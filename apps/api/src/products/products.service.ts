import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canViewCosts } from '../common/rbac';
import { toPaging } from '../common/pagination';
import { CreateProductDto } from './dtos/create-product.dto';
import { UpdateProductDto } from './dtos/update-product.dto';
import { ListProductsQueryDto } from './dtos/list-products.dto';

type ProductRow = Prisma.ProductGetPayload<{
  include: { stock: true; supplier: true };
}>;

export interface ProductRowDto {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  quantityOnHand: number | null;
  openConflicts: number;
  updatedAt: string;
  /** Cost-side fields are only present for roles that may see them. */
  unitCost?: number | null;
  defaultPrice?: number | null;
  supplierCode?: string | null;
  supplierName?: string | null;
  reorderPoint?: number | null;
  location?: string | null;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(row: ProductRow, openConflicts: number, role: Role): ProductRowDto {
    const base: ProductRowDto = {
      id: row.id,
      sku: row.sku,
      name: row.name,
      category: row.category,
      quantityOnHand: row.stock ? row.stock.quantityOnHand : null,
      openConflicts,
      updatedAt: row.updatedAt.toISOString(),
    };
    if (canViewCosts(role)) {
      base.unitCost = row.unitCost === null ? null : Number(row.unitCost);
      base.defaultPrice = row.defaultPrice === null ? null : Number(row.defaultPrice);
      base.supplierCode = row.supplier?.code ?? null;
      base.supplierName = row.supplier?.name ?? null;
      base.reorderPoint = row.stock ? row.stock.reorderPoint : null;
      base.location = row.stock?.location ?? null;
    }
    return base;
  }

  async list(query: ListProductsQueryDto, role: Role) {
    const { page, pageSize, skip, take } = toPaging(query);
    const where: Prisma.ProductWhereInput = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.category
        ? { category: { contains: query.category, mode: 'insensitive' } }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { stock: true, supplier: true },
        orderBy: { sku: 'asc' },
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);

    const conflictCounts = await this.openConflictCounts(rows.map((r) => r.sku));
    const data = rows.map((r) => this.toDto(r, conflictCounts.get(r.sku) ?? 0, role));
    return { data, total, page, pageSize };
  }

  private async openConflictCounts(skus: string[]) {
    if (skus.length === 0) return new Map<string, number>();
    const grouped = await this.prisma.reconciliationConflict.groupBy({
      by: ['entityKey'],
      where: {
        status: 'OPEN',
        entityType: 'INVENTORY',
        entityKey: { in: skus },
      },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.entityKey, g._count._all]));
  }

  async get(id: string, role: Role) {
    const row = await this.prisma.product.findUnique({
      where: { id },
      include: { stock: true, supplier: true },
    });
    if (!row) throw new NotFoundException('Product not found');
    const open = await this.prisma.reconciliationConflict.count({
      where: { entityKey: row.sku, status: 'OPEN', entityType: 'INVENTORY' },
    });
    return this.toDto(row, open, role);
  }

  async create(dto: CreateProductDto, actor: string) {
    const sku = dto.sku.trim().toUpperCase();
    const supplierId = await this.resolveSupplierId(dto.supplierCode);
    let product;
    try {
      product = await this.prisma.product.create({
        data: {
          sku,
          name: dto.name,
          category: dto.category,
          unitCost: dto.unitCost ?? null,
          defaultPrice: dto.defaultPrice ?? null,
          supplierId,
          stock: {
            create: {
              quantityOnHand: dto.quantityOnHand ?? 0,
              reorderPoint: dto.reorderPoint ?? 0,
              location: dto.location,
            },
          },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Product with SKU ${sku} already exists`);
      }
      throw err;
    }
    await this.audit(actor, 'PRODUCT_CREATED', 'INVENTORY', sku, { productId: product.id });
    return product;
  }

  async update(id: string, dto: UpdateProductDto, actor: string) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { stock: true },
    });
    if (!existing) throw new NotFoundException('Product not found');

    const data: Prisma.ProductUpdateInput = {};
    const stockData: Prisma.StockItemUpdateInput = {};
    if (dto.sku !== undefined) data.sku = dto.sku.trim().toUpperCase();
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.unitCost !== undefined) data.unitCost = dto.unitCost;
    if (dto.defaultPrice !== undefined) data.defaultPrice = dto.defaultPrice;
    if (dto.reorderPoint !== undefined) stockData.reorderPoint = dto.reorderPoint;
    if (dto.location !== undefined) stockData.location = dto.location;

    if (dto.supplierCode !== undefined) {
      const supplierId = await this.resolveSupplierId(dto.supplierCode);
      data.supplier = supplierId
        ? { connect: { id: supplierId } }
        : { disconnect: true };
    }

    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data,
        include: { stock: true, supplier: true },
      });
      if (Object.keys(stockData).length > 0 && existing.stock) {
        await tx.stockItem.update({ where: { id: existing.stock.id }, data: stockData });
      }
      return updated;
    });

    await this.audit(actor, 'PRODUCT_UPDATED', 'INVENTORY', product.sku, {
      productId: product.id,
    });
    return product;
  }

  async remove(id: string, actor: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    await this.prisma.product.delete({ where: { id } });
    await this.audit(actor, 'PRODUCT_DELETED', 'INVENTORY', existing.sku, {
      productId: id,
    });
    return { deleted: true };
  }

  private async resolveSupplierId(code?: string): Promise<string | null> {
    if (!code) return null;
    const supplier = await this.prisma.supplier.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!supplier) throw new NotFoundException(`Supplier ${code} not found`);
    return supplier.id;
  }

  private audit(actor: string, action: string, entityType: string, entityId: string, details: object) {
    return this.prisma.auditLog.create({
      data: { actor, action, entityType, entityId, details },
    });
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canViewCosts } from '../common/rbac';
import { toPaging } from '../common/pagination';
import { ListStockQueryDto } from './dtos/list-stock.dto';
import { AdjustStockDto } from './dtos/adjust-stock.dto';

export interface StockRowDto {
  productId: string;
  sku: string;
  name: string;
  quantityOnHand: number;
  lowStock: boolean;
  updatedAt: string;
  reorderPoint?: number;
  location?: string;
}

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(
    row: {
      id: string;
      sku: string;
      name: string;
      stock: { quantityOnHand: number; reorderPoint: number; location: string | null; updatedAt: Date } | null;
    },
    role: Role,
  ): StockRowDto | null {
    if (!row.stock) return null;
    const low = row.stock.quantityOnHand <= row.stock.reorderPoint;
    const base: StockRowDto = {
      productId: row.id,
      sku: row.sku,
      name: row.name,
      quantityOnHand: row.stock.quantityOnHand,
      lowStock: low,
      updatedAt: row.stock.updatedAt.toISOString(),
    };
    if (canViewCosts(role)) {
      base.reorderPoint = row.stock.reorderPoint;
      base.location = row.stock.location ?? undefined;
    }
    return base;
  }

  async list(query: ListStockQueryDto, role: Role) {
    const { page, pageSize } = toPaging(query);
    const where: Prisma.ProductWhereInput = {};
    if (query.location) {
      where.stock = { location: query.location };
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { stock: true },
        orderBy: [{ stock: { quantityOnHand: 'asc' } }, { sku: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    const filtered = rows
      .map((r) => this.toDto(r, role))
      .filter((r): r is StockRowDto => r !== null);
    const lowFiltered = query.lowOnly === 'true' ? filtered.filter((r) => r.lowStock) : filtered;

    return {
      data: lowFiltered,
      total: lowFiltered.length,
      page,
      pageSize,
    };
  }

  async adjust(productId: string, dto: AdjustStockDto, actor: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: { stock: true },
      });
      if (!product || !product.stock) {
        throw new BadRequestException('Product or stock record not found');
      }
      const next = product.stock.quantityOnHand + dto.delta;
      if (next < 0) {
        throw new BadRequestException(
          `Cannot reduce below zero (current ${product.stock.quantityOnHand}, delta ${dto.delta})`,
        );
      }
      await tx.stockItem.update({
        where: { productId },
        data: { quantityOnHand: next },
      });
      return { from: product.stock.quantityOnHand, to: next, sku: product.sku };
    });

    await this.prisma.auditLog.create({
      data: {
        actor,
        action: 'STOCK_ADJUSTED',
        entityType: 'INVENTORY',
        entityId: result.sku,
        details: { productId, from: result.from, to: result.to, delta: dto.delta, reason: dto.reason },
      },
    });
    return result;
  }
}

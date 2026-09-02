import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OrderStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPaging } from '../common/pagination';
import { CreateOrderDto } from './dtos/create-order.dto';
import { ListOrdersQueryDto } from './dtos/list-orders.dto';

function newOrderNumber(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private async toDto<T extends { items: { quantity: number; unitPrice: Prisma.Decimal | number }[] }>(
    order: T,
  ) {
    const total = order.items.reduce(
      (sum, i) => sum + i.quantity * Number(i.unitPrice),
      0,
    );
    return { ...order, total };
  }

  async list(query: ListOrdersQueryDto) {
    const { page, pageSize, skip, take } = toPaging(query);
    const where = { ...(query.status ? { status: query.status as OrderStatus } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: {
          items: { include: { product: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { data: rows, total, page, pageSize };
  }

  async get(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.toDto(order);
  }

  async create(dto: CreateOrderDto, actor: string, role: Role) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item');
    }
    const skus = [...new Set(dto.items.map((i) => i.sku.trim().toUpperCase()))];
    const products = await this.prisma.product.findMany({ where: { sku: { in: skus } } });
    const productBySku = new Map(products.map((p) => [p.sku, p]));

    const missing = skus.filter((s) => !productBySku.has(s));
    if (missing.length > 0) {
      throw new NotFoundException(`Unknown SKUs: ${missing.join(', ')}`);
    }

    const items = dto.items.map((i) => {
      const sku = i.sku.trim().toUpperCase();
      const product = productBySku.get(sku)!;
      if (role === 'SALES' && i.unitPrice !== undefined) {
        throw new BadRequestException('Sales role cannot set unit price');
      }
      const price = i.unitPrice ?? (product.defaultPrice !== null ? Number(product.defaultPrice) : null);
      if (price === null) {
        throw new BadRequestException(`No price available for ${sku} (set defaultPrice)`);
      }
      return { sku, quantity: i.quantity, unitPrice: price, productId: product.id };
    });

    // Merge duplicate SKUs in one order
    const merged = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      const existing = merged.get(item.sku);
      if (existing) existing.quantity += item.quantity;
      else merged.set(item.sku, { ...item });
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          number: newOrderNumber(),
          customerName: dto.customerName,
          status: 'DRAFT',
          items: {
            create: [...merged.values()].map((i) => ({
              productId: i.productId,
              sku: i.sku,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
            })),
          },
        },
        include: { items: true },
      });
      await tx.auditLog.create({
        data: {
          actor,
          action: 'ORDER_CREATED',
          entityType: 'ORDER',
          entityId: created.number,
          details: { orderId: created.id, status: 'DRAFT', items: [...merged.keys()] },
        },
      });
      return created;
    });

    return this.toDto(order);
  }

  async confirm(id: string, actor: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'DRAFT') {
      throw new ConflictException(`Only DRAFT orders can be confirmed (current: ${order.status})`);
    }

    await this.prisma.$transaction(async (tx) => {
      const shortfalls: string[] = [];
      for (const item of order.items) {
        const stock = await tx.stockItem.findUnique({ where: { productId: item.productId } });
        if (!stock || stock.quantityOnHand < item.quantity) {
          shortfalls.push(
            `${item.sku}: available ${stock?.quantityOnHand ?? 0}, required ${item.quantity}`,
          );
        }
      }
      if (shortfalls.length > 0) {
        throw new ConflictException({
          message: 'Insufficient stock to confirm order',
          shortfalls,
        });
      }
      for (const item of order.items) {
        await tx.stockItem.update({
          where: { productId: item.productId },
          data: { quantityOnHand: { decrement: item.quantity } },
        });
      }
      await tx.order.update({ where: { id }, data: { status: 'CONFIRMED' } });
    });

    await this.prisma.auditLog.create({
      data: {
        actor,
        action: 'ORDER_CONFIRMED',
        entityType: 'ORDER',
        entityId: order.number,
        details: { orderId: id },
      },
    });

    return this.get(id);
  }

  private async transition(
    id: string,
    from: OrderStatus[],
    to: OrderStatus,
    action: string,
    actor: string,
    restoreStock: boolean,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (!from.includes(order.status)) {
      throw new ConflictException(
        `Cannot transition from ${order.status} to ${to} (allowed from: ${from.join(', ')})`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (restoreStock) {
        for (const item of order.items) {
          await tx.stockItem.update({
            where: { productId: item.productId },
            data: { quantityOnHand: { increment: item.quantity } },
          });
        }
      }
      await tx.order.update({ where: { id }, data: { status: to } });
    });

    await this.prisma.auditLog.create({
      data: {
        actor,
        action,
        entityType: 'ORDER',
        entityId: order.number,
        details: { orderId: id, from: order.status, to },
      },
    });
    return this.get(id);
  }

  ship(id: string, actor: string) {
    return this.transition(id, ['CONFIRMED'], 'SHIPPED', 'ORDER_SHIPPED', actor, false);
  }

  async cancel(id: string, actor: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    // Only CONFIRMED orders have decremented stock and need restoration.
    const restoreStock = order.status === 'CONFIRMED';
    return this.transition(id, ['DRAFT', 'CONFIRMED'], 'CANCELLED', 'ORDER_CANCELLED', actor, restoreStock);
  }
}

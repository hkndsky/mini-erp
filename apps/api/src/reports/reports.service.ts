import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Role } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [products, openConflicts, ordersThisMonth, stockRows] =
      await this.prisma.$transaction([
        this.prisma.product.count(),
        this.prisma.reconciliationConflict.count({ where: { status: 'OPEN' } }),
        this.prisma.order.count({ where: { createdAt: { gte: monthStart } } }),
        this.prisma.stockItem.findMany({ select: { quantityOnHand: true, reorderPoint: true } }),
      ]);

    const lowStock = stockRows.filter(
      (s) => s.quantityOnHand <= s.reorderPoint,
    ).length;

    return { products, lowStock, openConflicts, ordersThisMonth };
  }

  async lowStock() {
    const rows = await this.prisma.product.findMany({
      include: { stock: true, supplier: true },
      orderBy: { sku: 'asc' },
    });
    return rows
      .filter((p) => p.stock && p.stock.quantityOnHand <= p.stock.reorderPoint)
      .map((p) => ({
        sku: p.sku,
        name: p.name,
        quantityOnHand: p.stock!.quantityOnHand,
        reorderPoint: p.stock!.reorderPoint,
        needed: Math.max(0, p.stock!.reorderPoint - p.stock!.quantityOnHand),
        location: p.stock!.location,
        supplierName: p.supplier?.name ?? null,
      }));
  }

  async orderTrend(days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: since } },
      include: { items: true },
    });

    const byDay = new Map<string, { date: string; orders: number; revenue: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, { date: key, orders: 0, revenue: 0 });
    }

    for (const order of orders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      const bucket = byDay.get(key);
      if (!bucket) continue;
      bucket.orders += 1;
      if (order.status === 'CONFIRMED' || order.status === 'SHIPPED') {
        bucket.revenue += order.items.reduce(
          (sum, i) => sum + i.quantity * Number(i.unitPrice),
          0,
        );
      }
    }

    return [...byDay.values()];
  }
}

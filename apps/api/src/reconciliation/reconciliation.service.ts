import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ReconciliationConfig,
  NormalizedInventoryRecord,
  NormalizedOrderRecord,
  SourceType,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { reconcileInventory } from './engine';
import { reconcileOrders } from './order-engine';

export interface BatchCounts {
  totalRecords: number;
  applied: number;
  conflicts: number;
}

export interface RowError {
  row: number;
  sku?: string;
  message: string;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  reconciliationConfig(): ReconciliationConfig {
    const priority = (this.config.get<string>('RECON_SOURCE_PRIORITY') ?? 'CSV,PARTNER_API,LEGACY')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean) as SourceType[];
    return {
      fieldRules: {
        name: 'SOURCE_PRIORITY',
        quantityOnHand: 'FLAG_FOR_REVIEW',
        unitCost: 'LAST_WRITE_WINS',
        location: 'SOURCE_PRIORITY',
      },
      sourcePriority: priority,
      tolerance: {
        quantityDelta: Number(this.config.get('RECON_TOLERANCE_QTY') ?? 0),
        costDeltaPct: Number(this.config.get('RECON_TOLERANCE_COST_PCT') ?? 1),
      },
    };
  }

  /**
   * Persists the outcome of an inventory reconciliation batch.
   * Runs inside a transaction; caller owns batch lifecycle (status updates).
   */
  async runInventoryBatch(
    batchId: string,
    source: SourceType,
    records: NormalizedInventoryRecord[],
    actor: string,
  ): Promise<BatchCounts> {
    const skus = [...new Set(records.map((r) => r.sku))];
    const products = await this.prisma.product.findMany({
      where: { sku: { in: skus } },
      include: { stock: true },
    });
    const existing = new Map(
      products.map((p) => [
        p.sku,
        {
          sku: p.sku,
          name: p.name,
          quantityOnHand: p.stock ? p.stock.quantityOnHand : null,
          unitCost: p.unitCost === null ? null : Number(p.unitCost),
          location: p.stock?.location ?? null,
          lastSource: p.stock?.lastSource ?? null,
        },
      ]),
    );

    const outcome = reconcileInventory({
      source,
      records,
      existing,
      config: this.reconciliationConfig(),
    });

    const firstBySku = new Map<string, NormalizedInventoryRecord>();
    for (const rec of records) if (!firstBySku.has(rec.sku)) firstBySku.set(rec.sku, rec);

    await this.prisma.$transaction(async (tx) => {
      for (const app of outcome.applications) {
        const product = await tx.product.findUniqueOrThrow({ where: { sku: app.sku } });
        const productData: Prisma.ProductUpdateInput = {};
        const stockData: Prisma.StockItemUpdateInput = {};
        if (app.field === 'name' && app.next !== null) productData.name = app.next;
        if (app.field === 'unitCost' && app.nextNum !== null) productData.unitCost = app.nextNum;
        if (app.field === 'quantityOnHand' && app.nextNum !== null) stockData.quantityOnHand = Math.trunc(app.nextNum);
        if (app.field === 'location' && app.next !== null) stockData.location = app.next;

        if (Object.keys(productData).length > 0) {
          await tx.product.update({ where: { id: product.id }, data: productData });
        }
        if (Object.keys(stockData).length > 0) {
          await tx.stockItem.update({
            where: { productId: product.id },
            data: {
              ...stockData,
              lastSource: source,
              lastReconciledAt: new Date(),
            },
          });
        }
        await tx.auditLog.create({
          data: {
            actor,
            action: 'FIELD_APPLIED',
            entityType: 'INVENTORY',
            entityId: app.sku,
            source,
            batchId,
            details: app as unknown as Prisma.InputJsonValue,
          },
        });
      }

      for (const sku of outcome.newSkus) {
        const rec = firstBySku.get(sku)!;
        const product = await tx.product.create({
          data: {
            sku,
            name: rec.name ?? sku,
            unitCost: rec.unitCost ?? null,
            stock: {
              create: {
                quantityOnHand: rec.quantityOnHand ?? 0,
                location: rec.location ?? null,
                lastSource: source,
                lastReconciledAt: new Date(),
              },
            },
          },
          include: { stock: true },
        });
        await tx.auditLog.create({
          data: {
            actor,
            action: 'PRODUCT_CREATED',
            entityType: 'INVENTORY',
            entityId: sku,
            source,
            batchId,
            details: { productId: product.id, name: product.name },
          },
        });
      }

      for (const c of outcome.conflicts) {
        await tx.reconciliationConflict.create({
          data: {
            entityType: 'INVENTORY',
            entityKey: c.sku,
            source,
            batchId,
            field: c.field,
            currentValue: c.previous,
            incomingValue: c.next,
            reason: c.reason,
          },
        });
        await tx.auditLog.create({
          data: {
            actor,
            action: 'CONFLICT_OPENED',
            entityType: 'INVENTORY',
            entityId: c.sku,
            source,
            batchId,
            details: c as unknown as Prisma.InputJsonValue,
          },
        });
      }
    });

    this.logger.log(
      `batch ${batchId} (${source}): ${outcome.applications.length} applied, ` +
        `${outcome.conflicts.length} conflicts, ${outcome.newSkus.length} new products`,
    );
    return {
      totalRecords: records.length,
      applied: outcome.applications.length + outcome.newSkus.length,
      conflicts: outcome.conflicts.length,
    };
  }

  /**
   * Persists the outcome of an order sync (partner feed).
   * New partner orders are created as-is (no stock movement on sync);
   * divergences on known orders are flagged for review.
   */
  async runOrderBatch(
    batchId: string,
    source: SourceType,
    orders: NormalizedOrderRecord[],
    actor: string,
  ): Promise<BatchCounts> {
    const numbers = [...new Set(orders.map((o) => o.orderNumber))];
    const existingOrders = await this.prisma.order.findMany({
      where: { number: { in: numbers } },
      include: { items: true },
    });
    const existing = new Map(
      existingOrders.map((o) => [
        o.number,
        {
          orderNumber: o.number,
          status: o.status,
          totalQuantity: o.items.reduce((sum, i) => sum + i.quantity, 0),
        },
      ]),
    );

    const outcome = reconcileOrders({ source, orders, existing });

    const errors: RowError[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const order of outcome.created) {
        const skus = [...new Set(order.items.map((i) => i.sku))];
        const products = await tx.product.findMany({ where: { sku: { in: skus } } });
        const productBySku = new Map(products.map((p) => [p.sku, p]));
        const validItems = order.items
          .filter((i) => {
            const p = productBySku.get(i.sku);
            if (!p) {
              errors.push({ row: 0, sku: i.sku, message: `order ${order.orderNumber}: unknown SKU ${i.sku}, item skipped` });
              return false;
            }
            return true;
          })
          .map((i) => ({
            productId: productBySku.get(i.sku)!.id,
            sku: i.sku,
            quantity: i.quantity,
            unitPrice: i.unitPrice ?? productBySku.get(i.sku)!.defaultPrice ?? 0,
          }));
        if (validItems.length === 0) continue;
        const created = await tx.order.create({
          data: {
            number: order.orderNumber,
            customerName: order.customerName,
            status: order.status,
            source,
            items: { create: validItems },
          },
        });
        await tx.auditLog.create({
          data: {
            actor,
            action: 'ORDER_CREATED',
            entityType: 'ORDER',
            entityId: order.orderNumber,
            source,
            batchId,
            details: { orderId: created.id, status: order.status },
          },
        });
      }

      for (const c of outcome.conflicts) {
        await tx.reconciliationConflict.create({
          data: {
            entityType: 'ORDER',
            entityKey: c.orderNumber,
            source,
            batchId,
            field: c.field,
            currentValue: c.previous,
            incomingValue: c.next,
            reason: c.reason,
          },
        });
        await tx.auditLog.create({
          data: {
            actor,
            action: 'CONFLICT_OPENED',
            entityType: 'ORDER',
            entityId: c.orderNumber,
            source,
            batchId,
            details: c as unknown as Prisma.InputJsonValue,
          },
        });
      }
    });

    this.logger.log(
      `order sync ${batchId} (${source}): ${outcome.created.length} created, ${outcome.conflicts.length} conflicts`,
    );
    return {
      totalRecords: orders.length,
      applied: outcome.created.length,
      conflicts: outcome.conflicts.length,
    };
  }
}

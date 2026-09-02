import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  NormalizedInventoryRecord,
  NormalizedOrderRecord,
  OrderStatus,
} from '@erp/shared';
import {
  InventorySource,
  ParsedSource,
  RowError,
  cleanText,
  normalizeSku,
  parseMessyNumber,
} from './source.interface';

const PARTNER_ORDER_STATUSES: OrderStatus[] = ['DRAFT', 'CONFIRMED', 'SHIPPED', 'CANCELLED'];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Partner API source: HTTP client with timeout + retry/backoff.
 * Never happy-path: any failure after retries becomes a 502 so the import
 * batch is marked FAILED with a clear message.
 */
@Injectable()
export class PartnerApiSource implements InventorySource {
  readonly type = 'PARTNER_API' as const;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl() {
    return (this.config.get('PARTNER_API_URL') ?? 'http://localhost:4010').replace(/\/$/, '');
  }

  private async fetchJson(path: string): Promise<unknown> {
    const timeoutMs = Number(this.config.get('PARTNER_TIMEOUT_MS') ?? 3000);
    const retries = Number(this.config.get('PARTNER_RETRIES') ?? 3);
    let lastError: unknown = new Error('unknown');

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { accept: 'application/json' },
        });
        if (!res.ok) {
          lastError = new Error(`partner API returned HTTP ${res.status}`);
          if (res.status < 500) break; // 4xx: retrying will not help
          continue;
        }
        return await res.json();
      } catch (err) {
        lastError = err;
      }
      if (attempt < retries) await sleep(100 * 2 ** (attempt - 1));
    }

    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new BadGatewayException(
      `Partner API unreachable after ${retries} attempts (${path}): ${message}`,
    );
  }

  async fetchInventory(): Promise<ParsedSource> {
    const data = (await this.fetchJson('/inventory')) as unknown;
    if (!Array.isArray(data)) {
      throw new BadGatewayException('Partner API /inventory did not return a JSON array');
    }
    return normalizePartnerInventory(data);
  }

  async fetchOrders(): Promise<NormalizedOrderRecord[]> {
    const data = (await this.fetchJson('/orders')) as unknown;
    if (!Array.isArray(data)) {
      throw new BadGatewayException('Partner API /orders did not return a JSON array');
    }
    const orders: NormalizedOrderRecord[] = [];
    for (const row of data as Record<string, unknown>[]) {
      const orderNumber = normalizeSku(row.orderNumber ?? row.order_number ?? row.number);
      if (!orderNumber) continue;
      const status = PARTNER_ORDER_STATUSES.includes(String(row.status).toUpperCase() as OrderStatus)
        ? (String(row.status).toUpperCase() as OrderStatus)
        : 'DRAFT';
      const items = Array.isArray(row.items)
        ? (row.items as Record<string, unknown>[]).flatMap((item) => {
            const sku = normalizeSku(item.sku);
            const quantity = parseMessyNumber(item.quantity);
            if (!sku || quantity === null) return [];
            const unitPrice = parseMessyNumber(item.unitPrice ?? item.unit_price);
            return [
              {
                sku,
                quantity: Math.trunc(quantity),
                unitPrice: unitPrice ?? undefined,
              },
            ];
          })
        : [];
      orders.push({
        orderNumber,
        customerName: cleanText(row.customerName ?? row.customer_name) ?? 'Partner customer',
        status,
        items,
        raw: row,
      });
    }
    return orders;
  }
}

export function normalizePartnerInventory(data: Record<string, unknown>[] | unknown[]): ParsedSource {
  const records: NormalizedInventoryRecord[] = [];
  const errors: RowError[] = [];
  (data as Record<string, unknown>[]).forEach((row, i) => {
    const sku = normalizeSku(row.sku ?? row.item);
    if (!sku) {
      errors.push({ row: i + 1, message: 'record without SKU - skipped' });
      return;
    }
    const quantityOnHand = parseMessyNumber(row.quantityOnHand ?? row.quantity_on_hand ?? row.qty);
    const unitCost = parseMessyNumber(row.unitCost ?? row.unit_cost ?? row.cost);
    records.push({
      sku,
      name: cleanText(row.name ?? row.description),
      quantityOnHand: quantityOnHand ?? undefined,
      unitCost: unitCost ?? undefined,
      location: cleanText(row.location ?? row.warehouse),
      raw: row,
    });
  });
  return { records, errors };
}

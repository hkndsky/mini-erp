import { Injectable } from '@nestjs/common';
import type { NormalizedInventoryRecord } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  InventorySource,
  ParsedSource,
  RowError,
  cleanText,
  normalizeSku,
  parseMessyNumber,
} from './source.interface';

/**
 * Shape of the legacy table on purpose: snake_case, nullable everything,
 * text-typed numerics. It simulates a system we are migrating away from.
 */
export interface LegacyRow {
  item_id: number | null;
  sku: string | null;
  descr: string | null;
  stock_qty: string | null;
  cost: string | null;
  whse: string | null;
}

/**
 * Legacy source: cross-schema read from the `legacy_inventory` table.
 * The table is deliberately messy:
 *  - NULL / padded / mixed-case SKUs
 *  - quantities and costs as text ("1,200", "$2.40", " 85 ", "abc")
 *  - orphan rows without SKU, duplicate SKUs
 * Normalization de-dupes (first occurrence wins) and reports everything else.
 */
export function normalizeLegacy(rows: LegacyRow[]): ParsedSource {
  const records: NormalizedInventoryRecord[] = [];
  const seen = new Set<string>();
  const errors: RowError[] = [];

  for (const row of rows) {
    const rowNum = row.item_id ?? -1;
    const sku = normalizeSku(row.sku);
    if (!sku) {
      errors.push({ row: rowNum, message: 'orphan row: missing SKU - skipped' });
      continue;
    }
    if (seen.has(sku)) {
      errors.push({ row: rowNum, sku, message: `duplicate SKU ${sku} in legacy table - first occurrence kept` });
      continue;
    }
    seen.add(sku);

    const quantityOnHand = parseMessyNumber(row.stock_qty);
    if (row.stock_qty !== null && String(row.stock_qty).trim() !== '' && quantityOnHand === null) {
      errors.push({ row: rowNum, sku, message: `unparseable quantity "${row.stock_qty}" - field ignored` });
    }
    const unitCost = parseMessyNumber(row.cost);
    if (row.cost !== null && String(row.cost).trim() !== '' && unitCost === null) {
      errors.push({ row: rowNum, sku, message: `unparseable cost "${row.cost}" - field ignored` });
    }

    records.push({
      sku,
      name: cleanText(row.descr),
      quantityOnHand: quantityOnHand ?? undefined,
      unitCost: unitCost ?? undefined,
      location: cleanText(row.whse),
      raw: row,
    });
  }

  return { records, errors };
}

@Injectable()
export class LegacyDbSource implements InventorySource {
  readonly type = 'LEGACY' as const;

  constructor(private readonly prisma: PrismaService) {}

  async fetchInventory(): Promise<ParsedSource> {
    const rows = await this.prisma.$queryRaw<LegacyRow[]>`
      SELECT item_id, sku, descr, stock_qty, cost, whse
      FROM legacy_inventory
      ORDER BY item_id
    `;
    return normalizeLegacy(rows);
  }
}

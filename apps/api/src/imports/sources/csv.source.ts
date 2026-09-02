import { BadRequestException, Injectable } from '@nestjs/common';
import * as Papa from 'papaparse';
import {
  NormalizedInventoryRecord,
} from '@erp/shared';
import {
  ParsedSource,
  RowError,
  cleanText,
  normalizeSku,
  parseMessyNumber,
} from './source.interface';

/**
 * Header aliases: real CSVs are never consistent. Accept the common variants
 * for each field; matching is done on the lower-cased header.
 */
const HEADER_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'item', 'item code', 'item_code', 'code', 'part'],
  name: ['name', 'description', 'product', 'product name', 'product_name'],
  quantityOnHand: [
    'qty',
    'quantity',
    'on hand',
    'quantity on hand',
    'quantity_on_hand',
    'qty on hand',
    'stock',
    'stock_qty',
    'stock qty',
    'available',
  ],
  unitCost: ['cost', 'unit cost', 'unit_cost', 'unitcost', 'unit price', 'price'],
  location: ['location', 'warehouse', 'whse', 'wh', 'bin'],
};

interface MappedColumns {
  sku: string;
  name?: string;
  quantityOnHand?: string;
  unitCost?: string;
  location?: string;
}

function mapHeaders(fields: readonly string[]): MappedColumns {
  const map: MappedColumns = { sku: '' };
  const normalized = fields.map((f) => f.trim().toLowerCase());
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx !== -1) {
      (map as unknown as Record<string, string>)[field] = fields[idx];
    }
  }
  return map;
}

/**
 * CSV source: parse an uploaded CSV buffer into normalized inventory records.
 * Structural problems (no SKU column) throw; per-row problems are collected
 * in `errors` so a mostly-valid file still imports the valid rows.
 */
export function parseCsv(buffer: Buffer): ParsedSource {
  const text = buffer.toString('utf8');
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  const fields = (parsed.meta.fields ?? []) as string[];
  const columns = mapHeaders(fields);
  if (!columns.sku) {
    throw new BadRequestException(
      'CSV must contain a SKU column (tried: ' + HEADER_ALIASES.sku.join(', ') + ')',
    );
  }

  const records: NormalizedInventoryRecord[] = [];
  const errors: RowError[] = [];

  parsed.data.forEach((row, i) => {
    const rowNum = i + 2; // 1-based + header line
    const rawSku = row[columns.sku];
    const sku = normalizeSku(rawSku);
    if (!sku) {
      errors.push({ row: rowNum, message: 'missing SKU - row skipped' });
      return;
    }

    const rowErrors: string[] = [];
    let quantityOnHand: number | undefined;
    if (columns.quantityOnHand && row[columns.quantityOnHand] !== undefined && row[columns.quantityOnHand] !== null && String(row[columns.quantityOnHand]).trim() !== '') {
      const qty = parseMessyNumber(row[columns.quantityOnHand]);
      quantityOnHand = qty ?? undefined;
      if (qty === null) {
        rowErrors.push(`invalid quantity "${row[columns.quantityOnHand]}"`);
      }
    }
    let unitCost: number | undefined;
    if (columns.unitCost && row[columns.unitCost] !== undefined && row[columns.unitCost] !== null && String(row[columns.unitCost]).trim() !== '') {
      const cost = parseMessyNumber(row[columns.unitCost]);
      unitCost = cost ?? undefined;
      if (cost === null) {
        rowErrors.push(`invalid unit cost "${row[columns.unitCost]}"`);
      }
    }

    const record: NormalizedInventoryRecord = {
      sku,
      name: cleanText(row[columns.name ?? '']),
      quantityOnHand,
      unitCost,
      location: columns.location ? cleanText(row[columns.location]) : undefined,
      raw: row,
    };
    records.push(record);
    for (const msg of rowErrors) {
      errors.push({ row: rowNum, sku, message: msg + ' - field ignored' });
    }
  });

  return { records, errors };
}

/**
 * CSV source adapter. Thin injectable wrapper around the pure parser so the
 * orchestrator depends on an injectable unit like the other two sources.
 */
@Injectable()
export class CsvSource {
  parse(buffer: Buffer): ParsedSource {
    return parseCsv(buffer);
  }
}

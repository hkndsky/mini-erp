import {
  NormalizedInventoryRecord,
  SourceType,
} from '@erp/shared';

export interface ParsedSource {
  records: NormalizedInventoryRecord[];
  errors: RowError[];
}

export interface RowError {
  row: number;
  sku?: string;
  message: string;
}

export interface InventorySource {
  readonly type: SourceType;
  fetchInventory(): Promise<ParsedSource>;
}

/** Normalize an SKU the way all sources should: trim, collapse spaces, uppercase. */
export function normalizeSku(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** Parse a messy numeric cell: "1,200" / "$2.40" / " 85 " -> number | null. */
export function parseMessyNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const cleaned = s.replace(/[$,\s]/g, '').replace(/\u00a0/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function cleanText(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  return s === '' ? undefined : s;
}

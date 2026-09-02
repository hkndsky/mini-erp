import { describe, it, expect } from 'vitest';
import { normalizeLegacy, LegacyRow } from '../../src/imports/sources/legacy.source';

const row = (partial: Partial<LegacyRow> & { item_id: number }): LegacyRow => ({
  sku: null,
  descr: null,
  stock_qty: null,
  cost: null,
  whse: null,
  ...partial,
});

describe('legacy table normalizer', () => {
  it('normalizes messy SKUs (trim + uppercase) and text numerics', () => {
    const { records, errors } = normalizeLegacy([
      row({ item_id: 1, sku: ' sku-001 ', stock_qty: ' 120 ', cost: '$2.40', descr: 'Bolt', whse: 'WH-A' }),
      row({ item_id: 2, sku: 'SKU-003', stock_qty: '1,200', cost: '$0.05', descr: 'Washer' }),
    ]);
    expect(records).toHaveLength(2);
    expect(records[0].sku).toBe('SKU-001');
    expect(records[0].quantityOnHand).toBe(120);
    expect(records[0].unitCost).toBe(2.4);
    expect(records[1].quantityOnHand).toBe(1200);
    expect(records[1].unitCost).toBe(0.05);
    expect(errors).toHaveLength(0);
  });

  it('drops orphan rows without SKU and reports them', () => {
    const { records, errors } = normalizeLegacy([
      row({ item_id: 5, sku: null, stock_qty: '50' }),
      row({ item_id: 6, sku: '   ', stock_qty: '10' }),
    ]);
    expect(records).toHaveLength(0);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('missing SKU');
  });

  it('keeps the first occurrence of duplicate SKUs and reports the rest', () => {
    const { records, errors } = normalizeLegacy([
      row({ item_id: 1, sku: 'SKU-001', stock_qty: '100' }),
      row({ item_id: 2, sku: ' sku-001 ', stock_qty: '999' }),
    ]);
    expect(records).toHaveLength(1);
    expect(records[0].quantityOnHand).toBe(100);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('duplicate SKU');
  });

  it('reports unparseable numerics but keeps the record with the field ignored', () => {
    const { records, errors } = normalizeLegacy([
      row({ item_id: 7, sku: 'SKU-002', stock_qty: 'abc', cost: '??' }),
    ]);
    expect(records).toHaveLength(1);
    expect(records[0].quantityOnHand).toBeUndefined();
    expect(records[0].unitCost).toBeUndefined();
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('unparseable quantity');
    expect(errors[1].message).toContain('unparseable cost');
  });

  it('null numerics are silently skipped (no error)', () => {
    const { records, errors } = normalizeLegacy([
      row({ item_id: 8, sku: 'SKU-009' }),
    ]);
    expect(records).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });
});

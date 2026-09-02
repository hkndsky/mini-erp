import { describe, it, expect } from 'vitest';
import {
  reconcileInventory,
} from '../../src/reconciliation/engine';
import {
  ExistingInventorySnapshot,
  NormalizedInventoryRecord,
} from '@erp/shared';

const existing = (partial: Partial<ExistingInventorySnapshot> & { sku: string }): ExistingInventorySnapshot => ({
  name: null,
  quantityOnHand: null,
  unitCost: null,
  location: null,
  lastSource: null,
  ...partial,
});

const rec = (partial: Partial<NormalizedInventoryRecord> & { sku: string }): NormalizedInventoryRecord => ({
  raw: partial,
  ...partial,
});

describe('reconciliation engine (inventory)', () => {
  it('creates products for unknown SKUs', () => {
    const outcome = reconcileInventory({
      source: 'CSV',
      records: [rec({ sku: 'NEW-1', quantityOnHand: 5 })],
      existing: new Map(),
    });
    expect(outcome.newSkus).toEqual(['NEW-1']);
    expect(outcome.conflicts).toHaveLength(0);
    expect(outcome.applications).toHaveLength(0);
  });

  it('applies LAST_WRITE_WINS for cost changes beyond tolerance', () => {
    const outcome = reconcileInventory({
      source: 'PARTNER_API',
      records: [rec({ sku: 'A', unitCost: 3.0 })],
      existing: new Map([['A', existing({ sku: 'A', unitCost: 2.4, lastSource: 'CSV' })]]),
    });
    expect(outcome.applications).toHaveLength(1);
    expect(outcome.applications[0]).toMatchObject({
      sku: 'A',
      field: 'unitCost',
      next: '3',
      rule: 'LAST_WRITE_WINS',
    });
    expect(outcome.conflicts).toHaveLength(0);
  });

  it('silently absorbs cost drift within the 1% tolerance', () => {
    const outcome = reconcileInventory({
      source: 'PARTNER_API',
      records: [rec({ sku: 'A', unitCost: 2.41 })],
      existing: new Map([['A', existing({ sku: 'A', unitCost: 2.4, lastSource: 'CSV' })]]),
    });
    expect(outcome.applications).toHaveLength(0);
    expect(outcome.conflicts).toHaveLength(0);
    expect(outcome.skipped).toHaveLength(1);
    expect(outcome.skipped[0].reason).toBe('within_tolerance');
  });

  it('SOURCE_PRIORITY: higher-trust source overwrites (CSV beats PARTNER_API)', () => {
    const outcome = reconcileInventory({
      source: 'CSV',
      records: [rec({ sku: 'A', name: 'Bolt M8 (recounted)' })],
      existing: new Map([
        ['A', existing({ sku: 'A', name: 'Bolt M8', lastSource: 'PARTNER_API' })],
      ]),
    });
    expect(outcome.applications).toHaveLength(1);
    expect(outcome.applications[0].field).toBe('name');
    expect(outcome.conflicts).toHaveLength(0);
  });

  it('SOURCE_PRIORITY: lower-trust source raises a conflict (LEGACY vs CSV)', () => {
    const outcome = reconcileInventory({
      source: 'LEGACY',
      records: [rec({ sku: 'A', name: 'BOLT M8 (legacy naming)' })],
      existing: new Map([['A', existing({ sku: 'A', name: 'Bolt M8', lastSource: 'CSV' })]]),
    });
    expect(outcome.applications).toHaveLength(0);
    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0]).toMatchObject({
      sku: 'A',
      field: 'name',
      next: 'BOLT M8 (legacy naming)',
      source: 'LEGACY',
    });
    expect(outcome.conflicts[0].reason).toContain('less trusted');
  });

  it('SOURCE_PRIORITY: unknown current source allows any incoming source', () => {
    const outcome = reconcileInventory({
      source: 'LEGACY',
      records: [rec({ sku: 'A', name: 'From legacy' })],
      existing: new Map([['A', existing({ sku: 'A', name: 'Unknown origin' })]]),
    });
    expect(outcome.applications).toHaveLength(1);
  });

  it('FLAG_FOR_REVIEW: quantity mismatch is never auto-applied', () => {
    const outcome = reconcileInventory({
      source: 'CSV',
      records: [rec({ sku: 'A', quantityOnHand: 130 })],
      existing: new Map([
        ['A', existing({ sku: 'A', quantityOnHand: 120, lastSource: 'PARTNER_API' })],
      ]),
    });
    expect(outcome.applications).toHaveLength(0);
    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0]).toMatchObject({
      field: 'quantityOnHand',
      previous: '120',
      next: '130',
    });
  });

  it('equal values produce no applications, conflicts or skips', () => {
    const outcome = reconcileInventory({
      source: 'CSV',
      records: [rec({ sku: 'A', name: 'Same', quantityOnHand: 10, unitCost: 2.4, location: 'WH-A' })],
      existing: new Map([
        ['A', existing({ sku: 'A', name: 'Same', quantityOnHand: 10, unitCost: 2.4, location: 'WH-A', lastSource: 'CSV' })],
      ]),
    });
    expect(outcome.applications).toHaveLength(0);
    expect(outcome.conflicts).toHaveLength(0);
    expect(outcome.newSkus).toHaveLength(0);
  });

  it('records that omit a field do not touch that field', () => {
    const outcome = reconcileInventory({
      source: 'PARTNER_API',
      records: [rec({ sku: 'A', unitCost: 9.9 })],
      existing: new Map([
        ['A', existing({ sku: 'A', name: 'Keep me', quantityOnHand: 7, lastSource: 'CSV' })],
      ]),
    });
    expect(outcome.applications).toHaveLength(1);
    expect(outcome.applications[0].field).toBe('unitCost');
    expect(outcome.conflicts).toHaveLength(0);
  });

  it('one record can produce multiple field effects (2 conflicts + 1 tolerance skip)', () => {
    const outcome = reconcileInventory({
      source: 'PARTNER_API',
      records: [rec({ sku: 'A', quantityOnHand: 50, unitCost: 2.41, name: 'Newer name' })],
      existing: new Map([
        ['A', existing({ sku: 'A', name: 'Old name', quantityOnHand: 40, unitCost: 2.4, lastSource: 'CSV' })],
      ]),
    });
    expect(outcome.conflicts).toHaveLength(2); // qty FLAG_FOR_REVIEW + name SOURCE_PRIORITY
    expect(outcome.skipped).toHaveLength(1); // cost within tolerance
    expect(outcome.applications).toHaveLength(0);
  });
});

describe('reconciliation engine (edge cases)', () => {
  it('name field from PARTNER_API against CSV-owned record is a conflict (less trusted)', () => {
    const outcome = reconcileInventory({
      source: 'PARTNER_API',
      records: [rec({ sku: 'A', name: 'Partner name' })],
      existing: new Map([['A', existing({ sku: 'A', name: 'CSV name', lastSource: 'CSV' })]]),
    });
    expect(outcome.conflicts).toHaveLength(1);
  });

  it('supports custom config (tolerance + priority order)', () => {
    const outcome = reconcileInventory({
      source: 'LEGACY',
      records: [rec({ sku: 'A', unitCost: 2.45 })],
      existing: new Map([['A', existing({ sku: 'A', unitCost: 2.4, lastSource: null })]]),
      config: { tolerance: { quantityDelta: 0, costDeltaPct: 5 } },
    });
    // 2.4 -> 2.45 is ~2%: within custom 5% tolerance -> skipped, not applied.
    expect(outcome.applications).toHaveLength(0);
    expect(outcome.skipped).toHaveLength(1);
  });
});

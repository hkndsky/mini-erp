import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { parseCsv } from '../../src/imports/sources/csv.source';
import sampleCsv from '../fixtures/sample-import.csv?raw';

describe('CSV parser', () => {
  it('parses a well-formed inventory CSV with aliased headers', () => {
    const csv = [
      'ITEM,Description,Quantity On Hand,Unit Cost,Whse',
      'SKU-001,M8 bolt,120,2.40,WH-A',
      'SKU-002,M10 bolt,85,1.10,WH-B',
    ].join('\n');
    const { records, errors } = parseCsv(Buffer.from(csv));
    expect(errors).toHaveLength(0);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      sku: 'SKU-001',
      name: 'M8 bolt',
      quantityOnHand: 120,
      unitCost: 2.4,
      location: 'WH-A',
    });
    expect(records[1].sku).toBe('SKU-002');
  });

  it('accepts messy values: padded SKUs, comma numbers, $-prefixed costs', () => {
    const csv = [
      'SKU,Name,Qty,Cost',
      ' sku-010 ,Thing,"1,500",$3.50',
    ].join('\n');
    const { records, errors } = parseCsv(Buffer.from(csv));
    expect(errors).toHaveLength(0);
    expect(records[0].sku).toBe('SKU-010');
    expect(records[0].quantityOnHand).toBe(1500);
    expect(records[0].unitCost).toBe(3.5);
  });

  it('throws when the SKU column is missing', () => {
    const csv = 'Name,Qty\nFoo,3\n';
    expect(() => parseCsv(Buffer.from(csv))).toThrow(BadRequestException);
  });

  it('skips rows without SKU and reports them with 1-based line numbers', () => {
    const csv = [
      'SKU,Qty',
      'SKU-A,1',
      ',2',
      'SKU-B,3',
    ].join('\n');
    const { records, errors } = parseCsv(Buffer.from(csv));
    expect(records).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(3);
    expect(errors[0].message).toContain('missing SKU');
  });

  it('keeps rows with invalid numerics but flags the fields', () => {
    const csv = [
      'SKU,Qty,Cost',
      'SKU-X,abc,xyz',
    ].join('\n');
    const { records, errors } = parseCsv(Buffer.from(csv));
    expect(records).toHaveLength(1);
    expect(records[0].quantityOnHand).toBeUndefined();
    expect(records[0].unitCost).toBeUndefined();
    expect(errors).toHaveLength(2);
  });

  it('parses the sample import fixture', () => {
    const { records, errors } = parseCsv(Buffer.from(sampleCsv));
    expect(errors).toHaveLength(0);
    expect(records).toHaveLength(3);
  });
});

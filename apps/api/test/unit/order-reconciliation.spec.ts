import { describe, it, expect } from 'vitest';
import { reconcileOrders } from '../../src/reconciliation/order-engine';
import { NormalizedOrderRecord } from '@erp/shared';

const order = (
  partial: Partial<NormalizedOrderRecord> & { orderNumber: string },
): NormalizedOrderRecord => ({
  customerName: 'Cust',
  status: 'DRAFT',
  items: [],
  raw: partial,
  ...partial,
});

describe('reconciliation engine (orders)', () => {
  it('creates unknown partner orders', () => {
    const outcome = reconcileOrders({
      source: 'PARTNER_API',
      orders: [order({ orderNumber: 'PNR-1', items: [{ sku: 'A', quantity: 2 }] })],
      existing: new Map(),
    });
    expect(outcome.created).toHaveLength(1);
    expect(outcome.conflicts).toHaveLength(0);
    expect(outcome.unchanged).toHaveLength(0);
  });

  it('flags status changes on known orders', () => {
    const outcome = reconcileOrders({
      source: 'PARTNER_API',
      orders: [
        order({ orderNumber: 'PNR-1', status: 'SHIPPED', items: [{ sku: 'A', quantity: 2 }] }),
      ],
      existing: new Map([
        ['PNR-1', { orderNumber: 'PNR-1', status: 'CONFIRMED', totalQuantity: 2 }],
      ]),
    });
    expect(outcome.created).toHaveLength(0);
    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0]).toMatchObject({
      field: 'status',
      previous: 'CONFIRMED',
      next: 'SHIPPED',
    });
  });

  it('flags quantity changes on known orders', () => {
    const outcome = reconcileOrders({
      source: 'PARTNER_API',
      orders: [
        order({ orderNumber: 'PNR-1', items: [{ sku: 'A', quantity: 5 }] }),
      ],
      existing: new Map([
        ['PNR-1', { orderNumber: 'PNR-1', status: 'DRAFT', totalQuantity: 2 }],
      ]),
    });
    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0].field).toBe('items');
  });

  it('matches orders with no changes', () => {
    const outcome = reconcileOrders({
      source: 'PARTNER_API',
      orders: [order({ orderNumber: 'PNR-1', items: [{ sku: 'A', quantity: 2 }] })],
      existing: new Map([
        ['PNR-1', { orderNumber: 'PNR-1', status: 'DRAFT', totalQuantity: 2 }],
      ]),
    });
    expect(outcome.created).toHaveLength(0);
    expect(outcome.conflicts).toHaveLength(0);
    expect(outcome.unchanged).toEqual(['PNR-1']);
  });

  it('aggregates multi-item totals when comparing quantities', () => {
    const outcome = reconcileOrders({
      source: 'PARTNER_API',
      orders: [
        order({
          orderNumber: 'PNR-1',
          items: [
            { sku: 'A', quantity: 2 },
            { sku: 'B', quantity: 3 },
          ],
        }),
      ],
      existing: new Map([
        ['PNR-1', { orderNumber: 'PNR-1', status: 'DRAFT', totalQuantity: 5 }],
      ]),
    });
    expect(outcome.unchanged).toEqual(['PNR-1']);
  });
});

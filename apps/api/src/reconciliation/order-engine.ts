import {
  ExistingOrderSnapshot,
  NormalizedOrderRecord,
  OrderConflictCandidate,
  OrderReconciliationOutcome,
  OrderStatus,
} from '@erp/shared';

export interface ReconcileOrdersParams {
  source: string;
  orders: NormalizedOrderRecord[];
  existing: Map<string, ExistingOrderSnapshot>;
}

function totalQuantity(order: NormalizedOrderRecord): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Order-side reconciliation. Orders only ever arrive from the partner feed,
 * so the rules are deliberately conservative:
 *  - unknown order number -> created
 *  - status changed vs current state -> conflict (never auto-applied)
 *  - total quantity changed vs current state -> conflict
 *  - otherwise unchanged
 */
export function reconcileOrders(params: ReconcileOrdersParams): OrderReconciliationOutcome {
  const outcome: OrderReconciliationOutcome = {
    created: [],
    conflicts: [],
    unchanged: [],
  };

  for (const order of params.orders) {
    const existing = params.existing.get(order.orderNumber);
    if (!existing) {
      outcome.created.push(order);
      continue;
    }

    const nextTotal = totalQuantity(order);
    let changed = false;

    if (existing.status !== order.status) {
      changed = true;
      outcome.conflicts.push({
        orderNumber: order.orderNumber,
        field: 'status',
        previous: existing.status,
        next: order.status,
        reason: `order status differs (current ${existing.status} vs incoming ${order.status})`,
      });
    }
    if (existing.totalQuantity !== nextTotal) {
      changed = true;
      outcome.conflicts.push({
        orderNumber: order.orderNumber,
        field: 'items',
        previous: `total quantity ${existing.totalQuantity}`,
        next: `total quantity ${nextTotal}`,
        reason: `order line quantities differ from current state`,
      });
    }

    if (!changed) outcome.unchanged.push(order.orderNumber);
  }

  return outcome;
}

export function assertValidOrderStatus(status: string): asserts status is OrderStatus {
  if (!['DRAFT', 'CONFIRMED', 'SHIPPED', 'CANCELLED'].includes(status)) {
    throw new Error(`Unknown order status: ${status}`);
  }
}

export const SOURCE_TYPES = ['CSV', 'PARTNER_API', 'LEGACY'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const INVENTORY_FIELDS = ['name', 'quantityOnHand', 'unitCost', 'location'] as const;
export type InventoryField = (typeof INVENTORY_FIELDS)[number];

export type ConflictRule = 'SOURCE_PRIORITY' | 'LAST_WRITE_WINS' | 'FLAG_FOR_REVIEW';

export interface ReconciliationConfig {
  /** Rule applied per inventory field when the incoming value differs from current state. */
  fieldRules: Record<InventoryField, ConflictRule>;
  /** Ordered list of sources, highest trust first. Used by SOURCE_PRIORITY rule. */
  sourcePriority: SourceType[];
  /** Changes within tolerance are applied silently (no audit noise, no conflict). */
  tolerance: {
    quantityDelta: number;
    costDeltaPct: number;
  };
}

export interface NormalizedInventoryRecord {
  sku: string;
  name?: string;
  quantityOnHand?: number;
  unitCost?: number;
  location?: string;
  /** Raw source payload, kept for audit/debugging. */
  raw: unknown;
}

/** Shape of the current state as seen by the engine, keyed by SKU. */
export interface ExistingInventorySnapshot {
  sku: string;
  name: string | null;
  quantityOnHand: number | null;
  unitCost: number | null;
  location: string | null;
  /** Which source last wrote this record (null = unknown/seeded). */
  lastSource: SourceType | null;
}

export interface FieldApplication {
  sku: string;
  field: InventoryField;
  previous: string | null;
  next: string | null;
  previousNum: number | null;
  nextNum: number | null;
  rule: ConflictRule;
  source: SourceType;
}

export interface ConflictCandidate {
  sku: string;
  field: InventoryField;
  previous: string | null;
  next: string | null;
  previousNum: number | null;
  nextNum: number | null;
  source: SourceType;
  reason: string;
}

export interface SkippedField {
  sku: string;
  field: InventoryField;
  source: SourceType;
  reason: 'unchanged' | 'within_tolerance';
}

export interface ReconciliationOutcome {
  applications: FieldApplication[];
  conflicts: ConflictCandidate[];
  skipped: SkippedField[];
  /** SKUs not present in current state; the caller creates the product. */
  newSkus: string[];
}

export const ORDER_STATUSES = ['DRAFT', 'CONFIRMED', 'SHIPPED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface NormalizedOrderItem {
  sku: string;
  quantity: number;
  unitPrice?: number;
}

export interface NormalizedOrderRecord {
  orderNumber: string;
  customerName: string;
  status: OrderStatus;
  items: NormalizedOrderItem[];
  raw: unknown;
}

export interface ExistingOrderSnapshot {
  orderNumber: string;
  status: OrderStatus;
  totalQuantity: number;
}

export interface OrderConflictCandidate {
  orderNumber: string;
  field: 'status' | 'items';
  previous: string;
  next: string;
  reason: string;
}

export interface OrderReconciliationOutcome {
  created: NormalizedOrderRecord[];
  conflicts: OrderConflictCandidate[];
  unchanged: string[];
}

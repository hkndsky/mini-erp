/**
 * Types mirroring the API's JSON responses. Kept local to the app (not in
 * @erp/shared) because they include Prisma's runtime shapes (Decimal -> string,
 * ISO date strings) rather than the shared domain types.
 */
export type Role = 'ADMIN' | 'WAREHOUSE' | 'SALES';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  accessToken: string;
  user: PublicUser;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/** Cost/supplier/reorder fields only appear for roles that may see them. */
export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  quantityOnHand: number | null;
  openConflicts: number;
  updatedAt: string;
  unitCost?: number | null;
  defaultPrice?: number | null;
  supplierCode?: string | null;
  supplierName?: string | null;
  reorderPoint?: number | null;
  location?: string | null;
}

export interface StockRow {
  productId: string;
  sku: string;
  name: string;
  quantityOnHand: number;
  lowStock: boolean;
  updatedAt: string;
  reorderPoint?: number;
  location?: string;
}

export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'SHIPPED' | 'CANCELLED';

export interface OrderItemRow {
  id: string;
  sku: string;
  quantity: number;
  /** Prisma Decimal -> serialized as a string; coerce with Number() when doing math. */
  unitPrice: string | number;
  product?: { name: string };
}

export interface OrderRow {
  id: string;
  number: string;
  customerName: string;
  status: OrderStatus;
  source: string | null;
  createdAt: string;
  items: OrderItemRow[];
  total: number;
}

export interface CreateOrderPayload {
  customerName: string;
  items: { sku: string; quantity: number; unitPrice?: number }[];
}

export type SourceType = 'CSV' | 'PARTNER_API' | 'LEGACY';

export interface ImportBatchRow {
  id: string;
  source: SourceType;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  triggeredBy: string;
  totalRecords: number;
  applied: number;
  conflicts: number;
  errors: unknown[] | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ConflictRow {
  id: string;
  entityType: 'INVENTORY' | 'ORDER';
  entityKey: string;
  source: SourceType;
  batchId: string | null;
  field: string;
  currentValue: string | null;
  incomingValue: string | null;
  reason: string;
  status: 'OPEN' | 'RESOLVED_APPLIED' | 'RESOLVED_DISCARDED';
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  createdAt: string;
}

export interface Summary {
  products: number;
  lowStock: number;
  openConflicts: number;
  ordersThisMonth: number;
}

export interface OrderTrendPoint {
  date: string;
  orders: number;
  revenue: number;
}

export interface LowStockRow {
  sku: string;
  name: string;
  quantityOnHand: number;
  reorderPoint: number;
  needed: number;
  location: string | null;
  supplierName: string | null;
}

export interface AuditRow {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  source: string | null;
  details: unknown;
  createdAt: string;
}

export interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

import { api } from './client';
import type {
  AuditRow,
  ConflictRow,
  CreateOrderPayload,
  ImportBatchRow,
  LoginResponse,
  LowStockRow,
  OrderRow,
  OrderTrendPoint,
  OrderStatus,
  Paginated,
  ProductRow,
  PublicUser,
  Role,
  StockRow,
  Summary,
} from './types';

/**
 * Drop empty-ish values from a query object so we only send the params the
 * caller actually set. Keys whose value is undefined/''/null are removed.
 */
function q<T extends Record<string, unknown>>(params: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

export type ProductQuery = { page?: number; pageSize?: number; search?: string; category?: string };
export type StockQuery = { page?: number; pageSize?: number; lowOnly?: boolean; location?: string };
export type OrderQuery = { page?: number; pageSize?: number; status?: OrderStatus | '' };
export type ConflictQuery = {
  page?: number;
  pageSize?: number;
  status?: ConflictRow['status'] | '';
  entityType?: 'INVENTORY' | 'ORDER' | '';
};
export type CreateProductPayload = {
  sku: string;
  name: string;
  category?: string;
  quantityOnHand?: number;
  unitCost?: number;
  defaultPrice?: number;
  reorderPoint?: number;
  location?: string;
  supplierCode?: string;
};
export type UpdateProductPayload = Partial<CreateProductPayload>;

export const endpoints = {
  auth: {
    login: (body: { email: string; password: string }) =>
      api.post<LoginResponse>('/auth/login', body).then((r) => r.data),
    register: (body: { name: string; email: string; password: string; role: Role }) =>
      api.post<PublicUser>('/auth/register', body).then((r) => r.data),
    me: () => api.get<PublicUser>('/auth/me').then((r) => r.data),
  },

  products: {
    list: (query: ProductQuery) =>
      api.get<Paginated<ProductRow>>('/products', { params: q(query) }).then((r) => r.data),
    get: (id: string) => api.get<ProductRow>(`/products/${id}`).then((r) => r.data),
    create: (body: CreateProductPayload) =>
      api.post<ProductRow>('/products', body).then((r) => r.data),
    update: (id: string, body: UpdateProductPayload) =>
      api.post<ProductRow>(`/products/${id}`, body).then((r) => r.data),
    remove: (id: string) =>
      api.delete(`/products/${id}`).then((r) => r.data as { deleted: boolean }),
  },

  stock: {
    list: (query: StockQuery) =>
      api
        .get<Paginated<StockRow>>('/stock', {
          params: q({ ...query, lowOnly: query.lowOnly ? 'true' : undefined }),
        })
        .then((r) => r.data),
    adjust: (productId: string, body: { delta: number; reason: string }) =>
      api.post(`/stock/${productId}/adjust`, body).then((r) => r.data),
  },

  orders: {
    list: (query: OrderQuery) =>
      api.get<Paginated<OrderRow>>('/orders', { params: q(query) }).then((r) => r.data),
    get: (id: string) => api.get<OrderRow>(`/orders/${id}`).then((r) => r.data),
    create: (body: CreateOrderPayload) =>
      api.post<OrderRow>('/orders', body).then((r) => r.data),
    confirm: (id: string) => api.post<OrderRow>(`/orders/${id}/confirm`).then((r) => r.data),
    ship: (id: string) => api.post<OrderRow>(`/orders/${id}/ship`).then((r) => r.data),
    cancel: (id: string) => api.post<OrderRow>(`/orders/${id}/cancel`).then((r) => r.data),
  },

  conflicts: {
    list: (query: ConflictQuery) =>
      api.get<Paginated<ConflictRow>>('/conflicts', { params: q(query) }).then((r) => r.data),
    get: (id: string) => api.get<ConflictRow>(`/conflicts/${id}`).then((r) => r.data),
    resolve: (
      id: string,
      body: { resolution: 'APPLY_INCOMING' | 'KEEP_CURRENT'; note?: string },
    ) => api.post<ConflictRow>(`/conflicts/${id}/resolve`, body).then((r) => r.data),
  },

  imports: {
    list: (query: { page?: number; pageSize?: number }) =>
      api
        .get<Paginated<ImportBatchRow>>('/imports', { params: q(query) })
        .then((r) => r.data),
    uploadCsv: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api
        .post<ImportBatchRow>('/imports/csv', form, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((r) => r.data);
    },
    runPartner: () =>
      api.post<ImportBatchRow>('/imports/partner').then((r) => r.data),
    runLegacy: () =>
      api.post<ImportBatchRow>('/imports/legacy').then((r) => r.data),
  },

  reports: {
    summary: () => api.get<Summary>('/reports/summary').then((r) => r.data),
    lowStock: () => api.get<LowStockRow[]>('/reports/low-stock').then((r) => r.data),
    orderTrend: (days?: number) =>
      api.get<OrderTrendPoint[]>('/reports/order-trend', { params: q({ days }) }).then((r) => r.data),
  },

  audit: {
    list: (params: { entityType?: string; entityId?: string; limit?: number } = {}) =>
      api.get<AuditRow[]>('/audit', { params: q(params) }).then((r) => r.data),
  },
};

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderAs, makeUser } from './helpers';
import { Products } from '../pages/Products';
import { endpoints } from '../api';
import type { ProductRow } from '../api/types';

vi.mock('../api', () => ({
  endpoints: {
    auth: { me: vi.fn(), login: vi.fn(), register: vi.fn() },
    products: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    stock: { list: vi.fn(), adjust: vi.fn() },
    orders: { list: vi.fn(), get: vi.fn(), create: vi.fn(), confirm: vi.fn(), ship: vi.fn(), cancel: vi.fn() },
    conflicts: { list: vi.fn(), get: vi.fn(), resolve: vi.fn() },
    imports: { list: vi.fn(), uploadCsv: vi.fn(), runPartner: vi.fn(), runLegacy: vi.fn() },
    reports: { summary: vi.fn(), lowStock: vi.fn(), orderTrend: vi.fn() },
    audit: { list: vi.fn() },
  },
}));

const row: ProductRow = {
  id: 'p1',
  sku: 'SKU-001',
  name: 'Bolt M8 x 40',
  category: 'BOLTS',
  quantityOnHand: 120,
  openConflicts: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
  unitCost: 2.4,
  defaultPrice: 4.9,
  supplierName: 'Acme Fasteners',
  reorderPoint: 50,
  location: 'WH-A',
};

const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(endpoints.products.list).mockResolvedValue({ data: [row], meta });
});

describe('Products page — RBAC column visibility', () => {
  it('shows cost/supplier columns for WAREHOUSE users', async () => {
    renderAs(makeUser({ role: 'WAREHOUSE' }), <Products />);
    expect(await screen.findByText('Unit cost')).toBeInTheDocument();
    expect(screen.getByText('Supplier')).toBeInTheDocument();
    expect(screen.getByText('Reorder point')).toBeInTheDocument();
    expect(screen.getByText('Acme Fasteners')).toBeInTheDocument();
  });

  it('hides cost/supplier columns for SALES users', async () => {
    renderAs(makeUser({ role: 'SALES' }), <Products />);
    await screen.findByText('SKU-001');
    expect(screen.queryByText('Unit cost')).not.toBeInTheDocument();
    expect(screen.queryByText('Default price')).not.toBeInTheDocument();
    expect(screen.queryByText('Supplier')).not.toBeInTheDocument();
    expect(screen.queryByText('Reorder point')).not.toBeInTheDocument();
    expect(screen.queryByText('Acme Fasteners')).not.toBeInTheDocument();
  });

  it('hides the New product button for SALES users', async () => {
    renderAs(makeUser({ role: 'SALES' }), <Products />);
    await screen.findByText('SKU-001');
    expect(screen.queryByText('New product')).not.toBeInTheDocument();
  });
});

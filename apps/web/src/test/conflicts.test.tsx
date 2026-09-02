import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAs, makeUser } from './helpers';
import { Conflicts } from '../pages/Conflicts';
import { endpoints } from '../api';
import type { ConflictRow } from '../api/types';

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

const conflict: ConflictRow = {
  id: 'c1',
  entityType: 'INVENTORY',
  entityKey: 'SKU-001',
  source: 'CSV',
  batchId: 'b1',
  field: 'quantityOnHand',
  currentValue: '120',
  incomingValue: '130',
  reason: 'quantity divergence beyond tolerance',
  status: 'OPEN',
  resolvedBy: null,
  resolvedAt: null,
  resolution: null,
  createdAt: '2026-01-02T00:00:00.000Z',
};

const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(endpoints.conflicts.list).mockResolvedValue({ data: [conflict], meta });
  vi.mocked(endpoints.conflicts.resolve).mockResolvedValue({ ...conflict, status: 'RESOLVED_APPLIED' });
});

describe('Conflicts page — resolution flow', () => {
  it('resolves an open conflict through the modal (apply incoming)', async () => {
    renderAs(makeUser({ role: 'WAREHOUSE' }), <Conflicts />);

    const resolveBtn = await screen.findByTestId('resolve-c1');
    await userEvent.click(resolveBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('SKU-001');
    expect(dialog).toHaveTextContent('quantityOnHand');
    expect(dialog).toHaveTextContent('130');

    await userEvent.click(screen.getByTestId('resolve-submit'));

    await waitFor(() =>
      expect(endpoints.conflicts.resolve).toHaveBeenCalledWith('c1', {
        resolution: 'APPLY_INCOMING',
        note: undefined,
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('supports keeping the current value', async () => {
    renderAs(makeUser({ role: 'ADMIN' }), <Conflicts />);
    const resolveBtn = await screen.findByTestId('resolve-c1');
    await userEvent.click(resolveBtn);

    await userEvent.click(screen.getByLabelText(/keep current value/i));
    await userEvent.click(screen.getByTestId('resolve-submit'));

    await waitFor(() =>
      expect(endpoints.conflicts.resolve).toHaveBeenCalledWith('c1', {
        resolution: 'KEEP_CURRENT',
        note: undefined,
      }),
    );
  });

  it('does not show a resolve action for SALES users', async () => {
    renderAs(makeUser({ role: 'SALES' }), <Conflicts />);
    await screen.findByText('SKU-001');
    expect(screen.queryByTestId('resolve-c1')).not.toBeInTheDocument();
  });
});

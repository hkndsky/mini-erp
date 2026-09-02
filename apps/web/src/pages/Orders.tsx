import { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { endpoints } from '../api';
import type { OrderRow, OrderStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DataGrid } from '../components/DataGrid';
import { Pagination } from '../components/Pagination';
import { Badge } from '../components/Badge';
import { ErrorState } from '../components/States';
import { Modal } from '../components/Modal';
import { errorMessage } from '../api/client';
import type { ColumnDef } from '@tanstack/react-table';

const PAGE_SIZE = 20;

function statusBadge(status: OrderStatus) {
  const tone =
    status === 'CONFIRMED' ? 'ok' : status === 'SHIPPED' ? 'info' : status === 'CANCELLED' ? 'danger' : 'warn';
  return <Badge tone={tone}>{status}</Badge>;
}

export function Orders() {
  const { user } = useAuth();
  const isOps = user?.role !== 'SALES';
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync(
    () => endpoints.orders.list({ page, pageSize: PAGE_SIZE, status: statusFilter }),
    [page, statusFilter],
  );

  const columns: ColumnDef<OrderRow, any>[] = [
    { header: 'Number', accessorKey: 'number' },
    { header: 'Customer', accessorKey: 'customerName' },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: (ctx) => statusBadge(ctx.getValue() as OrderStatus),
    },
    { header: 'Source', accessorKey: 'source', cell: (ctx) => (ctx.getValue() as string | null) ?? '—' },
    {
      header: 'Created',
      accessorKey: 'createdAt',
      cell: (ctx) => new Date(ctx.getValue() as string).toLocaleDateString(),
    },
    {
      header: 'Total',
      accessorKey: 'total',
      cell: (ctx) => `${Number(ctx.getValue() as number).toFixed(2)}`,
    },
    ...(isOps
      ? ([
          {
            id: 'actions',
            header: 'Actions',
            cell: (ctx) => {
              const o = ctx.row.original;
              return (
                <span className="row-actions">
                  {o.status === 'DRAFT' && (
                    <button type="button" className="btn btn-sm" onClick={() => void act(o.id, 'confirm')}>
                      Confirm
                    </button>
                  )}
                  {o.status === 'CONFIRMED' && (
                    <button type="button" className="btn btn-sm" onClick={() => void act(o.id, 'ship')}>
                      Ship
                    </button>
                  )}
                  {(o.status === 'DRAFT' || o.status === 'CONFIRMED') && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => void act(o.id, 'cancel')}>
                      Cancel
                    </button>
                  )}
                </span>
              );
            },
          },
        ] as ColumnDef<OrderRow, any>[])
      : []),
  ];

  async function act(id: string, action: 'confirm' | 'ship' | 'cancel') {
    setNotice(null);
    try {
      const fn = { confirm: endpoints.orders.confirm, ship: endpoints.orders.ship, cancel: endpoints.orders.cancel }[action];
      await fn(id);
      reload();
    } catch (err) {
      setNotice(errorMessage(err));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Orders</h1>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          New order
        </button>
      </div>
      <div className="toolbar">
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value as typeof statusFilter);
            }}
          >
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="SHIPPED">Shipped</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
      </div>
      {notice && (
        <p className="form-error" role="alert">
          {notice}
        </p>
      )}
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          <DataGrid
            data={data ? data.data : null}
            columns={columns}
            rowKey={(r) => r.id}
            emptyMessage="No orders yet."
            data-testid="orders-grid"
          />
          {data && (
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          )}
        </>
      )}
      {loading && !data && <span className="sr-only">loading</span>}
      {creating && (
        <CreateOrderModal
          isOps={isOps}
          onClose={() => setCreating(false)}
          onDone={() => {
            reload();
          }}
        />
      )}
    </div>
  );
}

interface LineItem {
  sku: string;
  quantity: string;
  unitPrice: string;
}

function CreateOrderModal({
  isOps,
  onClose,
  onDone,
}: {
  isOps: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [customerName, setCustomerName] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ sku: '', quantity: '1', unitPrice: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setItem(idx: number, patch: Partial<LineItem>) {
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const clean = items
        .map((i) => ({
          sku: i.sku.trim().toUpperCase(),
          quantity: Number(i.quantity),
          unitPrice: isOps && i.unitPrice !== '' ? Number(i.unitPrice) : undefined,
        }))
        .filter((i) => i.sku !== '');
      if (clean.length === 0) throw new Error('Add at least one line item');
      await endpoints.orders.create({
        customerName: customerName.trim(),
        items: clean,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New order" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <label>
          Customer
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required minLength={2} />
        </label>
        <div className="order-items">
          <div className="order-item-head">
            <span>SKU</span>
            <span>Qty</span>
            {isOps && <span>Unit price</span>}
            <span />
          </div>
          {items.map((it, idx) => (
            <div className="order-item" key={idx}>
              <input
                value={it.sku}
                onChange={(e) => setItem(idx, { sku: e.target.value })}
                aria-label={`SKU for line ${idx + 1}`}
                placeholder="SKU-001"
              />
              <input
                type="number"
                min="1"
                value={it.quantity}
                onChange={(e) => setItem(idx, { quantity: e.target.value })}
                aria-label={`Quantity for line ${idx + 1}`}
              />
              {isOps && (
                <input
                  type="number"
                  step="0.01"
                  value={it.unitPrice}
                  onChange={(e) => setItem(idx, { unitPrice: e.target.value })}
                  aria-label={`Unit price for line ${idx + 1}`}
                  placeholder="auto"
                />
              )}
              <button
                type="button"
                className="btn btn-sm"
                aria-label={`Remove line ${idx + 1}`}
                onClick={() => setItems((list) => list.filter((_, i) => i !== idx))}
                disabled={items.length === 1}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setItems((list) => [...list, { sku: '', quantity: '1', unitPrice: '' }])}
          >
            + Add line
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create order'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

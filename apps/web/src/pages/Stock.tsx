import { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { endpoints } from '../api';
import type { StockRow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DataGrid } from '../components/DataGrid';
import { Pagination } from '../components/Pagination';
import { Badge } from '../components/Badge';
import { ErrorState } from '../components/States';
import { Modal } from '../components/Modal';
import { errorMessage } from '../api/client';
import type { ColumnDef } from '@tanstack/react-table';

const PAGE_SIZE = 20;

export function Stock() {
  const { user } = useAuth();
  const isOps = user?.role !== 'SALES';
  const [page, setPage] = useState(1);
  const [lowOnly, setLowOnly] = useState(false);
  const [adjusting, setAdjusting] = useState<StockRow | null>(null);

  const { data, error, loading, reload } = useAsync(
    () => endpoints.stock.list({ page, pageSize: PAGE_SIZE, lowOnly }),
    [page, lowOnly],
  );

  const baseColumns: ColumnDef<StockRow, any>[] = [
    { header: 'SKU', accessorKey: 'sku' },
    { header: 'Name', accessorKey: 'name' },
    { header: 'On hand', accessorKey: 'quantityOnHand' },
    {
      header: 'Status',
      accessorKey: 'lowStock',
      cell: (ctx) => (ctx.getValue() ? <Badge tone="warn">LOW</Badge> : <Badge tone="ok">OK</Badge>),
    },
    {
      header: 'Updated',
      accessorKey: 'updatedAt',
      cell: (ctx) => new Date(ctx.getValue() as string).toLocaleDateString(),
    },
  ];

  const costColumns: ColumnDef<StockRow, any>[] = isOps
    ? ([
        { header: 'Reorder point', accessorKey: 'reorderPoint', cell: (ctx) => ctx.getValue() as number },
        { header: 'Location', accessorKey: 'location', cell: (ctx) => (ctx.getValue() as string | undefined) ?? '—' },
        {
          id: 'actions',
          header: '',
          cell: (ctx) => {
            const row = ctx.row.original;
            return (
              <button type="button" className="btn btn-sm" onClick={() => setAdjusting(row)}>
                Adjust
              </button>
            );
          },
        },
      ] as ColumnDef<StockRow, any>[])
    : [];

  const columns = [...baseColumns, ...costColumns];

  return (
    <div>
      <div className="page-header">
        <h1>Stock</h1>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => {
              setPage(1);
              setLowOnly(e.target.checked);
            }}
          />
          Low stock only
        </label>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          <DataGrid
            data={data ? data.data : null}
            columns={columns}
            rowKey={(r) => r.productId}
            emptyMessage="No stock rows match."
            data-testid="stock-grid"
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
      {adjusting && (
        <AdjustModal
          row={adjusting}
          onClose={() => setAdjusting(null)}
          onDone={() => reload()}
        />
      )}
    </div>
  );
}

function AdjustModal({ row, onClose, onDone }: { row: StockRow; onClose: () => void; onDone: () => void }) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = Number(delta);
      if (!Number.isFinite(d) || d === 0) {
        throw new Error('Delta must be a non-zero number');
      }
      await endpoints.stock.adjust(row.productId, { delta: d, reason });
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Adjust stock — ${row.sku}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <p>
          Current quantity: <strong>{row.quantityOnHand}</strong>
        </p>
        <label>
          Delta (+ / −)
          <input
            type="number"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            required
            placeholder="e.g. 50 or -5"
          />
        </label>
        <label>
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="cycle count, correction…" />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="adjust-submit">
            {busy ? 'Saving…' : 'Apply adjustment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

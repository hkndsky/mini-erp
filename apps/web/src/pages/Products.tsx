import { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { endpoints } from '../api';
import type { ProductRow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DataGrid } from '../components/DataGrid';
import { Pagination } from '../components/Pagination';
import { Badge } from '../components/Badge';
import { ErrorState } from '../components/States';
import { Modal } from '../components/Modal';
import { errorMessage } from '../api/client';
import type { ColumnDef } from '@tanstack/react-table';

const PAGE_SIZE = 20;

function qtyBadge(p: ProductRow) {
  return <span>{p.quantityOnHand ?? '—'}</span>;
}

function conflictCell(open: number) {
  if (open > 0) return <Badge tone="danger">{open} open</Badge>;
  return <span className="muted">none</span>;
}

export function Products() {
  const { user } = useAuth();
  const isOps = user?.role !== 'SALES';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [creating, setCreating] = useState(false);

  const { data, error, loading, reload } = useAsync(
    () => endpoints.products.list({ page, pageSize: PAGE_SIZE, search }),
    [page, search],
  );

  const baseColumns: ColumnDef<ProductRow, any>[] = [
    { header: 'SKU', accessorKey: 'sku' },
    { header: 'Name', accessorKey: 'name' },
    { header: 'Category', accessorKey: 'category', cell: (ctx) => (ctx.getValue() as string | null) ?? '—' },
    { header: 'On hand', accessorKey: 'quantityOnHand', cell: (ctx) => qtyBadge(ctx.row.original) },
    {
      header: 'Open conflicts',
      accessorKey: 'openConflicts',
      cell: (ctx) => conflictCell(ctx.getValue() as number),
    },
    {
      header: 'Updated',
      accessorKey: 'updatedAt',
      cell: (ctx) => new Date(ctx.getValue() as string).toLocaleDateString(),
    },
  ];

  const costColumns: ColumnDef<ProductRow, any>[] = isOps
    ? ([
        { header: 'Unit cost', accessorKey: 'unitCost', cell: (ctx) => (ctx.getValue() as number | null) ?? '—' },
        { header: 'Default price', accessorKey: 'defaultPrice', cell: (ctx) => (ctx.getValue() as number | null) ?? '—' },
        { header: 'Supplier', accessorKey: 'supplierName', cell: (ctx) => (ctx.getValue() as string | null) ?? '—' },
        { header: 'Reorder point', accessorKey: 'reorderPoint', cell: (ctx) => (ctx.getValue() as number | null) ?? '—' },
        { header: 'Location', accessorKey: 'location', cell: (ctx) => (ctx.getValue() as string | null) ?? '—' },
      ] as ColumnDef<ProductRow, any>[])
    : [];

  const columns = [...baseColumns, ...costColumns];

  return (
    <div>
      <div className="page-header">
        <h1>Products</h1>
        {isOps && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            New product
          </button>
        )}
      </div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(searchInput.trim());
        }}
      >
        <label>
          Search
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="SKU or name…"
            aria-label="Search products"
          />
        </label>
        <button type="submit" className="btn">
          Apply
        </button>
      </form>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <DataGrid
          data={data.data}
          columns={columns}
          rowKey={(r) => r.id}
          emptyMessage="No products match."
          data-testid="products-grid"
        />
      ) : null}
      {data && (
        <Pagination
          page={data.meta.page}
          totalPages={data.meta.totalPages}
          total={data.meta.total}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      )}
      {loading && !data && <span className="sr-only">loading</span>}
      {creating && <CreateProductModal onClose={() => setCreating(false)} onDone={() => reload()} />}
    </div>
  );
}

function CreateProductModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    sku: '',
    name: '',
    category: '',
    quantityOnHand: '0',
    unitCost: '',
    defaultPrice: '',
    reorderPoint: '0',
    location: '',
    supplierCode: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await endpoints.products.create({
        sku: form.sku,
        name: form.name,
        category: form.category || undefined,
        quantityOnHand: Number(form.quantityOnHand || 0),
        unitCost: form.unitCost === '' ? undefined : Number(form.unitCost),
        defaultPrice: form.defaultPrice === '' ? undefined : Number(form.defaultPrice),
        reorderPoint: Number(form.reorderPoint || 0),
        location: form.location || undefined,
        supplierCode: form.supplierCode || undefined,
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
    <Modal title="New product" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <label>
            SKU
            <input value={form.sku} onChange={(e) => set('sku', e.target.value)} required />
          </label>
          <label>
            Name
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </label>
          <label>
            Category
            <input value={form.category} onChange={(e) => set('category', e.target.value)} />
          </label>
          <label>
            Initial quantity
            <input type="number" value={form.quantityOnHand} onChange={(e) => set('quantityOnHand', e.target.value)} />
          </label>
          <label>
            Unit cost
            <input type="number" step="0.01" value={form.unitCost} onChange={(e) => set('unitCost', e.target.value)} />
          </label>
          <label>
            Default price
            <input type="number" step="0.01" value={form.defaultPrice} onChange={(e) => set('defaultPrice', e.target.value)} />
          </label>
          <label>
            Reorder point
            <input type="number" value={form.reorderPoint} onChange={(e) => set('reorderPoint', e.target.value)} />
          </label>
          <label>
            Location
            <input value={form.location} onChange={(e) => set('location', e.target.value)} />
          </label>
          <label>
            Supplier code
            <input value={form.supplierCode} onChange={(e) => set('supplierCode', e.target.value)} />
          </label>
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
            {busy ? 'Saving…' : 'Create product'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

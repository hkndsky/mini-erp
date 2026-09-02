import { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { endpoints } from '../api';
import type { ConflictRow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DataGrid } from '../components/DataGrid';
import { Pagination } from '../components/Pagination';
import { Badge } from '../components/Badge';
import { ErrorState } from '../components/States';
import { ResolveConflictModal } from '../components/ResolveConflictModal';
import type { ColumnDef } from '@tanstack/react-table';

const PAGE_SIZE = 20;

function statusBadge(status: ConflictRow['status']) {
  const tone = status === 'OPEN' ? 'danger' : status === 'RESOLVED_APPLIED' ? 'ok' : 'neutral';
  const label = status === 'OPEN' ? 'OPEN' : status === 'RESOLVED_APPLIED' ? 'RESOLVED · APPLIED' : 'RESOLVED · DISCARDED';
  return <Badge tone={tone}>{label}</Badge>;
}

export function Conflicts() {
  const { user } = useAuth();
  const isOps = user?.role !== 'SALES';
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ConflictRow['status'] | ''>('OPEN');
  const [resolving, setResolving] = useState<ConflictRow | null>(null);

  const { data, error, loading, reload } = useAsync(
    () => endpoints.conflicts.list({ page, pageSize: PAGE_SIZE, status: statusFilter }),
    [page, statusFilter],
  );

  const columns: ColumnDef<ConflictRow, any>[] = [
    { header: 'Entity', accessorKey: 'entityKey' },
    { header: 'Type', accessorKey: 'entityType' },
    { header: 'Field', accessorKey: 'field' },
    { header: 'Source', accessorKey: 'source' },
    { header: 'Current', accessorKey: 'currentValue' },
    { header: 'Incoming', accessorKey: 'incomingValue' },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: (ctx) => statusBadge(ctx.getValue() as ConflictRow['status']),
    },
    {
      header: 'Created',
      accessorKey: 'createdAt',
      cell: (ctx) => new Date(ctx.getValue() as string).toLocaleString(),
    },
    ...(isOps
      ? ([
          {
            id: 'actions',
            header: '',
            cell: (ctx) => {
              const row = ctx.row.original;
              return row.status === 'OPEN' ? (
                <button type="button" className="btn btn-sm" data-testid={`resolve-${row.id}`} onClick={() => setResolving(row)}>
                  Resolve
                </button>
              ) : (
                <span className="muted">—</span>
              );
            },
          },
        ] as ColumnDef<ConflictRow, any>[])
      : []),
  ];

  return (
    <div>
      <h1>Conflicts</h1>
      <div className="toolbar">
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as typeof statusFilter);
              setPage(1);
            }}
          >
            <option value="OPEN">Open</option>
            <option value="RESOLVED_APPLIED">Resolved · applied</option>
            <option value="RESOLVED_DISCARDED">Resolved · discarded</option>
            <option value="">All</option>
          </select>
        </label>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          <DataGrid
            data={data ? data.data : null}
            columns={columns}
            rowKey={(r) => r.id}
            emptyMessage={statusFilter === 'OPEN' ? 'No open conflicts. Nice and tidy.' : 'No conflicts match this filter.'}
            data-testid="conflicts-grid"
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
      {resolving && (
        <ResolveConflictModal
          conflict={resolving}
          onClose={() => setResolving(null)}
          onDone={() => {
            reload();
          }}
        />
      )}
      {loading && data && <span className="sr-only">refreshing</span>}
    </div>
  );
}

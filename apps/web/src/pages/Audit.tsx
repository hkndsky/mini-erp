import { useAsync } from '../hooks/useAsync';
import { endpoints } from '../api';
import type { AuditRow } from '../api/types';
import { DataGrid } from '../components/DataGrid';
import { ErrorState } from '../components/States';
import type { ColumnDef } from '@tanstack/react-table';

const LIMIT = 200;

export function Audit() {
  const { data, error, loading, reload } = useAsync(() => endpoints.audit.list({ limit: LIMIT }), []);

  const columns: ColumnDef<AuditRow, any>[] = [
    {
      header: 'When',
      accessorKey: 'createdAt',
      cell: (ctx) => new Date(ctx.getValue() as string).toLocaleString(),
    },
    { header: 'Actor', accessorKey: 'actor' },
    { header: 'Action', accessorKey: 'action' },
    { header: 'Entity type', accessorKey: 'entityType' },
    { header: 'Entity', accessorKey: 'entityId', cell: (ctx) => (ctx.getValue() as string | null) ?? '—' },
    { header: 'Source', accessorKey: 'source', cell: (ctx) => (ctx.getValue() as string | null) ?? '—' },
    {
      header: 'Details',
      accessorKey: 'details',
      cell: (ctx) => (
        <details>
          <summary>view</summary>
          <pre>{JSON.stringify(ctx.getValue(), null, 2)}</pre>
        </details>
      ),
    },
  ];

  return (
    <div>
      <h1>Audit trail</h1>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataGrid
          data={data ?? null}
          columns={columns}
          rowKey={(r) => r.id}
          emptyMessage="No audit entries."
          data-testid="audit-grid"
        />
      )}
      {loading && !data && <span className="sr-only">loading</span>}
    </div>
  );
}

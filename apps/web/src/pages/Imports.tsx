import { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { endpoints } from '../api';
import type { ImportBatchRow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DataGrid } from '../components/DataGrid';
import { Pagination } from '../components/Pagination';
import { CsvDropzone } from '../components/CsvDropzone';
import { ErrorState } from '../components/States';
import { Badge } from '../components/Badge';
import { Loading } from '../components/Loading';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';

const PAGE_SIZE = 10;

function statusBadge(status: ImportBatchRow['status']) {
  const tone = status === 'COMPLETED' ? 'ok' : status === 'FAILED' ? 'danger' : 'warn';
  return <Badge tone={tone}>{status}</Badge>;
}

export function Imports() {
  const { user } = useAuth();
  const isOps = user?.role !== 'SALES';
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [lastBatch, setLastBatch] = useState<ImportBatchRow | null>(null);

  const { data, error, loading, reload } = useAsync(
    () => endpoints.imports.list({ page, pageSize: PAGE_SIZE }),
    [page],
  );

  async function run(fn: () => Promise<ImportBatchRow>) {
    setBusy(true);
    try {
      const batch = await fn();
      setLastBatch(batch);
      reload();
    } finally {
      setBusy(false);
    }
  }

  const columns: ColumnDef<ImportBatchRow, any>[] = [
    { header: 'Source', accessorKey: 'source' },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: (ctx) => statusBadge(ctx.getValue() as ImportBatchRow['status']),
    },
    { header: 'Records', accessorKey: 'totalRecords' },
    { header: 'Applied', accessorKey: 'applied' },
    { header: 'Conflicts', accessorKey: 'conflicts' },
    { header: 'Triggered by', accessorKey: 'triggeredBy' },
    {
      header: 'Started',
      accessorKey: 'startedAt',
      cell: (ctx) => new Date(ctx.getValue() as string).toLocaleString(),
    },
    {
      header: 'Error',
      accessorKey: 'errorMessage',
      cell: (ctx) => ctx.getValue() as string | null,
    },
  ];

  return (
    <div>
      <h1>Imports</h1>
      {isOps && (
        <div className="toolbar">
          <div className="toolbar-group">
            <CsvDropzone
              disabled={busy}
              onFile={(file) => {
                void run(() => endpoints.imports.uploadCsv(file));
              }}
            />
          </div>
          <div className="toolbar-group">
            <button type="button" className="btn" disabled={busy} onClick={() => void run(endpoints.imports.runPartner)}>
              Run partner sync
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void run(endpoints.imports.runLegacy)}>
              Run legacy import
            </button>
          </div>
        </div>
      )}
      {lastBatch && (
        <p className="import-result" role="status" data-testid="import-result">
          Import {lastBatch.status.toLowerCase()}: {lastBatch.applied} applied, {lastBatch.conflicts} conflict
          {lastBatch.conflicts === 1 ? '' : 's'}.{' '}
          {lastBatch.conflicts > 0 && (
            <Link to="/conflicts">Review conflicts</Link>
          )}
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
            emptyMessage="No imports yet."
            data-testid="imports-grid"
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
      {busy && <Loading label="Running import…" />}
    </div>
  );
}

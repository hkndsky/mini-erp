import { useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Loading } from './Loading';
import { EmptyState } from './States';

/**
 * Thin wrapper around @tanstack/react-table. Pages pass `data: null` while the
 * first request is in flight; afterwards `data` is always an array (possibly
 * empty) so the empty state and pagination stay consistent.
 */
export function DataGrid<TData extends object>({
  data,
  columns,
  rowKey,
  emptyMessage = 'Nothing here yet.',
  sorting = true,
  'data-testid': testId,
}: {
  data: TData[] | null;
  columns: ColumnDef<TData, any>[];
  rowKey: (row: TData) => string;
  emptyMessage?: string;
  sorting?: boolean;
  'data-testid'?: string;
}) {
  const [sortingState, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting: sortingState },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  if (data === null) return <Loading />;

  if (rows.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className="datagrid" data-testid={testId}>
      <table>
        <thead>
          {table.getHeaderGroups()[0].headers.map((header) => {
            const canSort = sorting && header.column.getCanSort();
            const sortDir = header.column.getIsSorted();
            const headerCtx = header.getContext();
            return (
              <th
                key={header.id}
                aria-sort={sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none'}
              >
                {canSort ? (
                  <button type="button" className="th-sort" onClick={header.column.getToggleSortingHandler()}>
                    {flexRender(header.column.columnDef.header, headerCtx)}
                    <span aria-hidden="true">{sortDir === 'asc' ? ' ↑' : sortDir === 'desc' ? ' ↓' : ''}</span>
                  </button>
                ) : (
                  <span className="th-static">
                    {flexRender(header.column.columnDef.header, headerCtx)}
                  </span>
                )}
              </th>
            );
          })}
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowData = row.original;
            return (
              <tr key={rowKey(rowData)} data-row-id={rowKey(rowData)}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

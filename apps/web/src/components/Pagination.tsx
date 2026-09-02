export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-info">
        Page {page} of {totalPages} · {total} rows
      </span>
      <div className="pagination-buttons">
        <button type="button" className="btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ← Prev
        </button>
        <button
          type="button"
          className="btn"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next →
        </button>
      </div>
      <span className="sr-only">{`Showing ${pageSize} per page`}</span>
    </nav>
  );
}

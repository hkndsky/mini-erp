export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="loading" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

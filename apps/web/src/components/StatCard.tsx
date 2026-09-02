import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  to,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  to?: string;
  tone?: 'neutral' | 'warn' | 'danger' | 'ok';
}) {
  const inner = (
    <div className={`stat-card stat-${tone}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
  if (to) {
    return (
      <a className="stat-link" href={to} aria-label={`${label}: see details`}>
        {inner}
      </a>
    );
  }
  return inner;
}

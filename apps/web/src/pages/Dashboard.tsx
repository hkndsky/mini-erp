import { useAsync } from '../hooks/useAsync';
import { endpoints } from '../api';
import { StatCard } from '../components/StatCard';
import { Loading } from '../components/Loading';
import { ErrorState } from '../components/States';

export function Dashboard() {
  const { data, error, loading, reload } = useAsync(() => endpoints.reports.summary(), []);

  if (loading && !data) return <Loading label="Loading dashboard…" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  const s = data;
  return (
    <div>
      <h1>Dashboard</h1>
      {s && (
        <div className="stat-grid">
          <StatCard to="/products" label="Products" value={s.products} />
          <StatCard to="/stock?low=1" label="Low stock" value={s.lowStock} tone={s.lowStock > 0 ? 'warn' : 'ok'} />
          <StatCard
            to="/conflicts"
            label="Open conflicts"
            value={s.openConflicts}
            tone={s.openConflicts > 0 ? 'danger' : 'ok'}
          />
          <StatCard to="/orders" label="Orders this month" value={s.ordersThisMonth} />
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

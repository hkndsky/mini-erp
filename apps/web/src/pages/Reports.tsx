import { useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAsync } from '../hooks/useAsync';
import { endpoints } from '../api';
import { useAuth } from '../auth/AuthContext';
import { StatCard } from '../components/StatCard';
import { Loading } from '../components/Loading';
import { ErrorState } from '../components/States';
import { Badge } from '../components/Badge';

export function Reports() {
  const { user } = useAuth();
  const isOps = user?.role !== 'SALES';
  const [days, setDays] = useState(30);

  const summary = useAsync(() => endpoints.reports.summary(), []);
  const trend = useAsync(() => endpoints.reports.orderTrend(days), [days]);
  const lowStock = useAsync(
    () => endpoints.reports.lowStock(),
    [],
  );

  return (
    <div>
      <h1>Reports</h1>
      {summary.error ? (
        <ErrorState message={summary.error} onRetry={summary.reload} />
      ) : (
        <div className="stat-grid">
          <StatCard label="Products" value={summary.data?.products ?? '—'} />
          <StatCard
            label="Low stock"
            value={summary.data?.lowStock ?? '—'}
            tone={(summary.data?.lowStock ?? 0) > 0 ? 'warn' : 'ok'}
          />
          <StatCard
            label="Open conflicts"
            value={summary.data?.openConflicts ?? '—'}
            tone={(summary.data?.openConflicts ?? 0) > 0 ? 'danger' : 'ok'}
          />
          <StatCard label="Orders this month" value={summary.data?.ordersThisMonth ?? '—'} />
        </div>
      )}

      <section className="report-section">
        <div className="page-header">
          <h2>Order trend</h2>
          <label>
            Days
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>7</option>
              <option value={30}>30</option>
              <option value={90}>90</option>
            </select>
          </label>
        </div>
        {trend.error ? (
          <ErrorState message={trend.error} onRetry={trend.reload} />
        ) : trend.data ? (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={trend.data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="orders" allowDecimals={false} />
              <YAxis yAxisId="revenue" orientation="right" />
              <Tooltip />
              <Bar yAxisId="orders" dataKey="orders" name="Orders" fill="#3b82f6" />
              <Line
                yAxisId="revenue"
                dataKey="revenue"
                name="Revenue"
                stroke="#16a34a"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <Loading label="Loading trend…" />
        )}
      </section>

      {isOps && (
        <section className="report-section">
          <h2>Low stock — reorder candidates</h2>
          {lowStock.error ? (
            <ErrorState message={lowStock.error} onRetry={lowStock.reload} />
          ) : lowStock.data ? (
            lowStock.data.length === 0 ? (
              <p>
                <Badge tone="ok">All stocked above reorder points</Badge>
              </p>
            ) : (
              <table className="low-stock-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>On hand</th>
                    <th>Reorder point</th>
                    <th>Needed</th>
                    <th>Location</th>
                    <th>Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.data.map((row) => (
                    <tr key={row.sku}>
                      <td>{row.sku}</td>
                      <td>{row.name}</td>
                      <td>{row.quantityOnHand}</td>
                      <td>{row.reorderPoint}</td>
                      <td>{row.needed}</td>
                      <td>{row.location ?? '—'}</td>
                      <td>{row.supplierName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            <Loading label="Loading low stock…" />
          )}
        </section>
      )}
    </div>
  );
}

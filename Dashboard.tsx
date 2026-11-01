import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, Boxes, Receipt, TrendingUp, Wallet } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button, Card, DataTable, EmptyState, ErrorState, PageHeader, Spinner, StatCard, autoBadge } from '../components/ui';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { formatDateTime, formatMoney, formatNumber } from '../lib/format';
import type { DashboardSummary } from '../lib/types';

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
];
const PIE = ['#0B1630', '#D4AF37', '#2A4580', '#B8942A', '#8A94A8', '#13244A'];

export default function Dashboard() {
  const { user } = useAuth();
  const [range, setRange] = useState('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const cur = user?.business?.currency ?? 'NGN';

  const customReady = range !== 'custom' || (from && to);
  const { data, loading, error, reload } = useFetch<DashboardSummary>(customReady ? '/dashboard/summary' : null, {
    range,
    date_from: range === 'custom' ? from : undefined,
    date_to: range === 'custom' ? to : undefined,
  });

  const money = (n: number) => formatMoney(n, cur);
  const moneyOrDash = (n: number | null) => (n === null ? '—' : money(n));
  const isNewBusiness = !!data && data.total_products === 0 && data.sales_series.length === 0;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={user?.business?.name} />

      <div className="mb-5 flex flex-wrap items-end gap-2">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`min-h-[40px] rounded-lg px-4 text-sm font-medium ${
              range === r.value ? 'bg-navy text-white' : 'bg-white text-navy ring-1 ring-grey-200 hover:bg-grey-50'
            }`}
          >
            {r.label}
          </button>
        ))}
        {range === 'custom' && (
          <>
            <input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-[40px] rounded-lg border border-grey-200 px-3 text-sm" />
            <input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-[40px] rounded-lg border border-grey-200 px-3 text-sm" />
          </>
        )}
      </div>

      {error ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard loading={loading} label="Sales (revenue)" value={data ? money(data.sales_today) : ''} icon={<Banknote className="h-5 w-5" />} note="Money received from sales" />
            <StatCard loading={loading} label="Expenses" value={data ? moneyOrDash(data.expenses_today) : ''} icon={<Wallet className="h-5 w-5" />} />
            <StatCard loading={loading} label="Estimated gross profit" value={data ? moneyOrDash(data.gross_profit_estimate) : ''} icon={<TrendingUp className="h-5 w-5" />} note="Sales minus cost of goods — not revenue" />
            <StatCard loading={loading} label="Total products" value={data ? formatNumber(data.total_products) : ''} icon={<Boxes className="h-5 w-5" />} />
            <StatCard loading={loading} label="Low-stock items" value={data ? formatNumber(data.low_stock_count) : ''} icon={<AlertTriangle className="h-5 w-5" />} />
            <StatCard loading={loading} label="Outstanding balances" value={data ? moneyOrDash(data.outstanding_balances) : ''} icon={<Receipt className="h-5 w-5" />} note="Owed by customers" />
          </div>

          {loading && !data && <Spinner />}

          {isNewBusiness && (
            <Card className="mt-5">
              <EmptyState
                title="Welcome to Much Biz"
                description="Your dashboard fills up as you add products and record sales."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link to="/products"><Button>Add your first product</Button></Link>
                    <Link to="/pos"><Button variant="gold">Record your first sale</Button></Link>
                    <Link to="/expenses"><Button variant="secondary">Add an expense</Button></Link>
                  </div>
                }
              />
            </Card>
          )}

          {data && !isNewBusiness && (
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <h2 className="mb-3">Sales performance</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.sales_series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF3" />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis fontSize={12} width={60} tickFormatter={(v) => formatNumber(v)} />
                      <Tooltip formatter={(v: number) => money(v)} />
                      <Line type="monotone" dataKey="value" stroke="#0B1630" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card>
                <h2 className="mb-3">Sales by category</h2>
                <div className="h-64">
                  {data.sales_by_category.length === 0 ? (
                    <EmptyState title="No category data yet" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.sales_by_category} dataKey="value" nameKey="label" innerRadius={45} outerRadius={80}>
                          {data.sales_by_category.map((_, i) => (
                            <Cell key={i} fill={PIE[i % PIE.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => money(v)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>

              <Card>
                <h2 className="mb-3">Top-selling products</h2>
                {data.top_products.length === 0 ? (
                  <EmptyState title="No sales in this period" />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.top_products} layout="vertical" margin={{ left: 10 }}>
                        <XAxis type="number" fontSize={12} />
                        <YAxis type="category" dataKey="name" width={90} fontSize={11} />
                        <Tooltip />
                        <Bar dataKey="quantity" fill="#D4AF37" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card className="lg:col-span-2 !p-0">
                <h2 className="p-4 pb-2">Recent transactions</h2>
                {data.recent_transactions.length === 0 ? (
                  <EmptyState title="No transactions yet" />
                ) : (
                  <DataTable
                    rowKey={(r) => r.id}
                    rows={data.recent_transactions}
                    columns={[
                      { key: 'n', header: 'Receipt', render: (r) => r.number },
                      { key: 'd', header: 'Date', render: (r) => formatDateTime(r.created_at), hideOnMobile: true },
                      { key: 't', header: 'Total', align: 'right', render: (r) => <span className="money">{money(r.total)}</span> },
                      { key: 's', header: 'Status', render: (r) => autoBadge(r.status) },
                    ]}
                  />
                )}
              </Card>

              <Card className="lg:col-span-3">
                <h2 className="mb-3">Low-stock alerts</h2>
                {data.low_stock.length === 0 ? (
                  <p className="text-sm text-grey-400">All products are above their minimum stock level.</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {data.low_stock.map((p) => (
                      <li key={p.id} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-amber-700">{p.quantity} left (min {p.min_stock})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </>
  );
}

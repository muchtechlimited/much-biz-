import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, ErrorState, PageHeader, SelectField, Spinner, TextField } from '../components/ui';
import { ApiError, downloadFile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatMoney, formatNumber } from '../lib/format';
import { useFetch } from '../lib/useFetch';

type Key = 'sales' | 'revenue' | 'profit' | 'inventory' | 'payments' | 'customers';
const TABS: { key: Key; label: string; timeSeries?: boolean; cost?: boolean }[] = [
  { key: 'sales', label: 'Sales', timeSeries: true }, { key: 'revenue', label: 'Revenue', timeSeries: true },
  { key: 'profit', label: 'Profit', timeSeries: true, cost: true }, { key: 'inventory', label: 'Inventory' },
  { key: 'payments', label: 'Payments' }, { key: 'customers', label: 'Customers' },
];
const iso = (d: Date) => d.toISOString().slice(0, 10);

type Row = Record<string, string | number | null>;
function Table({ cols, rows, money, plain = [] }: { cols: [string, string][]; rows: Row[]; money: (n: number) => string; plain?: string[] }) {
  if (!rows.length) return <p className="text-sm text-grey-400">No data for this period.</p>;
  const isMoney = (k: string) => !plain.includes(k);
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm">
      <thead><tr className="border-b text-xs uppercase text-grey-400">{cols.map(([k, l], i) => <th key={k} className={`py-1 ${i ? 'text-right' : ''}`}>{l}</th>)}</tr></thead>
      <tbody>{rows.map((r, n) => <tr key={n} className="border-b border-grey-100">{cols.map(([k], i) => {
        const v = r[k];
        return <td key={k} className={`py-1.5 ${i ? 'money text-right' : ''}`}>{v === null || v === undefined ? '—' : typeof v === 'number' ? (isMoney(k) ? money(v) : formatNumber(v)) : v}</td>;
      })}</tr>)}</tbody></table></div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-grey-50 p-3"><p className="text-xs text-grey-400">{label}</p><p className="money text-base font-bold text-navy">{value}</p></div>;
}

export default function Reports() {
  const { can } = useAuth();
  const tabs = TABS.filter((t) => !t.cost || can('products.cost'));
  const [tab, setTab] = useState<Key>('sales');
  const today = new Date();
  const [from, setFrom] = useState(iso(new Date(today.getTime() - 29 * 864e5)));
  const [to, setTo] = useState(iso(today));
  const [group, setGroup] = useState('day');
  const def = TABS.find((t) => t.key === tab)!;
  const bad = !from || !to || from > to;
  const csvRef = useRef<() => void>(() => {});
  return (
    <>
      <PageHeader title="Reports" subtitle="Figures are calculated by the server for the selected period" actions={<Button variant="secondary" onClick={() => csvRef.current()} disabled={bad}><Download className="h-4 w-4" /> Export CSV</Button>} />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {tabs.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
          className={`min-h-[44px] rounded-lg px-4 text-sm font-medium ${tab === t.key ? 'bg-navy text-white' : 'bg-white text-navy ring-1 ring-grey-200'}`}>{t.label}</button>)}
      </div>
      <Card className="mb-4"><div className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} error={from && to && from > to ? 'The start date is after the end date.' : undefined} />
        {def.timeSeries && <SelectField label="Group by" value={group} onChange={(e) => setGroup(e.target.value)} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />}
      </div></Card>
      <Body key={tab} tab={tab} from={from} to={to} group={group} bad={bad} csvRef={csvRef} />
    </>
  );
}

// Keyed by tab: switching tabs mounts a fresh component so one report's data is never rendered as another's.
function Body({ tab, from, to, group, bad, csvRef }: { tab: Key; from: string; to: string; group: string; bad: boolean; csvRef: React.MutableRefObject<() => void> }) {
  const { user, can } = useAuth();
  const { notify } = useToast();
  const money = (n: number) => formatMoney(n, user?.business?.currency ?? 'NGN');
  const def = TABS.find((t) => t.key === tab)!;
  const q = { date_from: from, date_to: to, group: def.timeSeries ? group : undefined };
  const { data, loading, error, reload } = useFetch<any>(bad ? null : `/reports/${tab}`, q);   // eslint-disable-line @typescript-eslint/no-explicit-any

  async function csv() {
    try { await downloadFile(`/reports/${tab}`, `${tab}-report.csv`, { ...q, format: 'csv' }); }
    catch (e) { notify('error', e instanceof ApiError ? e.message : 'Could not export.'); }
  }

  const upgrade = !!error && /not included in your (current )?plan/i.test(error);
  if (upgrade) {
    return (<><PageHeader title="Reports" /><Card><p className="font-medium text-navy">Advanced reports are not included in your plan</p>
      <p className="mt-1 text-sm text-grey-400">Upgrade to see sales, revenue, profit, inventory, payment and customer reports. The Dashboard still shows your daily summary.</p>
      {can('billing.view') && <Link to="/billing"><Button className="mt-4" variant="gold">View plans</Button></Link>}</Card></>);
  }

  const chartKey = tab === 'sales' ? 'net_sales' : tab === 'revenue' ? 'revenue' : 'gross_profit';
  csvRef.current = csv;
  return (
    <>
      {bad ? null : loading && !data ? <Spinner /> : error || !data ? <ErrorState message={error ?? 'Report unavailable.'} onRetry={reload} /> : (
        <div className="space-y-4">
          {def.timeSeries && data.series && (
            <Card><h2 className="mb-2 text-base">{def.label} over time</h2>
              {data.series.length === 0 ? <p className="text-sm text-grey-400">No data for this period.</p> : (
                <div className="h-56" role="img" aria-label={`${def.label} chart`}><ResponsiveContainer><BarChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="period" fontSize={11} /><YAxis fontSize={11} width={60} />
                  <Tooltip formatter={(v: number) => money(v)} /><Bar dataKey={chartKey} fill="#D4AF37" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>)}</Card>)}
          {tab === 'sales' && (<><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Stat label="Sales" value={formatNumber(data.totals.sales)} /><Stat label="Net sales" value={money(data.totals.net_sales)} /><Stat label="Average sale" value={money(data.totals.average_sale)} /><Stat label="Discounts" value={money(data.totals.discounts)} /><Stat label="Refunded" value={`${data.totals.refunds} · ${money(data.totals.refunded_amount)}`} /></div>
            <Card><Table money={money} plain={['sales', 'refunds']} rows={data.series} cols={[['period', 'Period'], ['sales', 'Sales'], ['net_sales', 'Net sales'], ['discounts', 'Discounts'], ['refunds', 'Refunds'], ['refunded_amount', 'Refunded']]} /></Card>
            <Card><h2 className="mb-2 text-base">By cashier</h2><Table money={money} plain={['sales']} rows={data.by_cashier} cols={[['cashier', 'Cashier'], ['sales', 'Sales'], ['total', 'Total']]} /></Card></>)}
          {tab === 'revenue' && (<><div className="grid grid-cols-3 gap-3"><Stat label="POS sales" value={money(data.totals.pos_sales)} /><Stat label="Invoiced" value={money(data.totals.invoiced)} /><Stat label="Total revenue" value={money(data.totals.revenue)} /></div>
            <Card><Table money={money} rows={data.series} cols={[['period', 'Period'], ['pos_sales', 'POS sales'], ['invoiced', 'Invoiced'], ['revenue', 'Revenue']]} /></Card>
            <p className="text-xs text-grey-400">Revenue counts completed POS sales and issued invoices. Refunded sales and cancelled or draft invoices are excluded.</p></>)}
          {tab === 'profit' && (<><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Stat label="Sales" value={money(data.totals.sales)} /><Stat label="Cost of goods" value={money(data.totals.cost_of_goods)} /><Stat label="Gross profit" value={`${money(data.totals.gross_profit)} (${data.totals.margin_percent}%)`} /><Stat label="Expenses" value={money(data.totals.expenses)} /><Stat label="Net profit" value={money(data.totals.net_profit)} /></div>
            <Card><Table money={money} plain={['margin_percent']} rows={data.series} cols={[['period', 'Period'], ['sales', 'Sales'], ['cost_of_goods', 'Cost'], ['gross_profit', 'Gross profit'], ['margin_percent', 'Margin %'], ['expenses', 'Expenses'], ['net_profit', 'Net profit']]} /></Card>
            <Card><h2 className="mb-2 text-base">Most profitable products</h2><Table money={money} plain={['quantity']} rows={data.top_products_by_profit} cols={[['name', 'Product'], ['quantity', 'Units'], ['revenue', 'Revenue'], ['profit', 'Profit']]} /></Card>
            <p className="text-xs text-grey-400">Profit covers POS sales only; invoices are not costed. Cost of goods is the cost recorded at the time of each sale.</p></>)}
          {tab === 'inventory' && (<><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Stat label="Products" value={formatNumber(data.totals.products)} /><Stat label="Units in stock" value={formatNumber(data.totals.units)} />
            <Stat label="Stock value (cost)" value={data.totals.stock_value_cost === null ? '—' : money(data.totals.stock_value_cost)} /><Stat label="Stock value (retail)" value={money(data.totals.stock_value_retail)} /><Stat label="Low / out" value={`${data.totals.low} / ${data.totals.out}`} /></div>
            <Card><Table money={money} plain={['quantity']} rows={data.items} cols={[['name', 'Product'], ['quantity', 'Qty'], ['status', 'Status'], ['selling_price', 'Price'], ['cost_value', 'Cost value'], ['retail_value', 'Retail value']]} /></Card>
            <Card><h2 className="mb-2 text-base">Stock movements in period</h2><Table money={money} plain={['units', 'entries']} rows={data.movements} cols={[['kind', 'Type'], ['units', 'Net units'], ['entries', 'Entries']]} /></Card></>)}
          {tab === 'payments' && (<><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="POS sales" value={money(data.totals.pos_sales)} /><Stat label="Customer payments" value={money(data.totals.customer_payments)} /><Stat label="Invoice payments" value={money(data.totals.invoice_payments)} /><Stat label="Total received" value={money(data.totals.total)} /></div>
            <Card><Table money={money} rows={data.methods} cols={[['method', 'Method'], ['pos_sales', 'POS sales'], ['customer_payments', 'Customer payments'], ['invoice_payments', 'Invoice payments'], ['total', 'Total']]} /></Card></>)}
          {tab === 'customers' && (<><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Stat label="Customers" value={formatNumber(data.totals.customers)} /><Stat label="New in period" value={formatNumber(data.totals.new_in_period)} /><Stat label="Active in period" value={formatNumber(data.totals.active_in_period)} /><Stat label="With a balance" value={formatNumber(data.totals.with_balance)} /><Stat label="Total outstanding" value={money(data.totals.total_outstanding)} /></div>
            <Card><h2 className="mb-2 text-base">Top customers</h2><Table money={money} rows={data.top_customers} cols={[['name', 'Customer'], ['purchases_in_period', 'Purchases in period'], ['total_purchases', 'All-time purchases']]} /></Card>
            <Card><h2 className="mb-2 text-base">Customers who owe</h2><Table money={money} rows={data.debtors} cols={[['name', 'Customer'], ['phone', 'Phone'], ['outstanding', 'Outstanding']]} /></Card></>)}
        </div>
      )}
    </>
  );
}

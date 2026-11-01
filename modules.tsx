import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button, Card, ConfirmDialog, Modal, PageHeader, SelectField, TextAreaField, TextField, autoBadge } from '../components/ui';
import { ResourceList } from '../components/ResourceList';
import type { FilterDef } from '../components/ResourceList';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatDate, formatDateTime, formatMoney, stockStatus } from '../lib/format';
import { useFetch } from '../lib/useFetch';
import type { Column } from '../components/ui';
import type { Customer, Product, Sale } from '../lib/types';

function useCur() {
  const { user } = useAuth();
  const cur = user?.business?.currency ?? 'NGN';
  return (n: number) => formatMoney(n, cur);
}

/* ---------------------------------------------------------------- Inventory */
export function Inventory() {
  const m = useCur();
  const { can } = useAuth();
  const { notify } = useToast();
  const [target, setTarget] = useState<Product | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);

  async function submit() {
    if (!target) return;
    setBusy(true);
    try {
      // Reason is mandatory; backend writes an immutable audit/movement record.
      await api.post('/inventory/adjustments', { product_id: target.id, quantity_change: Number(delta), reason });
      notify('success', 'Stock adjusted and recorded.');
      setTarget(null); setDelta(''); setReason('');
      setKey((k) => k + 1);
    } catch (e) {
      notify('error', e instanceof ApiError ? e.message : 'Adjustment failed.');
    } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Inventory" subtitle="Current stock, low-stock items and adjustments" />
      <ResourceList<Product>
        path="/inventory" reloadKey={key} rowKey={(p) => p.id}
        filters={[{ key: 'stock_status', label: 'Stock status', placeholder: 'All', options: [{ value: 'ok', label: 'In stock' }, { value: 'low', label: 'Low' }, { value: 'out', label: 'Out of stock' }] }]}
        emptyTitle="No stock to show" emptyDescription="Add products to start tracking inventory."
        columns={[
          { key: 'n', header: 'Product', render: (p) => <span className="font-medium">{p.name}</span> },
          { key: 'q', header: 'On hand', align: 'right', render: (p) => `${p.quantity} ${p.unit}` },
          { key: 'min', header: 'Minimum', align: 'right', render: (p) => p.min_stock, hideOnMobile: true },
          { key: 's', header: 'Status', render: (p) => autoBadge(stockStatus(p.quantity, p.min_stock)) },
          { key: 'a', header: '', align: 'right', render: (p) => can('inventory.adjust') && <Button variant="secondary" onClick={() => setTarget(p)}>Adjust</Button> },
        ]}
      />
      <Modal open={!!target} onClose={() => setTarget(null)} title={`Adjust stock: ${target?.name ?? ''}`}
        footer={<><Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button>
          <Button variant="gold" loading={busy} disabled={!delta || Number(delta) === 0 || reason.trim().length < 5} onClick={submit}>Record adjustment</Button></>}>
        <div className="space-y-4">
          <TextField label="Quantity change (use - to reduce)" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} hint={`Current stock: ${target?.quantity ?? 0}`} />
          <TextAreaField label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}

/* -------------------------------------------------------------------- Sales */
export function Sales() {
  const m = useCur();
  const { can } = useAuth();
  const { notify } = useToast();
  const [refund, setRefund] = useState<Sale | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);

  async function doRefund() {
    if (!refund) return;
    setBusy(true);
    try {
      await api.post(`/sales/${refund.id}/refund`, { reason });
      notify('success', 'Refund recorded.');
      setRefund(null); setReason(''); setKey((k) => k + 1);
    } catch (e) { notify('error', e instanceof ApiError ? e.message : 'Refund failed.'); }
    finally { setBusy(false); }
  }

  const filters: FilterDef[] = [
    { key: 'payment_method', label: 'Payment method', placeholder: 'All', options: [{ value: 'cash', label: 'Cash' }, { value: 'transfer', label: 'Transfer' }, { value: 'pos', label: 'POS' }] },
    { key: 'status', label: 'Status', placeholder: 'All', options: [{ value: 'completed', label: 'Completed' }, { value: 'refunded', label: 'Refunded' }, { value: 'cancelled', label: 'Cancelled' }] },
  ];
  return (
    <>
      <PageHeader title="Sales" subtitle="Transaction history" />
      <ResourceList<Sale> path="/sales" reloadKey={key} rowKey={(s) => s.id} dateRange filters={filters}
        emptyTitle="No sales yet" emptyDescription="Completed sales will appear here."
        columns={[
          { key: 'n', header: 'Receipt', render: (s) => <span className="font-medium">{s.number}</span> },
          { key: 'd', header: 'Date', render: (s) => formatDateTime(s.created_at) },
          { key: 'c', header: 'Customer', render: (s) => s.customer ?? 'Walk-in', hideOnMobile: true },
          { key: 'k', header: 'Cashier', render: (s) => s.cashier, hideOnMobile: true },
          { key: 't', header: 'Total', align: 'right', render: (s) => <span className="money">{m(s.total)}</span> },
          { key: 'p', header: 'Payment', render: (s) => <span className="capitalize">{s.payment_method}</span> },
          { key: 's', header: 'Status', render: (s) => autoBadge(s.status) },
          { key: 'a', header: '', align: 'right', render: (s) => (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" onClick={() => window.open(`/receipt/${s.id}`, '_blank')}>Receipt</Button>
              {can('sales.refund') && s.status === 'completed' && <Button variant="ghost" onClick={() => setRefund(s)}>Refund</Button>}
            </div>
          ) },
        ]} />
      <ConfirmDialog open={!!refund} onClose={() => setRefund(null)} title="Refund this sale?"
        message={`Refund ${refund?.number}? Stock and totals will be adjusted and the action stays traceable.`}
        confirmLabel="Refund" requireReason reason={reason} setReason={setReason} loading={busy} onConfirm={doRefund} />
    </>
  );
}

/* -------------------------------------------------- Generic create-and-list */
interface FieldDef { key: string; label: string; type?: string; required?: boolean; options?: { value: string; label: string }[] }

function CrudPage<T extends { id: string }>({
  title, subtitle, path, addLabel, fields, columns, filters, dateRange, emptyTitle, emptyDescription, permission,
}: {
  title: string; subtitle: string; path: string; addLabel: string; fields: FieldDef[];
  columns: Column<T>[]; filters?: FilterDef[]; dateRange?: boolean; emptyTitle: string; emptyDescription: string; permission?: string;
}) {
  const { can } = useAuth();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  const [secret, setSecret] = useState<string | null>(null);
  const allowed = !permission || can(permission);

  async function save() {
    const e: Record<string, string> = {};
    fields.forEach((f) => { if (f.required && !form[f.key]?.trim()) e[f.key] = `${f.label} is required.`; });
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      fields.forEach((f) => { const v = form[f.key]; if (v !== undefined && v !== '') body[f.key] = f.type === 'number' ? Number(v) : v; });
      const res = await api.post<{ temporary_password?: string } | undefined>(path, body);
      notify('success', 'Saved.');
      if (res?.temporary_password) setSecret(res.temporary_password);
      setOpen(false); setForm({}); setKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      notify('error', err instanceof ApiError ? err.message : 'Could not save.');
    } finally { setBusy(false); }
  }

  const add = allowed ? <Button variant="gold" onClick={() => { setForm({}); setErrors({}); setOpen(true); }}><Plus className="h-4 w-4" /> {addLabel}</Button> : null;
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={add} />
      <ResourceList<T> path={path} reloadKey={key} rowKey={(r) => r.id} columns={columns} filters={filters} dateRange={dateRange}
        emptyTitle={emptyTitle} emptyDescription={emptyDescription} emptyAction={add} />
      <Modal open={open} onClose={() => setOpen(false)} title={addLabel}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="gold" loading={busy} onClick={save}>Save</Button></>}>
        <div className="space-y-4">
          {fields.map((f) => f.options ? (
            <SelectField key={f.key} label={f.label} required={f.required} placeholder="Select" options={f.options} value={form[f.key] ?? ''} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} error={errors[f.key]} />
          ) : (
            <TextField key={f.key} label={f.label} required={f.required} type={f.type ?? 'text'} value={form[f.key] ?? ''} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} error={errors[f.key]} />
          ))}
        </div>
      </Modal>
      <Modal open={!!secret} onClose={() => setSecret(null)} title="Temporary password"
        footer={<Button onClick={() => setSecret(null)}>I have copied it</Button>}>
        <p className="text-sm">Share this with the new team member. It is shown <strong>only once</strong>; ask them to change it after signing in.</p>
        <p className="mt-3 select-all rounded-lg bg-grey-50 p-3 text-center font-mono text-base">{secret}</p>
      </Modal>
    </>
  );
}

/* --------------------------------------------------------------- Customers */
export function Customers() {
  const m = useCur();
  return (
    <CrudPage<Customer> title="Customers" subtitle="Customer records and balances" path="/customers" addLabel="Add customer" permission="customers.write"
      fields={[{ key: 'name', label: 'Name', required: true }, { key: 'phone', label: 'Phone number', type: 'tel' }, { key: 'email', label: 'Email', type: 'email' }]}
      emptyTitle="No customers yet" emptyDescription="Add customers to track purchases and balances."
      columns={[
        { key: 'n', header: 'Name', render: (c) => <span className="font-medium">{c.name}</span> },
        { key: 'p', header: 'Phone', render: (c) => c.phone ?? '—' },
        { key: 'e', header: 'Email', render: (c) => c.email ?? '—', hideOnMobile: true },
        { key: 't', header: 'Total purchases', align: 'right', render: (c) => <span className="money">{m(c.total_purchases)}</span> },
        { key: 'b', header: 'Balance', align: 'right', render: (c) => <span className="money">{m(c.outstanding_balance)}</span> },
        { key: 's', header: 'Status', render: (c) => autoBadge(c.status) },
        { key: 'x', header: '', render: (c) => <StatementLink id={c.id} /> },
      ]} />
  );
}

function StatementLink({ id }: { id: string }) {
  const { can } = useAuth();
  return can('customers.payments') ? <Link to={`/customers/${id}/statement`} className="text-sm font-medium text-navy underline">Statement</Link> : null;
}

/* --------------------------------------------------------------- Suppliers */
interface Supplier { id: string; name: string; contact_person?: string; phone?: string; email?: string; outstanding_balance: number }
export function Suppliers() {
  const m = useCur();
  return (
    <CrudPage<Supplier> title="Suppliers" subtitle="Who you buy from" path="/suppliers" addLabel="Add supplier" permission="suppliers.write"
      fields={[{ key: 'name', label: 'Supplier name', required: true }, { key: 'contact_person', label: 'Contact person' }, { key: 'phone', label: 'Phone', type: 'tel' }, { key: 'email', label: 'Email', type: 'email' }, { key: 'address', label: 'Address' }]}
      emptyTitle="No suppliers yet" emptyDescription="Add suppliers to record purchases."
      columns={[
        { key: 'n', header: 'Supplier', render: (s) => <span className="font-medium">{s.name}</span> },
        { key: 'c', header: 'Contact', render: (s) => s.contact_person ?? '—', hideOnMobile: true },
        { key: 'p', header: 'Phone', render: (s) => s.phone ?? '—' },
        { key: 'b', header: 'Balance', align: 'right', render: (s) => <span className="money">{m(s.outstanding_balance)}</span> },
      ]} />
  );
}

/* --------------------------------------------------------------- Purchases */
interface Purchase { id: string; reference: string; supplier: string; total: number; paid: number; status: string; created_at: string }
interface Line { product_id: string; quantity: string; unit_cost: string }
export function Purchases() {
  const m = useCur();
  const { can } = useAuth();
  const { notify } = useToast();
  const [key, setKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [paid, setPaid] = useState('0');
  const [lines, setLines] = useState<Line[]>([{ product_id: '', quantity: '1', unit_cost: '' }]);
  const [busy, setBusy] = useState(false);
  const sup = useFetch<{ items: { id: string; name: string }[] }>(open ? '/suppliers' : null, { page_size: 100 });
  const prods = useFetch<{ items: { id: string; name: string }[] }>(open ? '/products' : null, { page_size: 100 });
  const setLine = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const valid = supplier && lines.every((l) => l.product_id && Number(l.quantity) > 0 && l.unit_cost !== '' && Number(l.unit_cost) >= 0);
  async function create() {
    setBusy(true);
    try {
      await api.post('/purchases', {
        supplier_id: supplier, paid: Number(paid || 0),
        items: lines.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity), unit_cost: Number(l.unit_cost) })),
      });
      notify('success', 'Purchase order created. Stock changes only when you receive it.');
      setOpen(false); setLines([{ product_id: '', quantity: '1', unit_cost: '' }]); setSupplier(''); setPaid('0'); setKey((k) => k + 1);
    } catch (e) { notify('error', e instanceof ApiError ? e.message : 'Could not create purchase.'); }
    finally { setBusy(false); }
  }
  async function receive(p: Purchase) {
    try { await api.post(`/purchases/${p.id}/receive`); notify('success', 'Stock received.'); setKey((k) => k + 1); }
    catch (e) { notify('error', e instanceof ApiError ? e.message : 'Could not receive stock.'); }
  }
  return (
    <>
      <PageHeader title="Purchases" subtitle="Purchase orders. Creating an order does not change stock — receiving it does."
        actions={can('purchases.write') ? <Button variant="gold" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New purchase</Button> : undefined} />
      <Modal open={open} onClose={() => setOpen(false)} title="New purchase order" wide
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="gold" loading={busy} disabled={!valid} onClick={create}>Create order</Button></>}>
        <div className="space-y-4">
          <SelectField label="Supplier" required placeholder="Select supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)}
            options={(sup.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
              <SelectField label="Product" placeholder="Select" value={l.product_id} onChange={(e) => setLine(i, 'product_id', e.target.value)}
                options={(prods.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))} />
              <TextField label="Quantity" type="number" min="1" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
              <TextField label="Unit cost" type="number" min="0" step="0.01" value={l.unit_cost} onChange={(e) => setLine(i, 'unit_cost', e.target.value)} />
            </div>
          ))}
          <Button variant="ghost" onClick={() => setLines((ls) => [...ls, { product_id: '', quantity: '1', unit_cost: '' }])}>+ Add product</Button>
          <TextField label="Amount paid so far" type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </div>
      </Modal>
      <ResourceList<Purchase> path="/purchases" reloadKey={key} rowKey={(p) => p.id} dateRange
        emptyTitle="No purchases yet" emptyDescription="Purchase orders you create will appear here."
        columns={[
          { key: 'r', header: 'Reference', render: (p) => p.reference },
          { key: 's', header: 'Supplier', render: (p) => p.supplier },
          { key: 'd', header: 'Date', render: (p) => formatDate(p.created_at), hideOnMobile: true },
          { key: 't', header: 'Total', align: 'right', render: (p) => <span className="money">{m(p.total)}</span> },
          { key: 'o', header: 'Outstanding', align: 'right', render: (p) => <span className="money">{m(p.total - p.paid)}</span>, hideOnMobile: true },
          { key: 'st', header: 'Status', render: (p) => autoBadge(p.status) },
          { key: 'a', header: '', align: 'right', render: (p) => can('inventory.receive') && p.status === 'ordered' && <Button variant="secondary" onClick={() => receive(p)}>Receive stock</Button> },
        ]} />
    </>
  );
}

/* ---------------------------------------------------------------- Expenses */
interface Expense { id: string; description: string; category: string; amount: number; date: string; payment_method: string; recorded_by: string; status?: string }
const EXP_CATS = ['Rent', 'Transportation', 'Electricity', 'Internet', 'Salaries', 'Repairs', 'Advertising', 'Other expenses'].map((c) => ({ value: c, label: c }));
export function Expenses() {
  const m = useCur();
  return (
    <CrudPage<Expense> title="Expenses" subtitle="Track what your business spends" path="/expenses" addLabel="Add expense" permission="expenses.write" dateRange
      filters={[{ key: 'category', label: 'Category', placeholder: 'All', options: EXP_CATS }]}
      fields={[
        { key: 'description', label: 'Description', required: true },
        { key: 'category', label: 'Category', required: true, options: EXP_CATS },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'payment_method', label: 'Payment method', options: [{ value: 'cash', label: 'Cash' }, { value: 'transfer', label: 'Transfer' }, { value: 'pos', label: 'POS' }] },
      ]}
      emptyTitle="No expenses recorded" emptyDescription="Add an expense to see how it affects your profit."
      columns={[
        { key: 'd', header: 'Description', render: (e) => <span className="font-medium">{e.description}</span> },
        { key: 'c', header: 'Category', render: (e) => e.category },
        { key: 'a', header: 'Amount', align: 'right', render: (e) => <span className="money">{m(e.amount)}</span> },
        { key: 'dt', header: 'Date', render: (e) => formatDate(e.date), hideOnMobile: true },
        { key: 'r', header: 'Recorded by', render: (e) => e.recorded_by, hideOnMobile: true },
      ]} />
  );
}

/* ---------------------------------------------------------------- Invoices */
function NotAvailable({ title, text }: { title: string; text: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card><p className="font-medium text-navy">Not available yet</p><p className="mt-1 text-sm text-grey-400">{text}</p></Card>
    </>
  );
}

/* ------------------------------------------------------------------- Staff */
interface Staff { id: string; full_name: string; email: string; role: string; status: string; last_active?: string }
export function StaffPage() {
  return (
    <CrudPage<Staff> title="Staff" subtitle="Team members and roles. Permissions are enforced by the server." path="/staff" addLabel="Add staff" permission="staff.manage"
      fields={[
        { key: 'full_name', label: 'Full name', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'role', label: 'Role', required: true, options: ['manager', 'cashier', 'inventory_officer', 'accountant', 'supervisor'].map((r) => ({ value: r, label: r.replace('_', ' ') })) },
      ]}
      emptyTitle="No staff yet" emptyDescription="Invite employees and assign them roles."
      columns={[
        { key: 'n', header: 'Name', render: (s) => <span className="font-medium">{s.full_name}</span> },
        { key: 'e', header: 'Email', render: (s) => s.email, hideOnMobile: true },
        { key: 'r', header: 'Role', render: (s) => <span className="capitalize">{s.role.replace('_', ' ')}</span> },
        { key: 's', header: 'Status', render: (s) => autoBadge(s.status) },
        { key: 'l', header: 'Last activity', render: (s) => formatDateTime(s.last_active), hideOnMobile: true },
      ]} />
  );
}


/* ----------------------------------------------------- Static-ish info pages */

export function Help() {
  return (
    <>
      <PageHeader title="Help & Support" />
      <Card><p className="text-sm">Need help? Contact Much Tech Limited support. Support ticket submission connects to <code>/support/tickets</code>.</p></Card>
    </>
  );
}

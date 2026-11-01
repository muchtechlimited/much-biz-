import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, ConfirmDialog, Modal, PageHeader, SelectField, Spinner, TextAreaField, TextField, autoBadge } from '../components/ui';
import { ResourceList } from '../components/ResourceList';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatDate, formatMoney } from '../lib/format';
import type { Paginated } from '../lib/types';

interface Row { id: string; number: string; customer: string; status: string; total: number; paid: number; outstanding: number; due_date: string }
interface Detail extends Row {
  customer_id: string; notes: string | null; subtotal: number; cancel_reason: string | null; issue_date: string | null;
  items: { description: string; quantity: number; unit_price: number; line_total: number }[];
  payments: { amount: number; method: string; note: string | null; created_at: string }[];
  business: { name: string; phone: string | null; email: string | null; address: string | null; currency: string };
}
interface Line { description: string; quantity: string; unit_price: string }
const blank = (): Line => ({ description: '', quantity: '1', unit_price: '' });
const num = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : 0);

export default function Invoices() {
  const { user, can } = useAuth();
  const m = (n: number) => formatMoney(n, user?.business?.currency ?? 'NGN');
  const { notify } = useToast();
  const [gate, setGate] = useState<'checking' | 'ok' | 'plan' | 'error'>('checking');
  const [key, setKey] = useState(0);
  const [editing, setEditing] = useState<{ id?: string } | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/invoices', { page_size: 1 }).then(() => setGate('ok')).catch((e) => setGate(e instanceof ApiError && e.status === 402 ? 'plan' : 'error'));
  }, []);

  if (gate === 'checking') return <Spinner />;
  if (gate === 'plan') {
    return (<><PageHeader title="Invoices" /><Card><p className="font-medium text-navy">Invoicing is not included in your plan</p>
      <p className="mt-1 text-sm text-grey-400">Upgrade to create and track customer invoices.</p>
      {can('billing.view') && <Link to="/billing"><Button className="mt-4" variant="gold">View plans</Button></Link>}</Card></>);
  }
  const add = can('invoices.write') ? <Button variant="gold" onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Create invoice</Button> : null;
  return (
    <>
      <PageHeader title="Invoices" subtitle="Invoices are separate from POS sales. Payments are recorded against the invoice." actions={add} />
      <ResourceList<Row> path="/invoices" reloadKey={key} rowKey={(r) => r.id} searchPlaceholder="Search invoice number…" dateRange
        filters={[{ key: 'status', label: 'Status', placeholder: 'All', options: ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'].map((s) => ({ value: s, label: s.replace('_', ' ') })) }]}
        emptyTitle="No invoices yet" emptyDescription="Create an invoice to bill a customer." emptyAction={add}
        columns={[
          { key: 'n', header: 'Invoice', render: (i) => <button className="font-medium text-navy underline" onClick={() => setViewId(i.id)}>{i.number}</button> },
          { key: 'c', header: 'Customer', render: (i) => i.customer },
          { key: 't', header: 'Total', align: 'right', render: (i) => <span className="money">{m(i.total)}</span> },
          { key: 'o', header: 'Outstanding', align: 'right', render: (i) => <span className="money">{m(i.outstanding)}</span>, hideOnMobile: true },
          { key: 'd', header: 'Due', render: (i) => formatDate(i.due_date), hideOnMobile: true },
          { key: 's', header: 'Status', render: (i) => autoBadge(i.status) },
        ]} />
      {editing && <Builder id={editing.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setKey((k) => k + 1); }} />}
      {viewId && <Viewer id={viewId} onClose={() => setViewId(null)} onChanged={() => setKey((k) => k + 1)} onEdit={(id) => { setViewId(null); setEditing({ id }); }} />}
    </>
  );
}

function Builder({ id, onClose, onSaved }: { id?: string; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const c = await api.get<Paginated<{ id: string; name: string }>>('/customers', { page_size: 100 });
        setCustomers(c.items);
        if (id) {
          const d = await api.get<Detail>(`/invoices/${id}`);
          setCustomerId(d.customer_id); setDue(d.due_date.slice(0, 10)); setNotes(d.notes ?? '');
          setLines(d.items.map((i) => ({ description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price) })));
        }
      } catch { notify('error', 'Could not load the invoice form.'); onClose(); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const total = lines.reduce((s, l) => s + num(l.quantity) * num(l.unit_price), 0);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  async function save(issue: boolean) {
    const e: Record<string, string> = {};
    if (!customerId) e.customer = 'Choose a customer.';
    if (!due) e.due = 'Due date is required.';
    lines.forEach((l, i) => {
      if (!l.description.trim()) e[`d${i}`] = 'Required';
      if (!(num(l.quantity) > 0)) e[`q${i}`] = 'Must be above 0';
      if (l.unit_price === '' || num(l.unit_price) < 0) e[`p${i}`] = 'Enter a price';
    });
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body = { customer_id: customerId, due_date: due, notes: notes.trim() || null, issue,
      items: lines.map((l) => ({ description: l.description.trim(), quantity: num(l.quantity), unit_price: num(l.unit_price) })) };
    try {
      if (id) { await api.put(`/invoices/${id}`, body); if (issue) await api.post(`/invoices/${id}/issue`); }
      else await api.post('/invoices', body);
      notify('success', issue ? 'Invoice issued.' : 'Draft saved.');
      onSaved();
    } catch (err) { notify('error', err instanceof ApiError ? err.message : 'Could not save the invoice.'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open wide onClose={onClose} title={id ? 'Edit draft invoice' : 'Create invoice'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="secondary" loading={busy} onClick={() => save(false)}>Save draft</Button><Button variant="gold" loading={busy} onClick={() => save(true)}>Save &amp; issue</Button></>}>
      {loading ? <Spinner /> : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Customer" required placeholder="Select customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} error={errors.customer}
              options={customers.map((c) => ({ value: c.id, label: c.name }))} />
            <TextField label="Due date" type="date" required value={due} onChange={(e) => setDue(e.target.value)} error={errors.due} />
          </div>
          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_72px_110px_36px] items-start gap-2">
                <TextField label={i === 0 ? 'Description' : ''} aria-label={`Description ${i + 1}`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} error={errors[`d${i}`]} />
                <TextField label={i === 0 ? 'Qty' : ''} aria-label={`Quantity ${i + 1}`} type="number" min="0" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} error={errors[`q${i}`]} />
                <TextField label={i === 0 ? 'Unit price' : ''} aria-label={`Unit price ${i + 1}`} type="number" min="0" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} error={errors[`p${i}`]} />
                <button type="button" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}
                  className={`${i === 0 ? 'mt-[26px]' : ''} rounded p-2 text-grey-400 hover:text-red-600 disabled:opacity-30`}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setLines((ls) => [...ls, blank()])}><Plus className="h-4 w-4" /> Add line</Button>
          </div>
          <TextAreaField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          <p className="text-right text-lg font-bold text-navy">Total: <span className="money">{formatMoney(total)}</span></p>
        </div>
      )}
    </Modal>
  );
}

function Viewer({ id, onClose, onChanged, onEdit }: { id: string; onClose: () => void; onChanged: () => void; onEdit: (id: string) => void }) {
  const { can } = useAuth();
  const { notify } = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const load = () => api.get<Detail>(`/invoices/${id}`).then(setD).catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load invoice.'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  const m = (n: number) => formatMoney(n, d?.business.currency ?? 'NGN');
  const write = can('invoices.write');

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); notify('success', ok); await load(); onChanged(); }
    catch (e) { notify('error', e instanceof ApiError ? e.message : 'Action failed.'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open wide onClose={onClose} title={d ? `Invoice ${d.number}` : 'Invoice'}
      footer={d && <><Button variant="secondary" onClick={() => window.print()}>Print</Button><Button variant="secondary" onClick={onClose}>Close</Button></>}>
      {err ? <p className="text-sm text-red-600" role="alert">{err}</p> : !d ? <Spinner /> : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <div><p className="font-semibold text-navy">{d.business.name}</p><p className="text-grey-400">{[d.business.address, d.business.phone, d.business.email].filter(Boolean).join(' · ')}</p></div>
            <div className="text-right">{autoBadge(d.status)}<p className="mt-1 text-grey-400">Due {formatDate(d.due_date)}</p></div>
          </div>
          <p>Billed to <strong>{d.customer}</strong></p>
          <table className="w-full text-left"><thead><tr className="border-b text-xs uppercase text-grey-400"><th className="py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{d.items.map((i, n) => <tr key={n} className="border-b border-grey-100"><td className="py-1.5">{i.description}</td><td className="text-right">{i.quantity}</td><td className="money text-right">{m(i.unit_price)}</td><td className="money text-right">{m(i.line_total)}</td></tr>)}</tbody></table>
          <div className="space-y-0.5 text-right"><p>Total <span className="money font-bold">{m(d.total)}</span></p><p>Paid <span className="money">{m(d.paid)}</span></p><p className="font-semibold text-navy">Outstanding <span className="money">{m(d.outstanding)}</span></p></div>
          {d.notes && <p className="text-grey-400">Notes: {d.notes}</p>}
          {d.cancel_reason && <p className="text-red-700">Cancelled: {d.cancel_reason}</p>}
          {d.payments.length > 0 && <div><h3 className="mb-1 text-sm font-semibold">Payments</h3>{d.payments.map((p, n) => <p key={n} className="flex justify-between text-grey-500"><span>{formatDate(p.created_at)} · {p.method}{p.note ? ` · ${p.note}` : ''}</span><span className="money">{m(p.amount)}</span></p>)}</div>}
          {write && d.status === 'draft' && <div className="flex gap-2"><Button variant="secondary" onClick={() => onEdit(d.id)}>Edit</Button><Button variant="gold" loading={busy} onClick={() => act(() => api.post(`/invoices/${d.id}/issue`), 'Invoice issued.')}>Issue invoice</Button><Button variant="secondary" onClick={() => setCancelOpen(true)}>Cancel invoice</Button></div>}
          {write && ['issued', 'partially_paid', 'overdue'].includes(d.status) && (
            <div className="rounded-lg border border-grey-200 p-3">
              <p className="mb-2 font-semibold">Record a payment</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                <TextField label="Amount" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <SelectField label="Method" value={method} onChange={(e) => setMethod(e.target.value)} options={['cash', 'transfer', 'pos', 'card'].map((x) => ({ value: x, label: x }))} />
                <Button variant="gold" loading={busy} disabled={!(num(amount) > 0)} onClick={() => act(async () => { await api.post(`/invoices/${d.id}/payments`, { amount: num(amount), method }); setAmount(''); }, 'Payment recorded.')}>Record</Button>
              </div>
              {d.paid === 0 && <Button className="mt-2" variant="secondary" onClick={() => setCancelOpen(true)}>Cancel invoice</Button>}
            </div>
          )}
          <ConfirmDialog open={cancelOpen} title="Cancel this invoice?" message="The invoice is kept for your records but can no longer be paid." confirmLabel="Cancel invoice" requireReason reason={reason} setReason={setReason}
            loading={busy} onClose={() => setCancelOpen(false)} onConfirm={() => act(async () => { await api.post(`/invoices/${d.id}/cancel`, { reason }); setCancelOpen(false); setReason(''); }, 'Invoice cancelled.')} />
        </div>
      )}
    </Modal>
  );
}

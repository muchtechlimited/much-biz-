import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button, Modal, PageHeader, TextAreaField, TextField, autoBadge } from '../../components/ui';
import { ResourceList } from '../../components/ResourceList';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../lib/toast';
import { formatMoney } from '../../lib/format';

interface Plan {
  id: string; code: string; name: string; description: string; price_monthly: number; price_annual: number;
  max_products: number | null; max_staff: number | null; features: Record<string, boolean>; sort_order: number; status: string;
}
interface Form {
  code: string; name: string; description: string; price_monthly: string; price_annual: string;
  max_products: string; max_staff: string; sort_order: string; enabled: boolean; features: Record<string, boolean>; reason: string;
}
const blank: Form = { code: '', name: '', description: '', price_monthly: '0', price_annual: '0', max_products: '', max_staff: '', sort_order: '100', enabled: true, features: {}, reason: '' };
const lim = (n: number | null) => (n === null ? 'Unlimited' : String(n));

/** Super Admin plan editor. Limits and entitlements saved here are enforced by the backend immediately. */
export default function PlanEditor() {
  const { can } = useAuth();
  const { notify } = useToast();
  const canEdit = can('plans.write');
  const ent = useFetch<Record<string, { label: string; enforced: boolean }>>('/admin/entitlements');
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  const set = (k: keyof Form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  function open(p: Plan | 'new') {
    setErrors({});
    setEditing(p);
    setForm(p === 'new' ? blank : {
      code: p.code, name: p.name, description: p.description, price_monthly: String(p.price_monthly), price_annual: String(p.price_annual),
      max_products: p.max_products === null ? '' : String(p.max_products), max_staff: p.max_staff === null ? '' : String(p.max_staff),
      sort_order: String(p.sort_order), enabled: p.status === 'enabled', features: { ...p.features }, reason: '',
    });
  }

  function validate() {
    const e: Record<string, string> = {};
    if (editing === 'new' && !/^[a-z0-9_-]{2,40}$/.test(form.code)) e.code = 'Lowercase letters, numbers, - or _ (2-40).';
    if (form.name.trim().length < 2) e.name = 'Enter a plan name.';
    if (!(Number(form.price_monthly) >= 0) || form.price_monthly === '') e.price_monthly = 'Enter a valid price (0 or more).';
    if (!(Number(form.price_annual) >= 0) || form.price_annual === '') e.price_annual = 'Enter a valid price (0 = not offered).';
    for (const k of ['max_products', 'max_staff'] as const) if (form[k] !== '' && !(Number.isInteger(Number(form[k])) && Number(form[k]) >= 1)) e[k] = 'Whole number 1 or more, or leave blank for unlimited.';
    if (form.reason.trim().length < 5) e.reason = 'A reason (5+ characters) is required and is audited.';
    return e;
  }

  async function save() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body = {
      name: form.name.trim(), description: form.description, price_monthly: Number(form.price_monthly), price_annual: Number(form.price_annual),
      max_products: form.max_products === '' ? null : Number(form.max_products), max_staff: form.max_staff === '' ? null : Number(form.max_staff),
      sort_order: Number(form.sort_order || 100), enabled: form.enabled, features: form.features, reason: form.reason.trim(),
    };
    try {
      if (editing === 'new') await api.post('/admin/plans', { ...body, code: form.code });
      else if (editing) await api.patch(`/admin/plans/${editing.id}`, body);
      notify('success', 'Plan saved. Limits apply immediately.');
      setEditing(null);
      setKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      notify('error', err instanceof ApiError ? err.message : 'Could not save plan.');
    } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Subscription Plans" subtitle="Prices, limits and feature entitlements. Enforced by the backend, never only by the UI."
        actions={canEdit ? <Button variant="gold" onClick={() => open('new')}><Plus className="h-4 w-4" /> New plan</Button> : undefined} />
      <ResourceList<Plan> path="/admin/plans" reloadKey={key} rowKey={(p) => p.id} emptyTitle="No plans" emptyDescription="Create the first plan."
        columns={[
          { key: 'n', header: 'Plan', render: (p) => <span className="font-medium">{p.name} <code className="text-xs text-grey-400">{p.code}</code></span> },
          { key: 'pm', header: 'Monthly', align: 'right', render: (p) => <span className="money">{formatMoney(p.price_monthly)}</span> },
          { key: 'pa', header: 'Annual', align: 'right', render: (p) => p.price_annual > 0 ? <span className="money">{formatMoney(p.price_annual)}</span> : '—', hideOnMobile: true },
          { key: 'mp', header: 'Products', align: 'right', render: (p) => lim(p.max_products) },
          { key: 'ms', header: 'Staff', align: 'right', render: (p) => lim(p.max_staff) },
          { key: 's', header: 'Status', render: (p) => autoBadge(p.status === 'enabled' ? 'active' : 'inactive') },
          { key: 'a', header: '', align: 'right', render: (p) => canEdit && <Button variant="ghost" onClick={() => open(p)} aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></Button> },
        ]} />

      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'New plan' : `Edit plan: ${form.name}`}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button variant="gold" loading={busy} onClick={save}>Save plan</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          {editing === 'new' && <TextField label="Plan code" required value={form.code} onChange={(e) => set('code', e.target.value)} error={errors.code} hint="Permanent identifier" />}
          <TextField label="Name" required value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
          <TextField label="Monthly price (₦)" type="number" min="0" required value={form.price_monthly} onChange={(e) => set('price_monthly', e.target.value)} error={errors.price_monthly} hint="0 = free, not purchasable" />
          <TextField label="Annual price (₦)" type="number" min="0" required value={form.price_annual} onChange={(e) => set('price_annual', e.target.value)} error={errors.price_annual} hint="0 = annual billing not offered" />
          <TextField label="Product limit" type="number" min="1" value={form.max_products} onChange={(e) => set('max_products', e.target.value)} error={errors.max_products} hint="Blank = unlimited" />
          <TextField label="Staff account limit" type="number" min="1" value={form.max_staff} onChange={(e) => set('max_staff', e.target.value)} error={errors.max_staff} hint="Blank = unlimited. Includes the owner." />
          <TextField label="Display order" type="number" min="0" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
          <label className="flex min-h-[44px] items-center gap-2 self-end text-sm"><input type="checkbox" className="h-4 w-4 accent-navy" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Available for new subscriptions</label>
          <div className="sm:col-span-2"><TextAreaField label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Feature entitlements</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(ent.data ?? {}).map(([k, meta]) => (
                <label key={k} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-navy" checked={!!form.features[k]} onChange={(e) => setForm((f) => ({ ...f, features: { ...f.features, [k]: e.target.checked } }))} />
                  <span>{meta.label}{!meta.enforced && <span className="block text-xs text-grey-400">Not enforced yet — module not built</span>}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2"><TextAreaField label="Reason for change (required, audited)" value={form.reason} onChange={(e) => set('reason', e.target.value)} error={errors.reason} /></div>
        </div>
      </Modal>
    </>
  );
}

import { useState } from 'react';
import { Download, Pencil, Plus, Upload } from 'lucide-react';
import { Button, Modal, PageHeader, SelectField, TextAreaField, TextField, autoBadge } from '../components/ui';
import { ResourceList } from '../components/ResourceList';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatMoney, stockStatus } from '../lib/format';
import type { Product } from '../lib/types';

const UNITS = ['piece', 'pack', 'carton', 'kg', 'litre', 'metre', 'dozen'];

interface FormState {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  description: string;
  purchase_cost: string;
  selling_price: string;
  quantity: string;
  min_stock: string;
  unit: string;
}
const empty: FormState = {
  name: '', sku: '', barcode: '', category: '', description: '',
  purchase_cost: '', selling_price: '', quantity: '0', min_stock: '0', unit: 'piece',
};

export default function Products() {
  const { can, user } = useAuth();
  const { notify } = useToast();
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const cur = user?.business?.currency ?? 'NGN';
  const canEdit = can('products.write');
  const canSeeCost = can('products.cost');

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function openNew() {
    setEditing(null);
    setForm(empty);
    setErrors({});
    setOpen(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name, sku: p.sku, barcode: p.barcode ?? '', category: p.category ?? '',
      description: p.description ?? '', purchase_cost: String(p.purchase_cost ?? ''),
      selling_price: String(p.selling_price), quantity: String(p.quantity),
      min_stock: String(p.min_stock), unit: p.unit,
    });
    setErrors({});
    setOpen(true);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Product name is required.';
    if (!form.sku.trim()) e.sku = 'Product code is required.';
    if (form.selling_price === '' || Number(form.selling_price) < 0) e.selling_price = 'Enter a valid selling price.';
    if (canSeeCost && (form.purchase_cost === '' || Number(form.purchase_cost) < 0)) e.purchase_cost = 'Enter a valid purchase cost.';
    if (!editing && Number(form.quantity) < 0) e.quantity = 'Quantity cannot be negative.';
    if (Number(form.min_stock) < 0) e.min_stock = 'Minimum stock cannot be negative.';
    return e;
  }

  async function save() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const payload = {
      ...form,
      selling_price: Number(form.selling_price),
      quantity: Number(form.quantity),
      min_stock: Number(form.min_stock),
      // Only send cost if the user may manage it; the server rejects it otherwise.
      ...(canSeeCost ? { purchase_cost: Number(form.purchase_cost || 0) } : {}),
    };
    try {
      if (editing) await api.patch(`/products/${editing.id}`, payload);
      else await api.post('/products', payload);
      notify('success', editing ? 'Product updated.' : 'Product added.');
      setOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError) {
        // The backend guarantees SKU uniqueness per business; a 409 surfaces here.
        if (err.status === 409) setErrors({ sku: 'This product code is already used in your business.' });
        else if (err.fieldErrors) setErrors(err.fieldErrors);
        notify('error', err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? '/api/v1'}/products/export`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notify('error', 'Export failed. Please try again.');
    }
  }

  async function importCsv(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? '/api/v1'}/products/import`, { method: 'POST', body: fd, credentials: 'include' });
      if (!res.ok) throw new Error();
      notify('success', 'Import submitted.');
      setReloadKey((k) => k + 1);
    } catch {
      notify('error', 'Import failed. Check the file and try again.');
    }
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Your product catalogue"
        actions={
          <>
            {canEdit && (
              <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-grey-200 bg-white px-4 text-sm font-semibold text-navy hover:bg-grey-50">
                <Upload className="h-4 w-4" /> Import
                <input type="file" accept=".csv" className="hidden" onChange={(e) => importCsv(e.target.files?.[0])} />
              </label>
            )}
            <Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
            {canEdit && <Button variant="gold" onClick={openNew}><Plus className="h-4 w-4" /> Add product</Button>}
          </>
        }
      />

      <ResourceList<Product>
        path="/products"
        reloadKey={reloadKey}
        rowKey={(p) => p.id}
        searchPlaceholder="Name, code or barcode"
        filters={[
          { key: 'stock_status', label: 'Stock status', placeholder: 'All', options: [{ value: 'ok', label: 'In stock' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }] },
        ]}
        emptyTitle="No products yet"
        emptyDescription="Add the items you sell so you can track stock and ring up sales."
        emptyAction={canEdit ? <Button variant="gold" onClick={openNew}>Add your first product</Button> : undefined}
        columns={[
          { key: 'name', header: 'Product', render: (p) => <span className="font-medium">{p.name}</span> },
          { key: 'sku', header: 'Code', render: (p) => p.sku, hideOnMobile: true },
          { key: 'cat', header: 'Category', render: (p) => p.category ?? '—', hideOnMobile: true },
          ...(canSeeCost
            ? [{ key: 'cost', header: 'Cost', align: 'right' as const, render: (p: Product) => <span className="money">{formatMoney(p.purchase_cost ?? 0, cur)}</span> }]
            : []),
          { key: 'price', header: 'Price', align: 'right', render: (p) => <span className="money">{formatMoney(p.selling_price, cur)}</span> },
          { key: 'qty', header: 'Qty', align: 'right', render: (p) => `${p.quantity} ${p.unit}` },
          { key: 'st', header: 'Status', render: (p) => autoBadge(stockStatus(p.quantity, p.min_stock)) },
          { key: 'act', header: '', align: 'right', render: (p) => canEdit && (
            <Button variant="ghost" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></Button>
          ) },
        ]}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit product' : 'Add product'}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="gold" onClick={save} loading={busy}>{editing ? 'Save changes' : 'Add product'}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Product name" required value={form.name} onChange={(e) => set('name')(e.target.value)} error={errors.name} />
          <TextField label="Product code / SKU" required value={form.sku} onChange={(e) => set('sku')(e.target.value)} error={errors.sku} />
          <TextField label="Barcode" value={form.barcode} onChange={(e) => set('barcode')(e.target.value)} />
          <TextField label="Category" value={form.category} onChange={(e) => set('category')(e.target.value)} />
          {canSeeCost && (
            <TextField label="Purchase cost" type="number" inputMode="decimal" min="0" step="0.01" required value={form.purchase_cost} onChange={(e) => set('purchase_cost')(e.target.value)} error={errors.purchase_cost} />
          )}
          <TextField label="Selling price" type="number" inputMode="decimal" min="0" step="0.01" required value={form.selling_price} onChange={(e) => set('selling_price')(e.target.value)} error={errors.selling_price} />
          {!editing && (
            <TextField label="Initial stock quantity" type="number" min="0" value={form.quantity} onChange={(e) => set('quantity')(e.target.value)} error={errors.quantity} />
          )}
          <TextField label="Minimum stock level" type="number" min="0" value={form.min_stock} onChange={(e) => set('min_stock')(e.target.value)} error={errors.min_stock} />
          <SelectField label="Unit of measurement" value={form.unit} onChange={(e) => set('unit')(e.target.value)} options={UNITS.map((u) => ({ value: u, label: u }))} />
          <div className="sm:col-span-2">
            <TextAreaField label="Description" value={form.description} onChange={(e) => set('description')(e.target.value)} />
          </div>
          {editing && (
            <p className="text-xs text-grey-400 sm:col-span-2">
              To change stock quantity, use Inventory &gt; Adjust stock so a reason and audit record are captured.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

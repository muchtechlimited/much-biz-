import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../../components/Brand';
import { Button, Card, SelectField, TextField } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';

const CATEGORIES = ['Retail shop', 'Supermarket / provisions', 'Pharmacy', 'Fashion & clothing', 'Electronics', 'Restaurant / food', 'Services', 'Other'];

/** 3 short steps. Only step 1 is mandatory; everything else can be completed later in Settings. */
export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: '',
    category: '',
    phone: '',
    email: '',
    address: '',
    currency: 'NGN',
    receipt_footer: 'Thank you for shopping with us!',
    receipt_width: '80mm',
  });
  const [logo, setLogo] = useState<File | null>(null);
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function next() {
    const e: Record<string, string> = {};
    if (step === 1) {
      if (form.name.trim().length < 2) e.name = 'Enter your business name.';
      if (!form.category) e.category = 'Choose a category.';
      if (!/^(\+?234|0)\d{10}$/.test(form.phone.replace(/\s/g, ''))) e.phone = 'Enter a valid phone number.';
    }
    setErrors(e);
    if (!Object.keys(e).length) setStep((s) => s + 1);
  }

  async function finish() {
    setBusy(true);
    try {
      await api.post('/business/setup', form);
      if (logo) {
        const fd = new FormData();
        fd.append('file', logo);
        // Multipart upload; the backend validates type and size.
        await fetch(`${import.meta.env.VITE_API_BASE_URL ?? '/api/v1'}/business/logo`, {
          method: 'POST',
          body: fd,
          credentials: 'include',
        });
      }
      await refresh();
      notify('success', 'Your business is ready.');
      navigate('/', { replace: true });
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Could not save your business.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-grey-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <Logo />
        <h1 className="mt-6">Set up your business</h1>
        <p className="mt-1 text-sm text-grey-400">Step {step} of 3 — you can finish optional details later.</p>
        <div className="mt-3 h-1.5 rounded bg-grey-100">
          <div className="h-full rounded bg-gold transition-all" style={{ width: `${(step / 3) * 100}%` }} />
        </div>

        <Card className="mt-6 space-y-4">
          {step === 1 && (
            <>
              <h2>Business details</h2>
              <TextField label="Business name" value={form.name} onChange={(e) => set('name')(e.target.value)} error={errors.name} required />
              <SelectField label="Business category" value={form.category} onChange={(e) => set('category')(e.target.value)} placeholder="Select category" options={CATEGORIES.map((c) => ({ value: c, label: c }))} error={errors.category} required />
              <TextField label="Business phone number" type="tel" value={form.phone} onChange={(e) => set('phone')(e.target.value)} error={errors.phone} required />
            </>
          )}
          {step === 2 && (
            <>
              <h2>Contact &amp; branding <span className="text-sm font-normal text-grey-400">(optional)</span></h2>
              <TextField label="Business email" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
              <TextField label="Business address" value={form.address} onChange={(e) => set('address')(e.target.value)} />
              <SelectField label="Currency" value={form.currency} onChange={(e) => set('currency')(e.target.value)} options={[{ value: 'NGN', label: 'Nigerian naira (₦)' }]} />
              <div>
                <label className="mb-1 block text-sm font-medium">Business logo</label>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:min-h-[44px] file:rounded-lg file:border-0 file:bg-navy file:px-4 file:font-semibold file:text-white" />
                <p className="mt-1 text-xs text-grey-400">PNG, JPG or WebP.</p>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h2>Receipt settings <span className="text-sm font-normal text-grey-400">(optional)</span></h2>
              <TextField label="Receipt footer message" value={form.receipt_footer} onChange={(e) => set('receipt_footer')(e.target.value)} />
              <SelectField label="Paper size" value={form.receipt_width} onChange={(e) => set('receipt_width')(e.target.value)} options={[{ value: '58mm', label: 'Thermal 58mm' }, { value: '80mm', label: 'Thermal 80mm' }, { value: 'a4', label: 'Standard A4' }]} />
            </>
          )}

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={step === 1}>Back</Button>
            {step < 3 ? (
              <Button onClick={next}>Continue</Button>
            ) : (
              <Button variant="gold" onClick={finish} loading={busy}>Finish setup</Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

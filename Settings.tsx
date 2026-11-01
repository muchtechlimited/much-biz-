import { useEffect, useState } from 'react';
import { Button, Card, PageHeader, SelectField, Spinner, TextField } from '../components/ui';
import { PasswordField } from './auth/Login';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

interface Biz { name: string; category: string | null; phone: string | null; email: string | null; address: string | null; currency: string; receipt_footer: string; receipt_width: string }

function BusinessTab() {
  const { can, refresh } = useAuth();
  const { notify } = useToast();
  const [b, setB] = useState<Biz | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const canEdit = can('settings.write');
  useEffect(() => { api.get<Biz>('/business').then(setB).catch(() => notify('error', 'Could not load business profile.')); /* eslint-disable-next-line */ }, []);
  if (!b) return <Spinner />;
  const set = (k: keyof Biz) => (e: { target: { value: string } }) => setB({ ...b, [k]: e.target.value });

  async function save() {
    if (!b) return;
    if (b.name.trim().length < 2) { setErrors({ name: 'Business name is required.' }); return; }
    setErrors({}); setBusy(true);
    try {
      await api.patch('/business', { name: b.name.trim(), category: b.category || null, phone: b.phone || null, email: b.email || null, address: b.address || null,
        currency: b.currency, receipt_footer: b.receipt_footer, receipt_width: b.receipt_width });
      await refresh(); notify('success', 'Business profile saved.');
    } catch (e) { notify('error', e instanceof ApiError ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  }
  return (
    <Card>
      <h2 className="mb-1">Business profile</h2>
      {!canEdit && <p className="mb-3 text-sm text-grey-400">Only the owner or a manager can change these details.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Business name" required disabled={!canEdit} value={b.name} onChange={set('name')} error={errors.name} />
        <TextField label="Category" disabled={!canEdit} value={b.category ?? ''} onChange={set('category')} />
        <TextField label="Business phone" disabled={!canEdit} value={b.phone ?? ''} onChange={set('phone')} />
        <TextField label="Business email" type="email" disabled={!canEdit} value={b.email ?? ''} onChange={set('email')} />
        <div className="sm:col-span-2"><TextField label="Address" disabled={!canEdit} value={b.address ?? ''} onChange={set('address')} /></div>
        <TextField label="Receipt footer message" disabled={!canEdit} maxLength={255} value={b.receipt_footer} onChange={set('receipt_footer')} />
        <SelectField label="Receipt paper size" disabled={!canEdit} value={b.receipt_width} onChange={set('receipt_width')}
          options={[{ value: '58mm', label: '58 mm thermal' }, { value: '80mm', label: '80 mm thermal' }, { value: 'a4', label: 'A4' }]} />
      </div>
      {canEdit && <div className="mt-5"><Button variant="gold" loading={busy} onClick={save}>Save changes</Button></div>}
    </Card>
  );
}

function AccountTab() {
  const { user, refresh } = useAuth();
  const { notify } = useToast();
  const [name, setName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [nw2, setNw2] = useState('');
  const [pwErr, setPwErr] = useState(''); const [pwBusy, setPwBusy] = useState(false);

  async function saveProfile() {
    if (name.trim().length < 2) { notify('error', 'Please enter your full name.'); return; }
    setBusy(true);
    try { await api.patch('/auth/me', { full_name: name.trim(), phone: phone.trim() || null }); await refresh(); notify('success', 'Profile updated.'); }
    catch (e) { notify('error', e instanceof ApiError ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  }
  async function changePw() {
    setPwErr('');
    if (nw !== nw2) { setPwErr('New passwords do not match.'); return; }
    if (nw.length < 8 || !/[A-Za-z]/.test(nw) || !/\d/.test(nw)) { setPwErr('Use at least 8 characters with letters and numbers.'); return; }
    setPwBusy(true);
    try {
      await api.post('/auth/change-password', { current_password: cur, new_password: nw });
      notify('success', 'Password changed. Other devices have been signed out.');
      setCur(''); setNw(''); setNw2('');
      window.location.assign('/login');   // this session is revoked too
    } catch (e) { setPwErr(e instanceof ApiError ? e.message : 'Could not change password.'); }
    finally { setPwBusy(false); }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="mb-3">Your account</h2>
        <div className="space-y-4">
          <TextField label="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField label="Email (sign-in)" value={user?.email ?? ''} disabled readOnly />
          <TextField label="Role" value={(user?.role ?? '').replace('_', ' ')} disabled readOnly />
          <Button variant="gold" loading={busy} onClick={saveProfile}>Save profile</Button>
        </div>
      </Card>
      <Card>
        <h2 className="mb-3">Change password</h2>
        <div className="space-y-4">
          <PasswordField label="Current password" value={cur} onChange={setCur} autoComplete="current-password" />
          <PasswordField label="New password" value={nw} onChange={setNw} autoComplete="new-password" />
          <PasswordField label="Confirm new password" value={nw2} onChange={setNw2} autoComplete="new-password" error={pwErr || undefined} />
          <Button loading={pwBusy} disabled={!cur || !nw || !nw2} onClick={changePw}>Change password</Button>
        </div>
      </Card>
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState<'business' | 'account'>('business');
  return (
    <>
      <PageHeader title="Settings" subtitle="Business profile, receipts and your account" />
      <div className="mb-4 flex gap-2" role="tablist">
        {([['business', 'Business'], ['account', 'Account & security']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`min-h-[44px] rounded-lg px-4 text-sm font-medium ${tab === k ? 'bg-navy text-white' : 'bg-white text-navy ring-1 ring-grey-200'}`}>{l}</button>
        ))}
      </div>
      {tab === 'business' ? <BusinessTab /> : <AccountTab />}
    </>
  );
}

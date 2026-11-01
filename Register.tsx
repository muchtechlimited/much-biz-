import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, TextField } from '../../components/ui';
import { AuthLayout, PasswordField } from './Login';
import { useAuth } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import { useToast } from '../../lib/toast';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '' });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function validate() {
    const e: Record<string, string> = {};
    if (form.full_name.trim().length < 2) e.full_name = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address.';
    if (!/^(\+?234|0)\d{10}$/.test(form.phone.replace(/\s/g, ''))) e.phone = 'Enter a valid Nigerian phone number.';
    if (form.password.length < 8) e.password = 'Use at least 8 characters.';
    if (form.confirm !== form.password) e.confirm = 'Passwords do not match.';
    if (!agree) e.agree = 'You must accept the Terms and Privacy Policy.';
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setFormError('');
    try {
      await register({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
      });
      notify('success', 'Account created. Please sign in.');
      navigate('/login');
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      setFormError(err instanceof ApiError ? err.message : 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <h1>Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-grey-400">Start free. Set up your business in minutes.</p>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {formError}
          </div>
        )}
        <TextField label="Full name" value={form.full_name} onChange={(e) => set('full_name')(e.target.value)} error={errors.full_name} autoComplete="name" required />
        <TextField label="Email address" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} error={errors.email} autoComplete="email" required />
        <TextField label="Phone number" type="tel" value={form.phone} onChange={(e) => set('phone')(e.target.value)} error={errors.phone} placeholder="0803 000 0000" autoComplete="tel" required />
        <PasswordField label="Password" value={form.password} onChange={set('password')} error={errors.password} autoComplete="new-password" />
        <PasswordField label="Confirm password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" />
        <div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-navy" />
            <span>
              I agree to the <Link to="/terms" className="font-medium underline">Terms</Link> and{' '}
              <Link to="/privacy" className="font-medium underline">Privacy Policy</Link>.
            </span>
          </label>
          {errors.agree && <p className="mt-1 text-xs font-medium text-red-600">{errors.agree}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-navy underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
}

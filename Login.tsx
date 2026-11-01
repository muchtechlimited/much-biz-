import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Logo } from '../../components/Brand';
import { Button, TextField } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { ApiError } from '../../lib/api';

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy p-10 text-white lg:flex">
        <Logo size="lg" />
        <div>
          <h1 className="!text-4xl !font-extrabold leading-tight !text-white">
            RUN YOUR BUSINESS <span className="text-gold">SMARTER.</span>
          </h1>
          <p className="mt-4 max-w-md text-white/70">
            Manage your inventory, sales, expenses, and business performance in one organized system.
          </p>
        </div>
        <div className="text-sm text-white/50">
          <p>MUCH BIZ — A MUCH TECH LIMITED PRODUCT.</p>
          <p className="text-gold/80">Innovating Technology. Empowering Growth.</p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-white p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  error,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextField
        label={label}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
        autoComplete={autoComplete}
        required
        className="pr-11"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-[30px] rounded p-2 text-grey-400 hover:text-navy"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function Login({ admin = false }: { admin?: boolean }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(identifier.trim(), password, remember, admin ? otp.trim() : undefined);
      if (admin) {
        if (!user.platform_role) throw new ApiError('This account is not a platform administrator.', 403);
        navigate('/admin', { replace: true });
      } else if (user.platform_role && !user.business) {
        navigate('/admin', { replace: true });
      } else {
        navigate(location.state?.from ?? '/', { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <h1>{admin ? 'Platform sign in' : 'Welcome back'}</h1>
      <p className="mb-6 mt-1 text-sm text-grey-400">
        {admin ? 'Authorized Much Tech Limited personnel only.' : 'Sign in to manage your business.'}
      </p>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <TextField
          label="Email or username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          required
        />
        <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        {admin && (
          <TextField
            label="Two-factor code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            hint="6-digit code from your authenticator app."
          />
        )}
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-grey-200 accent-navy"
            />
            Remember me
          </label>
          <Link to="/forgot-password" className="font-medium text-navy underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!identifier || !password}>
          Sign in
        </Button>
      </form>
      {!admin && (
        <p className="mt-6 text-center text-sm">
          New to Much Biz?{' '}
          <Link to="/register" className="font-semibold text-navy underline">
            Create an account
          </Link>
        </p>
      )}
      <p className="mt-8 text-center text-xs text-grey-400">
        <Link to="/privacy" className="underline">Privacy</Link> · <Link to="/terms" className="underline">Terms</Link>
      </p>
    </AuthLayout>
  );
}

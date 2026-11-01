import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, ErrorState, PageHeader, Spinner, TextField } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';

/** Mandatory for platform admins: every /admin endpoint rejects admins without 2FA. */
export default function Setup2FA() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [data, setData] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [error, setError] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.two_factor_enabled) return;
    api.post<{ secret: string; otpauth_uri: string }>('/auth/2fa/setup').then(setData).catch((e) =>
      setError(e instanceof ApiError ? e.message : 'Could not start setup.'),
    );
  }, [user?.two_factor_enabled]);

  async function enable() {
    setBusy(true);
    try {
      await api.post('/auth/2fa/enable', { otp });
      await refresh();
      notify('success', 'Two-factor authentication enabled.');
      navigate('/admin', { replace: true });
    } catch (e) {
      notify('error', e instanceof ApiError ? e.message : 'Invalid code.');
    } finally {
      setBusy(false);
    }
  }

  if (user?.two_factor_enabled) return <Card>Two-factor authentication is already enabled on your account.</Card>;
  if (error) return <ErrorState message={error} />;
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Set up two-factor authentication" subtitle="Required for all platform administrators." />
      <Card className="max-w-md space-y-4">
        <p className="text-sm">Scan this QR code with Google Authenticator, Microsoft Authenticator or similar, then enter the 6-digit code.</p>
        <div className="flex justify-center rounded-lg bg-white p-3"><QRCodeSVG value={data.otpauth_uri} size={176} /></div>
        <p className="break-all text-xs text-grey-400">Manual key: <code>{data.secret}</code></p>
        <TextField label="6-digit code" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
        <Button variant="gold" loading={busy} disabled={otp.length !== 6} onClick={enable}>Enable 2FA</Button>
      </Card>
    </>
  );
}

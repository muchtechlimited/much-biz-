import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Button, Card, Spinner } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';

type State = { kind: 'checking' } | { kind: 'successful' } | { kind: 'failed'; reason?: string | null } | { kind: 'pending' } | { kind: 'error'; message: string };

/**
 * Landing page after Paystack. The URL is NOT trusted: we only take the reference from it and ask OUR server,
 * which independently verifies the transaction with Paystack. Nothing is "paid" until the server says so.
 */
export default function BillingCallback() {
  const [params] = useSearchParams();
  const reference = params.get('reference') ?? params.get('trxref');
  const [state, setState] = useState<State>({ kind: 'checking' });
  const { refresh } = useAuth();
  const tries = useRef(0);

  useEffect(() => {
    if (!reference) { setState({ kind: 'error', message: 'Missing payment reference.' }); return; }
    let stop = false;
    const check = async () => {
      try {
        const r = await api.get<{ status: string; failure_reason?: string | null }>(`/billing/verify/${encodeURIComponent(reference)}`);
        if (stop) return;
        if (r.status === 'successful') { await refresh(); setState({ kind: 'successful' }); return; }
        if (r.status === 'failed') { setState({ kind: 'failed', reason: r.failure_reason }); return; }
        if (++tries.current < 8) setTimeout(check, 3000); else setState({ kind: 'pending' });
      } catch (e) {
        if (stop) return;
        if (e instanceof ApiError && e.status === 502 && ++tries.current < 8) { setTimeout(check, 3000); return; }
        setState({ kind: 'error', message: e instanceof ApiError ? e.message : 'Could not confirm your payment.' });
      }
    };
    check();
    return () => { stop = true; };
  }, [reference, refresh]);

  return (
    <div className="mx-auto max-w-md pt-8">
      <Card className="text-center">
        {state.kind === 'checking' && <Spinner label="Confirming your payment…" />}
        {state.kind === 'successful' && (<><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-3">Payment confirmed</h1><p className="mt-1 text-sm text-grey-400">Your plan is now active.</p></>)}
        {state.kind === 'failed' && (<><XCircle className="mx-auto h-12 w-12 text-red-600" /><h1 className="mt-3">Payment not completed</h1><p className="mt-1 text-sm text-grey-400">{state.reason ?? 'The payment did not go through.'} You have not been charged for this plan.</p></>)}
        {state.kind === 'pending' && (<><Clock className="mx-auto h-12 w-12 text-amber-600" /><h1 className="mt-3">Still confirming</h1><p className="mt-1 text-sm text-grey-400">We have not received confirmation yet. If you completed payment, your plan activates automatically within a few minutes.</p></>)}
        {state.kind === 'error' && (<><XCircle className="mx-auto h-12 w-12 text-red-600" /><h1 className="mt-3">Something went wrong</h1><p className="mt-1 text-sm text-grey-400">{state.message}</p></>)}
        {state.kind !== 'checking' && <Link to="/billing"><Button className="mt-5">Back to billing</Button></Link>}
      </Card>
    </div>
  );
}

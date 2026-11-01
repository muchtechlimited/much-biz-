import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button, Card, DataTable, EmptyState, ErrorState, PageHeader, Spinner, autoBadge } from '../../components/ui';
import { useFetch } from '../../lib/useFetch';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../../lib/format';
import type { Paginated } from '../../lib/types';

export interface PlanCard {
  code: string; name: string; description: string; price_monthly: number; price_annual: number;
  max_products: number | null; max_staff: number | null; features: Record<string, boolean>;
}
export interface BillingOverview {
  plan: PlanCard | null; status: string; cycle: string | null; renews_at: string | null; days_left: number | null;
  usage: { products: number; staff: number }; payments_enabled: boolean; payment_mode: 'test' | 'live' | null;
}
interface PaymentRow {
  id: string; reference: string; plan: string; amount: number; currency: string; status: string;
  mode: string | null; failure_reason: string | null; created_at: string; paid_at: string | null;
}

const FEATURE_LABELS: Record<string, string> = {
  csv_export: 'CSV product import / export', invoicing: 'Invoicing', advanced_reports: 'Advanced reports', priority_support: 'Priority support',
};
const limit = (n: number | null) => (n === null ? 'Unlimited' : formatNumber(n));

function Meter({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span className="font-medium">{used} / {limit(max)}</span></div>
      <div className="mt-1 h-2 rounded bg-grey-100"><div className={`h-full rounded ${pct >= 90 ? 'bg-red-500' : 'bg-gold'}`} style={{ width: `${max ? pct : 0}%` }} /></div>
    </div>
  );
}

export default function Billing() {
  const { can } = useAuth();
  const { notify } = useToast();
  const ov = useFetch<BillingOverview>('/billing/overview');
  const plans = useFetch<{ items: PlanCard[] }>('/billing/plans');
  const pays = useFetch<Paginated<PaymentRow>>('/billing/payments', { page_size: 10 });
  const [busy, setBusy] = useState<string | null>(null);
  const canPay = can('billing.manage');

  async function upgrade(code: string) {
    setBusy(code);
    try {
      const r = await api.post<{ authorization_url: string }>('/billing/checkout', { plan_code: code, cycle: 'monthly' });
      const url = new URL(r.authorization_url);
      if (url.protocol !== 'https:') throw new Error('bad url');   // only ever redirect to an https checkout page
      window.location.assign(url.toString());
    } catch (e) {
      notify('error', e instanceof ApiError ? e.message : 'Could not start checkout.');
      setBusy(null);
    }
  }

  if (ov.loading && !ov.data) return <Spinner />;
  if (ov.error || !ov.data) return <Card><ErrorState message={ov.error ?? 'Unavailable'} onRetry={ov.reload} /></Card>;
  const o = ov.data;
  const expired = o.status === 'expired';

  return (
    <>
      <PageHeader title="Subscription & Billing" subtitle="Your plan, usage and payment history" />

      {o.payment_mode === 'test' && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800" role="note">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> Payments are in <strong className="mx-1">TEST mode</strong> — no real money is charged.
        </div>
      )}
      {!o.payments_enabled && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Online payments are not available right now. Please contact Much Tech support to change your plan.
        </div>
      )}
      {expired && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Your subscription expired. Your data is safe and viewable, but changes are disabled until you renew.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-grey-400">Current plan</p>
              <p className="text-xl font-bold text-navy">{o.plan?.name ?? '—'}</p>
            </div>
            <div className="text-right text-sm">
              {autoBadge(o.status)}
              {o.renews_at && <p className="mt-1 text-grey-400">{expired ? 'Expired' : 'Renews'} {formatDate(o.renews_at)}{!expired && o.days_left !== null && ` (${o.days_left} days)`}</p>}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Meter label="Products" used={o.usage.products} max={o.plan?.max_products ?? null} />
            <Meter label="Staff accounts" used={o.usage.staff} max={o.plan?.max_staff ?? null} />
          </div>
        </Card>
        <Card>
          <h2 className="mb-2">Included</h2>
          <ul className="space-y-1.5 text-sm">
            {Object.entries(FEATURE_LABELS).map(([k, label]) => (
              <li key={k} className={o.plan?.features[k] ? '' : 'text-grey-400 line-through'}>
                <CheckCircle2 className={`mr-2 inline h-4 w-4 ${o.plan?.features[k] ? 'text-emerald-600' : 'text-grey-200'}`} />{label}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <h2 className="mb-3 mt-8">Plans</h2>
      {plans.loading && !plans.data ? <Spinner /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.data?.items.map((p) => {
            const current = p.code === o.plan?.code;
            const purchasable = p.price_monthly > 0;
            return (
              <Card key={p.code} className={current ? 'ring-2 ring-gold' : ''}>
                <h3 className="text-base font-semibold text-navy">{p.name}</h3>
                <p className="money mt-1 text-2xl text-navy">{p.price_monthly > 0 ? formatMoney(p.price_monthly) : 'Free'}<span className="text-sm font-normal text-grey-400">{p.price_monthly > 0 ? ' / month' : ''}</span></p>
                <p className="mt-1 text-xs text-grey-400">{p.description}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  <li>{limit(p.max_products)} products</li>
                  <li>{limit(p.max_staff)} staff account{p.max_staff === 1 ? '' : 's'}</li>
                  {Object.entries(FEATURE_LABELS).filter(([k]) => p.features[k]).map(([k, l]) => <li key={k}>{l}</li>)}
                </ul>
                <div className="mt-4">
                  {current && !expired ? (
                    purchasable && canPay ? <Button variant="secondary" className="w-full" disabled={!o.payments_enabled} loading={busy === p.code} onClick={() => upgrade(p.code)}>Renew</Button>
                      : <p className="text-center text-sm font-medium text-gold-600">Current plan</p>
                  ) : purchasable && canPay ? (
                    <Button variant="gold" className="w-full" disabled={!o.payments_enabled} loading={busy === p.code} onClick={() => upgrade(p.code)}>{expired && current ? 'Renew' : 'Choose plan'}</Button>
                  ) : purchasable ? <p className="text-center text-xs text-grey-400">Only the owner can change plans.</p> : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 mt-8">Payment history</h2>
      <Card className="!p-0">
        {pays.loading && !pays.data ? <Spinner /> : pays.error ? <ErrorState message={pays.error} onRetry={pays.reload} />
          : !pays.data?.items.length ? <EmptyState title="No payments yet" description="Your subscription payments will appear here." />
          : <DataTable rowKey={(r) => r.id} rows={pays.data.items} columns={[
              { key: 'd', header: 'Date', render: (r) => formatDateTime(r.paid_at ?? r.created_at) },
              { key: 'p', header: 'Plan', render: (r) => r.plan },
              { key: 'a', header: 'Amount', align: 'right', render: (r) => <span className="money">{formatMoney(r.amount, r.currency)}</span> },
              { key: 'm', header: 'Mode', render: (r) => r.mode === 'test' ? <span className="text-xs uppercase text-blue-700">test</span> : r.mode ?? '—', hideOnMobile: true },
              { key: 's', header: 'Status', render: (r) => <span title={r.failure_reason ?? ''}>{autoBadge(r.status === 'successful' ? 'paid' : r.status)}</span> },
              { key: 'r', header: 'Reference', render: (r) => <code className="text-xs">{r.reference}</code>, hideOnMobile: true },
            ]} />}
      </Card>
    </>
  );
}

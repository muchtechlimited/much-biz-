import { useState } from 'react';
import NotificationsPage from '../Notifications';
import { Banknote, Building2, CreditCard, ShieldAlert, Users } from 'lucide-react';
import { Button, Card, ConfirmDialog, ErrorState, PageHeader, Spinner, StatCard, autoBadge } from '../../components/ui';
import { ResourceList } from '../../components/ResourceList';
import { useFetch } from '../../lib/useFetch';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { formatDateTime, formatMoney, formatNumber } from '../../lib/format';

interface Overview {
  total_businesses: number; total_users: number; active_businesses: number; suspended_businesses: number;
  new_registrations: number; free_businesses: number; paid_subscribers: number; active_subscriptions: number;
  expired_subscriptions: number; successful_payments: number; failed_payments: number; mrr: number; security_alerts: number;
}

function NotAvailable({ title, text }: { title: string; text: string }) {
  return (<><PageHeader title={title} /><Card><p className="font-medium text-navy">Not available yet</p><p className="mt-1 text-sm text-grey-400">{text}</p></Card></>);
}

export function AdminOverview() {
  const { can } = useAuth();
  if (!can('businesses.view')) {
    return <NotAvailable title="Overview" text="Platform statistics are not part of your role. Use the menu to open the sections you can access." />;
  }
  return <AdminOverviewData />;
}

function AdminOverviewData() {
  const { data, loading, error, reload } = useFetch<Overview>('/admin/overview');
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState message={error ?? 'Unavailable'} onRetry={reload} />;
  const n = formatNumber;
  return (
    <>
      <PageHeader title="Overview" subtitle="Platform statistics from live database records" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Businesses" value={n(data.total_businesses)} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Users" value={n(data.total_users)} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Active" value={n(data.active_businesses)} />
        <StatCard label="Suspended" value={n(data.suspended_businesses)} />
        <StatCard label="New registrations" value={n(data.new_registrations)} />
        <StatCard label="Free plan" value={n(data.free_businesses)} />
        <StatCard label="Paid subscribers" value={n(data.paid_subscribers)} icon={<CreditCard className="h-5 w-5" />} />
        <StatCard label="Active subscriptions" value={n(data.active_subscriptions)} />
        <StatCard label="Expired subscriptions" value={n(data.expired_subscriptions)} />
        <StatCard label="Successful payments" value={n(data.successful_payments)} />
        <StatCard label="Failed payments" value={n(data.failed_payments)} />
        <StatCard label="MRR" value={formatMoney(data.mrr)} icon={<Banknote className="h-5 w-5" />} />
        <StatCard label="Security alerts" value={n(data.security_alerts)} icon={<ShieldAlert className="h-5 w-5" />} />
      </div>
    </>
  );
}

interface Biz { id: string; name: string; status: string; plan: string; created_at: string }
export function AdminBusinesses() {
  const { can } = useAuth();
  const { notify } = useToast();
  const [target, setTarget] = useState<Biz | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);

  async function toggle() {
    if (!target) return;
    setBusy(true);
    const action = target.status === 'suspended' ? 'reactivate' : 'suspend';
    try {
      await api.post(`/admin/businesses/${target.id}/${action}`, { reason });
      notify('success', `Business ${action}d. Data is retained.`);
      setTarget(null); setReason(''); setKey((k) => k + 1);
    } catch (e) { notify('error', e instanceof ApiError ? e.message : 'Action failed.'); }
    finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader title="Businesses" subtitle="Suspending never deletes business data" />
      <ResourceList<Biz> path="/admin/businesses" reloadKey={key} rowKey={(b) => b.id} dateRange
        filters={[
          { key: 'status', label: 'Status', placeholder: 'All', options: [{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }] },
          { key: 'plan', label: 'Plan', placeholder: 'All', options: [{ value: 'free', label: 'Free Starter' }, { value: 'business', label: 'Business' }, { value: 'professional', label: 'Professional' }] },
        ]}
        emptyTitle="No businesses" emptyDescription="Registered businesses appear here."
        columns={[
          { key: 'n', header: 'Business', render: (b) => <span className="font-medium">{b.name}</span> },
          { key: 'id', header: 'ID', render: (b) => <code className="text-xs">{b.id.slice(0, 8)}</code>, hideOnMobile: true },
          { key: 'p', header: 'Plan', render: (b) => b.plan },
          { key: 's', header: 'Status', render: (b) => autoBadge(b.status) },
          { key: 'd', header: 'Registered', render: (b) => formatDateTime(b.created_at), hideOnMobile: true },
          { key: 'a', header: '', align: 'right', render: (b) => can('businesses.suspend') && (
            <Button variant="secondary" onClick={() => setTarget(b)}>{b.status === 'suspended' ? 'Reactivate' : 'Suspend'}</Button>
          ) },
        ]} />
      <ConfirmDialog open={!!target} onClose={() => setTarget(null)} requireReason reason={reason} setReason={setReason}
        title={`${target?.status === 'suspended' ? 'Reactivate' : 'Suspend'} ${target?.name ?? ''}?`}
        message="This is a high-impact action. It is recorded in the audit log with your reason."
        confirmLabel={target?.status === 'suspended' ? 'Reactivate' : 'Suspend'} loading={busy} onConfirm={toggle} />
    </>
  );
}

interface Row { id: string; [k: string]: unknown }
function SimpleAdminList({ title, subtitle, path, cols }: { title: string; subtitle: string; path: string; cols: { key: string; header: string; badge?: boolean; date?: boolean; money?: boolean }[] }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <ResourceList<Row> path={path} rowKey={(r) => r.id} dateRange emptyTitle={`No ${title.toLowerCase()}`} emptyDescription="Nothing to show yet."
        columns={cols.map((c) => ({
          key: c.key, header: c.header, align: c.money ? 'right' as const : undefined,
          render: (r: Row) => {
            const v = r[c.key];
            if (v === null || v === undefined) return '—';
            if (c.badge) return autoBadge(String(v));
            if (c.date) return formatDateTime(String(v));
            if (c.money) return <span className="money">{formatMoney(Number(v))}</span>;
            return String(v);
          },
        }))} />
    </>
  );
}

export const AdminUsers = () => <SimpleAdminList title="Users" subtitle="Platform users. Passwords are never visible." path="/admin/users" cols={[{ key: 'full_name', header: 'Name' }, { key: 'email', header: 'Email' }, { key: 'status', header: 'Status', badge: true }, { key: 'last_login', header: 'Last login', date: true }]} />;
export const AdminSubscriptions = () => <SimpleAdminList title="Subscriptions" subtitle="Active and expired subscriptions" path="/admin/subscriptions" cols={[{ key: 'business', header: 'Business' }, { key: 'plan', header: 'Plan' }, { key: 'status', header: 'Status', badge: true }, { key: 'renews_at', header: 'Renewal', date: true }]} />;
export const AdminPayments = () => <SimpleAdminList title="Payments" subtitle="Status reflects verified provider notifications, not browser redirects" path="/admin/payments" cols={[{ key: 'reference', header: 'Reference' }, { key: 'business', header: 'Business' }, { key: 'amount', header: 'Amount', money: true }, { key: 'status', header: 'Status', badge: true }, { key: 'paid_at', header: 'Date', date: true }]} />;
export { default as AdminTickets } from './AdminTickets';
export const AdminAdmins = () => <SimpleAdminList title="Administrators & Roles" subtitle="Super Admin, Support Admin, Finance Admin" path="/admin/administrators" cols={[{ key: 'full_name', header: 'Name' }, { key: 'platform_role', header: 'Role' }, { key: 'status', header: 'Status', badge: true }, { key: 'two_factor', header: '2FA' }]} />;
export const AdminAudit = () => <SimpleAdminList title="Audit Logs" subtitle="Read-only, tamper-protected record of administrative actions" path="/admin/audit-logs" cols={[{ key: 'event_type', header: 'Event' }, { key: 'actor', header: 'Actor' }, { key: 'target', header: 'Affected record' }, { key: 'outcome', header: 'Outcome', badge: true }, { key: 'created_at', header: 'Time', date: true }]} />;
export const AdminNotifications = () => <NotificationsPage base="/admin/notifications" />;

export function AdminSettings() {
  return (
    <>
      <PageHeader title="Platform Settings" subtitle="Branding, feature flags, maintenance notices and integrations" />
      <Card><p className="text-sm text-grey-400">Sensitive settings require elevated authorization on the server. Secret keys are never exposed to the frontend.</p></Card>
    </>
  );
}

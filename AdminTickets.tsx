import { useEffect, useState } from 'react';
import { Button, Modal, PageHeader, SelectField, Spinner, TextAreaField, autoBadge } from '../../components/ui';
import { ResourceList } from '../../components/ResourceList';
import { Conversation } from '../Support';
import type { TicketDetail } from '../Support';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { formatDateTime } from '../../lib/format';

interface Row { id: string; reference: string; subject: string; business: string; status: string; priority: string; priority_plan: boolean; assigned_to: string | null; updated_at: string; last_reply_by: string }
const STATUS = ['open', 'in_progress', 'awaiting_customer', 'resolved', 'closed'];
const label = (s: string) => s.replace(/_/g, ' ');

export default function AdminTickets() {
  const [key, setKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Support Tickets" subtitle="Customer support queue. Priority-plan customers and tickets awaiting a reply are listed first." />
      <ResourceList<Row> path="/admin/tickets" reloadKey={key} rowKey={(r) => r.id} searchPlaceholder="Search reference or subject…"
        filters={[
          { key: 'status', label: 'Status', placeholder: 'All statuses', options: STATUS.map((s) => ({ value: s, label: label(s) })) },
          { key: 'priority', label: 'Priority', placeholder: 'Any priority', options: ['low', 'normal', 'high'].map((s) => ({ value: s, label: s })) },
          { key: 'assigned', label: 'Assignee', placeholder: 'Anyone', options: [{ value: 'me', label: 'Assigned to me' }, { value: 'none', label: 'Unassigned' }] },
        ]}
        emptyTitle="No tickets" emptyDescription="Nothing in the queue."
        columns={[
          { key: 'r', header: 'Reference', render: (t) => <button className="font-medium text-navy underline" onClick={() => setOpenId(t.id)}>{t.reference}</button> },
          { key: 's', header: 'Subject', render: (t) => <span>{t.subject}{t.priority_plan && <span className="ml-2 rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gold-600">Priority plan</span>}</span> },
          { key: 'b', header: 'Business', render: (t) => t.business, hideOnMobile: true },
          { key: 'p', header: 'Priority', render: (t) => autoBadge(t.priority), hideOnMobile: true },
          { key: 'a', header: 'Assigned', render: (t) => (t.assigned_to ? (t.assigned_to === user?.id ? 'You' : 'Assigned') : 'Unassigned'), hideOnMobile: true },
          { key: 'u', header: 'Updated', render: (t) => formatDateTime(t.updated_at), hideOnMobile: true },
          { key: 'st', header: 'Status', render: (t) => <span className="inline-flex items-center gap-1">{autoBadge(t.status)}{t.last_reply_by === 'shop' && ['open', 'in_progress'].includes(t.status) && <span className="text-xs font-medium text-red-600">Needs reply</span>}</span> },
        ]} />
      {openId && <Detail id={openId} onClose={() => setOpenId(null)} onChanged={() => setKey((k) => k + 1)} />}
    </>
  );
}

type Full = TicketDetail & { business: string; opened_by: string; assigned_to: string | null; priority_plan: boolean };

function Detail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { can, user } = useAuth();
  const { notify } = useToast();
  const write = can('tickets.write');
  const [t, setT] = useState<Full | null>(null); const [err, setErr] = useState('');
  const [text, setText] = useState(''); const [internal, setInternal] = useState(false); const [busy, setBusy] = useState(false);
  const load = () => api.get<Full>(`/admin/tickets/${id}`).then(setT).catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load.'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); notify('success', ok); await load(); onChanged(); }
    catch (e) { notify('error', e instanceof ApiError ? e.message : 'Action failed.'); } finally { setBusy(false); }
  }
  const patch = (body: object, ok: string) => run(() => api.patch(`/admin/tickets/${id}`, body), ok);

  return (
    <Modal open wide onClose={onClose} title={t ? `${t.reference} · ${t.subject}` : 'Ticket'} footer={<Button variant="secondary" onClick={onClose}>Close window</Button>}>
      {err ? <p role="alert" className="text-sm text-red-600">{err}</p> : !t ? <Spinner /> : (
        <div className="space-y-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="text-grey-400">Business:</span> {t.business}</p><p><span className="text-grey-400">Opened by:</span> {t.opened_by}</p>
            <p><span className="text-grey-400">Opened:</span> {formatDateTime(t.created_at)}</p>
            <p><span className="text-grey-400">First response:</span> {t.first_response_at ? formatDateTime(t.first_response_at) : 'Not yet'}</p>
            <p><span className="text-grey-400">Resolved:</span> {t.resolved_at ? formatDateTime(t.resolved_at) : '—'}</p>
          </div>
          {write && (
            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <SelectField label="Status" value={t.status} disabled={busy} onChange={(e) => patch({ status: e.target.value }, 'Status updated.')} options={STATUS.map((s) => ({ value: s, label: label(s) }))} />
              <SelectField label="Priority" value={t.priority} disabled={busy} onChange={(e) => patch({ priority: e.target.value }, 'Priority updated.')} options={['low', 'normal', 'high'].map((s) => ({ value: s, label: s }))} />
              <Button variant="secondary" disabled={busy || t.assigned_to === user?.id} onClick={() => patch({ assigned_to: 'me' }, 'Assigned to you.')}>{t.assigned_to === user?.id ? 'Assigned to you' : 'Assign to me'}</Button>
            </div>)}
          <Conversation messages={t.messages} viewer="admin" />
          {write ? (
            <div className="space-y-2">
              <TextAreaField label={internal ? 'Internal note (not visible to the customer)' : 'Reply to customer'} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note only</label>
              <Button variant="gold" loading={busy} disabled={!text.trim()} onClick={() => run(async () => { await api.post(`/admin/tickets/${id}/messages`, { message: text.trim(), internal }); setText(''); }, internal ? 'Note added.' : 'Reply sent.')}>{internal ? 'Add note' : 'Send reply'}</Button>
            </div>) : <p className="text-sm text-grey-400">Your role can view tickets but not reply.</p>}
        </div>)}
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, ConfirmDialog, Modal, SelectField, Spinner, TextAreaField, TextField, autoBadge } from '../components/ui';
import { ResourceList } from '../components/ResourceList';
import { api, ApiError } from '../lib/api';
import { useToast } from '../lib/toast';
import { formatDateTime } from '../lib/format';
import { PageHeader } from '../components/ui';

export interface Msg { id: string; author: string; from: 'shop' | 'admin'; body: string; created_at: string; internal?: boolean }
export interface TicketDetail { id: string; reference: string; subject: string; category: string; status: string; priority: string; messages: Msg[];
  created_at: string; first_response_at: string | null; resolved_at: string | null; last_reply_by: string; [k: string]: unknown }
interface Row { id: string; reference: string; subject: string; category: string; status: string; updated_at: string; last_reply_by: string }

const CATEGORIES = [['general', 'General question'], ['billing', 'Billing & subscription'], ['technical', 'Something is not working'], ['account', 'My account'], ['feature_request', 'Feature request']];
const label = (s: string) => s.replace(/_/g, ' ');

export function Conversation({ messages, viewer }: { messages: Msg[]; viewer: 'shop' | 'admin' }) {
  return (
    <ol className="space-y-3" aria-label="Conversation">
      {messages.map((m) => {
        const mine = m.from === viewer;
        return (
          <li key={m.id} className={`max-w-[92%] rounded-lg p-3 text-sm ${m.internal ? 'border border-dashed border-amber-400 bg-amber-50' : mine ? 'ml-auto bg-navy text-white' : 'bg-grey-50 text-charcoal'}`}>
            <p className={`mb-1 text-xs ${mine && !m.internal ? 'text-white/70' : 'text-grey-400'}`}>{m.internal ? 'Internal note · ' : ''}{m.author}{m.from === 'admin' && viewer === 'shop' ? ' (Much Biz support)' : ''} · {formatDateTime(m.created_at)}</p>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
          </li>
        );
      })}
    </ol>
  );
}

export default function Support() {
  const { notify } = useToast();
  const [key, setKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const add = <Button variant="gold" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New ticket</Button>;
  return (
    <>
      <PageHeader title="Support" subtitle="Ask Much Biz support for help. We reply here and notify you." actions={add} />
      <ResourceList<Row> path="/support/tickets" reloadKey={key} rowKey={(r) => r.id} searchPlaceholder="Search…"
        filters={[{ key: 'status', label: 'Status', placeholder: 'All', options: ['open', 'in_progress', 'awaiting_customer', 'resolved', 'closed'].map((s) => ({ value: s, label: label(s) })) }]}
        emptyTitle="No tickets yet" emptyDescription="Open a ticket if you need help with anything." emptyAction={add}
        columns={[
          { key: 'r', header: 'Reference', render: (t) => <button className="font-medium text-navy underline" onClick={() => setOpenId(t.id)}>{t.reference}</button> },
          { key: 's', header: 'Subject', render: (t) => t.subject },
          { key: 'c', header: 'Category', render: (t) => <span className="capitalize">{label(t.category)}</span>, hideOnMobile: true },
          { key: 'u', header: 'Updated', render: (t) => formatDateTime(t.updated_at), hideOnMobile: true },
          { key: 'st', header: 'Status', render: (t) => <span className="inline-flex items-center gap-1">{autoBadge(t.status)}{t.last_reply_by === 'admin' && t.status !== 'closed' && t.status !== 'resolved' && <span className="text-xs font-medium text-gold-600">New reply</span>}</span> },
        ]} />
      {creating && <NewTicket onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); setKey((k) => k + 1); setOpenId(id); }} />}
      {openId && <Thread id={openId} onClose={() => setOpenId(null)} onChanged={() => setKey((k) => k + 1)} />}
    </>
  );
  void notify;
}

function NewTicket({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { notify } = useToast();
  const [subject, setSubject] = useState(''); const [category, setCategory] = useState('general'); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [errors, setErrors] = useState<Record<string, string>>({});
  async function send() {
    const e: Record<string, string> = {};
    if (subject.trim().length < 3) e.subject = 'Give your ticket a short subject.';
    if (message.trim().length < 5) e.message = 'Please describe the problem.';
    setErrors(e); if (Object.keys(e).length) return;
    setBusy(true);
    try { const r = await api.post<{ id: string }>('/support/tickets', { subject: subject.trim(), category, message: message.trim() }); notify('success', 'Ticket sent.'); onDone(r.id); }
    catch (err) { notify('error', err instanceof ApiError ? err.message : 'Could not send the ticket.'); }
    finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="New support ticket" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="gold" loading={busy} onClick={send}>Send ticket</Button></>}>
      <div className="space-y-4">
        <TextField label="Subject" required maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} error={errors.subject} />
        <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES.map(([value, l]) => ({ value, label: l }))} />
        <TextAreaField label="How can we help?" required maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} error={errors.message} />
      </div>
    </Modal>
  );
}

function Thread({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { notify } = useToast();
  const [t, setT] = useState<TicketDetail | null>(null); const [err, setErr] = useState('');
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  const load = () => api.get<TicketDetail>(`/support/tickets/${id}`).then(setT).catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load the ticket.'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try { await api.post(`/support/tickets/${id}/messages`, { message: text.trim() }); setText(''); await load(); onChanged(); }
    catch (e) { notify('error', e instanceof ApiError ? e.message : 'Could not send.'); } finally { setBusy(false); }
  }
  async function close() {
    setBusy(true);
    try { await api.post(`/support/tickets/${id}/close`); setConfirm(false); await load(); onChanged(); notify('success', 'Ticket closed.'); }
    catch (e) { notify('error', e instanceof ApiError ? e.message : 'Could not close.'); } finally { setBusy(false); }
  }
  return (
    <Modal open wide onClose={onClose} title={t ? `${t.reference} · ${t.subject}` : 'Ticket'}
      footer={<Button variant="secondary" onClick={onClose}>Close window</Button>}>
      {err ? <p role="alert" className="text-sm text-red-600">{err}</p> : !t ? <Spinner /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">{autoBadge(t.status)}<span className="capitalize text-grey-400">{label(t.category)}</span>
            <span className="text-grey-400">· Opened {formatDateTime(t.created_at)}</span>
            {t.first_response_at ? <span className="text-grey-400">· First reply {formatDateTime(t.first_response_at)}</span> : <span className="text-grey-400">· Waiting for our first reply</span>}</div>
          <Conversation messages={t.messages} viewer="shop" />
          {t.status === 'closed' ? <p className="text-sm text-grey-400">This ticket is closed. Open a new ticket if you still need help.</p> : (
            <div className="space-y-2">
              <TextAreaField label="Your reply" value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} />
              <div className="flex gap-2"><Button variant="gold" loading={busy} disabled={!text.trim()} onClick={send}>Send reply</Button>
                <Button variant="secondary" onClick={() => setConfirm(true)}>Close ticket</Button></div>
            </div>)}
          <ConfirmDialog open={confirm} title="Close this ticket?" message="You will not be able to reply after closing it." confirmLabel="Close ticket" loading={busy} onClose={() => setConfirm(false)} onConfirm={close} />
        </div>)}
    </Modal>
  );
}

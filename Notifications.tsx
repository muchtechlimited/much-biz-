import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pagination, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useFetch } from '../lib/useFetch';
import type { Paginated } from '../lib/types';

interface Note { id: string; kind: string; title: string; body: string | null; link: string | null; created_at: string; read: boolean }

/** Shared by the shop (/notifications) and the admin panel (/admin/notifications). */
export default function NotificationsPage({ base }: { base: '/notifications' | '/admin/notifications' }) {
  const nav = useNavigate();
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch<Paginated<Note> & { unread: number }>(base, { page, page_size: 20 });

  async function open(n: Note) {
    if (!n.read) { try { await api.post(`${base}/${n.id}/read`); } catch { /* still navigate */ } window.dispatchEvent(new Event('mb:notifications')); }
    if (n.link) nav(n.link); else reload();
  }
  async function readAll() { await api.post(`${base}/read-all`); window.dispatchEvent(new Event('mb:notifications')); reload(); }

  return (
    <>
      <PageHeader title="Notifications" subtitle={data ? `${data.unread} unread` : undefined}
        actions={<Button variant="secondary" onClick={readAll} disabled={!data || data.unread === 0}>Mark all as read</Button>} />
      {loading && !data ? <Spinner /> : error || !data ? <ErrorState message={error ?? 'Unavailable'} onRetry={reload} /> :
        data.items.length === 0 ? <EmptyState title="You're all caught up" description="New notifications will appear here." icon={<Bell className="h-8 w-8" />} /> : (
          <Card className="!p-0">
            <ul className="divide-y divide-grey-100">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button onClick={() => open(n)} className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-grey-50 ${n.read ? '' : 'bg-gold/5'}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-gold'}`} aria-label={n.read ? 'Read' : 'Unread'} />
                    <span className="min-w-0 flex-1"><span className={`block text-sm ${n.read ? '' : 'font-semibold'} text-navy`}>{n.title}</span>
                      {n.body && <span className="block truncate text-sm text-grey-400">{n.body}</span>}</span>
                    <span className="shrink-0 text-xs text-grey-400">{formatDateTime(n.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>)}
      {data && data.total > data.page_size && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />}
    </>
  );
}

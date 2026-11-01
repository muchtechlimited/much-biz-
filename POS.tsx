import { useMemo, useRef, useState } from 'react';
import { Minus, Plus, Printer, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, Modal, SelectField, Spinner, TextField } from '../components/ui';
import { useFetch } from '../lib/useFetch';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatMoney, newIdempotencyKey } from '../lib/format';
import type { Paginated, Product } from '../lib/types';

interface CartLine {
  product: Product;
  qty: number;
  discount: number; // absolute amount off the line; server validates authorization
}
interface Payment {
  method: string;
  amount: string;
}
interface CompletedSale {
  id: string;
  number: string;
  total: number;
  change: number;
}

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Bank transfer' },
  { value: 'pos', label: 'POS terminal' },
  { value: 'other', label: 'Other' },
];

export default function POS() {
  const { user, can } = useAuth();
  const { notify } = useToast();
  const cur = user?.business?.currency ?? 'NGN';
  const money = (n: number) => formatMoney(n, cur);

  const [q, setQ] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([{ method: 'cash', amount: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<CompletedSale | null>(null);
  const [mobileCart, setMobileCart] = useState(false);
  // One key per checkout attempt: retries after a network failure reuse it,
  // so the backend can recognise and ignore duplicates.
  const idemKey = useRef<string>(newIdempotencyKey());
  const inFlight = useRef(false);

  const { data, loading, error } = useFetch<Paginated<Product>>('/products', { q, page_size: 40, stock_status: 'sellable' });

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.product.selling_price * l.qty, 0), [cart]);
  const discountTotal = useMemo(() => cart.reduce((s, l) => s + l.discount, 0), [cart]);
  const total = Math.max(0, subtotal - discountTotal);
  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const change = Math.max(0, paid - total);
  const balance = Math.max(0, total - paid);

  function add(p: Product) {
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        const next = [...c];
        next[i] = { ...next[i], qty: Math.min(next[i].qty + 1, p.quantity) };
        return next;
      }
      return [...c, { product: p, qty: 1, discount: 0 }];
    });
  }
  const setQty = (id: string, qty: number) =>
    setCart((c) =>
      c.map((l) => (l.product.id === id ? { ...l, qty: Math.max(1, Math.min(qty, l.product.quantity)) } : l)),
    );
  const remove = (id: string) => setCart((c) => c.filter((l) => l.product.id !== id));

  function openPayment() {
    setPayments([{ method: 'cash', amount: String(total) }]);
    setPayOpen(true);
  }

  async function complete() {
    if (inFlight.current) return; // blocks double-clicks
    inFlight.current = true;
    setSubmitting(true);
    try {
      const res = await api.post<{ id: string; number: string; total: number; change: number; status: string }>(
        '/sales',
        {
          items: cart.map((l) => ({ product_id: l.product.id, quantity: l.qty, discount: l.discount })),
          payments: payments.filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method, amount: Number(p.amount) })),
        },
        idemKey.current,
      );
      // Only show success once the backend confirms the sale as completed.
      if (res.status !== 'completed') throw new ApiError('The sale was not confirmed by the server.', 500);
      setDone({ id: res.id, number: res.number, total: res.total, change: res.change });
      setCart([]);
      setPayOpen(false);
      idemKey.current = newIdempotencyKey();
    } catch (err) {
      // Keep the same idempotency key so a retry cannot create a duplicate sale.
      notify('error', err instanceof ApiError ? err.message : 'Sale could not be completed. You can safely retry.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const cartPanel = (
    <div className="flex h-full flex-col">
      <h2 className="mb-3 flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Cart</h2>
      {cart.length === 0 ? (
        <EmptyState title="Cart is empty" description="Tap a product to add it." />
      ) : (
        <ul className="flex-1 divide-y divide-grey-100 overflow-y-auto">
          {cart.map((l) => (
            <li key={l.product.id} className="py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.product.name}</p>
                  <p className="text-xs text-grey-400">{money(l.product.selling_price)} each</p>
                </div>
                <button onClick={() => remove(l.product.id)} aria-label="Remove" className="p-2 text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button variant="secondary" className="!min-h-[44px] !w-11 !px-0" onClick={() => setQty(l.product.id, l.qty - 1)} aria-label="Decrease"><Minus className="h-4 w-4" /></Button>
                  <input
                    aria-label="Quantity" inputMode="numeric" value={l.qty}
                    onChange={(e) => setQty(l.product.id, Number(e.target.value) || 1)}
                    className="h-11 w-14 rounded-lg border border-grey-200 text-center text-sm"
                  />
                  <Button variant="secondary" className="!min-h-[44px] !w-11 !px-0" onClick={() => setQty(l.product.id, l.qty + 1)} aria-label="Increase"><Plus className="h-4 w-4" /></Button>
                </div>
                <p className="money text-sm">{money(l.product.selling_price * l.qty - l.discount)}</p>
              </div>
              {can('sales.discount') && (
                <input
                  aria-label="Discount amount" inputMode="decimal" placeholder="Discount (₦)"
                  value={l.discount || ''}
                  onChange={(e) => {
                    const d = Math.max(0, Math.min(Number(e.target.value) || 0, l.product.selling_price * l.qty));
                    setCart((c) => c.map((x) => (x.product.id === l.product.id ? { ...x, discount: d } : x)));
                  }}
                  className="mt-2 h-10 w-full rounded-lg border border-grey-200 px-3 text-xs"
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 space-y-1 border-t border-grey-100 pt-3 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span className="money">{money(subtotal)}</span></div>
        {discountTotal > 0 && <div className="flex justify-between text-grey-400"><span>Discounts</span><span>-{money(discountTotal)}</span></div>}
        <div className="flex justify-between text-lg font-bold text-navy"><span>Total</span><span className="money">{money(total)}</span></div>
        <Button variant="gold" size="lg" className="mt-2 w-full" disabled={cart.length === 0} onClick={openPayment}>
          Charge {money(total)}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-grey-400" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search or scan barcode"
              aria-label="Search products"
              className="min-h-[48px] w-full rounded-lg border border-grey-200 bg-white pl-9 pr-3 text-sm focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
          </div>
          {loading && !data ? <Spinner /> : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !data?.items.length ? (
            <Card><EmptyState title="No products found" description="Add products first, or adjust your search." /></Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 pb-24 sm:grid-cols-3 xl:grid-cols-4 lg:pb-0">
              {data.items.map((p) => (
                <button
                  key={p.id} onClick={() => add(p)}
                  className="min-h-[88px] rounded-xl border border-grey-100 bg-white p-3 text-left shadow-card transition hover:border-gold active:scale-[0.98]"
                >
                  <p className="line-clamp-2 text-sm font-semibold text-navy">{p.name}</p>
                  <p className="money mt-1 text-sm">{money(p.selling_price)}</p>
                  <p className="text-xs text-grey-400">{p.quantity} in stock</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <Card className="hidden lg:block lg:sticky lg:top-0 lg:h-[calc(100vh-7rem)]">{cartPanel}</Card>
      </div>

      {/* Mobile cart bar */}
      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-grey-200 bg-white p-3 lg:hidden">
        <Button variant="primary" size="lg" className="w-full" onClick={() => setMobileCart(true)}>
          <ShoppingCart className="h-5 w-5" /> {cart.length} item{cart.length === 1 ? '' : 's'} · {money(total)}
        </Button>
      </div>
      <Modal open={mobileCart} onClose={() => setMobileCart(false)} title="Cart">
        {cartPanel}
      </Modal>

      <Modal
        open={payOpen}
        onClose={() => !submitting && setPayOpen(false)}
        title="Payment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)} disabled={submitting}>Back</Button>
            <Button variant="gold" onClick={complete} loading={submitting} disabled={paid <= 0}>Complete sale</Button>
          </>
        }
      >
        <p className="mb-3 text-2xl font-bold text-navy money">{money(total)}</p>
        <div className="space-y-3">
          {payments.map((p, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <SelectField label="Method" options={METHODS} value={p.method} onChange={(e) => setPayments((ps) => ps.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))} />
              <TextField label="Amount received" inputMode="decimal" value={p.amount} onChange={(e) => setPayments((ps) => ps.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            </div>
          ))}
          <Button variant="ghost" onClick={() => setPayments((ps) => [...ps, { method: 'transfer', amount: '' }])}>+ Split payment</Button>
        </div>
        <div className="mt-4 space-y-1 rounded-lg bg-grey-50 p-3 text-sm">
          <div className="flex justify-between"><span>Change</span><span className="money">{money(change)}</span></div>
          {balance > 0 && <div className="flex justify-between text-amber-700"><span>Outstanding balance</span><span className="money">{money(balance)}</span></div>}
        </div>
      </Modal>

      <Modal
        open={!!done}
        onClose={() => setDone(null)}
        title="Sale completed"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDone(null)}>New sale</Button>
            {done && (
              <Button onClick={() => window.open(`/receipt/${done.id}`, '_blank')}><Printer className="h-4 w-4" /> Print / share receipt</Button>
            )}
          </>
        }
      >
        {done && (
          <div className="text-center">
            <p className="text-sm text-grey-400">Receipt {done.number}</p>
            <p className="money my-2 text-3xl text-navy">{money(done.total)}</p>
            {done.change > 0 && <p className="text-sm">Change due: <span className="money">{money(done.change)}</span></p>}
          </div>
        )}
      </Modal>
    </>
  );
}

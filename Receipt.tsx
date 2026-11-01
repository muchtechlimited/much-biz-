import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Button, ErrorState, Spinner } from '../components/ui';
import { useFetch } from '../lib/useFetch';
import { formatDateTime, formatMoney } from '../lib/format';

interface ReceiptData {
  number: string;
  created_at: string;
  cashier: string;
  business: { name: string; phone?: string; address?: string; logo_url?: string; footer?: string };
  currency: string;
  items: { name: string; quantity: number; unit_price: number; discount: number; line_total: number }[];
  total: number;
  payments: { method: string; amount: number }[];
  amount_paid: number;
  outstanding: number;
}

/** Printable receipt. Narrow layout suits 58/80mm thermal printers and prints cleanly on A4. */
export default function Receipt() {
  const { id } = useParams();
  const { data, loading, error, reload } = useFetch<ReceiptData>(id ? `/sales/${id}/receipt` : null);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState message={error ?? 'Receipt not found.'} onRetry={reload} />;
  const m = (n: number) => formatMoney(n, data.currency);

  return (
    <div className="min-h-full bg-grey-50 p-4 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 max-w-[320px]">
        <Button onClick={() => window.print()} className="w-full"><Printer className="h-4 w-4" /> Print receipt</Button>
      </div>
      <div className="mx-auto max-w-[320px] bg-white p-4 text-xs leading-snug shadow-card print:max-w-none print:shadow-none">
        <div className="text-center">
          {data.business.logo_url && <img src={data.business.logo_url} alt="" className="mx-auto mb-2 h-12" />}
          <p className="text-base font-bold">{data.business.name}</p>
          {data.business.address && <p>{data.business.address}</p>}
          {data.business.phone && <p>{data.business.phone}</p>}
        </div>
        <hr className="my-2 border-dashed" />
        <p>Receipt: {data.number}</p>
        <p>{formatDateTime(data.created_at)}</p>
        <p>Cashier: {data.cashier}</p>
        <hr className="my-2 border-dashed" />
        {data.items.map((i, k) => (
          <div key={k} className="mb-1">
            <p className="font-medium">{i.name}</p>
            <div className="flex justify-between">
              <span>{i.quantity} × {m(i.unit_price)}</span>
              <span>{m(i.line_total)}</span>
            </div>
            {i.discount > 0 && <p className="text-right">Discount -{m(i.discount)}</p>}
          </div>
        ))}
        <hr className="my-2 border-dashed" />
        <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{m(data.total)}</span></div>
        {data.payments.map((p, k) => (
          <div key={k} className="flex justify-between capitalize"><span>{p.method}</span><span>{m(p.amount)}</span></div>
        ))}
        <div className="flex justify-between"><span>Paid</span><span>{m(data.amount_paid)}</span></div>
        {data.outstanding > 0 && <div className="flex justify-between font-bold"><span>Balance due</span><span>{m(data.outstanding)}</span></div>}
        <hr className="my-2 border-dashed" />
        <p className="text-center">{data.business.footer || 'Thank you for shopping with us!'}</p>
        <p className="mt-1 text-center text-[10px] text-grey-400">Powered by MUCH BIZ</p>
      </div>
    </div>
  );
}

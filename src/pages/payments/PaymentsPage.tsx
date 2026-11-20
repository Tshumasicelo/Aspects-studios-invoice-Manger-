import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CreditCard, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { ActionMenu, EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui/Layout';
import { Input, SearchInput, Select } from '@/components/ui/Field';
import { useConfirm } from '@/components/ui/Confirm';
import { PaymentFormModal } from '@/components/forms/PaymentFormModal';
import { PAYMENT_METHOD_LABELS } from '@/domain/defaults';
import { monthKey } from '@/domain/dates';
import { sumCents } from '@/domain/money';
import type { Payment, PaymentMethod } from '@/domain/types';
import { useFormat, useToday } from '@/hooks/useApp';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useDataset } from '@/hooks/useLiveData';
import { clientDisplayName } from '@/services/clientService';
import { exportEntityCsv } from '@/services/exportService';
import { deletePayment } from '@/services/paymentService';

export default function PaymentsPage() {
  const data = useDataset();
  const fmt = useFormat();
  const today = useToday();
  const confirm = useConfirm();
  const { run } = useAsyncAction();
  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [q, setQ] = useState('');
  const [method, setMethod] = useState<'' | PaymentMethod>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    if (params.get('new') === '1') {
      setModal(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const rows = useMemo(() => {
    if (!data) return [];
    const invoices = new Map(data.invoices.map((i) => [i.id, i]));
    const term = q.trim().toLowerCase();
    return data.payments
      .map((p) => ({ payment: p, invoice: invoices.get(p.invoiceId) }))
      .filter((r) => !method || r.payment.method === method)
      .filter((r) => (!from || r.payment.date >= from) && (!to || r.payment.date <= to))
      .filter(
        (r) =>
          !term ||
          [r.payment.reference, r.payment.transactionReference, r.invoice?.number ?? '', clientDisplayName(r.invoice?.clientSnapshot)].join(' ').toLowerCase().includes(term),
      )
      .sort((a, b) => b.payment.date.localeCompare(a.payment.date) || b.payment.reference.localeCompare(a.payment.reference));
  }, [data, q, method, from, to]);

  if (!data) return <Spinner />;
  const thisMonth = sumCents(data.payments.filter((p) => monthKey(p.date) === monthKey(today)).map((p) => p.amount));
  const inView = sumCents(rows.map((r) => r.payment.amount));

  const remove = async (p: Payment) => {
    const { confirmed } = await confirm({
      title: `Remove payment ${p.reference}?`,
      message: `${fmt.money(p.amount)} will be removed and the invoice balance recalculated.`,
      confirmLabel: 'Remove payment',
    });
    if (confirmed) await run(() => deletePayment(p.id), { success: 'Payment removed' });
  };

  return (
    <>
      <PageHeader
        kicker="Cash received"
        title="Payments"
        subtitle="Payments received outside the app (EFT, bank transfer, cash, card). Recording a payment updates the invoice balance and status."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} disabled={!rows.length} onClick={() => void exportEntityCsv('payments', rows.map((r) => r.payment))}>
              Export CSV
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setModal(true)}>
              Record payment
            </Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Received this month" value={fmt.money(thisMonth)} tone="success" />
        <StatCard label="Received (all time)" value={fmt.money(sumCents(data.payments.map((p) => p.amount)))} />
        <div className="col-span-2 lg:col-span-1">
          <StatCard label="In current view" value={fmt.money(inView)} hint={`${rows.length} payment${rows.length === 1 ? '' : 's'}`} />
        </div>
      </div>
      {data.payments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CreditCard className="h-6 w-6" />}
            title="No payments recorded"
            description="When a client pays, record it here or from the invoice. Partial payments are supported, and revenue reports use these records."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setModal(true)}>
                Record a payment
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 md:p-5 lg:grid-cols-4">
            <SearchInput value={q} onChange={setQ} placeholder="Search reference, invoice, client…" />
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')} aria-label="Filter by method">
              <option value="">All methods</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" title="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" title="To date" />
          </div>
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">No payments match these filters.</p>
          ) : (
            <DataTable
              rows={rows}
              rowKey={(r) => r.payment.id}
              columns={[
                { key: 'ref', header: 'Reference', cell: (r) => <span className="num font-mono text-[0.8rem] text-text">{r.payment.reference}</span> },
                { key: 'date', header: 'Date', cell: (r) => <span className="text-muted">{fmt.date(r.payment.date)}</span> },
                {
                  key: 'invoice',
                  header: 'Invoice',
                  cell: (r) =>
                    r.invoice ? (
                      <Link to={`/invoices/${r.invoice.id}`} className="num font-mono text-[0.8rem] text-blue hover:underline">
                        {r.invoice.number}
                      </Link>
                    ) : (
                      <span className="text-faint">Missing</span>
                    ),
                },
                { key: 'client', header: 'Client', hideBelow: 'lg', cell: (r) => <span className="text-text">{clientDisplayName(r.invoice?.clientSnapshot)}</span> },
                { key: 'method', header: 'Method', hideBelow: 'lg', cell: (r) => <span className="text-muted">{PAYMENT_METHOD_LABELS[r.payment.method]}</span> },
                { key: 'amount', header: 'Amount', align: 'right', cell: (r) => <span className="num text-success">{fmt.money(r.payment.amount)}</span> },
                {
                  key: 'act',
                  header: <span className="sr-only">Actions</span>,
                  align: 'right',
                  className: 'w-12',
                  cell: (r) => (
                    <ActionMenu
                      items={[
                        { label: 'Edit payment', icon: <Pencil />, onClick: () => setEditing(r.payment) },
                        { label: 'Remove payment', icon: <Trash2 />, tone: 'danger', onClick: () => void remove(r.payment) },
                      ]}
                    />
                  ),
                },
              ]}
              mobile={(r) => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="num font-mono text-xs text-muted">{r.payment.reference}</div>
                    <div className="truncate text-sm text-text">{clientDisplayName(r.invoice?.clientSnapshot)}</div>
                    <div className="text-xs text-faint">
                      {fmt.date(r.payment.date)} · {PAYMENT_METHOD_LABELS[r.payment.method]} · {r.invoice?.number}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="num text-sm font-medium text-success">{fmt.money(r.payment.amount)}</span>
                    <ActionMenu
                      items={[
                        { label: 'Edit payment', icon: <Pencil />, onClick: () => setEditing(r.payment) },
                        { label: 'Remove payment', icon: <Trash2 />, tone: 'danger', onClick: () => void remove(r.payment) },
                      ]}
                    />
                  </div>
                </div>
              )}
            />
          )}
        </Card>
      )}
      <PaymentFormModal open={modal} onClose={() => setModal(false)} />
      <PaymentFormModal open={!!editing} onClose={() => setEditing(null)} payment={editing} />
    </>
  );
}

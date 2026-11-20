import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Ban,
  Copy,
  CreditCard,
  Download,
  Eye,
  FileText,
  LockOpen,
  Pencil,
  Printer,
  Send,
  Trash2,
} from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { InvoiceStatusBadge } from '@/components/ui/Badge';
import { ActionMenu, DetailRow, EmptyState, PageHeader, Spinner } from '@/components/ui/Layout';
import { useConfirm } from '@/components/ui/Confirm';
import { PaymentFormModal } from '@/components/forms/PaymentFormModal';
import { PdfPreviewModal } from '@/components/documents/PdfPreviewModal';
import { TotalsPanel } from '@/components/documents/TotalsPanel';
import { HistoryList } from '@/components/documents/HistoryList';
import { DocumentLines } from '@/components/documents/DocumentLines';
import { store } from '@/data/store';
import { outstandingBalance } from '@/domain/calculations';
import { daysBetween } from '@/domain/dates';
import { PAYMENT_METHOD_LABELS } from '@/domain/defaults';
import { invoiceStatus } from '@/domain/status';
import { useFormat, useSettings, useToday } from '@/hooks/useApp';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useLiveData } from '@/hooks/useLiveData';
import { clientDisplayName } from '@/services/clientService';
import {
  cancelInvoice,
  deleteDraftInvoice,
  duplicateInvoice,
  markInvoiceSent,
  unlockForCorrection,
} from '@/services/invoiceService';
import { deletePayment } from '@/services/paymentService';
import { downloadPdf, invoicePdfInput, printPdf } from '@/pdf/pdfActions';
import type { Payment } from '@/domain/types';

export default function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const fmt = useFormat();
  const settings = useSettings();
  const confirm = useConfirm();
  const { run, busy } = useAsyncAction();
  const [payOpen, setPayOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const data = useLiveData(async () => {
    const s = store();
    const invoice = await s.invoices.get(id);
    if (!invoice) return { invoice: null };
    const [payments, project, quotation, client] = await Promise.all([
      s.payments.findBy('invoiceId', id),
      invoice.projectId ? s.projects.get(invoice.projectId) : undefined,
      invoice.quotationId ? s.quotations.get(invoice.quotationId) : undefined,
      s.clients.get(invoice.clientId),
    ]);
    return { invoice, payments: payments.sort((a, b) => a.date.localeCompare(b.date)), project, quotation, client };
  }, [id]);

  if (!data) return <Spinner />;
  const { invoice } = data;
  if (!invoice) {
    return (
      <Card>
        <EmptyState icon={<FileText className="h-6 w-6" />} title="Invoice not found" description="It may have been deleted." action={<ButtonLink to="/invoices">Back to invoices</ButtonLink>} />
      </Card>
    );
  }
  const { payments = [], project, quotation, client } = data;
  const status = invoiceStatus(invoice, today);
  const outstanding = outstandingBalance(invoice.total, invoice.amountPaid);
  const pdfInput = invoicePdfInput(invoice, project, quotation);
  const isDraft = invoice.storedStatus === 'draft';
  const isSent = invoice.storedStatus === 'sent';
  const canPay = isSent && outstanding > 0;
  const daysOverdue = status === 'overdue' ? daysBetween(invoice.dueDate, today) : 0;

  const actions = {
    send: () => run(() => markInvoiceSent(invoice.id), { success: 'Invoice marked as sent', successMessage: 'It is now locked against accidental edits.' }),
    duplicate: async () => {
      const dup = await run(() => duplicateInvoice(invoice.id), { success: 'Invoice duplicated' });
      if (dup) navigate(`/invoices/${dup.id}`);
    },
    unlock: async () => {
      const { confirmed, reason } = await confirm({
        title: 'Unlock for correction?',
        message: (
          <>
            The invoice returns to <b className="text-text">Draft</b> so it can be edited. Its number ({invoice.number}) is kept and the
            reason is recorded in the invoice history. Only do this if the client has not acted on the original.
          </>
        ),
        confirmLabel: 'Unlock invoice',
        tone: 'primary',
        reason: { label: 'Reason for correction', required: true, placeholder: 'e.g. Incorrect unit price on line 2' },
      });
      if (confirmed) {
        const ok = await run(() => unlockForCorrection(invoice.id, reason), { success: 'Invoice unlocked for correction' });
        if (ok) navigate(`/invoices/${invoice.id}/edit`);
      }
    },
    cancel: async () => {
      const { confirmed, reason } = await confirm({
        title: `Cancel ${invoice.number}?`,
        message: 'A cancelled invoice is kept for your records but no longer counts as outstanding. This cannot be undone.',
        confirmLabel: 'Cancel invoice',
        cancelLabel: 'Keep invoice',
        reason: { label: 'Reason (optional)' },
      });
      if (confirmed) await run(() => cancelInvoice(invoice.id, reason), { success: 'Invoice cancelled' });
    },
    remove: async () => {
      const { confirmed } = await confirm({
        title: `Delete draft ${invoice.number}?`,
        message: 'The draft is permanently deleted. Its number will not be reused.',
        confirmLabel: 'Delete draft',
      });
      if (confirmed) {
        const ok = await run(() => deleteDraftInvoice(invoice.id).then(() => true), { success: 'Draft deleted' });
        if (ok) navigate('/invoices', { replace: true });
      }
    },
    download: () => run(() => downloadPdf(pdfInput, settings), { errorTitle: 'PDF download failed' }),
    print: () => run(() => printPdf(pdfInput, settings), { errorTitle: 'Printing failed' }),
    removePayment: async (p: Payment) => {
      const { confirmed } = await confirm({
        title: `Remove payment ${p.reference}?`,
        message: `${fmt.money(p.amount, invoice.currency)} will be removed and the invoice balance recalculated. The removal is recorded in the invoice history.`,
        confirmLabel: 'Remove payment',
      });
      if (confirmed) await run(() => deletePayment(p.id), { success: 'Payment removed' });
    },
  };

  return (
    <>
      <PageHeader
        back={{ to: '/invoices', label: 'Invoices' }}
        kicker={settings.vatEnabled && invoice.vatEnabled ? 'Tax invoice' : 'Invoice'}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="num font-mono">{invoice.number}</span>
            <InvoiceStatusBadge status={status} />
          </span>
        }
        subtitle={
          <>
            {clientDisplayName(invoice.clientSnapshot)} · Issued {fmt.date(invoice.issueDate)} · Due {fmt.date(invoice.dueDate)}
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={<Eye className="h-4 w-4" />} onClick={() => setPreviewOpen(true)}>
              Preview
            </Button>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => void actions.download()} disabled={busy}>
              PDF
            </Button>
            {isDraft && (
              <>
                <ButtonLink to={`/invoices/${invoice.id}/edit`} variant="secondary" icon={<Pencil className="h-4 w-4" />}>
                  Edit
                </ButtonLink>
                <Button variant="primary" icon={<Send className="h-4 w-4" />} onClick={() => void actions.send()} loading={busy}>
                  Mark as sent
                </Button>
              </>
            )}
            {canPay && (
              <Button variant="primary" icon={<CreditCard className="h-4 w-4" />} onClick={() => setPayOpen(true)}>
                Record payment
              </Button>
            )}
            <ActionMenu
              items={[
                { label: 'Print', icon: <Printer />, onClick: () => void actions.print() },
                { label: 'Duplicate', icon: <Copy />, onClick: () => void actions.duplicate() },
                { label: 'Unlock for correction', icon: <LockOpen />, onClick: () => void actions.unlock(), hidden: !isSent || payments.length > 0 },
                { label: 'Cancel invoice', icon: <Ban />, onClick: () => void actions.cancel(), tone: 'danger', hidden: invoice.storedStatus === 'cancelled' || payments.length > 0 },
                { label: 'Delete draft', icon: <Trash2 />, onClick: () => void actions.remove(), tone: 'danger', hidden: !isDraft },
              ]}
            />
          </>
        }
      />

      {status === 'overdue' && (
        <div className="mb-6 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          Overdue by {daysOverdue} day{daysOverdue === 1 ? '' : 's'} · {fmt.money(outstanding, invoice.currency)} outstanding.
        </div>
      )}
      {isDraft && (
        <div className="mb-6 rounded-xl border border-border bg-bg-2/70 px-4 py-3 text-sm text-muted">
          This invoice is a <span className="text-text">draft</span>. Mark it as sent once it has been issued to the client — that locks it and allows payments to be recorded.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Card>
            <CardHeader title="Line items" subtitle={`${invoice.items.length} item${invoice.items.length === 1 ? '' : 's'}`} />
            <CardBody>
              <DocumentLines pricing={invoice} currency={invoice.currency} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Payments"
              subtitle={payments.length ? `${payments.length} payment${payments.length === 1 ? '' : 's'} recorded` : 'No payments recorded yet'}
              action={
                canPay && (
                  <Button size="sm" variant="subtle" icon={<CreditCard className="h-3.5 w-3.5" />} onClick={() => setPayOpen(true)}>
                    Record
                  </Button>
                )
              }
            />
            <CardBody>
              {payments.length === 0 ? (
                <p className="text-sm text-faint">{isSent ? 'Record payments as you receive them — partial payments are supported.' : 'Payments can be recorded once the invoice has been sent.'}</p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm text-text">
                          <span className="num font-mono text-xs text-muted">{p.reference}</span> · {PAYMENT_METHOD_LABELS[p.method]}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-faint">
                          {fmt.date(p.date)}
                          {p.transactionReference && ` · Ref ${p.transactionReference}`}
                          {p.notes && ` · ${p.notes}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="num text-sm font-medium text-success">{fmt.money(p.amount, invoice.currency)}</span>
                        <ActionMenu
                          items={[
                            { label: 'Edit payment', icon: <Pencil />, onClick: () => setEditPayment(p) },
                            { label: 'Remove payment', icon: <Trash2 />, tone: 'danger', onClick: () => void actions.removePayment(p) },
                          ]}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {(invoice.paymentInstructions || invoice.notes || invoice.terms) && (
            <Card>
              <CardHeader title="Payment information, notes & terms" />
              <CardBody className="space-y-4 text-sm">
                {invoice.paymentInstructions && (
                  <div>
                    <div className="kicker mb-1.5">Payment information</div>
                    <p className="whitespace-pre-line text-muted">{invoice.paymentInstructions}</p>
                  </div>
                )}
                {invoice.notes && (
                  <div>
                    <div className="kicker mb-1.5">Notes</div>
                    <p className="whitespace-pre-line text-muted">{invoice.notes}</p>
                  </div>
                )}
                {invoice.terms && (
                  <div>
                    <div className="kicker mb-1.5">Terms & conditions</div>
                    <p className="whitespace-pre-line text-muted">{invoice.terms}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <aside className="space-y-6 lg:col-span-4">
          <Card>
            <CardHeader title="Amounts" />
            <CardBody>
              <TotalsPanel pricing={invoice} currency={invoice.currency} amountPaid={invoice.amountPaid} showBalance={!isDraft} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody className="divide-y divide-border/60 pt-0">
              <DetailRow label="Client">
                {client ? (
                  <Link to={`/clients/${client.id}`} className="text-blue hover:underline">
                    {clientDisplayName(invoice.clientSnapshot)}
                  </Link>
                ) : (
                  clientDisplayName(invoice.clientSnapshot)
                )}
              </DetailRow>
              {invoice.clientSnapshot.email && <DetailRow label="Email">{invoice.clientSnapshot.email}</DetailRow>}
              <DetailRow label="Project">
                {project ? (
                  <Link to={`/projects/${project.id}`} className="text-blue hover:underline">
                    {project.name}
                  </Link>
                ) : (
                  '—'
                )}
              </DetailRow>
              {quotation && (
                <DetailRow label="From quotation">
                  <Link to={`/quotations/${quotation.id}`} className="text-blue hover:underline">
                    {quotation.number}
                  </Link>
                </DetailRow>
              )}
              <DetailRow label="Currency">{invoice.currency}</DetailRow>
              <DetailRow label="VAT">{invoice.vatEnabled ? `${invoice.vatRate}%` : 'Not applied'}</DetailRow>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="History" />
            <CardBody>
              <HistoryList history={invoice.history} />
            </CardBody>
          </Card>
        </aside>
      </div>

      <PaymentFormModal open={payOpen} onClose={() => setPayOpen(false)} invoiceId={invoice.id} />
      <PaymentFormModal open={!!editPayment} onClose={() => setEditPayment(null)} payment={editPayment} />
      <PdfPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} input={previewOpen ? pdfInput : null} title={`${invoice.number}.pdf`} />
    </>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRightLeft, Check, Copy, Download, Eye, Pencil, Printer, RotateCcw, ScrollText, Send, Trash2, X } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { QuotationStatusBadge } from '@/components/ui/Badge';
import { ActionMenu, DetailRow, EmptyState, PageHeader, Spinner } from '@/components/ui/Layout';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { PdfPreviewModal } from '@/components/documents/PdfPreviewModal';
import { TotalsPanel } from '@/components/documents/TotalsPanel';
import { HistoryList } from '@/components/documents/HistoryList';
import { DocumentLines } from '@/components/documents/DocumentLines';
import { store } from '@/data/store';
import { quotationStatus } from '@/domain/status';
import { useFormat, useSettings, useToday } from '@/hooks/useApp';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useLiveData } from '@/hooks/useLiveData';
import { clientDisplayName } from '@/services/clientService';
import {
  acceptQuotation,
  convertQuotationToInvoice,
  deleteQuotation,
  duplicateQuotation,
  markQuotationSent,
  rejectQuotation,
  reopenQuotation,
} from '@/services/quotationService';
import { downloadPdf, printPdf, quotationPdfInput } from '@/pdf/pdfActions';

export default function QuotationDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const fmt = useFormat();
  const settings = useSettings();
  const confirm = useConfirm();
  const toast = useToast();
  const { run, busy } = useAsyncAction();
  const [previewOpen, setPreviewOpen] = useState(false);

  const data = useLiveData(async () => {
    const s = store();
    const quote = await s.quotations.get(id);
    if (!quote) return { quote: null };
    const [project, invoice, client] = await Promise.all([
      quote.projectId ? s.projects.get(quote.projectId) : undefined,
      quote.convertedInvoiceId ? s.invoices.get(quote.convertedInvoiceId) : undefined,
      s.clients.get(quote.clientId),
    ]);
    return { quote, project, invoice, client };
  }, [id]);

  if (!data) return <Spinner />;
  const { quote } = data;
  if (!quote) {
    return (
      <Card>
        <EmptyState icon={<ScrollText className="h-6 w-6" />} title="Quotation not found" action={<ButtonLink to="/quotations">Back to quotations</ButtonLink>} />
      </Card>
    );
  }
  const { project, invoice, client } = data;
  const status = quotationStatus(quote, today);
  const pdfInput = quotationPdfInput(quote, project);
  const editable = quote.storedStatus === 'draft' || quote.storedStatus === 'sent';

  const convert = async () => {
    const result = await run(() => convertQuotationToInvoice(quote.id));
    if (!result) return;
    if (result.created) toast.success('Invoice created from quotation', `${result.invoice.number} is ready as a draft — review it, then mark it as sent.`);
    else toast.info('Already converted', `Opening ${result.invoice.number}.`);
    navigate(`/invoices/${result.invoice.id}`);
  };

  const accept = async () => {
    const { confirmed } = await confirm({
      title: 'Mark as accepted?',
      message: (
        <>
          Record that the client accepted {quote.number} ({fmt.money(quote.total, quote.currency)}).
          {project && (project.status === 'planning' || project.status === 'quoted') && ` The project “${project.name}” will move to Approved.`}
        </>
      ),
      confirmLabel: 'Mark accepted',
      tone: 'primary',
    });
    if (confirmed) await run(() => acceptQuotation(quote.id), { success: 'Quotation accepted', successMessage: 'You can now convert it into an invoice.' });
  };

  const reject = async () => {
    const { confirmed, reason } = await confirm({
      title: 'Mark as rejected?',
      message: 'The quotation is kept for your records.',
      confirmLabel: 'Mark rejected',
      reason: { label: 'Reason (optional)', placeholder: 'e.g. Budget constraints' },
    });
    if (confirmed) await run(() => rejectQuotation(quote.id, reason), { success: 'Quotation marked as rejected' });
  };

  const remove = async () => {
    const { confirmed } = await confirm({ title: `Delete ${quote.number}?`, message: 'The quotation will be permanently deleted.', confirmLabel: 'Delete quotation' });
    if (confirmed && (await run(() => deleteQuotation(quote.id).then(() => true), { success: 'Quotation deleted' }))) navigate('/quotations', { replace: true });
  };

  return (
    <>
      <PageHeader
        back={{ to: '/quotations', label: 'Quotations' }}
        kicker="Quotation"
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="num font-mono">{quote.number}</span>
            <QuotationStatusBadge status={status} />
          </span>
        }
        subtitle={
          <>
            {clientDisplayName(quote.clientSnapshot)} · Issued {fmt.date(quote.issueDate)} · Valid until {fmt.date(quote.expiryDate)}
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={<Eye className="h-4 w-4" />} onClick={() => setPreviewOpen(true)}>
              Preview
            </Button>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => void run(() => downloadPdf(pdfInput, settings), { errorTitle: 'PDF download failed' })}>
              PDF
            </Button>
            {editable && status !== 'expired' && (
              <ButtonLink to={`/quotations/${quote.id}/edit`} variant="secondary" icon={<Pencil className="h-4 w-4" />}>
                Edit
              </ButtonLink>
            )}
            {quote.storedStatus === 'draft' && (
              <Button variant="primary" icon={<Send className="h-4 w-4" />} loading={busy} onClick={() => void run(() => markQuotationSent(quote.id), { success: 'Quotation marked as sent' })}>
                Mark as sent
              </Button>
            )}
            {(status === 'sent' || status === 'draft') && (
              <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => void accept()}>
                Accept
              </Button>
            )}
            {quote.storedStatus === 'accepted' && (
              <Button variant="primary" icon={<ArrowRightLeft className="h-4 w-4" />} loading={busy} onClick={() => void convert()}>
                {invoice ? 'Open invoice' : 'Convert to invoice'}
              </Button>
            )}
            <ActionMenu
              items={[
                { label: 'Print', icon: <Printer />, onClick: () => void run(() => printPdf(pdfInput, settings), { errorTitle: 'Printing failed' }) },
                {
                  label: 'Duplicate',
                  icon: <Copy />,
                  onClick: async () => {
                    const dup = await run(() => duplicateQuotation(quote.id), { success: 'Quotation duplicated' });
                    if (dup) navigate(`/quotations/${dup.id}`);
                  },
                },
                { label: 'Mark as rejected', icon: <X />, onClick: () => void reject(), hidden: !(status === 'sent' || status === 'draft' || status === 'expired') },
                {
                  label: 'Reopen as draft',
                  icon: <RotateCcw />,
                  onClick: () => void run(() => reopenQuotation(quote.id), { success: 'Quotation reopened as draft' }),
                  hidden: !(status === 'expired' || status === 'rejected'),
                },
                { label: 'Delete', icon: <Trash2 />, tone: 'danger', onClick: () => void remove(), hidden: !!quote.convertedInvoiceId },
              ]}
            />
          </>
        }
      />

      {status === 'expired' && (
        <div className="mb-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          This quotation expired on {fmt.date(quote.expiryDate)}. Reopen it as a draft to extend the validity, or mark it as rejected.
        </div>
      )}
      {quote.storedStatus === 'accepted' && !invoice && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-success">Accepted — ready to convert into an invoice. Client, line items and pricing will be carried over.</span>
          <Button size="sm" variant="primary" icon={<ArrowRightLeft className="h-3.5 w-3.5" />} onClick={() => void convert()} loading={busy}>
            Convert now
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Card>
            <CardHeader title="Line items" />
            <CardBody>
              <DocumentLines pricing={quote} currency={quote.currency} />
            </CardBody>
          </Card>
          {(quote.notes || quote.terms) && (
            <Card>
              <CardHeader title="Notes & terms" />
              <CardBody className="space-y-4 text-sm">
                {quote.notes && <p className="whitespace-pre-line text-muted">{quote.notes}</p>}
                {quote.terms && (
                  <div>
                    <div className="kicker mb-1.5">Terms & conditions</div>
                    <p className="whitespace-pre-line text-muted">{quote.terms}</p>
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
              <TotalsPanel pricing={quote} currency={quote.currency} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody className="divide-y divide-border/60 pt-0">
              <DetailRow label="Client">
                {client ? (
                  <Link to={`/clients/${client.id}`} className="text-blue hover:underline">
                    {clientDisplayName(quote.clientSnapshot)}
                  </Link>
                ) : (
                  clientDisplayName(quote.clientSnapshot)
                )}
              </DetailRow>
              <DetailRow label="Project">
                {project ? (
                  <Link to={`/projects/${project.id}`} className="text-blue hover:underline">
                    {project.name}
                  </Link>
                ) : (
                  '—'
                )}
              </DetailRow>
              <DetailRow label="Invoice">
                {invoice ? (
                  <Link to={`/invoices/${invoice.id}`} className="text-blue hover:underline">
                    {invoice.number}
                  </Link>
                ) : (
                  'Not converted'
                )}
              </DetailRow>
              <DetailRow label="VAT">{quote.vatEnabled ? `${quote.vatRate}%` : 'Not applied'}</DetailRow>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="History" />
            <CardBody>
              <HistoryList history={quote.history} />
            </CardBody>
          </Card>
        </aside>
      </div>

      <PdfPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} input={previewOpen ? pdfInput : null} title={`${quote.number}.pdf`} />
    </>
  );
}

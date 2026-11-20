import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { DocumentEditor } from '@/components/documents/DocumentEditor';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/Layout';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { store } from '@/data/store';
import type { Invoice } from '@/domain/types';
import type { DocumentFormValues } from '@/services/documentCommon';
import { createInvoice, invoiceToValues, markInvoiceSent, newInvoiceValues, updateDraftInvoice } from '@/services/invoiceService';

export default function InvoiceEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [initial, setInitial] = useState<DocumentFormValues | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (id) {
        const inv = await store().invoices.get(id);
        if (cancelled) return;
        setInvoice(inv ?? null);
        if (inv) setInitial(invoiceToValues(inv));
      } else {
        const clientId = params.get('client') ?? '';
        const projectId = params.get('project');
        const values = await newInvoiceValues({ clientId, projectId: projectId || null });
        if (cancelled) return;
        setInvoice(null);
        setInitial(values);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, params]);

  if (initial === null && invoice === undefined) return <Spinner />;
  if (id && !invoice) {
    return (
      <Card>
        <EmptyState icon={<Lock className="h-6 w-6" />} title="Invoice not found" action={<ButtonLink to="/invoices">Back to invoices</ButtonLink>} />
      </Card>
    );
  }
  if (invoice && invoice.storedStatus !== 'draft') {
    return (
      <Card>
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title="This invoice is finalised"
          description="Issued invoices are protected against accidental changes. Open the invoice and use “Unlock for correction” if a change is genuinely required."
          action={<ButtonLink to={`/invoices/${invoice.id}`}>Open invoice</ButtonLink>}
        />
      </Card>
    );
  }
  if (!initial) return <Spinner />;

  const onSave = async (values: DocumentFormValues, intent: 'draft' | 'send') => {
    let saved: Invoice;
    try {
      saved = invoice ? await updateDraftInvoice(invoice.id, values) : await createInvoice(values);
    } catch (err) {
      toast.error('Could not save invoice', err);
      return false;
    }
    // The draft is safely stored at this point; never stay on the "new" form (that would allow a duplicate).
    if (intent === 'send') {
      try {
        await markInvoiceSent(saved.id);
        toast.success('Invoice finalised and marked as sent', saved.number);
      } catch (err) {
        toast.error('Saved as draft, but it could not be marked as sent', err);
      }
    } else {
      toast.success('Draft saved', saved.number);
    }
    navigate(`/invoices/${saved.id}`, { replace: true });
    return true;
  };

  return (
    <>
      <PageHeader
        back={invoice ? { to: `/invoices/${invoice.id}`, label: invoice.number } : { to: '/invoices', label: 'Invoices' }}
        kicker={invoice ? 'Edit draft' : 'New'}
        title={invoice ? `Edit ${invoice.number}` : 'New invoice'}
      />
      <DocumentEditor kind="invoice" initial={initial} number={invoice?.number} onSave={onSave} />
    </>
  );
}

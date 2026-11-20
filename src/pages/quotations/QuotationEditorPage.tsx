import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { DocumentEditor } from '@/components/documents/DocumentEditor';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/Layout';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { store } from '@/data/store';
import type { Quotation } from '@/domain/types';
import type { DocumentFormValues } from '@/services/documentCommon';
import { createQuotation, markQuotationSent, newQuotationValues, quotationToValues, updateQuotation } from '@/services/quotationService';

export default function QuotationEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [initial, setInitial] = useState<DocumentFormValues | null>(null);
  const [quotation, setQuotation] = useState<Quotation | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (id) {
        const q = await store().quotations.get(id);
        if (cancelled) return;
        setQuotation(q ?? null);
        if (q) setInitial(quotationToValues(q));
      } else {
        const values = await newQuotationValues({ clientId: params.get('client') ?? '', projectId: params.get('project') || null });
        if (cancelled) return;
        setQuotation(null);
        setInitial(values);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, params]);

  if (initial === null && quotation === undefined) return <Spinner />;
  if (id && !quotation) {
    return (
      <Card>
        <EmptyState icon={<Lock className="h-6 w-6" />} title="Quotation not found" action={<ButtonLink to="/quotations">Back to quotations</ButtonLink>} />
      </Card>
    );
  }
  if (quotation && (quotation.storedStatus === 'accepted' || quotation.storedStatus === 'rejected')) {
    return (
      <Card>
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title={`This quotation was ${quotation.storedStatus}`}
          description="Accepted and rejected quotations are kept as a record. Duplicate it to prepare a revised quotation."
          action={<ButtonLink to={`/quotations/${quotation.id}`}>Open quotation</ButtonLink>}
        />
      </Card>
    );
  }
  if (!initial) return <Spinner />;

  const onSave = async (values: DocumentFormValues, intent: 'draft' | 'send') => {
    let saved: Quotation;
    try {
      saved = quotation ? await updateQuotation(quotation.id, values) : await createQuotation(values);
    } catch (err) {
      toast.error('Could not save quotation', err);
      return false;
    }
    if (intent === 'send') {
      try {
        await markQuotationSent(saved.id);
        toast.success('Quotation saved and marked as sent', saved.number);
      } catch (err) {
        toast.error('Saved as draft, but it could not be marked as sent', err);
      }
    } else toast.success('Draft saved', saved.number);
    navigate(`/quotations/${saved.id}`, { replace: true });
    return true;
  };

  return (
    <>
      <PageHeader
        back={quotation ? { to: `/quotations/${quotation.id}`, label: quotation.number } : { to: '/quotations', label: 'Quotations' }}
        kicker={quotation ? (quotation.storedStatus === 'sent' ? 'Revise (returns to draft)' : 'Edit draft') : 'New'}
        title={quotation ? `Edit ${quotation.number}` : 'New quotation'}
      />
      <DocumentEditor kind="quotation" initial={initial} number={quotation?.number} onSave={onSave} />
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { Eye, Info, Plus, Save, Send } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, MoneyInput, Select, Textarea, Toggle } from '@/components/ui/Field';
import { useConfirm } from '@/components/ui/Confirm';
import { ClientFormModal } from '@/components/forms/ClientFormModal';
import { ProjectFormModal } from '@/components/forms/ProjectFormModal';
import { store } from '@/data/store';
import { calculateTotals } from '@/domain/calculations';
import { addDays, isValidISODate } from '@/domain/dates';
import type { DiscountType } from '@/domain/types';
import { validateDocument, type ValidationErrors } from '@/domain/validation';
import { useFormat, useSettings } from '@/hooks/useApp';
import { useLiveData } from '@/hooks/useLiveData';
import { clientDisplayName, snapshotClient } from '@/services/clientService';
import type { DocumentFormValues } from '@/services/documentCommon';
import { previewNextNumber } from '@/services/numberingService';
import type { PdfDocumentInput } from '@/pdf/documentPdf';
import { LineItemsEditor } from './LineItemsEditor';
import { TotalsPanel } from './TotalsPanel';
import { PdfPreviewModal } from './PdfPreviewModal';

export type SaveIntent = 'draft' | 'send';

export function DocumentEditor({
  kind,
  initial,
  number,
  onSave,
}: {
  kind: 'invoice' | 'quotation';
  initial: DocumentFormValues;
  /** Existing number when editing; undefined for new documents. */
  number?: string;
  onSave: (values: DocumentFormValues, intent: SaveIntent) => Promise<boolean>;
}) {
  const settings = useSettings();
  const fmt = useFormat();
  const confirm = useConfirm();
  const [values, setValues] = useState<DocumentFormValues>(initial);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState<SaveIntent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [clientModal, setClientModal] = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [preview, setPreview] = useState<PdfDocumentInput | null>(null);
  const [nextNumber, setNextNumber] = useState<string>('');

  const isInvoice = kind === 'invoice';
  const endLabel = isInvoice ? 'Due date' : 'Expiry date';
  const label = isInvoice ? 'invoice' : 'quotation';

  const clients = useLiveData(() => store().clients.list(), []) ?? [];
  const services = useLiveData(() => store().services.list(), []) ?? [];
  const projects = useLiveData(() => (values.clientId ? store().projects.findBy('clientId', values.clientId) : Promise.resolve([])), [values.clientId]) ?? [];

  useEffect(() => {
    if (!number) void previewNextNumber(kind, isValidISODate(values.issueDate) ? values.issueDate : undefined).then(setNextNumber);
  }, [number, kind, values.issueDate]);

  // Warn before leaving with unsaved changes (in-app navigation and tab close).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirm({
      title: 'Discard unsaved changes?',
      message: `This ${label} has changes that have not been saved.`,
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
    }).then(({ confirmed }) => (confirmed ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm, label]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const update = (patch: Partial<DocumentFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setDirty(true);
  };

  const client = clients.find((c) => c.id === values.clientId);
  const totals = useMemo(() => calculateTotals(values), [values]);
  const sortedClients = useMemo(() => [...clients].sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b))), [clients]);

  const validate = () => {
    const errs = validateDocument(
      { clientId: values.clientId, issueDate: values.issueDate, endDate: values.endDate, items: values.items, discountType: values.discount.type, discountValue: values.discount.value },
      endLabel,
    );
    setErrors(errs);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"], [role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return false;
    }
    return true;
  };

  const save = async (intent: SaveIntent) => {
    if (!validate()) return;
    if (intent === 'send' && totals.total <= 0) {
      setErrors({ items: `The ${label} total must be greater than zero before it can be sent.` });
      return;
    }
    setSaving(intent);
    const ok = await onSave(values, intent);
    if (ok) setDirty(false);
    setSaving(null);
  };

  const openPreview = () => {
    if (!client) {
      setErrors((e) => ({ ...e, clientId: 'Select a client to preview the document.' }));
      return;
    }
    const project = projects.find((p) => p.id === values.projectId);
    setPreview({
      kind,
      number: number ?? nextNumber ?? 'PREVIEW',
      issueDate: values.issueDate,
      endDate: values.endDate,
      client: snapshotClient(client),
      projectName: project?.name,
      items: values.items,
      discount: values.discount,
      vatEnabled: values.vatEnabled,
      vatRate: values.vatRate,
      currency: values.currency,
      paymentInstructions: values.paymentInstructions,
      notes: values.notes,
      terms: values.terms,
      watermark: 'DRAFT',
    });
  };

  const termsButtons = isInvoice ? [0, 7, 14, 30] : [14, 30, 60];

  const actionButtons = (
    <>
      <Button variant="secondary" icon={<Eye className="h-4 w-4" />} onClick={openPreview}>
        Preview
      </Button>
      <Button variant="secondary" icon={<Save className="h-4 w-4" />} loading={saving === 'draft'} disabled={!!saving} onClick={() => void save('draft')}>
        Save draft
      </Button>
      <Button variant="primary" icon={<Send className="h-4 w-4" />} loading={saving === 'send'} disabled={!!saving} onClick={() => void save('send')}>
        Save & mark sent
      </Button>
    </>
  );

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Card>
            <CardHeader title="Client & dates" subtitle={isInvoice ? 'Who is being billed, and when payment is due.' : 'Who the quotation is for, and how long it is valid.'} />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Client" htmlFor="doc-client" error={errors.clientId} required>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Select
                      id="doc-client"
                      value={values.clientId}
                      invalid={!!errors.clientId}
                      onChange={(e) => update({ clientId: e.target.value, projectId: null })}
                    >
                      <option value="">Select a client…</option>
                      {sortedClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {clientDisplayName(c)}
                          {c.status === 'inactive' ? ' (inactive)' : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button size="icon" className="h-10 w-10 shrink-0" aria-label="New client" title="New client" onClick={() => setClientModal(true)} icon={<Plus className="h-4 w-4" />} />
                </div>
              </Field>
              <Field label="Project (optional)" htmlFor="doc-project">
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Select id="doc-project" value={values.projectId ?? ''} disabled={!values.clientId} onChange={(e) => update({ projectId: e.target.value || null })}>
                      <option value="">{values.clientId ? (projects.length ? 'No project' : 'No projects for this client') : 'Select a client first'}</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    aria-label="New project"
                    title="New project"
                    disabled={!values.clientId}
                    onClick={() => setProjectModal(true)}
                    icon={<Plus className="h-4 w-4" />}
                  />
                </div>
              </Field>
              {client && (client.billingSameAsPhysical ? client.physicalAddress : client.billingAddress).line1 === '' && (
                <p className="flex items-center gap-2 text-xs text-warning sm:col-span-2">
                  <Info className="h-3.5 w-3.5" /> This client has no billing address yet — you can add one from the Clients page.
                </p>
              )}
              <Field label="Issue date" htmlFor="doc-issue" error={errors.issueDate} required>
                <Input id="doc-issue" type="date" value={values.issueDate} invalid={!!errors.issueDate} onChange={(e) => update({ issueDate: e.target.value })} />
              </Field>
              <Field label={endLabel} htmlFor="doc-end" error={errors.endDate} required>
                <Input id="doc-end" type="date" value={values.endDate} invalid={!!errors.endDate} onChange={(e) => update({ endDate: e.target.value })} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {termsButtons.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => isValidISODate(values.issueDate) && update({ endDate: addDays(values.issueDate, d) })}
                      className="rounded-md border border-border px-2 py-0.5 text-[0.7rem] text-muted transition-colors hover:border-border-strong hover:text-text"
                    >
                      {d === 0 ? 'On receipt' : `${d} days`}
                    </button>
                  ))}
                </div>
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Line items" subtitle="Services and custom work included in this document." />
            <CardBody>
              <LineItemsEditor
                items={values.items}
                onChange={(items) => update({ items })}
                services={services}
                vatEnabled={values.vatEnabled}
                currency={values.currency}
                errors={errors}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Discount & VAT" />
            <CardBody className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Discount" htmlFor="doc-disc-type" error={errors.discount}>
                  <Select
                    id="doc-disc-type"
                    value={values.discount.type}
                    onChange={(e) => update({ discount: { type: e.target.value as DiscountType, value: 0 } })}
                  >
                    <option value="none">No discount</option>
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed amount</option>
                  </Select>
                </Field>
                {values.discount.type === 'percent' && (
                  <Field label="Discount percentage" htmlFor="doc-disc-pct">
                    <Input
                      id="doc-disc-pct"
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      inputMode="decimal"
                      className="num text-right"
                      value={values.discount.value || ''}
                      onChange={(e) => update({ discount: { type: 'percent', value: Number(e.target.value) || 0 } })}
                    />
                  </Field>
                )}
                {values.discount.type === 'fixed' && (
                  <Field label="Discount amount" htmlFor="doc-disc-fixed">
                    <MoneyInput
                      id="doc-disc-fixed"
                      value={values.discount.value}
                      currency={values.currency}
                      onChange={(c) => update({ discount: { type: 'fixed', value: c } })}
                    />
                  </Field>
                )}
              </div>
              {settings.vatEnabled ? (
                <div className="space-y-4 rounded-xl border border-border bg-bg-2/60 p-4">
                  <Toggle
                    checked={values.vatEnabled}
                    onChange={(v) => update({ vatEnabled: v })}
                    label={`Apply ${settings.vatLabel} to this ${label}`}
                    description="Individual lines can be marked zero-rated or exempt in the line items above."
                  />
                  {values.vatEnabled && (
                    <Field label={`${settings.vatLabel} rate (%)`} htmlFor="doc-vat-rate" className="max-w-[12rem]">
                      <Input
                        id="doc-vat-rate"
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        className="num text-right"
                        value={values.vatRate}
                        onChange={(e) => update({ vatRate: Math.min(Math.max(Number(e.target.value) || 0, 0), 100) })}
                      />
                    </Field>
                  )}
                </div>
              ) : (
                <p className="flex items-start gap-2 rounded-xl border border-border bg-bg-2/60 p-3 text-xs leading-relaxed text-muted">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue" />
                  <span>
                    VAT is switched off for this business. If you are VAT-registered, enable it in{' '}
                    <Link to="/settings?tab=financial" className="text-blue hover:underline">
                      Settings → Financial
                    </Link>
                    .
                  </span>
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={isInvoice ? 'Payment, notes & terms' : 'Notes & terms'} subtitle="Shown on the client-facing document." />
            <CardBody className="space-y-4">
              {isInvoice && (
                <Field
                  label="Payment instructions"
                  htmlFor="doc-payment"
                  hint={settings.paymentDetails ? undefined : 'Tip: save your banking details in Settings → Business so they fill in automatically.'}
                >
                  <Textarea id="doc-payment" rows={4} value={values.paymentInstructions} onChange={(e) => update({ paymentInstructions: e.target.value })} placeholder="Bank, account number, branch code, reference…" />
                </Field>
              )}
              <Field label="Notes" htmlFor="doc-notes">
                <Textarea id="doc-notes" rows={2} value={values.notes} onChange={(e) => update({ notes: e.target.value })} />
              </Field>
              <Field label="Terms & conditions" htmlFor="doc-terms">
                <Textarea id="doc-terms" rows={4} value={values.terms} onChange={(e) => update({ terms: e.target.value })} />
              </Field>
            </CardBody>
          </Card>
        </div>

        <aside className="lg:col-span-4">
          <div className="space-y-4 lg:sticky lg:top-24">
            <Card>
              <CardHeader
                title="Summary"
                subtitle={
                  <span className="num font-mono">{number ?? (nextNumber ? `${nextNumber} (assigned on save)` : '')}</span>
                }
              />
              <CardBody>
                <div className="mb-4 rounded-xl border border-border bg-bg-2/60 p-3">
                  <div className="kicker">{isInvoice ? 'Bill to' : 'Prepared for'}</div>
                  <div className="mt-1 truncate text-sm text-text">{client ? clientDisplayName(client) : '—'}</div>
                  <div className="mt-2 flex justify-between text-xs text-muted">
                    <span>{values.items.length} line item{values.items.length === 1 ? '' : 's'}</span>
                    <span>
                      {endLabel}: {fmt.date(values.endDate)}
                    </span>
                  </div>
                </div>
                <TotalsPanel pricing={values} currency={values.currency} />
                <div className="mt-5 hidden flex-col gap-2 lg:flex">{actionButtons}</div>
                <p className="mt-3 hidden text-[0.7rem] leading-relaxed text-faint lg:block">
                  {isInvoice
                    ? 'Once marked as sent, the invoice is locked against accidental edits. Corrections use a controlled unlock with a recorded reason.'
                    : 'Sent quotations can still be revised; accepted quotations can be converted into an invoice.'}
                </p>
              </CardBody>
            </Card>
          </div>
        </aside>
      </div>

      {/* Mobile sticky action bar */}
      <div className="pb-safe fixed inset-x-0 bottom-[3.9rem] z-20 border-t border-border bg-bg-2/95 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[0.65rem] text-faint">Total</div>
            <div className="num truncate font-display text-base font-semibold">{fmt.money(totals.total, values.currency)}</div>
          </div>
          <div className="flex gap-2">
            <Button size="icon" variant="secondary" aria-label="Preview" onClick={openPreview} icon={<Eye className="h-4 w-4" />} />
            <Button size="sm" variant="secondary" className="h-9" loading={saving === 'draft'} disabled={!!saving} onClick={() => void save('draft')}>
              Save
            </Button>
            <Button size="sm" variant="primary" className="h-9" loading={saving === 'send'} disabled={!!saving} onClick={() => void save('send')}>
              Send
            </Button>
          </div>
        </div>
      </div>

      <ClientFormModal open={clientModal} onClose={() => setClientModal(false)} onSaved={(c) => update({ clientId: c.id, projectId: null })} />
      <ProjectFormModal
        open={projectModal}
        onClose={() => setProjectModal(false)}
        defaultClientId={values.clientId}
        onSaved={(p) => p.clientId === values.clientId && update({ projectId: p.id })}
      />
      <PdfPreviewModal open={!!preview} onClose={() => setPreview(null)} input={preview} title={`Preview — ${number ?? nextNumber}`} />
    </>
  );
}

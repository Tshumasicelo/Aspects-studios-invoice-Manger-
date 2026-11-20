import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, ImagePlus, Info, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea, Toggle } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { AddressFields } from '@/components/forms/AddressFields';
import { PdfPreviewModal } from '@/components/documents/PdfPreviewModal';
import { CURRENCIES, formatMoney } from '@/domain/money';
import { formatDate, todayISO } from '@/domain/dates';
import type { CounterKey, DateFormat, NumberingConfig } from '@/domain/types';
import { validateNumberingConfig } from '@/domain/numbering';
import { processLogo } from '@/lib/image';
import { samplePdfInput } from '@/pdf/pdfActions';
import { getNextSequence, sampleNumber, setNextSequence } from '@/services/numberingService';
import type { SettingsDraft } from './useSettingsDraft';

export function BusinessSection({ s, showPayment = true }: { s: SettingsDraft; showPayment?: boolean }) {
  const d = s.draft;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" htmlFor="b-name" required>
          <Input id="b-name" value={d.businessName} onChange={(e) => s.set('businessName', e.target.value)} />
        </Field>
        <Field label="Tagline" htmlFor="b-tag" hint="Shown under the name on documents when no logo is uploaded.">
          <Input id="b-tag" value={d.tagline} onChange={(e) => s.set('tagline', e.target.value)} />
        </Field>
        <Field label="Business email" htmlFor="b-email">
          <Input id="b-email" type="email" value={d.email} onChange={(e) => s.set('email', e.target.value)} />
        </Field>
        <Field label="Telephone" htmlFor="b-phone">
          <Input id="b-phone" type="tel" value={d.phone} onChange={(e) => s.set('phone', e.target.value)} />
        </Field>
        <Field label="Website" htmlFor="b-web">
          <Input id="b-web" value={d.website} onChange={(e) => s.set('website', e.target.value)} placeholder="www.example.co.za" />
        </Field>
        <Field label="Company registration number" htmlFor="b-reg">
          <Input id="b-reg" value={d.registrationNumber} onChange={(e) => s.set('registrationNumber', e.target.value)} placeholder="e.g. 2024/123456/07" />
        </Field>
      </div>
      <fieldset>
        <legend className="kicker mb-3">Business address</legend>
        <AddressFields idPrefix="b-addr" value={d.address} onChange={(a) => s.set('address', a)} />
      </fieldset>
      {showPayment && <PaymentDetailsField s={s} />}
    </div>
  );
}

export function PaymentDetailsField({ s }: { s: SettingsDraft }) {
  return (
    <Field
      label="Payment / banking details"
      htmlFor="b-pay"
      hint="Printed in the “Payment information” box on invoices. Stored only on this device. Never pre-filled — enter your own details."
    >
      <Textarea
        id="b-pay"
        rows={5}
        value={s.draft.paymentDetails}
        onChange={(e) => s.set('paymentDetails', e.target.value)}
        placeholder={'Bank: …\nAccount name: …\nAccount number: …\nBranch code: …\nReference: Invoice number'}
      />
    </Field>
  );
}

export function BrandingSection({ s }: { s: SettingsDraft }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<'invoice' | 'quotation' | null>(null);
  const d = s.draft;
  // Memoised so the preview isn't regenerated on every render.
  const sample = useMemo(() => (preview ? samplePdfInput(d, preview) : null), [preview, d]);

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      s.set('logoDataUrl', await processLogo(file));
    } catch (err) {
      toast.error('Logo not added', err);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="label">Logo</div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-3 sm:w-64">
            {d.logoDataUrl ? (
              <img src={d.logoDataUrl} alt="Business logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-xs text-gray-400">No logo — business name is used</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button icon={<ImagePlus className="h-4 w-4" />} loading={busy} onClick={() => input.current?.click()}>
              {d.logoDataUrl ? 'Replace logo' : 'Upload logo'}
            </Button>
            {d.logoDataUrl && (
              <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => s.set('logoDataUrl', null)}>
                Remove
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-faint">PNG with a transparent background works best. Shown on a white document, max 52 × 20 mm.</p>
      </div>
      <Field label="Document accent colour" htmlFor="b-accent" hint="A restrained highlight used on the top edge and amount box of PDFs.">
        <div className="flex items-center gap-3">
          <input
            id="b-accent"
            type="color"
            value={d.documentAccentColor}
            onChange={(e) => s.set('documentAccentColor', e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-bg-2 p-1"
          />
          <Input value={d.documentAccentColor} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && s.set('documentAccentColor', e.target.value)} className="max-w-[8rem] font-mono" />
          <Button size="sm" variant="ghost" onClick={() => s.set('documentAccentColor', '#3985FF')}>
            Reset
          </Button>
        </div>
      </Field>
      <div className="rounded-xl border border-border bg-bg-2/60 p-4">
        <p className="text-sm text-text">Preview document branding</p>
        <p className="mt-1 text-xs text-muted">Generates a sample with your current (including unsaved) settings. Nothing is saved or sent.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => setPreview('invoice')}>
            Sample invoice
          </Button>
          <Button size="sm" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => setPreview('quotation')}>
            Sample quotation
          </Button>
        </div>
      </div>
      <PdfPreviewModal open={!!preview} onClose={() => setPreview(null)} input={sample} title="Branding preview (sample)" draftSettings={d} />
    </div>
  );
}

export function RegionalSection({ s }: { s: SettingsDraft }) {
  const d = s.draft;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Default currency" htmlFor="f-cur" hint={`Example: ${formatMoney(125000, d.currency)}`}>
        <Select id="f-cur" value={d.currency} onChange={(e) => s.set('currency', e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date format" htmlFor="f-date" hint={`Today: ${formatDate(todayISO(), d.dateFormat)}`}>
        <Select id="f-date" value={d.dateFormat} onChange={(e) => s.set('dateFormat', e.target.value as DateFormat)}>
          <option value="DD MMM YYYY">20 Nov 2026</option>
          <option value="YYYY/MM/DD">2026/11/20 (SA standard)</option>
          <option value="DD/MM/YYYY">20/11/2026</option>
        </Select>
      </Field>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-faint sm:col-span-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Changing the currency applies to new documents. Existing invoices and quotations keep the currency they were created with.
      </p>
    </div>
  );
}

export function VatSection({ s }: { s: SettingsDraft }) {
  const d = s.draft;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-bg-2/60 p-4">
        <Toggle
          checked={d.vatEnabled}
          onChange={(v) => s.set('vatEnabled', v)}
          label="This business is VAT-registered"
          description="Only enable this if you are registered for VAT. When enabled, new documents include VAT and invoices are titled “Tax Invoice”."
        />
      </div>
      {d.vatEnabled && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="VAT rate (%)" htmlFor="f-vat-rate" hint="South Africa standard rate is 15% — confirm with your tax practitioner.">
            <Input id="f-vat-rate" type="number" min="0" max="100" step="any" className="num" value={d.vatRate} onChange={(e) => s.set('vatRate', Number(e.target.value) || 0)} />
          </Field>
          <Field label="Tax label" htmlFor="f-vat-label">
            <Input id="f-vat-label" value={d.vatLabel} onChange={(e) => s.set('vatLabel', e.target.value)} />
          </Field>
          <Field label="VAT registration number" htmlFor="f-vat-no" hint="Printed on tax invoices.">
            <Input id="f-vat-no" value={d.vatRegistrationNumber} onChange={(e) => s.set('vatRegistrationNumber', e.target.value)} />
          </Field>
        </div>
      )}
      <p className="text-xs leading-relaxed text-faint">
        Existing documents keep the VAT settings they were created with. Individual line items can be marked zero-rated or exempt.
      </p>
    </div>
  );
}

export function DocumentDefaultsSection({ s }: { s: SettingsDraft }) {
  const d = s.draft;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default payment terms (days)" htmlFor="f-terms" hint="Due date = issue date + this many days.">
          <Input id="f-terms" type="number" min="0" max="365" className="num" value={d.defaultPaymentTermsDays} onChange={(e) => s.set('defaultPaymentTermsDays', Math.max(0, Math.round(Number(e.target.value) || 0)))} />
        </Field>
        <Field label="Quotation validity (days)" htmlFor="f-validity">
          <Input id="f-validity" type="number" min="1" max="365" className="num" value={d.quotationValidityDays} onChange={(e) => s.set('quotationValidityDays', Math.max(1, Math.round(Number(e.target.value) || 1)))} />
        </Field>
      </div>
      <Field label="Default invoice notes" htmlFor="f-in">
        <Textarea id="f-in" rows={2} value={d.defaultInvoiceNotes} onChange={(e) => s.set('defaultInvoiceNotes', e.target.value)} />
      </Field>
      <Field label="Default invoice terms & conditions" htmlFor="f-it">
        <Textarea id="f-it" rows={3} value={d.defaultInvoiceTerms} onChange={(e) => s.set('defaultInvoiceTerms', e.target.value)} />
      </Field>
      <Field label="Default quotation notes" htmlFor="f-qn">
        <Textarea id="f-qn" rows={2} value={d.defaultQuotationNotes} onChange={(e) => s.set('defaultQuotationNotes', e.target.value)} />
      </Field>
      <Field label="Default quotation terms & conditions" htmlFor="f-qt">
        <Textarea id="f-qt" rows={3} value={d.defaultQuotationTerms} onChange={(e) => s.set('defaultQuotationTerms', e.target.value)} />
      </Field>
    </div>
  );
}

export function NumberingSection({ s }: { s: SettingsDraft }) {
  const rows: { kind: CounterKey; key: 'invoiceNumbering' | 'quotationNumbering' | 'paymentNumbering'; label: string }[] = [
    { kind: 'invoice', key: 'invoiceNumbering', label: 'Invoices' },
    { kind: 'quotation', key: 'quotationNumbering', label: 'Quotations' },
    { kind: 'payment', key: 'paymentNumbering', label: 'Payment references' },
  ];
  return (
    <div className="space-y-6">
      <p className="text-xs leading-relaxed text-muted">
        Tokens: <code className="text-accent">{'{PREFIX}'}</code> <code className="text-accent">{'{YYYY}'}</code> <code className="text-accent">{'{YY}'}</code>{' '}
        <code className="text-accent">{'{MM}'}</code> <code className="text-accent">{'{SEQ}'}</code>. Numbers are never reused, and duplicates are blocked by the database.
      </p>
      {rows.map((r) => (
        <NumberingRow key={r.key} s={s} kind={r.kind} label={r.label} configKey={r.key} />
      ))}
    </div>
  );
}

function NumberingRow({ s, kind, label, configKey }: { s: SettingsDraft; kind: CounterKey; label: string; configKey: 'invoiceNumbering' | 'quotationNumbering' | 'paymentNumbering' }) {
  const toast = useToast();
  const cfg = s.draft[configKey];
  const savedCfg = s.saved[configKey];
  const [next, setNext] = useState<number | null>(null);
  const [nextInput, setNextInput] = useState('');
  const update = (patch: Partial<NumberingConfig>) => s.set(configKey, { ...cfg, ...patch });
  const problem = validateNumberingConfig(cfg);

  useEffect(() => {
    void getNextSequence(kind, savedCfg).then((n) => {
      setNext(n);
      setNextInput(String(n));
    });
  }, [kind, savedCfg]);

  return (
    <div className="rounded-xl border border-border bg-bg-2/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-text">{label}</span>
        <span className="num rounded-md border border-border bg-bg px-2 py-1 font-mono text-xs text-accent">
          Next: {problem ? '—' : sampleNumber(cfg, next ?? 1)}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Pattern" htmlFor={`${kind}-pat`} className="sm:col-span-2" error={problem ?? undefined}>
          <Input id={`${kind}-pat`} className="font-mono" value={cfg.pattern} onChange={(e) => update({ pattern: e.target.value })} />
        </Field>
        <Field label="Prefix" htmlFor={`${kind}-pre`}>
          <Input id={`${kind}-pre`} className="font-mono" value={cfg.prefix} onChange={(e) => update({ prefix: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Digits" htmlFor={`${kind}-pad`}>
          <Input id={`${kind}-pad`} type="number" min="1" max="10" className="num" value={cfg.padding} onChange={(e) => update({ padding: Math.round(Number(e.target.value) || 1) })} />
        </Field>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Toggle checked={cfg.resetYearly} onChange={(v) => update({ resetYearly: v })} label="Restart numbering each year" />
        <div className="flex items-end gap-2">
          <Field label={`Next sequence${cfg.resetYearly ? ` (${new Date().getFullYear()})` : ''}`} htmlFor={`${kind}-next`}>
            <Input id={`${kind}-next`} type="number" min="1" className="num w-28" value={nextInput} onChange={(e) => setNextInput(e.target.value)} />
          </Field>
          <Button
            size="sm"
            className="h-10"
            disabled={s.dirty || !nextInput || Number(nextInput) === next}
            title={s.dirty ? 'Save your other changes first' : undefined}
            onClick={async () => {
              const value = Math.max(1, Math.floor(Number(nextInput)));
              try {
                await setNextSequence(kind, savedCfg, value);
                setNext(value);
                toast.success('Sequence updated', `Numbers that already exist are skipped automatically.`);
              } catch (err) {
                toast.error('Could not update sequence', err);
              }
            }}
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

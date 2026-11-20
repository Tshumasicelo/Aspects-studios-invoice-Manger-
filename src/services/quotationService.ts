import { store } from '@/data/store';
import { calculateTotals } from '@/domain/calculations';
import { addDays, todayISO } from '@/domain/dates';
import type { Invoice, Quotation } from '@/domain/types';
import { hasErrors, validateDocument } from '@/domain/validation';
import { newId, nowISO } from '@/lib/id';
import { snapshotClient } from './clientService';
import { cloneItems, historyEntry, sanitiseItems, type DocumentFormValues } from './documentCommon';
import { BusinessRuleError } from './errors';
import { createInvoice } from './invoiceService';
import { reserveNumber } from './numberingService';
import { getSettings } from './settingsService';

export async function newQuotationValues(partial: Partial<DocumentFormValues> = {}): Promise<DocumentFormValues> {
  const settings = await getSettings();
  const issueDate = todayISO();
  return {
    clientId: '',
    projectId: null,
    issueDate,
    endDate: addDays(issueDate, settings.quotationValidityDays),
    items: [],
    discount: { type: 'none', value: 0 },
    vatEnabled: settings.vatEnabled,
    vatRate: settings.vatRate,
    currency: settings.currency,
    notes: settings.defaultQuotationNotes,
    terms: settings.defaultQuotationTerms,
    paymentInstructions: '',
    ...partial,
  };
}

export function quotationToValues(q: Quotation): DocumentFormValues {
  return {
    clientId: q.clientId,
    projectId: q.projectId,
    issueDate: q.issueDate,
    endDate: q.expiryDate,
    items: q.items.map((i) => ({ ...i })),
    discount: { ...q.discount },
    vatEnabled: q.vatEnabled,
    vatRate: q.vatRate,
    currency: q.currency,
    notes: q.notes,
    terms: q.terms,
    paymentInstructions: '',
  };
}

function assertValid(values: DocumentFormValues) {
  const errors = validateDocument(
    { ...values, discountType: values.discount.type, discountValue: values.discount.value },
    'Expiry date',
  );
  if (hasErrors(errors)) throw new BusinessRuleError(Object.values(errors)[0]);
}

async function applyValues(base: Quotation, values: DocumentFormValues): Promise<Quotation> {
  const client = await store().clients.get(values.clientId);
  if (!client) throw new BusinessRuleError('The selected client no longer exists.');
  if (values.projectId) {
    const project = await store().projects.get(values.projectId);
    if (!project || project.clientId !== values.clientId)
      throw new BusinessRuleError('The selected project does not belong to this client.');
  }
  const items = sanitiseItems(values.items);
  const pricing = { items, discount: values.discount, vatEnabled: values.vatEnabled, vatRate: values.vatRate };
  return {
    ...base,
    ...pricing,
    clientId: values.clientId,
    clientSnapshot: snapshotClient(client),
    projectId: values.projectId,
    issueDate: values.issueDate,
    expiryDate: values.endDate,
    currency: values.currency,
    notes: values.notes.trim(),
    terms: values.terms.trim(),
    total: calculateTotals(pricing).total,
    updatedAt: nowISO(),
  };
}

export async function createQuotation(values: DocumentFormValues, note?: string): Promise<Quotation> {
  assertValid(values);
  const s = store();
  return s.transaction(async () => {
    const now = nowISO();
    const base: Quotation = {
      id: newId(),
      number: await reserveNumber('quotation', values.issueDate),
      createdAt: now,
      updatedAt: now,
      issueDate: values.issueDate,
      expiryDate: values.endDate,
      clientId: values.clientId,
      clientSnapshot: {} as Quotation['clientSnapshot'],
      projectId: null,
      currency: values.currency,
      notes: '',
      terms: '',
      items: [],
      discount: { type: 'none', value: 0 },
      vatEnabled: false,
      vatRate: 0,
      storedStatus: 'draft',
      total: 0,
      convertedInvoiceId: null,
      history: [historyEntry('Created as draft', note)],
    };
    const q = await applyValues(base, values);
    await s.quotations.put(q);
    return q;
  });
}

/** Draft and sent quotations can be edited; editing a sent quotation returns it to draft. */
export async function updateQuotation(id: string, values: DocumentFormValues): Promise<Quotation> {
  assertValid(values);
  const s = store();
  return s.transaction(async () => {
    const existing = await s.quotations.get(id);
    if (!existing) throw new BusinessRuleError('Quotation not found.');
    if (existing.storedStatus === 'accepted' || existing.storedStatus === 'rejected')
      throw new BusinessRuleError('Accepted or rejected quotations cannot be edited. Duplicate it to create a revised quotation.');
    const q = await applyValues(existing, values);
    const wasSent = existing.storedStatus === 'sent';
    q.storedStatus = 'draft';
    q.history = [...existing.history, historyEntry(wasSent ? 'Revised (returned to draft)' : 'Draft updated')];
    await s.quotations.put(q);
    return q;
  });
}

async function mutate(id: string, fn: (q: Quotation) => Quotation | Promise<Quotation>): Promise<Quotation> {
  const s = store();
  return s.transaction(async () => {
    const q = await s.quotations.get(id);
    if (!q) throw new BusinessRuleError('Quotation not found.');
    const next = await fn(q);
    next.updatedAt = nowISO();
    await s.quotations.put(next);
    return next;
  });
}

export function markQuotationSent(id: string) {
  return mutate(id, (q) => {
    if (q.storedStatus !== 'draft') throw new BusinessRuleError('Only draft quotations can be marked as sent.');
    if (q.total <= 0) throw new BusinessRuleError('A quotation must have a total greater than zero before it is sent.');
    return { ...q, storedStatus: 'sent', history: [...q.history, historyEntry('Marked as sent')] };
  });
}

/** Accepting also moves a linked project from Planning/Quoted to Approved. */
export function acceptQuotation(id: string) {
  return mutate(id, async (q) => {
    if (q.storedStatus !== 'sent' && q.storedStatus !== 'draft')
      throw new BusinessRuleError('Only draft or sent quotations can be accepted.');
    if (q.expiryDate < todayISO()) throw new BusinessRuleError('This quotation has expired. Update the expiry date before accepting it.');
    if (q.projectId) {
      const project = await store().projects.get(q.projectId);
      if (project && (project.status === 'planning' || project.status === 'quoted')) {
        await store().projects.put({
          ...project,
          status: 'approved',
          quotationId: project.quotationId ?? q.id,
          updatedAt: nowISO(),
          history: [...project.history, historyEntry(`Approved via quotation ${q.number}`)],
        });
      }
    }
    return { ...q, storedStatus: 'accepted', history: [...q.history, historyEntry('Accepted by client')] };
  });
}

export function rejectQuotation(id: string, reason: string) {
  return mutate(id, (q) => {
    if (q.storedStatus === 'accepted' && q.convertedInvoiceId)
      throw new BusinessRuleError('This quotation has already been converted into an invoice.');
    return { ...q, storedStatus: 'rejected', history: [...q.history, historyEntry('Rejected', reason.trim() || undefined)] };
  });
}

/** Re-open an expired or rejected quotation as a draft with a new expiry date. */
export function reopenQuotation(id: string) {
  return mutate(id, async (q) => {
    if (q.convertedInvoiceId) throw new BusinessRuleError('Converted quotations cannot be reopened.');
    const settings = await getSettings();
    return {
      ...q,
      storedStatus: 'draft',
      expiryDate: q.expiryDate < todayISO() ? addDays(todayISO(), settings.quotationValidityDays) : q.expiryDate,
      history: [...q.history, historyEntry('Reopened as draft')],
    };
  });
}

export async function duplicateQuotation(id: string): Promise<Quotation> {
  const source = await store().quotations.get(id);
  if (!source) throw new BusinessRuleError('Quotation not found.');
  const settings = await getSettings();
  const issueDate = todayISO();
  return createQuotation(
    { ...quotationToValues(source), issueDate, endDate: addDays(issueDate, settings.quotationValidityDays), items: cloneItems(source.items) },
    `Duplicated from ${source.number}`,
  );
}

export async function deleteQuotation(id: string): Promise<void> {
  const s = store();
  await s.transaction(async () => {
    const q = await s.quotations.get(id);
    if (!q) return;
    if (q.convertedInvoiceId) throw new BusinessRuleError('This quotation has been converted into an invoice and must be kept for reference.');
    await s.quotations.delete(id);
    const projects = await s.projects.findBy('quotationId', id);
    for (const p of projects) await s.projects.put({ ...p, quotationId: null, updatedAt: nowISO() });
  });
}

/**
 * Convert an accepted quotation into a new draft invoice.
 * - The quotation is preserved and linked to the invoice (and vice versa).
 * - Client, project, line items, discount and VAT settings are carried over.
 * - A new invoice number is allocated.
 * - Idempotent: converting twice returns the existing invoice instead of creating a duplicate.
 */
export async function convertQuotationToInvoice(id: string): Promise<{ invoice: Invoice; created: boolean }> {
  const s = store();
  return s.transaction(async () => {
    const q = await s.quotations.get(id);
    if (!q) throw new BusinessRuleError('Quotation not found.');
    if (q.convertedInvoiceId) {
      const existing = await s.invoices.get(q.convertedInvoiceId);
      if (existing) return { invoice: existing, created: false };
    }
    if (q.storedStatus !== 'accepted') throw new BusinessRuleError('Only accepted quotations can be converted into invoices.');

    const settings = await getSettings();
    const issueDate = todayISO();
    const invoice = await createInvoice(
      {
        clientId: q.clientId,
        projectId: q.projectId,
        issueDate,
        endDate: addDays(issueDate, settings.defaultPaymentTermsDays),
        items: cloneItems(q.items),
        discount: { ...q.discount },
        vatEnabled: q.vatEnabled,
        vatRate: q.vatRate,
        currency: q.currency,
        notes: settings.defaultInvoiceNotes,
        terms: settings.defaultInvoiceTerms,
        paymentInstructions: settings.paymentDetails,
      },
      { quotationId: q.id, note: `Converted from quotation ${q.number}` },
    );
    await s.quotations.put({
      ...q,
      convertedInvoiceId: invoice.id,
      updatedAt: nowISO(),
      history: [...q.history, historyEntry(`Converted to invoice ${invoice.number}`)],
    });
    return { invoice, created: true };
  });
}

import { store } from '@/data/store';
import { calculateTotals } from '@/domain/calculations';
import { addDays, todayISO } from '@/domain/dates';
import type { Invoice } from '@/domain/types';
import { hasErrors, validateDocument } from '@/domain/validation';
import { newId, nowISO } from '@/lib/id';
import { snapshotClient } from './clientService';
import { cloneItems, historyEntry, sanitiseItems, type DocumentFormValues } from './documentCommon';
import { BusinessRuleError } from './errors';
import { reserveNumber } from './numberingService';
import { getSettings } from './settingsService';
import { sumCents } from '@/domain/money';

/** Blank invoice form values using the business defaults. */
export async function newInvoiceValues(partial: Partial<DocumentFormValues> = {}): Promise<DocumentFormValues> {
  const settings = await getSettings();
  const issueDate = todayISO();
  return {
    clientId: '',
    projectId: null,
    issueDate,
    endDate: addDays(issueDate, settings.defaultPaymentTermsDays),
    items: [],
    discount: { type: 'none', value: 0 },
    vatEnabled: settings.vatEnabled,
    vatRate: settings.vatRate,
    currency: settings.currency,
    notes: settings.defaultInvoiceNotes,
    terms: settings.defaultInvoiceTerms,
    paymentInstructions: settings.paymentDetails,
    ...partial,
  };
}

export function invoiceToValues(inv: Invoice): DocumentFormValues {
  return {
    clientId: inv.clientId,
    projectId: inv.projectId,
    issueDate: inv.issueDate,
    endDate: inv.dueDate,
    items: inv.items.map((i) => ({ ...i })),
    discount: { ...inv.discount },
    vatEnabled: inv.vatEnabled,
    vatRate: inv.vatRate,
    currency: inv.currency,
    notes: inv.notes,
    terms: inv.terms,
    paymentInstructions: inv.paymentInstructions,
  };
}

function assertValid(values: DocumentFormValues) {
  const errors = validateDocument(
    { ...values, endDate: values.endDate, discountType: values.discount.type, discountValue: values.discount.value },
    'Due date',
  );
  if (hasErrors(errors)) throw new BusinessRuleError(Object.values(errors)[0]);
}

async function applyValues(base: Invoice, values: DocumentFormValues): Promise<Invoice> {
  const client = await store().clients.get(values.clientId);
  if (!client) throw new BusinessRuleError('The selected client no longer exists.');
  if (values.projectId) {
    const project = await store().projects.get(values.projectId);
    if (!project) throw new BusinessRuleError('The selected project no longer exists.');
    if (project.clientId !== values.clientId) throw new BusinessRuleError('The selected project belongs to a different client.');
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
    dueDate: values.endDate,
    currency: values.currency,
    notes: values.notes.trim(),
    terms: values.terms.trim(),
    paymentInstructions: values.paymentInstructions.trim(),
    total: calculateTotals(pricing).total,
    updatedAt: nowISO(),
  };
}

/** Create a draft invoice with an automatically allocated, unique number. */
export async function createInvoice(values: DocumentFormValues, opts: { quotationId?: string; note?: string } = {}): Promise<Invoice> {
  assertValid(values);
  const s = store();
  return s.transaction(async () => {
    const now = nowISO();
    const number = await reserveNumber('invoice', values.issueDate);
    const base: Invoice = {
      id: newId(),
      number,
      createdAt: now,
      updatedAt: now,
      issueDate: values.issueDate,
      dueDate: values.endDate,
      clientId: values.clientId,
      clientSnapshot: {} as Invoice['clientSnapshot'],
      projectId: null,
      quotationId: opts.quotationId ?? null,
      currency: values.currency,
      paymentInstructions: '',
      notes: '',
      terms: '',
      items: [],
      discount: { type: 'none', value: 0 },
      vatEnabled: false,
      vatRate: 0,
      storedStatus: 'draft',
      total: 0,
      amountPaid: 0,
      sentAt: null,
      cancelledAt: null,
      history: [historyEntry('Created as draft', opts.note)],
    };
    const invoice = await applyValues(base, values);
    await s.invoices.put(invoice);
    return invoice;
  });
}

/** Only drafts may be edited. Issued invoices must go through `unlockForCorrection`. */
export async function updateDraftInvoice(id: string, values: DocumentFormValues): Promise<Invoice> {
  assertValid(values);
  const s = store();
  return s.transaction(async () => {
    const existing = await s.invoices.get(id);
    if (!existing) throw new BusinessRuleError('Invoice not found.');
    if (existing.storedStatus !== 'draft')
      throw new BusinessRuleError('Only draft invoices can be edited. Unlock the invoice for correction first.');
    const invoice = await applyValues(existing, values);
    invoice.history = [...existing.history, historyEntry('Draft updated')];
    await s.invoices.put(invoice);
    return invoice;
  });
}

async function mutate(id: string, fn: (inv: Invoice) => Invoice | Promise<Invoice>): Promise<Invoice> {
  const s = store();
  return s.transaction(async () => {
    const inv = await s.invoices.get(id);
    if (!inv) throw new BusinessRuleError('Invoice not found.');
    const next = await fn(inv);
    next.updatedAt = nowISO();
    await s.invoices.put(next);
    return next;
  });
}

/** Finalise a draft. From this point the invoice is protected from edits. */
export function markInvoiceSent(id: string): Promise<Invoice> {
  return mutate(id, (inv) => {
    if (inv.storedStatus !== 'draft') throw new BusinessRuleError('Only draft invoices can be marked as sent.');
    if (inv.items.length === 0 || inv.total <= 0) throw new BusinessRuleError('An invoice must have a total greater than zero before it is sent.');
    return { ...inv, storedStatus: 'sent', sentAt: nowISO(), history: [...inv.history, historyEntry('Finalised and marked as sent')] };
  });
}

/**
 * Controlled correction: return an issued invoice to draft so it can be edited.
 * Only allowed when no payments have been recorded; a reason is mandatory and
 * kept in the invoice history. The invoice number is preserved.
 */
export function unlockForCorrection(id: string, reason: string): Promise<Invoice> {
  if (!reason.trim()) return Promise.reject(new BusinessRuleError('Please give a reason for the correction.'));
  return mutate(id, async (inv) => {
    if (inv.storedStatus !== 'sent') throw new BusinessRuleError('Only sent invoices can be unlocked for correction.');
    const payments = await store().payments.findBy('invoiceId', id);
    if (payments.length > 0)
      throw new BusinessRuleError('This invoice has recorded payments. Remove those payments before correcting it, or issue a new invoice.');
    return { ...inv, storedStatus: 'draft', history: [...inv.history, historyEntry('Unlocked for correction', reason.trim())] };
  });
}

export function cancelInvoice(id: string, reason: string): Promise<Invoice> {
  return mutate(id, async (inv) => {
    if (inv.storedStatus === 'cancelled') throw new BusinessRuleError('This invoice is already cancelled.');
    const payments = await store().payments.findBy('invoiceId', id);
    if (payments.length > 0)
      throw new BusinessRuleError('Invoices with recorded payments cannot be cancelled. Remove the payments first.');
    return {
      ...inv,
      storedStatus: 'cancelled',
      cancelledAt: nowISO(),
      history: [...inv.history, historyEntry('Cancelled', reason.trim() || undefined)],
    };
  });
}

/** New draft with the same client, project and lines; fresh number and today's dates. */
export async function duplicateInvoice(id: string): Promise<Invoice> {
  const source = await store().invoices.get(id);
  if (!source) throw new BusinessRuleError('Invoice not found.');
  const settings = await getSettings();
  const issueDate = todayISO();
  const values = { ...invoiceToValues(source), issueDate, endDate: addDays(issueDate, settings.defaultPaymentTermsDays), items: cloneItems(source.items) };
  return createInvoice(values, { note: `Duplicated from ${source.number}` });
}

/** Drafts can be deleted outright. The number is not reused. */
export async function deleteDraftInvoice(id: string): Promise<void> {
  const s = store();
  await s.transaction(async () => {
    const inv = await s.invoices.get(id);
    if (!inv) return;
    if (inv.storedStatus !== 'draft') throw new BusinessRuleError('Only draft invoices can be deleted. Cancel issued invoices instead.');
    const payments = await s.payments.findBy('invoiceId', id);
    if (payments.length) throw new BusinessRuleError('This invoice has payments and cannot be deleted.');
    await s.invoices.delete(id);
    // Release a quotation that was converted into this draft so it can be converted again.
    if (inv.quotationId) {
      const q = await s.quotations.get(inv.quotationId);
      if (q && q.convertedInvoiceId === id)
        await s.quotations.put({ ...q, convertedInvoiceId: null, updatedAt: nowISO(), history: [...q.history, historyEntry(`Linked draft invoice ${inv.number} deleted`)] });
    }
  });
}

/**
 * Recompute an invoice's cached paid amount from its payment records.
 * Called inside payment transactions; recomputing (rather than incrementing)
 * keeps the cache correct even after edits, deletions or restores.
 */
export async function recalculateInvoicePaid(invoiceId: string): Promise<Invoice | undefined> {
  const s = store();
  const inv = await s.invoices.get(invoiceId);
  if (!inv) return undefined;
  const payments = await s.payments.findBy('invoiceId', invoiceId);
  const amountPaid = sumCents(payments.map((p) => p.amount));
  const total = calculateTotals(inv).total;
  if (amountPaid !== inv.amountPaid || total !== inv.total) {
    const next = { ...inv, amountPaid, total, updatedAt: nowISO() };
    await s.invoices.put(next);
    return next;
  }
  return inv;
}

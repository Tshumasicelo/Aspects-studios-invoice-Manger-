import { store } from '@/data/store';
import { outstandingBalance } from '@/domain/calculations';
import { isValidISODate } from '@/domain/dates';
import { formatMoney, sumCents } from '@/domain/money';
import type { Payment, PaymentMethod } from '@/domain/types';
import { newId, nowISO } from '@/lib/id';
import { historyEntry } from './documentCommon';
import { BusinessRuleError } from './errors';
import { recalculateInvoicePaid } from './invoiceService';
import { reserveNumber } from './numberingService';

export interface PaymentInput {
  invoiceId: string;
  date: string;
  amount: number; // cents
  method: PaymentMethod;
  transactionReference: string;
  notes: string;
}

function validate(input: PaymentInput) {
  if (!input.invoiceId) throw new BusinessRuleError('Select an invoice.');
  if (!isValidISODate(input.date)) throw new BusinessRuleError('Enter a valid payment date.');
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new BusinessRuleError('Enter a payment amount greater than zero.');
}

/**
 * Record a payment received outside the app (EFT, cash, card, ...).
 * Atomically: validates against the outstanding balance, stores the payment,
 * recalculates the invoice's paid amount and appends to the invoice history.
 * Overpayments are rejected.
 */
export async function recordPayment(input: PaymentInput): Promise<Payment> {
  validate(input);
  const s = store();
  return s.transaction(async () => {
    const invoice = await s.invoices.get(input.invoiceId);
    if (!invoice) throw new BusinessRuleError('Invoice not found.');
    if (invoice.storedStatus === 'draft') throw new BusinessRuleError('Mark the invoice as sent before recording payments.');
    if (invoice.storedStatus === 'cancelled') throw new BusinessRuleError('Payments cannot be recorded against a cancelled invoice.');
    const existing = await s.payments.findBy('invoiceId', invoice.id);
    const outstanding = outstandingBalance(invoice.total, sumCents(existing.map((p) => p.amount)));
    if (outstanding <= 0) throw new BusinessRuleError('This invoice is already paid in full.');
    if (input.amount > outstanding)
      throw new BusinessRuleError(`The payment exceeds the outstanding balance of ${formatMoney(outstanding, invoice.currency)}.`);

    const now = nowISO();
    const payment: Payment = {
      id: newId(),
      reference: await reserveNumber('payment', input.date),
      invoiceId: invoice.id,
      clientId: invoice.clientId,
      date: input.date,
      amount: input.amount,
      method: input.method,
      transactionReference: input.transactionReference.trim(),
      notes: input.notes.trim(),
      createdAt: now,
      updatedAt: now,
    };
    await s.payments.put(payment);
    const updated = await recalculateInvoicePaid(invoice.id);
    if (updated) {
      await s.invoices.put({
        ...updated,
        history: [...updated.history, historyEntry(`Payment ${payment.reference} recorded`, formatMoney(payment.amount, invoice.currency))],
      });
    }
    return payment;
  });
}

/** Edit date, amount, method and references of a payment (amount re-validated). */
export async function updatePayment(id: string, patch: Omit<PaymentInput, 'invoiceId'>): Promise<Payment> {
  const s = store();
  return s.transaction(async () => {
    const payment = await s.payments.get(id);
    if (!payment) throw new BusinessRuleError('Payment not found.');
    validate({ ...patch, invoiceId: payment.invoiceId });
    const invoice = await s.invoices.get(payment.invoiceId);
    if (!invoice) throw new BusinessRuleError('The invoice for this payment no longer exists.');
    const others = (await s.payments.findBy('invoiceId', invoice.id)).filter((p) => p.id !== id);
    const available = outstandingBalance(invoice.total, sumCents(others.map((p) => p.amount)));
    if (patch.amount > available)
      throw new BusinessRuleError(`The payment exceeds the outstanding balance of ${formatMoney(available, invoice.currency)}.`);
    const next: Payment = {
      ...payment,
      date: patch.date,
      amount: patch.amount,
      method: patch.method,
      transactionReference: patch.transactionReference.trim(),
      notes: patch.notes.trim(),
      updatedAt: nowISO(),
    };
    await s.payments.put(next);
    const updated = await recalculateInvoicePaid(invoice.id);
    if (updated)
      await s.invoices.put({ ...updated, history: [...updated.history, historyEntry(`Payment ${payment.reference} edited`, formatMoney(next.amount, invoice.currency))] });
    return next;
  });
}

export async function deletePayment(id: string): Promise<void> {
  const s = store();
  await s.transaction(async () => {
    const payment = await s.payments.get(id);
    if (!payment) return;
    await s.payments.delete(id);
    const updated = await recalculateInvoicePaid(payment.invoiceId);
    if (updated)
      await s.invoices.put({
        ...updated,
        history: [...updated.history, historyEntry(`Payment ${payment.reference} removed`, formatMoney(payment.amount, updated.currency))],
      });
  });
}

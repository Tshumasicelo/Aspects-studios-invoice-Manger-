import { outstandingBalance } from './calculations';
import type { ISODate, Invoice, InvoiceStatus, Quotation, QuotationStatus } from './types';

/**
 * Effective invoice status, derived — never typed in by hand — so it cannot drift
 * out of sync with payments or the calendar.
 *
 * Precedence: cancelled > draft > paid > overdue > partially paid > sent.
 * An invoice is overdue when its due date is in the past and an outstanding balance remains.
 */
export function invoiceStatus(
  invoice: Pick<Invoice, 'storedStatus' | 'total' | 'amountPaid' | 'dueDate'>,
  today: ISODate,
): InvoiceStatus {
  if (invoice.storedStatus === 'cancelled') return 'cancelled';
  if (invoice.storedStatus === 'draft') return 'draft';
  const outstanding = outstandingBalance(invoice.total, invoice.amountPaid);
  if (outstanding <= 0) return 'paid';
  if (invoice.dueDate < today) return 'overdue';
  if (invoice.amountPaid > 0) return 'partially_paid';
  return 'sent';
}

/** A sent quotation whose expiry date has passed is expired. Accepted/rejected are final. */
export function quotationStatus(q: Pick<Quotation, 'storedStatus' | 'expiryDate'>, today: ISODate): QuotationStatus {
  if (q.storedStatus === 'sent' && q.expiryDate < today) return 'expired';
  return q.storedStatus;
}

/** Invoices that count toward "invoiced" figures (issued, not cancelled). */
export function isIssued(invoice: Pick<Invoice, 'storedStatus'>): boolean {
  return invoice.storedStatus === 'sent';
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
};

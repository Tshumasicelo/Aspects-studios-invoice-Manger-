import { multiplyCents, percentOf, roundHalfAwayFromZero, sumCents } from './money';
import type { Cents, Discount, DocumentTotals, LineItem, PricingInput } from './types';

/**
 * Centralised financial calculations. These functions are the single source of
 * truth for document totals; the UI, PDF generator, reports and services all
 * call them, so figures are always consistent.
 *
 *   Subtotal            = Σ line totals (quantity × unit price, rounded per line)
 *   Discount            = percent of subtotal, or fixed amount (never above subtotal)
 *   Taxable amount      = Subtotal − Discount
 *   VAT                 = VAT rate × (standard-rated lines − their share of the discount)
 *   Total               = Taxable amount + VAT
 *   Outstanding balance = Total − payments received
 *
 * The discount is allocated pro-rata across lines so that zero-rated and exempt
 * lines never attract VAT, even when a document-level discount is applied.
 */

export function lineTotal(item: Pick<LineItem, 'quantity' | 'unitPrice'>): Cents {
  const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
  return multiplyCents(item.unitPrice, qty);
}

export function discountAmount(subtotal: Cents, discount: Discount): Cents {
  if (subtotal <= 0) return 0;
  let amount = 0;
  if (discount.type === 'percent') {
    const pct = Math.min(Math.max(discount.value || 0, 0), 100);
    amount = percentOf(subtotal, pct);
  } else if (discount.type === 'fixed') {
    amount = Math.round(discount.value || 0);
  }
  return Math.min(Math.max(amount, 0), subtotal);
}

export function calculateTotals(input: PricingInput): DocumentTotals {
  const lineTotals: Record<string, Cents> = {};
  for (const item of input.items) lineTotals[item.id] = lineTotal(item);

  const subtotal = sumCents(Object.values(lineTotals));
  const discount = discountAmount(subtotal, input.discount);
  const taxable = subtotal - discount;

  let vat = 0;
  if (input.vatEnabled && input.vatRate > 0 && subtotal > 0) {
    const standardBase = sumCents(
      input.items.filter((i) => i.vatCategory === 'standard').map((i) => lineTotals[i.id]),
    );
    const standardDiscountShare = roundHalfAwayFromZero((discount * standardBase) / subtotal);
    const vatBase = Math.max(standardBase - standardDiscountShare, 0);
    vat = percentOf(vatBase, input.vatRate);
  }

  return { subtotal, discount, taxable, vat, total: taxable + vat, lineTotals };
}

export function outstandingBalance(total: Cents, amountPaid: Cents): Cents {
  return Math.max(total - amountPaid, 0);
}

/**
 * Share of a payment attributable to each line, used for "revenue by service".
 * Allocation is proportional to each line's contribution to the invoice total,
 * with any rounding remainder applied to the largest line so the parts always
 * add up exactly to the payment.
 */
export function allocateAcrossLines(amount: Cents, input: PricingInput): Record<string, Cents> {
  const totals = calculateTotals(input);
  const result: Record<string, Cents> = {};
  if (totals.subtotal <= 0 || input.items.length === 0) return result;
  let allocated = 0;
  let largestId = input.items[0].id;
  for (const item of input.items) {
    const share = roundHalfAwayFromZero((amount * totals.lineTotals[item.id]) / totals.subtotal);
    result[item.id] = share;
    allocated += share;
    if (totals.lineTotals[item.id] > totals.lineTotals[largestId]) largestId = item.id;
  }
  result[largestId] += amount - allocated;
  return result;
}

import { describe, expect, it } from 'vitest';
import { allocateAcrossLines, calculateTotals, discountAmount, lineTotal, outstandingBalance } from './calculations';
import { addDays, formatDate, isValidISODate, monthRange, presetRange } from './dates';
import { formatMoney, formatMoneyCompact, percentOf, roundHalfAwayFromZero, toCents } from './money';
import { allocateNumber, counterKey, formatDocumentNumber, validateNumberingConfig } from './numbering';
import { invoiceStatus, quotationStatus } from './status';
import type { LineItem, PricingInput } from './types';
import { validateDocument } from './validation';
import { escapeCsvCell, toCsv } from '@/lib/csv';

const item = (id: string, quantity: number, unitPrice: number, vatCategory: LineItem['vatCategory'] = 'standard'): LineItem => ({
  id,
  serviceId: null,
  title: id,
  description: '',
  quantity,
  unitPrice,
  vatCategory,
});

const pricing = (items: LineItem[], extra: Partial<PricingInput> = {}): PricingInput => ({
  items,
  discount: { type: 'none', value: 0 },
  vatEnabled: false,
  vatRate: 15,
  ...extra,
});

describe('money', () => {
  it('rounds half away from zero, including binary edge cases', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(toCents('1.005')).toBe(101);
    expect(toCents('0.1') + toCents('0.2')).toBe(30);
  });
  it('parses user input into cents', () => {
    expect(toCents('1,250.50')).toBe(125050);
    expect(toCents('R 99')).toBe(9900);
    expect(toCents('')).toBe(0);
    expect(toCents('abc')).toBe(0);
    expect(toCents(12.345)).toBe(1235);
  });
  it('formats ZAR as "R 1,250.00"', () => {
    expect(formatMoney(125000)).toBe('R 1,250.00');
    expect(formatMoney(0)).toBe('R 0.00');
    expect(formatMoney(123456789)).toBe('R 1,234,567.89');
    expect(formatMoney(-5050)).toBe('-R 50.50');
    expect(formatMoney(100, 'USD')).toBe('$ 1.00');
    expect(formatMoneyCompact(1250000)).toBe('R 12.5k');
  });
  it('calculates percentages with currency rounding', () => {
    expect(percentOf(10001, 15)).toBe(1500); // 1500.15 -> 1500
    expect(percentOf(10010, 15)).toBe(1502); // 1501.5 -> 1502
  });
});

describe('document calculations', () => {
  it('computes line totals with decimal quantities', () => {
    expect(lineTotal({ quantity: 1.5, unitPrice: 85000 })).toBe(127500);
    expect(lineTotal({ quantity: 3, unitPrice: 3333 })).toBe(9999);
  });

  it('sums multiple line items with no VAT by default', () => {
    const t = calculateTotals(pricing([item('a', 1, 1500000), item('b', 10, 65000)]));
    expect(t.subtotal).toBe(2150000);
    expect(t.discount).toBe(0);
    expect(t.vat).toBe(0);
    expect(t.total).toBe(2150000);
  });

  it('applies VAT only when enabled', () => {
    const t = calculateTotals(pricing([item('a', 1, 100000)], { vatEnabled: true, vatRate: 15 }));
    expect(t.vat).toBe(15000);
    expect(t.total).toBe(115000);
  });

  it('applies percentage discounts before VAT', () => {
    const t = calculateTotals(pricing([item('a', 1, 100000)], { vatEnabled: true, discount: { type: 'percent', value: 10 } }));
    expect(t.discount).toBe(10000);
    expect(t.taxable).toBe(90000);
    expect(t.vat).toBe(13500);
    expect(t.total).toBe(103500);
  });

  it('caps fixed discounts at the subtotal and rejects negatives', () => {
    expect(discountAmount(5000, { type: 'fixed', value: 9000 })).toBe(5000);
    expect(discountAmount(5000, { type: 'fixed', value: -100 })).toBe(0);
    expect(discountAmount(5000, { type: 'percent', value: 150 })).toBe(5000);
    const t = calculateTotals(pricing([item('a', 1, 5000)], { discount: { type: 'fixed', value: 9000 } }));
    expect(t.total).toBe(0);
  });

  it('does not charge VAT on zero-rated or exempt lines, even with a discount', () => {
    const items = [item('std', 1, 100000), item('zero', 1, 50000, 'zero'), item('ex', 1, 50000, 'exempt')];
    const noDiscount = calculateTotals(pricing(items, { vatEnabled: true }));
    expect(noDiscount.vat).toBe(15000);
    const withDiscount = calculateTotals(pricing(items, { vatEnabled: true, discount: { type: 'fixed', value: 20000 } }));
    // Standard line carries half of the discount (100k of 200k) => VAT on 90k
    expect(withDiscount.taxable).toBe(180000);
    expect(withDiscount.vat).toBe(13500);
    expect(withDiscount.total).toBe(193500);
  });

  it('computes outstanding balance and never goes negative', () => {
    expect(outstandingBalance(10000, 2500)).toBe(7500);
    expect(outstandingBalance(10000, 12000)).toBe(0);
  });

  it('allocates a payment across lines summing exactly to the payment', () => {
    const input = pricing([item('a', 1, 3333), item('b', 1, 3333), item('c', 1, 3334)]);
    const shares = allocateAcrossLines(1000, input);
    expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBe(1000);
  });
});

describe('statuses', () => {
  const base = { storedStatus: 'sent' as const, total: 10000, amountPaid: 0, dueDate: '2026-05-10' };
  it('derives invoice statuses', () => {
    expect(invoiceStatus({ ...base, storedStatus: 'draft' }, '2026-06-01')).toBe('draft');
    expect(invoiceStatus(base, '2026-05-01')).toBe('sent');
    expect(invoiceStatus({ ...base, amountPaid: 4000 }, '2026-05-01')).toBe('partially_paid');
    expect(invoiceStatus({ ...base, amountPaid: 10000 }, '2026-06-01')).toBe('paid');
    expect(invoiceStatus(base, '2026-05-10')).toBe('sent'); // due today is not overdue
    expect(invoiceStatus(base, '2026-05-11')).toBe('overdue');
    expect(invoiceStatus({ ...base, amountPaid: 4000 }, '2026-05-11')).toBe('overdue');
    expect(invoiceStatus({ ...base, storedStatus: 'cancelled' }, '2026-06-01')).toBe('cancelled');
  });
  it('derives quotation expiry', () => {
    expect(quotationStatus({ storedStatus: 'sent', expiryDate: '2026-01-01' }, '2026-01-02')).toBe('expired');
    expect(quotationStatus({ storedStatus: 'accepted', expiryDate: '2026-01-01' }, '2026-01-02')).toBe('accepted');
    expect(quotationStatus({ storedStatus: 'sent', expiryDate: '2026-01-05' }, '2026-01-02')).toBe('sent');
  });
});

describe('numbering', () => {
  const cfg = { pattern: '{PREFIX}-{YYYY}-{SEQ}', prefix: 'AS-INV', padding: 4, resetYearly: true };
  it('formats the default pattern', () => {
    expect(formatDocumentNumber(cfg, 1, new Date(2026, 0, 5))).toBe('AS-INV-2026-0001');
    expect(formatDocumentNumber({ ...cfg, pattern: '{PREFIX}{YY}{MM}-{SEQ}', padding: 3 }, 42, new Date(2026, 2, 1))).toBe('AS-INV2603-042');
  });
  it('skips numbers that already exist', () => {
    const existing = new Set(['AS-INV-2026-0001', 'AS-INV-2026-0002']);
    expect(allocateNumber(1, cfg, new Date(2026, 0, 1), existing)).toEqual({ number: 'AS-INV-2026-0003', seq: 3 });
  });
  it('uses per-year counter keys when resetting yearly', () => {
    expect(counterKey('invoice', cfg, 2026)).toBe('invoice:2026');
    expect(counterKey('invoice', { ...cfg, resetYearly: false }, 2026)).toBe('invoice');
  });
  it('validates patterns', () => {
    expect(validateNumberingConfig({ ...cfg, pattern: '{PREFIX}-{YYYY}' })).toMatch(/SEQ/);
    expect(validateNumberingConfig(cfg)).toBeNull();
  });
});

describe('dates', () => {
  it('validates and manipulates ISO dates', () => {
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08');
    expect(formatDate('2026-03-07')).toBe('07 Mar 2026');
    expect(formatDate('2026-03-07', 'YYYY/MM/DD')).toBe('2026/03/07');
    expect(monthRange('2026-01-15', '2026-04-02')).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(presetRange('this_month', '2026-11-20')).toEqual({ from: '2026-11-01', to: '2026-11-20' });
  });
});

describe('validation', () => {
  it('requires client, items and sensible dates', () => {
    const errors = validateDocument(
      { clientId: '', issueDate: '2026-05-10', endDate: '2026-05-01', items: [], discountType: 'percent', discountValue: 120 },
      'Due date',
    );
    expect(errors.clientId).toBeTruthy();
    expect(errors.items).toBeTruthy();
    expect(errors.endDate).toMatch(/before/);
    expect(errors.discount).toBeTruthy();
  });
});

describe('csv', () => {
  it('escapes quotes, commas and formula injection', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(escapeCsvCell(-12.5)).toBe('-12.5');
    expect(toCsv([{ a: 1 }], [{ header: 'A', value: (r) => r.a }])).toBe('A\r\n1');
  });
});

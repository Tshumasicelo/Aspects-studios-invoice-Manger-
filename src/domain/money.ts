import type { Cents } from './types';

/**
 * Money utilities. Every amount is an integer number of cents.
 * Rounding uses "round half away from zero", the convention used for
 * currency on invoices.
 */

export function roundHalfAwayFromZero(value: number): number {
  // Correct tiny binary representation errors (e.g. 1.005 * 100 = 100.49999...)
  const corrected = Math.round(value * 1e6) / 1e6;
  return Math.sign(corrected) * Math.round(Math.abs(corrected));
}

/** Multiply an amount in cents by a decimal factor and round to whole cents. */
export function multiplyCents(cents: Cents, factor: number): Cents {
  return roundHalfAwayFromZero(cents * factor);
}

/** Apply a percentage (e.g. 15 => 15%) to an amount in cents. */
export function percentOf(cents: Cents, percent: number): Cents {
  return roundHalfAwayFromZero((cents * percent) / 100);
}

export function sumCents(values: Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0);
}

/** Convert a user-entered major-unit value ("1,250.50", "1250.5", 1250.5) to cents. */
export function toCents(input: string | number): Cents {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return 0;
    return roundHalfAwayFromZero(input * 100);
  }
  const cleaned = input.replace(/[\s,R$€£]/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return roundHalfAwayFromZero(n * 100);
}

/** Convert cents to a major-unit number (for form inputs and CSV). */
export function fromCents(cents: Cents): number {
  return cents / 100;
}

/** Plain "1250.00" string for CSV/input fields. */
export function centsToInput(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'BWP', symbol: 'P', name: 'Botswana Pula' },
  { code: 'NAD', symbol: 'N$', name: 'Namibian Dollar' },
  { code: 'ZMW', symbol: 'K', name: 'Zambian Kwacha' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
];

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

/**
 * Format cents as "R 1,250.00".
 * A custom formatter is used (rather than Intl en-ZA, which renders "R 1 250,00")
 * because the specification requires comma thousands separators and a decimal point,
 * and because jsPDF's standard fonts cannot render narrow no-break spaces.
 */
export function formatMoney(cents: Cents, currency = 'ZAR', opts: { symbol?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const majorStr = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const number = `${majorStr}.${minor.toString().padStart(2, '0')}`;
  const withSymbol = opts.symbol === false ? number : `${currencySymbol(currency)} ${number}`;
  return negative ? `-${withSymbol}` : withSymbol;
}

/** Compact format for chart axes: R 12.5k, R 1.2m */
export function formatMoneyCompact(cents: Cents, currency = 'ZAR'): string {
  const major = cents / 100;
  const sym = currencySymbol(currency);
  const abs = Math.abs(major);
  const sign = major < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${sym} ${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (abs >= 1_000) return `${sign}${sym} ${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${sign}${sym} ${abs.toFixed(0)}`;
}

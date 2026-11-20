import type { DateFormat, ISODate } from './types';

/** Local calendar date as YYYY-MM-DD (not UTC, so "today" matches the user's clock). */
export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseISODate(value);
  return toISODate(d) === value;
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso: ISODate | '' | null | undefined, format: DateFormat = 'DD MMM YYYY'): string {
  if (!iso) return '—';
  const datePart = iso.slice(0, 10);
  if (!isValidISODate(datePart)) return '—';
  const [y, m, d] = datePart.split('-');
  switch (format) {
    case 'YYYY/MM/DD':
      return `${y}/${m}/${d}`;
    case 'DD/MM/YYYY':
      return `${d}/${m}/${y}`;
    default:
      return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
  }
}

export function formatDateTime(iso: string, format: DateFormat = 'DD MMM YYYY'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${formatDate(toISODate(d), format)} ${time}`;
}

/** "2026-03" month key from an ISO date. */
export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

/** Inclusive list of month keys between two ISO dates. */
export function monthRange(from: ISODate, to: ISODate): string[] {
  const keys: string[] = [];
  const start = parseISODate(from);
  const end = parseISODate(to);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end && keys.length < 240) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

export interface DateRange {
  from: ISODate;
  to: ISODate;
}

export type RangePreset = 'this_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'last_12_months' | 'all' | 'custom';

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_12_months', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

export function presetRange(preset: RangePreset, today: ISODate = todayISO(), earliest?: ISODate): DateRange {
  const t = parseISODate(today);
  const firstOfMonth = (monthsBack: number) => toISODate(new Date(t.getFullYear(), t.getMonth() - monthsBack, 1));
  switch (preset) {
    case 'this_month':
      return { from: firstOfMonth(0), to: today };
    case 'last_3_months':
      return { from: firstOfMonth(2), to: today };
    case 'last_6_months':
      return { from: firstOfMonth(5), to: today };
    case 'this_year':
      return { from: `${t.getFullYear()}-01-01`, to: today };
    case 'last_12_months':
      return { from: firstOfMonth(11), to: today };
    case 'all':
    case 'custom':
    default: {
      const from = earliest && earliest < firstOfMonth(11) ? earliest : firstOfMonth(11);
      return { from, to: today };
    }
  }
}

export function inRange(iso: ISODate, range: DateRange): boolean {
  return iso >= range.from && iso <= range.to;
}

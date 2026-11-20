import { store } from '@/data/store';
import { allocateNumber, counterKey, formatDocumentNumber } from '@/domain/numbering';
import { parseISODate, todayISO } from '@/domain/dates';
import type { CounterKey, ISODate, NumberingConfig } from '@/domain/types';
import { getSettings } from './settingsService';

function configFor(kind: CounterKey, settings: Awaited<ReturnType<typeof getSettings>>): NumberingConfig {
  if (kind === 'invoice') return settings.invoiceNumbering;
  if (kind === 'quotation') return settings.quotationNumbering;
  return settings.paymentNumbering;
}

async function existingNumbers(kind: CounterKey): Promise<Set<string>> {
  const s = store();
  if (kind === 'invoice') return new Set((await s.invoices.list()).map((i) => i.number));
  if (kind === 'quotation') return new Set((await s.quotations.list()).map((q) => q.number));
  return new Set((await s.payments.list()).map((p) => p.reference));
}

/**
 * Allocate and reserve the next document number.
 * MUST be called inside `store().transaction(...)` together with the write that
 * uses the number, so concurrent tabs cannot allocate the same number.
 * Numbers are never reused, even if a draft is later deleted (audit-friendly).
 */
export async function reserveNumber(kind: CounterKey, documentDate: ISODate = todayISO()): Promise<string> {
  const s = store();
  const settings = await getSettings();
  const config = configFor(kind, settings);
  const date = parseISODate(documentDate);
  const key = counterKey(kind, config, date.getFullYear());
  const counter = await s.counters.get(key);
  const { number, seq } = allocateNumber(counter?.next ?? 1, config, date, await existingNumbers(kind));
  await s.counters.put({ key, kind, next: seq + 1 });
  return number;
}

/** What the next number will look like (for previews; does not reserve it). */
export async function previewNextNumber(kind: CounterKey, documentDate: ISODate = todayISO()): Promise<string> {
  const settings = await getSettings();
  const config = configFor(kind, settings);
  const date = parseISODate(documentDate);
  const counter = await store().counters.get(counterKey(kind, config, date.getFullYear()));
  return allocateNumber(counter?.next ?? 1, config, date, await existingNumbers(kind)).number;
}

export async function getNextSequence(kind: CounterKey, config: NumberingConfig, year = new Date().getFullYear()) {
  const counter = await store().counters.get(counterKey(kind, config, year));
  return counter?.next ?? 1;
}

/** Set the next sequence (e.g. to continue numbering from a previous system). */
export async function setNextSequence(kind: CounterKey, config: NumberingConfig, next: number, year = new Date().getFullYear()) {
  const value = Math.max(Math.floor(next), 1);
  await store().counters.put({ key: counterKey(kind, config, year), kind, next: value });
}

export function sampleNumber(config: NumberingConfig, seq = 1): string {
  return formatDocumentNumber(config, seq, new Date());
}

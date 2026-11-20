import type { CounterKey, NumberingConfig } from './types';

/**
 * Document numbering. Pattern tokens:
 *   {PREFIX}  configured prefix, e.g. "AS-INV"
 *   {YYYY}    four-digit year of the document date
 *   {YY}      two-digit year
 *   {MM}      two-digit month
 *   {SEQ}     sequence number padded to `padding` digits
 *
 * Default invoice pattern "{PREFIX}-{YYYY}-{SEQ}" => AS-INV-2026-0001
 */

export function formatDocumentNumber(config: NumberingConfig, seq: number, date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const padding = Math.min(Math.max(Math.round(config.padding) || 1, 1), 10);
  return config.pattern
    .replace(/\{PREFIX\}/g, config.prefix)
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yyyy.slice(2))
    .replace(/\{MM\}/g, mm)
    .replace(/\{SEQ\}/g, String(seq).padStart(padding, '0'));
}

export function validateNumberingConfig(config: NumberingConfig): string | null {
  if (!config.pattern.includes('{SEQ}')) return 'The pattern must include {SEQ} so every number is unique.';
  if (config.pattern.length > 60) return 'The pattern is too long.';
  if (/[\\/:*?"<>|]/.test(config.pattern + config.prefix))
    return 'Avoid the characters \\ / : * ? " < > | (they break file names).';
  if (config.padding < 1 || config.padding > 10) return 'Padding must be between 1 and 10 digits.';
  return null;
}

/** Counter key: one continuous counter, or one per year when numbering resets yearly. */
export function counterKey(kind: CounterKey, config: NumberingConfig, year: number): string {
  return config.resetYearly ? `${kind}:${year}` : kind;
}

/**
 * Allocate the next number that does not collide with any existing number.
 * `startSeq` is the counter's next value (1 when no counter exists yet).
 */
export function allocateNumber(
  startSeq: number,
  config: NumberingConfig,
  date: Date,
  existing: Set<string>,
): { number: string; seq: number } {
  let seq = Math.max(Math.floor(startSeq) || 1, 1);
  let number = formatDocumentNumber(config, seq, date);
  let guard = 0;
  while (existing.has(number) && guard < 100_000) {
    seq += 1;
    guard += 1;
    number = formatDocumentNumber(config, seq, date);
  }
  return { number, seq };
}

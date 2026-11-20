import { store } from '@/data/store';
import { calculateTotals } from '@/domain/calculations';
import { isValidISODate } from '@/domain/dates';
import { sumCents } from '@/domain/money';
import type {
  BusinessSettings,
  Client,
  Counter,
  Expense,
  Invoice,
  Payment,
  Project,
  Quotation,
  Service,
} from '@/domain/types';
import { nowISO } from '@/lib/id';
import { withDefaults } from './settingsService';

export const BACKUP_APP_ID = 'aspects-studios-invoice-manager';
export const BACKUP_SCHEMA_VERSION = 1;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export interface BackupData {
  clients: Client[];
  services: Service[];
  invoices: Invoice[];
  quotations: Quotation[];
  projects: Project[];
  payments: Payment[];
  expenses: Expense[];
  settings: BusinessSettings | null;
  counters: Counter[];
}

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

export const COLLECTIONS = ['clients', 'services', 'invoices', 'quotations', 'projects', 'payments', 'expenses'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export const COLLECTION_LABELS: Record<CollectionName, string> = {
  clients: 'Clients',
  services: 'Services',
  invoices: 'Invoices',
  quotations: 'Quotations',
  projects: 'Projects',
  payments: 'Payments',
  expenses: 'Expenses',
};

export async function createBackup(): Promise<BackupFile> {
  const s = store();
  return s.transaction(async () => ({
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: nowISO(),
    data: {
      clients: await s.clients.list(),
      services: await s.services.list(),
      invoices: await s.invoices.list(),
      quotations: await s.quotations.list(),
      projects: await s.projects.list(),
      payments: await s.payments.list(),
      expenses: await s.expenses.list(),
      settings: (await s.settings.get()) ?? null,
      counters: await s.counters.list(),
    },
  }));
}

/* ------------------------------------------------------------- Validation */

type Check = (r: Record<string, unknown>) => string | null;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (k: string, required = false): Check => (r) =>
  r[k] === undefined && !required ? null : typeof r[k] === 'string' && (!required || (r[k] as string).length > 0) ? null : `"${k}" must be text`;
const cents = (k: string): Check => (r) => (Number.isInteger(r[k]) ? null : `"${k}" must be a whole number of cents`);
const date = (k: string, optional = false): Check => (r) =>
  optional && (r[k] === '' || r[k] === undefined || r[k] === null) ? null : isValidISODate(r[k]) ? null : `"${k}" must be a date (YYYY-MM-DD)`;
const arr = (k: string): Check => (r) => (Array.isArray(r[k]) ? null : `"${k}" must be a list`);
const oneOf = (k: string, values: string[]): Check => (r) => (values.includes(r[k] as string) ? null : `"${k}" has an unknown value`);
const lineItems: Check = (r) => {
  if (!Array.isArray(r.items)) return '"items" must be a list';
  for (const it of r.items) {
    if (!isObj(it) || typeof it.id !== 'string' || typeof it.title !== 'string' || typeof it.quantity !== 'number' || !Number.isInteger(it.unitPrice))
      return 'contains an invalid line item';
  }
  return null;
};

const RULES: Record<CollectionName, Check[]> = {
  clients: [str('id', true), str('name'), str('companyName'), str('email'), oneOf('status', ['active', 'lead', 'inactive'])],
  services: [str('id', true), str('name', true), str('category'), str('description'), cents('defaultPrice'), oneOf('pricingModel', ['fixed', 'hourly', 'daily', 'custom'])],
  invoices: [str('id', true), str('number', true), str('clientId', true), date('issueDate'), date('dueDate'), lineItems, cents('total'), cents('amountPaid'), oneOf('storedStatus', ['draft', 'sent', 'cancelled']), arr('history')],
  quotations: [str('id', true), str('number', true), str('clientId', true), date('issueDate'), date('expiryDate'), lineItems, cents('total'), oneOf('storedStatus', ['draft', 'sent', 'accepted', 'rejected']), arr('history')],
  projects: [str('id', true), str('name', true), str('clientId', true), cents('budget'), date('startDate', true), date('expectedCompletionDate', true), arr('history')],
  payments: [str('id', true), str('reference', true), str('invoiceId', true), str('clientId', true), date('date'), cents('amount'), oneOf('method', ['eft', 'bank_transfer', 'cash', 'card', 'other'])],
  expenses: [str('id', true), str('description', true), str('category'), cents('amount'), date('date')],
};

export interface BackupValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  backup?: BackupFile;
  counts: Record<CollectionName, number>;
}

const emptyCounts = (): Record<CollectionName, number> =>
  Object.fromEntries(COLLECTIONS.map((c) => [c, 0])) as Record<CollectionName, number>;

/** Parse and structurally validate a backup file. Nothing is written. */
export function validateBackup(text: string): BackupValidation {
  const result: BackupValidation = { ok: false, errors: [], warnings: [], counts: emptyCounts() };
  if (text.length > MAX_BACKUP_BYTES) {
    result.errors.push('The file is too large to be a valid backup.');
    return result;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    result.errors.push('The file is not valid JSON.');
    return result;
  }
  if (!isObj(parsed) || parsed.app !== BACKUP_APP_ID) {
    result.errors.push('This file is not an ASPECTS STUDIOS Invoice Manager backup.');
    return result;
  }
  if (typeof parsed.schemaVersion !== 'number' || parsed.schemaVersion > BACKUP_SCHEMA_VERSION) {
    result.errors.push('This backup was created by a newer version of the app. Update the app before restoring it.');
    return result;
  }
  if (!isObj(parsed.data)) {
    result.errors.push('The backup has no data section.');
    return result;
  }
  const data = parsed.data;

  for (const name of COLLECTIONS) {
    const list = data[name] ?? [];
    if (!Array.isArray(list)) {
      result.errors.push(`${COLLECTION_LABELS[name]}: expected a list.`);
      continue;
    }
    const ids = new Set<string>();
    list.forEach((record, idx) => {
      if (result.errors.length > 25) return;
      if (!isObj(record)) {
        result.errors.push(`${COLLECTION_LABELS[name]} #${idx + 1}: not a valid record.`);
        return;
      }
      for (const rule of RULES[name]) {
        const problem = rule(record);
        if (problem) {
          result.errors.push(`${COLLECTION_LABELS[name]} #${idx + 1}: ${problem}.`);
          break;
        }
      }
      if (typeof record.id === 'string') {
        if (ids.has(record.id)) result.errors.push(`${COLLECTION_LABELS[name]}: duplicate id ${record.id}.`);
        ids.add(record.id);
      }
    });
    result.counts[name] = list.length;
  }

  // Unique document numbers inside the backup itself.
  const dupCheck = (list: unknown[], key: string, label: string) => {
    const seen = new Set<string>();
    for (const r of list as Record<string, unknown>[]) {
      const v = r?.[key] as string;
      if (seen.has(v)) result.errors.push(`${label}: number ${v} appears more than once.`);
      seen.add(v);
    }
  };
  if (Array.isArray(data.invoices)) dupCheck(data.invoices, 'number', 'Invoices');
  if (Array.isArray(data.quotations)) dupCheck(data.quotations, 'number', 'Quotations');
  if (Array.isArray(data.payments)) dupCheck(data.payments, 'reference', 'Payments');

  // Referential integrity (warnings — data is still importable).
  if (Array.isArray(data.invoices) && Array.isArray(data.payments)) {
    const invoiceIds = new Set((data.invoices as Invoice[]).map((i) => i.id));
    const orphans = (data.payments as Payment[]).filter((p) => !invoiceIds.has(p.invoiceId)).length;
    if (orphans) result.warnings.push(`${orphans} payment(s) refer to invoices that are not in the backup.`);
  }
  if (data.settings !== undefined && data.settings !== null && !isObj(data.settings))
    result.errors.push('Settings section is invalid.');
  if (data.counters !== undefined && !Array.isArray(data.counters)) result.errors.push('Counters section is invalid.');

  if (result.errors.length === 0) {
    result.ok = true;
    result.backup = {
      app: BACKUP_APP_ID,
      schemaVersion: parsed.schemaVersion,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
      data: {
        ...(Object.fromEntries(COLLECTIONS.map((c) => [c, (data[c] as unknown[]) ?? []])) as Omit<BackupData, 'settings' | 'counters'>),
        settings: (data.settings as BusinessSettings) ?? null,
        counters: ((data.counters as Counter[]) ?? []).filter((c) => isObj(c) && typeof c.key === 'string' && Number.isInteger(c.next)),
      },
    };
  }
  return result;
}

/* ---------------------------------------------------------------- Restore */

export type RestoreMode = 'replace' | 'merge';

export interface RestorePlan {
  mode: RestoreMode;
  added: Record<CollectionName, number>;
  updated: Record<CollectionName, number>;
  skipped: Record<CollectionName, number>;
  conflicts: string[];
}

interface Prepared {
  plan: RestorePlan;
  writes: Partial<Record<CollectionName, { id: string }[]>>;
}

async function prepare(backup: BackupFile, mode: RestoreMode): Promise<Prepared> {
  const s = store();
  const plan: RestorePlan = { mode, added: emptyCounts(), updated: emptyCounts(), skipped: emptyCounts(), conflicts: [] };
  const writes: Prepared['writes'] = {};

  for (const name of COLLECTIONS) {
    const incoming = backup.data[name] as unknown as Array<{ id: string; updatedAt?: string }>;
    if (mode === 'replace') {
      plan.added[name] = incoming.length;
      writes[name] = incoming;
      continue;
    }
    const existing = new Map((await (s[name].list() as Promise<Array<{ id: string; updatedAt?: string }>>)).map((r) => [r.id, r]));
    const uniqueKey = name === 'invoices' || name === 'quotations' ? 'number' : name === 'payments' ? 'reference' : null;
    const taken = new Map<string, string>();
    if (uniqueKey) for (const r of existing.values()) taken.set((r as Record<string, string>)[uniqueKey], r.id);
    const out: { id: string }[] = [];
    for (const rec of incoming) {
      const current = existing.get(rec.id);
      if (uniqueKey) {
        const owner = taken.get((rec as Record<string, string>)[uniqueKey]);
        if (owner && owner !== rec.id) {
          plan.skipped[name] += 1;
          plan.conflicts.push(`${COLLECTION_LABELS[name]}: ${(rec as Record<string, string>)[uniqueKey]} already exists as a different record — skipped.`);
          continue;
        }
      }
      if (!current) {
        plan.added[name] += 1;
        out.push(rec);
      } else if ((rec.updatedAt ?? '') > (current.updatedAt ?? '')) {
        plan.updated[name] += 1;
        out.push(rec);
      } else {
        plan.skipped[name] += 1;
      }
    }
    writes[name] = out;
  }
  return { plan, writes };
}

/** What a restore would do, without writing anything (shown to the user for confirmation). */
export async function planRestore(backup: BackupFile, mode: RestoreMode): Promise<RestorePlan> {
  return (await prepare(backup, mode)).plan;
}

/**
 * Restore a validated backup inside a single transaction (all-or-nothing).
 * - replace: wipes all local records and loads the backup, including settings.
 * - merge: adds new records; replaces existing ones only when the backup copy is newer;
 *   keeps current settings; never overwrites a document number owned by another record.
 * Afterwards, cached invoice totals and paid amounts are recomputed from source records.
 */
export async function restoreBackup(backup: BackupFile, mode: RestoreMode): Promise<RestorePlan> {
  const s = store();
  return s.transaction(async () => {
    const { plan, writes } = await prepare(backup, mode);
    if (mode === 'replace') {
      await clearAllData();
      await s.settings.put(withDefaults(backup.data.settings ?? undefined));
      await s.counters.bulkPut(backup.data.counters);
    } else {
      const current = new Map((await s.counters.list()).map((c) => [c.key, c]));
      const merged = backup.data.counters.map((c) => ({ ...c, next: Math.max(c.next, current.get(c.key)?.next ?? 1) }));
      await s.counters.bulkPut(merged);
    }
    for (const name of COLLECTIONS) {
      const list = writes[name];
      if (list?.length) await (s[name].bulkPut as (r: unknown[]) => Promise<void>)(list);
    }
    await repairDerivedValues();
    return plan;
  });
}

/* ------------------------------------------------------- Integrity checks */

export interface IntegrityReport {
  invoicesRepaired: number;
  quotationsRepaired: number;
  orphanPayments: number;
}

/** Recompute cached totals/paid amounts from line items and payment records. */
export async function repairDerivedValues(): Promise<IntegrityReport> {
  const s = store();
  return s.transaction(async () => {
    const report: IntegrityReport = { invoicesRepaired: 0, quotationsRepaired: 0, orphanPayments: 0 };
    const payments = await s.payments.list();
    const invoices = await s.invoices.list();
    const byInvoice = new Map<string, number[]>();
    for (const p of payments) byInvoice.set(p.invoiceId, [...(byInvoice.get(p.invoiceId) ?? []), p.amount]);
    const invoiceIds = new Set(invoices.map((i) => i.id));
    report.orphanPayments = payments.filter((p) => !invoiceIds.has(p.invoiceId)).length;
    for (const inv of invoices) {
      const total = calculateTotals(inv).total;
      const amountPaid = sumCents(byInvoice.get(inv.id) ?? []);
      if (total !== inv.total || amountPaid !== inv.amountPaid) {
        await s.invoices.put({ ...inv, total, amountPaid });
        report.invoicesRepaired += 1;
      }
    }
    for (const q of await s.quotations.list()) {
      const total = calculateTotals(q).total;
      if (total !== q.total) {
        await s.quotations.put({ ...q, total });
        report.quotationsRepaired += 1;
      }
    }
    return report;
  });
}

/** Permanently delete every locally stored record, including settings. */
export async function clearAllData(): Promise<void> {
  const s = store();
  await s.transaction(async () => {
    for (const name of COLLECTIONS) await s[name].clear();
    await s.settings.clear();
    await s.counters.clear();
  });
}

export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `aspects-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

const LAST_BACKUP_KEY = 'aspects.lastBackupAt';
export function markBackupTaken() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, nowISO());
  } catch {
    /* preferences only */
  }
}
export function lastBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

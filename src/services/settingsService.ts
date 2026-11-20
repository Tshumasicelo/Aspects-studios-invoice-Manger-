import { store } from '@/data/store';
import { SEED_SERVICES, defaultSettings } from '@/domain/defaults';
import type { BusinessSettings, Service } from '@/domain/types';
import { newId, nowISO } from '@/lib/id';
import { validateNumberingConfig } from '@/domain/numbering';
import { BusinessRuleError } from './errors';

/** Deep-merge stored settings over defaults so new settings fields get sensible values after upgrades. */
export function withDefaults(stored: Partial<BusinessSettings> | undefined): BusinessSettings {
  const d = defaultSettings();
  if (!stored) return d;
  return {
    ...d,
    ...stored,
    address: { ...d.address, ...(stored.address ?? {}) },
    invoiceNumbering: { ...d.invoiceNumbering, ...(stored.invoiceNumbering ?? {}) },
    quotationNumbering: { ...d.quotationNumbering, ...(stored.quotationNumbering ?? {}) },
    paymentNumbering: { ...d.paymentNumbering, ...(stored.paymentNumbering ?? {}) },
    onboarding: { ...d.onboarding, ...(stored.onboarding ?? {}) },
    id: 'business',
  };
}

export async function getSettings(): Promise<BusinessSettings> {
  return withDefaults(await store().settings.get());
}

export async function saveSettings(patch: Partial<BusinessSettings>): Promise<BusinessSettings> {
  const next = withDefaults({ ...(await getSettings()), ...patch, updatedAt: nowISO() });
  for (const cfg of [next.invoiceNumbering, next.quotationNumbering, next.paymentNumbering]) {
    const problem = validateNumberingConfig(cfg);
    if (problem) throw new BusinessRuleError(problem);
  }
  if (next.vatEnabled && !(next.vatRate > 0 && next.vatRate <= 100))
    throw new BusinessRuleError('Enter a VAT rate between 0 and 100.');
  if (next.defaultPaymentTermsDays < 0 || next.defaultPaymentTermsDays > 365)
    throw new BusinessRuleError('Payment terms must be between 0 and 365 days.');
  await store().settings.put(next);
  return next;
}

export function buildSeedServices(): Service[] {
  const now = nowISO();
  return SEED_SERVICES.map((s) => ({
    ...s,
    id: newId(),
    defaultPrice: 0,
    internalNotes: '',
    archived: false,
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * First-run initialisation: create default settings and the initial service
 * catalogue. Idempotent — runs inside a transaction and does nothing if
 * settings already exist, so app updates never overwrite records.
 */
export async function initialiseDatabase(): Promise<void> {
  const s = store();
  await s.transaction(async () => {
    const existing = await s.settings.get();
    if (existing) return;
    await s.settings.put(defaultSettings());
    if ((await s.services.count()) === 0) await s.services.bulkPut(buildSeedServices());
  });
}

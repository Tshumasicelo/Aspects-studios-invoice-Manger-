import { store } from '@/data/store';
import type { Service } from '@/domain/types';
import { hasErrors, validateService } from '@/domain/validation';
import { newId, nowISO } from '@/lib/id';
import { BusinessRuleError } from './errors';
import { buildSeedServices } from './settingsService';

export type ServiceInput = Omit<Service, 'id' | 'createdAt' | 'updatedAt'>;

export function emptyService(): ServiceInput {
  return {
    name: '',
    category: 'Web Design & Development',
    description: '',
    defaultPrice: 0,
    pricingModel: 'fixed',
    deliveryEstimate: '',
    internalNotes: '',
    archived: false,
  };
}

export async function saveService(input: ServiceInput, id?: string): Promise<Service> {
  const errors = validateService(input);
  if (hasErrors(errors)) throw new BusinessRuleError(Object.values(errors)[0]);
  const s = store();
  const now = nowISO();
  const existing = id ? await s.services.get(id) : undefined;
  const service: Service = {
    ...input,
    name: input.name.trim(),
    category: input.category.trim(),
    description: input.description.trim(),
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await s.services.put(service);
  return service;
}

export async function setServiceArchived(id: string, archived: boolean): Promise<void> {
  const s = store();
  const service = await s.services.get(id);
  if (!service) throw new BusinessRuleError('Service not found.');
  await s.services.put({ ...service, archived, updatedAt: nowISO() });
}

/**
 * Deleting a catalogue entry is safe for existing documents because line items
 * store their own copy of the name, description and price.
 */
export async function deleteService(id: string): Promise<void> {
  await store().services.delete(id);
}

/** Re-add any of the standard ASPECTS STUDIOS services that are missing (matched by name). */
export async function restoreDefaultServices(): Promise<number> {
  const s = store();
  const existing = new Set((await s.services.list()).map((x) => x.name.toLowerCase()));
  const missing = buildSeedServices().filter((x) => !existing.has(x.name.toLowerCase()));
  if (missing.length) await s.services.bulkPut(missing);
  return missing.length;
}

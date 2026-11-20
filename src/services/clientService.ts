import { store } from '@/data/store';
import { emptyAddress } from '@/domain/defaults';
import type { Client, ClientSnapshot } from '@/domain/types';
import { hasErrors, normaliseForMatch, validateClient } from '@/domain/validation';
import { newId, nowISO } from '@/lib/id';
import { BusinessRuleError } from './errors';

export type ClientInput = Omit<Client, 'id' | 'createdAt' | 'updatedAt'>;

export function emptyClient(): ClientInput {
  return {
    name: '',
    companyName: '',
    email: '',
    phone: '',
    physicalAddress: emptyAddress(),
    billingAddress: emptyAddress(),
    billingSameAsPhysical: true,
    registrationNumber: '',
    vatNumber: '',
    notes: '',
    status: 'active',
  };
}

export function clientDisplayName(c: Pick<Client, 'name' | 'companyName'> | ClientSnapshot | undefined | null): string {
  if (!c) return 'Unknown client';
  return c.companyName?.trim() || c.name?.trim() || 'Unnamed client';
}

export function snapshotClient(c: Client): ClientSnapshot {
  return {
    name: c.name,
    companyName: c.companyName,
    email: c.email,
    phone: c.phone,
    billingAddress: { ...(c.billingSameAsPhysical ? c.physicalAddress : c.billingAddress) },
    registrationNumber: c.registrationNumber,
    vatNumber: c.vatNumber,
  };
}

/** Existing clients that look like the same person/company (same email, or same normalised name). */
export function findPossibleDuplicates(input: Pick<Client, 'name' | 'companyName' | 'email'>, clients: Client[], excludeId?: string): Client[] {
  const email = input.email.trim().toLowerCase();
  const name = normaliseForMatch(input.name);
  const company = normaliseForMatch(input.companyName);
  return clients.filter((c) => {
    if (c.id === excludeId) return false;
    if (email && c.email.trim().toLowerCase() === email) return true;
    if (company && normaliseForMatch(c.companyName) === company) return true;
    if (!company && name && !c.companyName && normaliseForMatch(c.name) === name) return true;
    return false;
  });
}

function clean(input: ClientInput): ClientInput {
  const trim = (v: string) => v.trim();
  return {
    ...input,
    name: trim(input.name),
    companyName: trim(input.companyName),
    email: trim(input.email).toLowerCase(),
    phone: trim(input.phone),
    registrationNumber: trim(input.registrationNumber),
    vatNumber: trim(input.vatNumber),
    billingAddress: input.billingSameAsPhysical ? { ...input.physicalAddress } : input.billingAddress,
  };
}

export async function saveClient(input: ClientInput, id?: string): Promise<Client> {
  const errors = validateClient(input);
  if (hasErrors(errors)) throw new BusinessRuleError(Object.values(errors)[0]);
  const s = store();
  const now = nowISO();
  const existing = id ? await s.clients.get(id) : undefined;
  const client: Client = {
    ...clean(input),
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await s.clients.put(client);
  return client;
}

/**
 * Clients with financial documents cannot be deleted — that would orphan
 * invoices and payments. Mark them inactive instead.
 */
export async function deleteClient(id: string): Promise<void> {
  const s = store();
  await s.transaction(async () => {
    const [invoices, quotations, projects, payments] = await Promise.all([
      s.invoices.findBy('clientId', id),
      s.quotations.findBy('clientId', id),
      s.projects.findBy('clientId', id),
      s.payments.findBy('clientId', id),
    ]);
    const linked = invoices.length + quotations.length + projects.length + payments.length;
    if (linked > 0)
      throw new BusinessRuleError(
        'This client has linked invoices, quotations, projects or payments and cannot be deleted. Set the status to Inactive instead.',
      );
    await s.clients.delete(id);
  });
}

import type { DataStore } from './types';
import { createDexieStore } from './dexie/dexieStore';

/**
 * The active DataStore. Everything in the app obtains data through `store()`,
 * so the storage backend can be replaced in one place (e.g. a cloud-synchronised
 * implementation, or an in-memory store for tests).
 */
let current: DataStore | null = null;

export function store(): DataStore {
  if (!current) current = createDexieStore();
  return current;
}

export function setDataStore(next: DataStore): void {
  current = next;
}

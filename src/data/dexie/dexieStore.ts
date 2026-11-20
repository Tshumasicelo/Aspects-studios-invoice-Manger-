import { liveQuery, type Table } from 'dexie';
import type { BusinessSettings, Counter } from '@/domain/types';
import type { CounterRepository, DataStore, Repository, SettingsRepository } from '../types';
import { AspectsDatabase } from './database';

class DexieRepository<T extends { id: string }> implements Repository<T> {
  constructor(private readonly table: Table<T, string>) {}

  list() {
    return this.table.toArray();
  }
  get(id: string) {
    return this.table.get(id);
  }
  findBy<K extends keyof T & string>(field: K, value: T[K] & (string | number)) {
    return this.table.where(field).equals(value).toArray();
  }
  async put(entity: T) {
    await this.table.put(entity);
  }
  async bulkPut(entities: T[]) {
    await this.table.bulkPut(entities);
  }
  async delete(id: string) {
    await this.table.delete(id);
  }
  count() {
    return this.table.count();
  }
  async clear() {
    await this.table.clear();
  }
}

class DexieSettingsRepository implements SettingsRepository {
  constructor(private readonly table: Table<BusinessSettings, string>) {}
  get() {
    return this.table.get('business');
  }
  async put(settings: BusinessSettings) {
    await this.table.put(settings);
  }
  async clear() {
    await this.table.clear();
  }
}

class DexieCounterRepository implements CounterRepository {
  constructor(private readonly table: Table<Counter, string>) {}
  get(key: string) {
    return this.table.get(key);
  }
  async put(counter: Counter) {
    await this.table.put(counter);
  }
  list() {
    return this.table.toArray();
  }
  async bulkPut(counters: Counter[]) {
    await this.table.bulkPut(counters);
  }
  async clear() {
    await this.table.clear();
  }
}

export function createDexieStore(db = new AspectsDatabase()): DataStore & { db: AspectsDatabase } {
  return {
    db,
    clients: new DexieRepository(db.clients),
    services: new DexieRepository(db.services),
    invoices: new DexieRepository(db.invoices),
    quotations: new DexieRepository(db.quotations),
    projects: new DexieRepository(db.projects),
    payments: new DexieRepository(db.payments),
    expenses: new DexieRepository(db.expenses),
    settings: new DexieSettingsRepository(db.settings),
    counters: new DexieCounterRepository(db.counters),

    transaction<R>(fn: () => Promise<R>): Promise<R> {
      return db.transaction('rw', db.tables, fn);
    },

    watch(query, onNext, onError) {
      const subscription = liveQuery(query).subscribe({
        next: onNext,
        error: (err) => {
          console.error('[data] live query failed', err);
          onError?.(err);
        },
      });
      return () => subscription.unsubscribe();
    },

    async requestPersistence() {
      if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
      try {
        return await navigator.storage.persist();
      } catch {
        return false;
      }
    },
    async isPersisted() {
      if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return false;
      try {
        return await navigator.storage.persisted();
      } catch {
        return false;
      }
    },
  };
}

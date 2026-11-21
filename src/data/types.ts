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

/**
 * Storage-agnostic data-access contracts.
 *
 * UI components and services depend ONLY on these interfaces. The current
 * implementation is IndexedDB (Dexie), but a cloud/sync implementation can be
 * provided later by implementing `DataStore` and calling `setDataStore()`.
 */

export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  /** Records where `field` equals `value`. Field must be indexed by the implementation. */
  findBy<K extends keyof T & string>(field: K, value: T[K] & (string | number)): Promise<T[]>;
  put(entity: T): Promise<void>;
  bulkPut(entities: T[]): Promise<void>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<BusinessSettings | undefined>;
  put(settings: BusinessSettings): Promise<void>;
  clear(): Promise<void>;
}

export interface CounterRepository {
  get(key: string): Promise<Counter | undefined>;
  put(counter: Counter): Promise<void>;
  list(): Promise<Counter[]>;
  bulkPut(counters: Counter[]): Promise<void>;
  clear(): Promise<void>;
}

export type Unsubscribe = () => void;

/** Dispatched on `window` by a DataStore when opening storage is held up by another open tab/window. */
export const DB_BLOCKED_EVENT = 'aspects:db-blocked';

export interface DataStore {
  clients: Repository<Client>;
  services: Repository<Service>;
  invoices: Repository<Invoice>;
  quotations: Repository<Quotation>;
  projects: Repository<Project>;
  payments: Repository<Payment>;
  expenses: Repository<Expense>;
  settings: SettingsRepository;
  counters: CounterRepository;

  /** Run `fn` atomically: all writes succeed, or none are applied. */
  transaction<R>(fn: () => Promise<R>): Promise<R>;

  /**
   * Re-run `query` whenever the underlying data changes and push results to `onNext`.
   * This is what keeps every screen (dashboard, lists, reports) live and consistent.
   */
  watch<R>(query: () => Promise<R>, onNext: (value: R) => void, onError?: (error: unknown) => void): Unsubscribe;

  /** Ask the browser to keep this origin's storage from being evicted (best effort). */
  requestPersistence(): Promise<boolean>;
  isPersisted(): Promise<boolean>;
}

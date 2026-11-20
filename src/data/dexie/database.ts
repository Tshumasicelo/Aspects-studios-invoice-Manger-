import Dexie, { type Table } from 'dexie';
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
 * IndexedDB schema. Unique indexes (&) on document numbers and payment
 * references give database-level protection against duplicates, in addition
 * to the checks performed by the numbering service.
 *
 * Schema changes MUST be added as a new `this.version(n)` block — never edit an
 * existing version — so installed copies upgrade without losing records.
 */
export class AspectsDatabase extends Dexie {
  clients!: Table<Client, string>;
  services!: Table<Service, string>;
  invoices!: Table<Invoice, string>;
  quotations!: Table<Quotation, string>;
  projects!: Table<Project, string>;
  payments!: Table<Payment, string>;
  expenses!: Table<Expense, string>;
  settings!: Table<BusinessSettings, string>;
  counters!: Table<Counter, string>;

  constructor(name = 'aspects-studios-invoice-manager') {
    super(name);
    this.version(1).stores({
      clients: 'id, name, companyName, email, status, createdAt',
      services: 'id, name, category, createdAt',
      invoices: 'id, &number, clientId, projectId, quotationId, storedStatus, issueDate, dueDate, createdAt',
      quotations: 'id, &number, clientId, projectId, storedStatus, issueDate, expiryDate, createdAt',
      projects: 'id, clientId, status, quotationId, createdAt',
      payments: 'id, &reference, invoiceId, clientId, date, createdAt',
      expenses: 'id, category, date, createdAt',
      settings: 'id',
      counters: 'key',
    });
  }
}

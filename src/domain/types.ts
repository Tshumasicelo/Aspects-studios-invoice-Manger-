/**
 * Core domain types for ASPECTS STUDIOS — Invoice Manager.
 *
 * Conventions
 * - All monetary values are stored as INTEGER CENTS (e.g. R 1,250.00 => 125000)
 *   to avoid floating-point rounding errors.
 * - All calendar dates are stored as ISO date strings "YYYY-MM-DD".
 * - All timestamps are stored as ISO date-time strings.
 * - IDs are opaque strings (UUIDs) so records can later be synchronised to a cloud store.
 */

export type ID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;
export type Cents = number;

export interface BaseEntity {
  id: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface HistoryEntry {
  at: ISODateTime;
  action: string;
  note?: string;
}

/* ------------------------------------------------------------------ Clients */

export type ClientStatus = 'active' | 'lead' | 'inactive';

export interface Address {
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export interface Client extends BaseEntity {
  name: string;
  companyName: string;
  email: string;
  phone: string;
  physicalAddress: Address;
  billingAddress: Address;
  billingSameAsPhysical: boolean;
  registrationNumber: string;
  vatNumber: string;
  notes: string;
  status: ClientStatus;
}

/** Frozen copy of client billing details stored on a document when it is created/issued. */
export interface ClientSnapshot {
  name: string;
  companyName: string;
  email: string;
  phone: string;
  billingAddress: Address;
  registrationNumber: string;
  vatNumber: string;
}

/* ----------------------------------------------------------------- Services */

export type PricingModel = 'fixed' | 'hourly' | 'daily' | 'custom';

export interface Service extends BaseEntity {
  name: string;
  category: string;
  description: string;
  defaultPrice: Cents;
  pricingModel: PricingModel;
  deliveryEstimate: string;
  internalNotes: string;
  archived: boolean;
}

/* ------------------------------------------------------- Document line items */

/** VAT treatment of a single line. "standard" uses the document VAT rate. */
export type VatCategory = 'standard' | 'zero' | 'exempt';

export interface LineItem {
  id: ID;
  serviceId: ID | null;
  title: string;
  description: string;
  /** Decimal quantity allowed (e.g. 1.5 hours). */
  quantity: number;
  unitPrice: Cents;
  vatCategory: VatCategory;
}

export type DiscountType = 'none' | 'percent' | 'fixed';

export interface Discount {
  type: DiscountType;
  /** Percent (0–100) when type = percent; cents when type = fixed. */
  value: number;
}

/** Everything needed to calculate a document's totals. */
export interface PricingInput {
  items: LineItem[];
  discount: Discount;
  vatEnabled: boolean;
  /** Percent, e.g. 15 for 15%. */
  vatRate: number;
}

export interface DocumentTotals {
  subtotal: Cents;
  discount: Cents;
  taxable: Cents;
  vat: Cents;
  total: Cents;
  /** Per-line totals keyed by line id. */
  lineTotals: Record<ID, Cents>;
}

/* ----------------------------------------------------------------- Invoices */

/** Statuses persisted on the record. */
export type InvoiceStoredStatus = 'draft' | 'sent' | 'cancelled';
/** Statuses shown to the user (derived from stored status, payments and dates). */
export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';

export interface Invoice extends BaseEntity, PricingInput {
  number: string;
  issueDate: ISODate;
  dueDate: ISODate;
  clientId: ID;
  clientSnapshot: ClientSnapshot;
  projectId: ID | null;
  quotationId: ID | null;
  currency: string;
  paymentInstructions: string;
  notes: string;
  terms: string;
  storedStatus: InvoiceStoredStatus;
  /** Cached total in cents (recomputed on every save). */
  total: Cents;
  /** Cached sum of recorded payments in cents (recomputed on every payment change). */
  amountPaid: Cents;
  sentAt: ISODateTime | null;
  cancelledAt: ISODateTime | null;
  history: HistoryEntry[];
}

/* --------------------------------------------------------------- Quotations */

export type QuotationStoredStatus = 'draft' | 'sent' | 'accepted' | 'rejected';
export type QuotationStatus = QuotationStoredStatus | 'expired';

export interface Quotation extends BaseEntity, PricingInput {
  number: string;
  issueDate: ISODate;
  expiryDate: ISODate;
  clientId: ID;
  clientSnapshot: ClientSnapshot;
  projectId: ID | null;
  currency: string;
  notes: string;
  terms: string;
  storedStatus: QuotationStoredStatus;
  total: Cents;
  convertedInvoiceId: ID | null;
  history: HistoryEntry[];
}

/* ----------------------------------------------------------------- Projects */

export type ProjectStatus =
  | 'planning'
  | 'quoted'
  | 'approved'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

export interface Project extends BaseEntity {
  name: string;
  clientId: ID;
  description: string;
  category: string;
  startDate: ISODate | '';
  expectedCompletionDate: ISODate | '';
  budget: Cents;
  status: ProjectStatus;
  quotationId: ID | null;
  notes: string;
  history: HistoryEntry[];
}

/* ----------------------------------------------------------------- Payments */

export type PaymentMethod = 'eft' | 'bank_transfer' | 'cash' | 'card' | 'other';

export interface Payment extends BaseEntity {
  reference: string;
  invoiceId: ID;
  clientId: ID;
  date: ISODate;
  amount: Cents;
  method: PaymentMethod;
  transactionReference: string;
  notes: string;
}

/* ----------------------------------------------------------------- Expenses */

export interface Expense extends BaseEntity {
  description: string;
  category: string;
  amount: Cents;
  date: ISODate;
  paymentMethod: PaymentMethod;
  supplier: string;
  reference: string;
  notes: string;
}

/* ----------------------------------------------------------------- Settings */

export type DateFormat = 'DD MMM YYYY' | 'YYYY/MM/DD' | 'DD/MM/YYYY';

export interface NumberingConfig {
  /** Tokens: {PREFIX} {YYYY} {YY} {MM} {SEQ} */
  pattern: string;
  prefix: string;
  padding: number;
  resetYearly: boolean;
}

export interface BusinessSettings {
  id: 'business';
  businessName: string;
  tagline: string;
  logoDataUrl: string | null;
  email: string;
  phone: string;
  website: string;
  address: Address;
  registrationNumber: string;
  vatRegistrationNumber: string;
  /** Free-text banking/payment details shown on documents. Never pre-filled. */
  paymentDetails: string;

  currency: string;
  locale: string;
  dateFormat: DateFormat;

  vatEnabled: boolean;
  vatRate: number;
  vatLabel: string;

  defaultPaymentTermsDays: number;
  quotationValidityDays: number;
  defaultInvoiceNotes: string;
  defaultInvoiceTerms: string;
  defaultQuotationNotes: string;
  defaultQuotationTerms: string;

  invoiceNumbering: NumberingConfig;
  quotationNumbering: NumberingConfig;
  paymentNumbering: NumberingConfig;

  documentAccentColor: string;

  onboarding: {
    welcomeDismissed: boolean;
    setupCompleted: boolean;
  };
  updatedAt: ISODateTime;
}

export type CounterKey = 'invoice' | 'quotation' | 'payment';

/**
 * Sequence counter. Key is "<kind>" when numbering runs continuously, or
 * "<kind>:<year>" when numbering resets every year.
 */
export interface Counter {
  key: string;
  kind: CounterKey;
  /** Next sequence number to allocate. */
  next: number;
}

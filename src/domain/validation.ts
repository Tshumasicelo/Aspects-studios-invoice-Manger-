import type { Client, Expense, LineItem, Project, Service } from './types';
import { isValidISODate } from './dates';

/** Field-level validation errors keyed by field name. Empty object = valid. */
export type ValidationErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function validateClient(c: Partial<Client>): ValidationErrors {
  const e: ValidationErrors = {};
  if (!c.name?.trim() && !c.companyName?.trim()) e.name = 'Enter a client name or a company name.';
  if (c.email && c.email.trim() && !isValidEmail(c.email)) e.email = 'Enter a valid email address.';
  if (c.phone && c.phone.trim() && !/^[+()\d\s-]{6,20}$/.test(c.phone.trim()))
    e.phone = 'Use digits, spaces, +, ( ) or - only.';
  return e;
}

export function validateService(s: Partial<Service>): ValidationErrors {
  const e: ValidationErrors = {};
  if (!s.name?.trim()) e.name = 'Service name is required.';
  if (!s.category?.trim()) e.category = 'Choose a category.';
  if ((s.defaultPrice ?? 0) < 0) e.defaultPrice = 'Price cannot be negative.';
  return e;
}

export function validateProject(p: Partial<Project>): ValidationErrors {
  const e: ValidationErrors = {};
  if (!p.name?.trim()) e.name = 'Project name is required.';
  if (!p.clientId) e.clientId = 'Select a client.';
  if ((p.budget ?? 0) < 0) e.budget = 'Budget cannot be negative.';
  if (p.startDate && p.expectedCompletionDate && p.expectedCompletionDate < p.startDate)
    e.expectedCompletionDate = 'Completion date cannot be before the start date.';
  return e;
}

export function validateExpense(x: Partial<Expense>): ValidationErrors {
  const e: ValidationErrors = {};
  if (!x.description?.trim()) e.description = 'Description is required.';
  if (!x.category?.trim()) e.category = 'Choose a category.';
  if (!x.amount || x.amount <= 0) e.amount = 'Enter an amount greater than zero.';
  if (!x.date || !isValidISODate(x.date)) e.date = 'Enter a valid date.';
  return e;
}

export function validateLineItems(items: LineItem[]): ValidationErrors {
  const e: ValidationErrors = {};
  if (items.length === 0) e.items = 'Add at least one line item.';
  items.forEach((item, idx) => {
    if (!item.title.trim()) e[`items.${idx}.title`] = 'Item name is required.';
    if (!(item.quantity > 0)) e[`items.${idx}.quantity`] = 'Quantity must be greater than zero.';
    if (item.unitPrice < 0) e[`items.${idx}.unitPrice`] = 'Unit price cannot be negative.';
  });
  return e;
}

export interface DocumentDraftInput {
  clientId: string;
  issueDate: string;
  endDate: string; // due date (invoice) or expiry date (quotation)
  items: LineItem[];
  discountValue: number;
  discountType: 'none' | 'percent' | 'fixed';
}

export function validateDocument(d: DocumentDraftInput, endLabel: string): ValidationErrors {
  const e: ValidationErrors = { ...validateLineItems(d.items) };
  if (!d.clientId) e.clientId = 'Select a client.';
  if (!isValidISODate(d.issueDate)) e.issueDate = 'Enter a valid issue date.';
  if (!isValidISODate(d.endDate)) e.endDate = `Enter a valid ${endLabel.toLowerCase()}.`;
  else if (isValidISODate(d.issueDate) && d.endDate < d.issueDate)
    e.endDate = `${endLabel} cannot be before the issue date.`;
  if (d.discountType === 'percent' && (d.discountValue < 0 || d.discountValue > 100))
    e.discount = 'Percentage discount must be between 0 and 100.';
  if (d.discountType === 'fixed' && d.discountValue < 0) e.discount = 'Discount cannot be negative.';
  return e;
}

/** Normalised key used for duplicate-client detection. */
export function normaliseForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

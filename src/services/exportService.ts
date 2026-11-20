import { store } from '@/data/store';
import { outstandingBalance } from '@/domain/calculations';
import { todayISO } from '@/domain/dates';
import { CLIENT_STATUS_LABELS, PAYMENT_METHOD_LABELS, PROJECT_STATUS_LABELS } from '@/domain/defaults';
import { centsToInput } from '@/domain/money';
import { INVOICE_STATUS_LABELS, QUOTATION_STATUS_LABELS, invoiceStatus, quotationStatus } from '@/domain/status';
import type { Address, Client, Expense, Invoice, Payment, Project, Quotation } from '@/domain/types';
import { downloadCsv, toCsv, type CsvColumn } from '@/lib/csv';
import { clientDisplayName } from './clientService';
import { calculateTotals } from '@/domain/calculations';

/** CSV exports use ISO dates and plain decimal amounts so they import cleanly into spreadsheets/accounting tools. */

const addr = (a: Address) => [a.line1, a.line2, a.city, a.province, a.postalCode, a.country].filter(Boolean).join(', ');
const money = (c: number) => centsToInput(c);

export type ExportEntity = 'clients' | 'invoices' | 'quotations' | 'payments' | 'expenses' | 'projects';

export const EXPORT_LABELS: Record<ExportEntity, string> = {
  clients: 'Clients',
  invoices: 'Invoices',
  quotations: 'Quotations',
  payments: 'Payments',
  expenses: 'Expenses',
  projects: 'Projects',
};

export function clientsCsv(clients: Client[]): string {
  const cols: CsvColumn<Client>[] = [
    { header: 'Name', value: (c) => c.name },
    { header: 'Company', value: (c) => c.companyName },
    { header: 'Email', value: (c) => c.email },
    { header: 'Phone', value: (c) => c.phone },
    { header: 'Physical address', value: (c) => addr(c.physicalAddress) },
    { header: 'Billing address', value: (c) => addr(c.billingSameAsPhysical ? c.physicalAddress : c.billingAddress) },
    { header: 'Registration number', value: (c) => c.registrationNumber },
    { header: 'VAT number', value: (c) => c.vatNumber },
    { header: 'Status', value: (c) => CLIENT_STATUS_LABELS[c.status] },
    { header: 'Notes', value: (c) => c.notes },
    { header: 'Created', value: (c) => c.createdAt.slice(0, 10) },
  ];
  return toCsv(clients, cols);
}

export function invoicesCsv(invoices: Invoice[], projects: Project[], today = todayISO()): string {
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const cols: CsvColumn<Invoice>[] = [
    { header: 'Invoice number', value: (i) => i.number },
    { header: 'Status', value: (i) => INVOICE_STATUS_LABELS[invoiceStatus(i, today)] },
    { header: 'Client', value: (i) => clientDisplayName(i.clientSnapshot) },
    { header: 'Project', value: (i) => (i.projectId ? projectName.get(i.projectId) ?? '' : '') },
    { header: 'Issue date', value: (i) => i.issueDate },
    { header: 'Due date', value: (i) => i.dueDate },
    { header: 'Currency', value: (i) => i.currency },
    { header: 'Subtotal', value: (i) => money(calculateTotals(i).subtotal) },
    { header: 'Discount', value: (i) => money(calculateTotals(i).discount) },
    { header: 'VAT', value: (i) => money(calculateTotals(i).vat) },
    { header: 'Total', value: (i) => money(i.total) },
    { header: 'Amount paid', value: (i) => money(i.amountPaid) },
    { header: 'Outstanding', value: (i) => money(i.storedStatus === 'sent' ? outstandingBalance(i.total, i.amountPaid) : 0) },
    { header: 'Line items', value: (i) => i.items.map((it) => `${it.title} x${it.quantity}`).join('; ') },
  ];
  return toCsv([...invoices].sort((a, b) => a.number.localeCompare(b.number)), cols);
}

export function quotationsCsv(quotations: Quotation[], today = todayISO()): string {
  const cols: CsvColumn<Quotation>[] = [
    { header: 'Quotation number', value: (q) => q.number },
    { header: 'Status', value: (q) => QUOTATION_STATUS_LABELS[quotationStatus(q, today)] },
    { header: 'Client', value: (q) => clientDisplayName(q.clientSnapshot) },
    { header: 'Issue date', value: (q) => q.issueDate },
    { header: 'Expiry date', value: (q) => q.expiryDate },
    { header: 'Currency', value: (q) => q.currency },
    { header: 'Subtotal', value: (q) => money(calculateTotals(q).subtotal) },
    { header: 'Discount', value: (q) => money(calculateTotals(q).discount) },
    { header: 'VAT', value: (q) => money(calculateTotals(q).vat) },
    { header: 'Total', value: (q) => money(q.total) },
    { header: 'Converted to invoice', value: (q) => (q.convertedInvoiceId ? 'Yes' : 'No') },
  ];
  return toCsv([...quotations].sort((a, b) => a.number.localeCompare(b.number)), cols);
}

export function paymentsCsv(payments: Payment[], invoices: Invoice[]): string {
  const inv = new Map(invoices.map((i) => [i.id, i]));
  const cols: CsvColumn<Payment>[] = [
    { header: 'Payment reference', value: (p) => p.reference },
    { header: 'Date', value: (p) => p.date },
    { header: 'Invoice', value: (p) => inv.get(p.invoiceId)?.number ?? '' },
    { header: 'Client', value: (p) => clientDisplayName(inv.get(p.invoiceId)?.clientSnapshot) },
    { header: 'Amount', value: (p) => money(p.amount) },
    { header: 'Method', value: (p) => PAYMENT_METHOD_LABELS[p.method] },
    { header: 'Transaction reference', value: (p) => p.transactionReference },
    { header: 'Notes', value: (p) => p.notes },
  ];
  return toCsv([...payments].sort((a, b) => a.date.localeCompare(b.date)), cols);
}

export function expensesCsv(expenses: Expense[]): string {
  const cols: CsvColumn<Expense>[] = [
    { header: 'Date', value: (e) => e.date },
    { header: 'Description', value: (e) => e.description },
    { header: 'Category', value: (e) => e.category },
    { header: 'Amount', value: (e) => money(e.amount) },
    { header: 'Payment method', value: (e) => PAYMENT_METHOD_LABELS[e.paymentMethod] },
    { header: 'Supplier', value: (e) => e.supplier },
    { header: 'Reference', value: (e) => e.reference },
    { header: 'Notes', value: (e) => e.notes },
  ];
  return toCsv([...expenses].sort((a, b) => a.date.localeCompare(b.date)), cols);
}

export function projectsCsv(projects: Project[], clients: Client[], invoices: Invoice[]): string {
  const client = new Map(clients.map((c) => [c.id, c]));
  const cols: CsvColumn<Project>[] = [
    { header: 'Project', value: (p) => p.name },
    { header: 'Client', value: (p) => clientDisplayName(client.get(p.clientId)) },
    { header: 'Category', value: (p) => p.category },
    { header: 'Status', value: (p) => PROJECT_STATUS_LABELS[p.status] },
    { header: 'Start date', value: (p) => p.startDate },
    { header: 'Expected completion', value: (p) => p.expectedCompletionDate },
    { header: 'Budget', value: (p) => money(p.budget) },
    {
      header: 'Invoiced',
      value: (p) => money(invoices.filter((i) => i.projectId === p.id && i.storedStatus === 'sent').reduce((a, i) => a + i.total, 0)),
    },
    {
      header: 'Paid',
      value: (p) => money(invoices.filter((i) => i.projectId === p.id && i.storedStatus === 'sent').reduce((a, i) => a + i.amountPaid, 0)),
    },
  ];
  return toCsv(projects, cols);
}

export async function exportEntityCsv(entity: ExportEntity, rows?: unknown[]): Promise<void> {
  const s = store();
  const stamp = todayISO();
  let csv = '';
  switch (entity) {
    case 'clients':
      csv = clientsCsv((rows as Client[]) ?? (await s.clients.list()));
      break;
    case 'invoices':
      csv = invoicesCsv((rows as Invoice[]) ?? (await s.invoices.list()), await s.projects.list());
      break;
    case 'quotations':
      csv = quotationsCsv((rows as Quotation[]) ?? (await s.quotations.list()));
      break;
    case 'payments':
      csv = paymentsCsv((rows as Payment[]) ?? (await s.payments.list()), await s.invoices.list());
      break;
    case 'expenses':
      csv = expensesCsv((rows as Expense[]) ?? (await s.expenses.list()));
      break;
    case 'projects':
      csv = projectsCsv((rows as Project[]) ?? (await s.projects.list()), await s.clients.list(), await s.invoices.list());
      break;
  }
  downloadCsv(csv, `aspects-${entity}-${stamp}.csv`);
}

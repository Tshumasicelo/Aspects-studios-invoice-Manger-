import { allocateAcrossLines, outstandingBalance } from '@/domain/calculations';
import { inRange, monthKey, monthRange, type DateRange } from '@/domain/dates';
import { sumCents } from '@/domain/money';
import { invoiceStatus, isIssued, quotationStatus } from '@/domain/status';
import type {
  Cents,
  Client,
  Expense,
  ISODate,
  Invoice,
  InvoiceStatus,
  Payment,
  Project,
  ProjectStatus,
  Quotation,
} from '@/domain/types';
import { clientDisplayName } from './clientService';

/**
 * Pure analytics over stored records. The dashboard and the reports page both
 * use these functions, so their figures are always identical.
 *
 * Definitions
 * - Revenue (cash received) = payments dated within the range.
 * - Invoiced = totals of issued (sent, not cancelled, not draft) invoices with an issue date in range.
 * - Outstanding = unpaid balance of all issued invoices, regardless of range (it is a point-in-time figure).
 * - Net profit = revenue received − expenses, within the range.
 */

export interface Dataset {
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  projects: Project[];
  quotations: Quotation[];
}

export interface MonthlyPoint {
  key: string;
  revenue: Cents;
  expenses: Cents;
  profit: Cents;
  invoiced: Cents;
}

export interface FinancialSummary {
  revenue: Cents;
  revenueThisMonth: Cents;
  invoiced: Cents;
  outstanding: Cents;
  outstandingCount: number;
  overdue: Cents;
  overdueCount: number;
  expenses: Cents;
  netProfit: Cents;
}

export function financialSummary(data: Dataset, range: DateRange, today: ISODate): FinancialSummary {
  const paymentsInRange = data.payments.filter((p) => inRange(p.date, range));
  const expensesInRange = data.expenses.filter((e) => inRange(e.date, range));
  const thisMonth = monthKey(today);
  const revenue = sumCents(paymentsInRange.map((p) => p.amount));
  const expenses = sumCents(expensesInRange.map((e) => e.amount));

  let outstanding = 0;
  let outstandingCount = 0;
  let overdue = 0;
  let overdueCount = 0;
  for (const inv of data.invoices) {
    if (!isIssued(inv)) continue;
    const bal = outstandingBalance(inv.total, inv.amountPaid);
    if (bal <= 0) continue;
    outstanding += bal;
    outstandingCount += 1;
    if (invoiceStatus(inv, today) === 'overdue') {
      overdue += bal;
      overdueCount += 1;
    }
  }

  return {
    revenue,
    revenueThisMonth: sumCents(data.payments.filter((p) => monthKey(p.date) === thisMonth).map((p) => p.amount)),
    invoiced: sumCents(data.invoices.filter((i) => isIssued(i) && inRange(i.issueDate, range)).map((i) => i.total)),
    outstanding,
    outstandingCount,
    overdue,
    overdueCount,
    expenses,
    netProfit: revenue - expenses,
  };
}

export function monthlySeries(data: Dataset, range: DateRange): MonthlyPoint[] {
  const keys = monthRange(range.from, range.to);
  const map = new Map<string, MonthlyPoint>(keys.map((k) => [k, { key: k, revenue: 0, expenses: 0, profit: 0, invoiced: 0 }]));
  for (const p of data.payments) if (inRange(p.date, range)) map.get(monthKey(p.date))!.revenue += p.amount;
  for (const e of data.expenses) if (inRange(e.date, range)) map.get(monthKey(e.date))!.expenses += e.amount;
  for (const i of data.invoices)
    if (isIssued(i) && inRange(i.issueDate, range)) map.get(monthKey(i.issueDate))!.invoiced += i.total;
  return keys.map((k) => {
    const point = map.get(k)!;
    return { ...point, profit: point.revenue - point.expenses };
  });
}

export interface StatusSlice {
  status: InvoiceStatus;
  count: number;
  amount: Cents;
}

export function invoiceStatusBreakdown(data: Dataset, range: DateRange, today: ISODate): StatusSlice[] {
  const order: InvoiceStatus[] = ['paid', 'partially_paid', 'sent', 'overdue', 'draft', 'cancelled'];
  const map = new Map<InvoiceStatus, StatusSlice>(order.map((s) => [s, { status: s, count: 0, amount: 0 }]));
  for (const inv of data.invoices) {
    if (!inRange(inv.issueDate, range)) continue;
    const slice = map.get(invoiceStatus(inv, today))!;
    slice.count += 1;
    slice.amount += inv.total;
  }
  return order.map((s) => map.get(s)!).filter((s) => s.count > 0);
}

export function projectStatusBreakdown(projects: Project[]): { status: ProjectStatus; count: number }[] {
  const counts = new Map<ProjectStatus, number>();
  for (const p of projects) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
  return [...counts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
}

export interface NamedAmount {
  id: string;
  name: string;
  amount: Cents;
  count: number;
}

export function revenueByClient(data: Dataset, range: DateRange): NamedAmount[] {
  const clients = new Map(data.clients.map((c) => [c.id, c]));
  const invoices = new Map(data.invoices.map((i) => [i.id, i]));
  const map = new Map<string, NamedAmount>();
  for (const p of data.payments) {
    if (!inRange(p.date, range)) continue;
    const client = clients.get(p.clientId);
    const name = client ? clientDisplayName(client) : clientDisplayName(invoices.get(p.invoiceId)?.clientSnapshot);
    const row = map.get(p.clientId) ?? { id: p.clientId, name, amount: 0, count: 0 };
    row.amount += p.amount;
    row.count += 1;
    map.set(p.clientId, row);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/**
 * Revenue received per service. Each payment is allocated across the invoice's
 * line items in proportion to their value. Custom (non-catalogue) lines are grouped by title.
 */
export function revenueByService(data: Dataset, range: DateRange): NamedAmount[] {
  const invoices = new Map(data.invoices.map((i) => [i.id, i]));
  const map = new Map<string, NamedAmount>();
  for (const p of data.payments) {
    if (!inRange(p.date, range)) continue;
    const inv = invoices.get(p.invoiceId);
    if (!inv) continue;
    const shares = allocateAcrossLines(p.amount, inv);
    for (const item of inv.items) {
      const key = item.serviceId ?? `custom:${item.title.toLowerCase()}`;
      const row = map.get(key) ?? { id: key, name: item.title || 'Custom item', amount: 0, count: 0 };
      row.amount += shares[item.id] ?? 0;
      row.count += 1;
      map.set(key, row);
    }
  }
  return [...map.values()].filter((r) => r.amount !== 0).sort((a, b) => b.amount - a.amount);
}

export function expensesByCategory(expenses: Expense[], range: DateRange): NamedAmount[] {
  const map = new Map<string, NamedAmount>();
  for (const e of expenses) {
    if (!inRange(e.date, range)) continue;
    const row = map.get(e.category) ?? { id: e.category, name: e.category, amount: 0, count: 0 };
    row.amount += e.amount;
    row.count += 1;
    map.set(e.category, row);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export interface ProjectFinancials {
  project: Project;
  clientName: string;
  budget: Cents;
  invoiced: Cents;
  paid: Cents;
  outstanding: Cents;
  invoiceCount: number;
  /** Invoiced as a percentage of budget (null when no budget is set). */
  budgetUsed: number | null;
}

export function projectFinancials(project: Project, invoices: Invoice[], clients: Client[]): ProjectFinancials {
  const linked = invoices.filter((i) => i.projectId === project.id && isIssued(i));
  const invoiced = sumCents(linked.map((i) => i.total));
  const paid = sumCents(linked.map((i) => i.amountPaid));
  const client = clients.find((c) => c.id === project.clientId);
  return {
    project,
    clientName: clientDisplayName(client),
    budget: project.budget,
    invoiced,
    paid,
    outstanding: sumCents(linked.map((i) => outstandingBalance(i.total, i.amountPaid))),
    invoiceCount: linked.length,
    budgetUsed: project.budget > 0 ? Math.round((invoiced / project.budget) * 1000) / 10 : null,
  };
}

export interface ClientFinancials {
  lifetimeBilling: Cents;
  paymentsReceived: Cents;
  outstanding: Cents;
  overdue: Cents;
  invoiceCount: number;
  quotationCount: number;
  projectCount: number;
}

export function clientFinancials(clientId: string, data: Dataset, today: ISODate): ClientFinancials {
  const invoices = data.invoices.filter((i) => i.clientId === clientId && isIssued(i));
  return {
    lifetimeBilling: sumCents(invoices.map((i) => i.total)),
    paymentsReceived: sumCents(data.payments.filter((p) => p.clientId === clientId).map((p) => p.amount)),
    outstanding: sumCents(invoices.map((i) => outstandingBalance(i.total, i.amountPaid))),
    overdue: sumCents(
      invoices.filter((i) => invoiceStatus(i, today) === 'overdue').map((i) => outstandingBalance(i.total, i.amountPaid)),
    ),
    invoiceCount: data.invoices.filter((i) => i.clientId === clientId).length,
    quotationCount: data.quotations.filter((q) => q.clientId === clientId).length,
    projectCount: data.projects.filter((p) => p.clientId === clientId).length,
  };
}

export function pendingQuotations(quotations: Quotation[], today: ISODate): Quotation[] {
  return quotations
    .filter((q) => {
      const s = quotationStatus(q, today);
      return s === 'sent' || s === 'draft';
    })
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
}

/** Earliest date found in any financial record (used for "All time" ranges). */
export function earliestDate(data: Dataset): ISODate | undefined {
  const dates = [
    ...data.payments.map((p) => p.date),
    ...data.expenses.map((e) => e.date),
    ...data.invoices.map((i) => i.issueDate),
  ].sort();
  return dates[0];
}

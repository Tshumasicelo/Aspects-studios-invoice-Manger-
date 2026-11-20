import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { InvoiceStatusBadge } from '@/components/ui/Badge';
import { EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui/Layout';
import { Legend, ProfitTrendChart, RankedBars, RevenueExpensesChart, SERIES } from '@/components/charts/Charts';
import { RangeFilter, useDateRange } from '@/components/RangeFilter';
import { outstandingBalance } from '@/domain/calculations';
import { daysBetween, inRange, monthLabel } from '@/domain/dates';
import { centsToInput } from '@/domain/money';
import { PAYMENT_METHOD_LABELS, PROJECT_STATUS_LABELS } from '@/domain/defaults';
import { invoiceStatus, isIssued } from '@/domain/status';
import { useFormat, useToday } from '@/hooks/useApp';
import { useDataset } from '@/hooks/useLiveData';
import { downloadCsv, toCsv } from '@/lib/csv';
import {
  earliestDate,
  expensesByCategory,
  financialSummary,
  monthlySeries,
  projectFinancials,
  revenueByClient,
  revenueByService,
  type NamedAmount,
} from '@/services/analytics';
import { clientDisplayName } from '@/services/clientService';

export default function ReportsPage() {
  const data = useDataset();
  const today = useToday();
  const fmt = useFormat();
  const rangeState = useDateRange(data ? earliestDate(data) : undefined);
  const { range } = rangeState;
  const suffix = `${range.from}_to_${range.to}`;

  const r = useMemo(() => {
    if (!data) return null;
    const invoices = new Map(data.invoices.map((i) => [i.id, i]));
    const outstanding = data.invoices
      .filter((i) => isIssued(i) && outstandingBalance(i.total, i.amountPaid) > 0)
      .map((i) => ({ inv: i, status: invoiceStatus(i, today), balance: outstandingBalance(i.total, i.amountPaid) }))
      .sort((a, b) => a.inv.dueDate.localeCompare(b.inv.dueDate));
    return {
      summary: financialSummary(data, range, today),
      monthly: monthlySeries(data, range),
      byClient: revenueByClient(data, range),
      byService: revenueByService(data, range),
      byCategory: expensesByCategory(data.expenses, range),
      outstanding,
      overdue: outstanding.filter((o) => o.status === 'overdue'),
      payments: data.payments
        .filter((p) => inRange(p.date, range))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((p) => ({ p, inv: invoices.get(p.invoiceId) })),
      projects: data.projects
        .filter((p) => p.status !== 'cancelled')
        .map((p) => projectFinancials(p, data.invoices, data.clients))
        .sort((a, b) => b.invoiced - a.invoiced),
    };
  }, [data, range, today]);

  if (!data || !r) return <Spinner />;

  const named = (rows: NamedAmount[], label: string, file: string) =>
    downloadCsv(toCsv(rows, [{ header: label, value: (x) => x.name }, { header: 'Amount', value: (x) => centsToInput(x.amount) }]), `${file}-${suffix}.csv`);

  const exportButton = (onClick: () => void, disabled = false) => (
    <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={onClick} disabled={disabled}>
      CSV
    </Button>
  );

  const hasAnything = data.invoices.length + data.payments.length + data.expenses.length > 0;

  return (
    <>
      <PageHeader
        kicker="Analytics"
        title="Reports"
        subtitle="Revenue figures are based on payments actually received; invoiced amounts are shown separately."
        actions={<RangeFilter {...rangeState} />}
      />
      {!hasAnything ? (
        <Card>
          <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Nothing to report yet" description="Reports fill in automatically as you issue invoices, record payments and log expenses." />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-5">
            <StatCard label="Invoiced" value={fmt.money(r.summary.invoiced)} hint="Issued in period" />
            <StatCard label="Received" value={fmt.money(r.summary.revenue)} tone="blue" hint="Cash in period" />
            <StatCard label="Expenses" value={fmt.money(r.summary.expenses)} />
            <StatCard label="Net profit" value={<span className={r.summary.netProfit < 0 ? 'text-danger' : ''}>{fmt.money(r.summary.netProfit)}</span>} tone={r.summary.netProfit < 0 ? 'danger' : 'success'} />
            <div className="col-span-2 lg:col-span-1">
              <StatCard label="Outstanding now" value={fmt.money(r.summary.outstanding)} tone="warning" hint={`${fmt.money(r.summary.overdue)} overdue`} />
            </div>
          </div>

          <Card>
            <CardHeader
              title="Revenue by month"
              subtitle="Cash received, expenses and net profit"
              action={
                <div className="flex items-center gap-3">
                  <span className="hidden sm:block">
                    <Legend items={[{ label: 'Revenue', color: SERIES.revenue }, { label: 'Expenses', color: SERIES.expenses }]} />
                  </span>
                  {exportButton(() =>
                    downloadCsv(
                      toCsv(r.monthly, [
                        { header: 'Month', value: (m) => m.key },
                        { header: 'Invoiced', value: (m) => centsToInput(m.invoiced) },
                        { header: 'Revenue received', value: (m) => centsToInput(m.revenue) },
                        { header: 'Expenses', value: (m) => centsToInput(m.expenses) },
                        { header: 'Net profit', value: (m) => centsToInput(m.profit) },
                      ]),
                      `revenue-by-month-${suffix}.csv`,
                    ),
                  )}
                </div>
              }
            />
            <CardBody className="space-y-6">
              <RevenueExpensesChart data={r.monthly} height={280} />
              <div>
                <div className="kicker mb-3">Net profit</div>
                <ProfitTrendChart data={r.monthly} height={180} />
              </div>
              <details className="group rounded-xl border border-border">
                <summary className="cursor-pointer px-4 py-3 text-xs text-muted select-none hover:text-text">Show as table</summary>
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[0.68rem] tracking-[0.14em] text-faint uppercase">
                        <th className="px-4 py-2 text-left">Month</th>
                        <th className="px-4 py-2 text-right">Invoiced</th>
                        <th className="px-4 py-2 text-right">Received</th>
                        <th className="px-4 py-2 text-right">Expenses</th>
                        <th className="px-4 py-2 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.monthly.map((m) => (
                        <tr key={m.key} className="border-t border-border/60">
                          <td className="px-4 py-2 text-muted">{monthLabel(m.key)}</td>
                          <td className="num px-4 py-2 text-right">{fmt.money(m.invoiced)}</td>
                          <td className="num px-4 py-2 text-right">{fmt.money(m.revenue)}</td>
                          <td className="num px-4 py-2 text-right">{fmt.money(m.expenses)}</td>
                          <td className={`num px-4 py-2 text-right ${m.profit < 0 ? 'text-danger' : ''}`}>{fmt.money(m.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title="Revenue by client" subtitle="Payments received" action={exportButton(() => named(r.byClient, 'Client', 'revenue-by-client'), !r.byClient.length)} />
              <CardBody>
                <RankedBars rows={r.byClient} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Revenue by service" subtitle="Payments allocated across invoice lines" action={exportButton(() => named(r.byService, 'Service', 'revenue-by-service'), !r.byService.length)} />
              <CardBody>
                <RankedBars rows={r.byService} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Expenses by category" action={exportButton(() => named(r.byCategory, 'Category', 'expenses-by-category'), !r.byCategory.length)} />
              <CardBody>
                <RankedBars rows={r.byCategory} color={SERIES.expenses} />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Outstanding invoices"
              subtitle={`${r.outstanding.length} unpaid · ${r.overdue.length} overdue · as of today`}
              action={exportButton(
                () =>
                  downloadCsv(
                    toCsv(r.outstanding, [
                      { header: 'Invoice', value: (o) => o.inv.number },
                      { header: 'Client', value: (o) => clientDisplayName(o.inv.clientSnapshot) },
                      { header: 'Due date', value: (o) => o.inv.dueDate },
                      { header: 'Status', value: (o) => o.status },
                      { header: 'Days overdue', value: (o) => (o.status === 'overdue' ? daysBetween(o.inv.dueDate, today) : 0) },
                      { header: 'Total', value: (o) => centsToInput(o.inv.total) },
                      { header: 'Balance', value: (o) => centsToInput(o.balance) },
                    ]),
                    `outstanding-invoices-${today}.csv`,
                  ),
                !r.outstanding.length,
              )}
            />
            <CardBody className="pt-0">
              {r.outstanding.length === 0 ? (
                <p className="py-6 text-center text-sm text-faint">All issued invoices are paid. 🎉</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {r.outstanding.map((o) => (
                    <li key={o.inv.id}>
                      <Link to={`/invoices/${o.inv.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-white/[0.02]">
                        <div className="min-w-0">
                          <div className="num font-mono text-sm text-text">{o.inv.number}</div>
                          <div className="truncate text-xs text-faint">
                            {clientDisplayName(o.inv.clientSnapshot)} · due {fmt.date(o.inv.dueDate)}
                            {o.status === 'overdue' && <span className="text-danger"> · {daysBetween(o.inv.dueDate, today)} days overdue</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <InvoiceStatusBadge status={o.status} />
                          <span className="num w-28 text-right text-sm">{fmt.money(o.balance, o.inv.currency)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Payments received"
                subtitle={`${r.payments.length} in period`}
                action={exportButton(
                  () =>
                    downloadCsv(
                      toCsv(r.payments, [
                        { header: 'Reference', value: (x) => x.p.reference },
                        { header: 'Date', value: (x) => x.p.date },
                        { header: 'Invoice', value: (x) => x.inv?.number ?? '' },
                        { header: 'Client', value: (x) => clientDisplayName(x.inv?.clientSnapshot) },
                        { header: 'Method', value: (x) => PAYMENT_METHOD_LABELS[x.p.method] },
                        { header: 'Amount', value: (x) => centsToInput(x.p.amount) },
                      ]),
                      `payments-${suffix}.csv`,
                    ),
                  !r.payments.length,
                )}
              />
              <CardBody className="max-h-96 overflow-y-auto pt-0">
                {r.payments.length === 0 ? (
                  <p className="py-6 text-center text-sm text-faint">No payments in this period.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {r.payments.map(({ p, inv }) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <div className="truncate text-text">{clientDisplayName(inv?.clientSnapshot)}</div>
                          <div className="text-xs text-faint">
                            {fmt.date(p.date)} · {inv?.number}
                          </div>
                        </div>
                        <span className="num shrink-0 text-success">{fmt.money(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Project performance"
                subtitle="Budget versus invoiced and received (all time)"
                action={exportButton(
                  () =>
                    downloadCsv(
                      toCsv(r.projects, [
                        { header: 'Project', value: (x) => x.project.name },
                        { header: 'Client', value: (x) => x.clientName },
                        { header: 'Status', value: (x) => PROJECT_STATUS_LABELS[x.project.status] },
                        { header: 'Budget', value: (x) => centsToInput(x.budget) },
                        { header: 'Invoiced', value: (x) => centsToInput(x.invoiced) },
                        { header: 'Received', value: (x) => centsToInput(x.paid) },
                        { header: 'Outstanding', value: (x) => centsToInput(x.outstanding) },
                        { header: 'Budget used %', value: (x) => x.budgetUsed ?? '' },
                      ]),
                      `project-performance-${today}.csv`,
                    ),
                  !r.projects.length,
                )}
              />
              <CardBody className="max-h-96 overflow-y-auto pt-0">
                {r.projects.length === 0 ? (
                  <p className="py-6 text-center text-sm text-faint">No projects yet.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {r.projects.map((x) => (
                      <li key={x.project.id}>
                        <Link to={`/projects/${x.project.id}`} className="block py-3 hover:bg-white/[0.02]">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-text">{x.project.name}</span>
                            <span className="num shrink-0">
                              {fmt.money(x.invoiced)}
                              {x.budget ? <span className="text-faint"> / {fmt.money(x.budget)}</span> : null}
                            </span>
                          </div>
                          <div className="mt-1 flex justify-between text-xs text-faint">
                            <span>
                              {x.clientName} · {PROJECT_STATUS_LABELS[x.project.status]}
                            </span>
                            <span>
                              Received <span className="text-success">{fmt.money(x.paid)}</span>
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

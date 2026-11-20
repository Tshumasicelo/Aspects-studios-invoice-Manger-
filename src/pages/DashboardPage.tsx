import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Clock,
  FileText,
  FolderKanban,
  Plus,
  Receipt,
  ScrollText,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { InvoiceStatusBadge, ProjectStatusBadge, QuotationStatusBadge, STATUS_COLORS } from '@/components/ui/Badge';
import { PageHeader, Spinner, StatCard } from '@/components/ui/Layout';
import { Legend, ProfitTrendChart, RankedBars, RevenueExpensesChart, SERIES, SegmentedStatus } from '@/components/charts/Charts';
import { RangeFilter, useDateRange } from '@/components/RangeFilter';
import { SetupChecklist } from '@/components/onboarding/Checklist';
import { LogoMark } from '@/components/brand/Logo';
import { PAYMENT_METHOD_LABELS, PROJECT_STATUS_LABELS } from '@/domain/defaults';
import { INVOICE_STATUS_LABELS, invoiceStatus, quotationStatus } from '@/domain/status';
import { useFormat, useSettings, useToday } from '@/hooks/useApp';
import { useDataset } from '@/hooks/useLiveData';
import {
  earliestDate,
  financialSummary,
  invoiceStatusBreakdown,
  monthlySeries,
  pendingQuotations,
  projectStatusBreakdown,
} from '@/services/analytics';
import { clientDisplayName } from '@/services/clientService';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardPage() {
  const data = useDataset();
  const settings = useSettings();
  const today = useToday();
  const fmt = useFormat();
  const rangeState = useDateRange(data ? earliestDate(data) : undefined);
  const { range } = rangeState;

  const view = useMemo(() => {
    if (!data) return null;
    return {
      summary: financialSummary(data, range, today),
      series: monthlySeries(data, range),
      statuses: invoiceStatusBreakdown(data, range, today),
      projects: projectStatusBreakdown(data.projects.filter((p) => p.status !== 'cancelled')),
    };
  }, [data, range, today]);

  if (!data || !view) return <Spinner />;

  const isEmpty = data.clients.length === 0 && data.invoices.length === 0 && data.quotations.length === 0 && data.expenses.length === 0;
  const invoices = new Map(data.invoices.map((i) => [i.id, i]));
  const clients = new Map(data.clients.map((c) => [c.id, c]));
  const recentInvoices = [...data.invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const recentPayments = [...data.payments].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const activeProjects = data.projects.filter((p) => ['approved', 'in_progress', 'review'].includes(p.status)).slice(0, 5);
  const recentClients = [...data.clients].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const pending = pendingQuotations(data.quotations, today).slice(0, 5);
  const { summary: s } = view;

  if (isEmpty) {
    return (
      <>
        <SetupChecklist settings={settings} data={data} />
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-blue/10 blur-3xl" />
          <div className="relative grid gap-10 p-6 md:p-10 lg:grid-cols-2">
            <div>
              <LogoMark className="h-14 w-14" />
              <div className="kicker mt-6">Welcome</div>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">
                <span className="metal-text">{settings.businessName}</span>
                <br />
                Invoice Manager
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
                Quotations, invoices, payments, projects and expenses — in one place, working offline, with your data stored privately on this device.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                <ButtonLink to="/setup" variant="primary" size="lg">
                  Set up your business
                </ButtonLink>
                <ButtonLink to="/services" variant="secondary" size="lg">
                  Explore services
                </ButtonLink>
              </div>
            </div>
            <ol className="space-y-3 self-center">
              {[
                { icon: Users, title: 'Add a client', text: 'Store billing details once, reuse them everywhere.', to: '/clients?new=1' },
                { icon: ScrollText, title: 'Send a quotation', text: 'Pick services from your catalogue of 15 pre-written offerings.', to: '/quotations/new' },
                { icon: FileText, title: 'Invoice & get paid', text: 'Convert accepted quotes, download premium PDFs, record payments.', to: '/invoices/new' },
                { icon: TrendingUp, title: 'Watch the numbers', text: 'Revenue, outstanding balances and profit update automatically.', to: '/reports' },
              ].map((step, i) => (
                <li key={step.title}>
                  <Link to={step.to} className="group flex items-start gap-4 rounded-xl border border-border bg-bg-2/60 p-4 transition-colors hover:border-border-strong">
                    <span className="num mt-0.5 font-mono text-xs text-faint">0{i + 1}</span>
                    <step.icon className="mt-0.5 h-4 w-4 shrink-0 text-blue" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-text">{step.title}</div>
                      <div className="mt-0.5 text-xs text-muted">{step.text}</div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-faint group-hover:text-text" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        kicker={greeting()}
        title={<span className="metal-text">{settings.businessName}</span>}
        subtitle="Business overview — figures are calculated from your recorded invoices, payments and expenses."
        actions={<RangeFilter {...rangeState} />}
      />
      <SetupChecklist settings={settings} data={data} />

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-6">
        <StatCard label="Revenue received" value={fmt.money(s.revenue)} icon={<Banknote className="h-4 w-4" />} tone="blue" hint={`Invoiced ${fmt.money(s.invoiced)}`} to="/reports" />
        <StatCard label="This month" value={fmt.money(s.revenueThisMonth)} icon={<TrendingUp className="h-4 w-4" />} tone="success" hint="Cash received" to="/payments" />
        <StatCard label="Outstanding" value={fmt.money(s.outstanding)} icon={<Clock className="h-4 w-4" />} tone="warning" hint={`${s.outstandingCount} unpaid invoice${s.outstandingCount === 1 ? '' : 's'}`} to="/invoices" />
        <StatCard
          label="Overdue"
          value={fmt.money(s.overdue)}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={s.overdueCount ? 'danger' : 'neutral'}
          hint={s.overdueCount ? `${s.overdueCount} invoice${s.overdueCount === 1 ? '' : 's'} past due` : 'Nothing overdue'}
          to="/invoices"
        />
        <StatCard label="Expenses" value={fmt.money(s.expenses)} icon={<Receipt className="h-4 w-4" />} hint="In selected period" to="/expenses" />
        <StatCard
          label="Net profit"
          value={<span className={s.netProfit < 0 ? 'text-danger' : ''}>{fmt.money(s.netProfit)}</span>}
          icon={<Wallet className="h-4 w-4" />}
          tone={s.netProfit >= 0 ? 'success' : 'danger'}
          hint="Revenue − expenses"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Revenue vs expenses"
            subtitle="Monthly cash received and costs"
            action={<Legend items={[{ label: 'Revenue', color: SERIES.revenue }, { label: 'Expenses', color: SERIES.expenses }]} />}
          />
          <CardBody>
            <RevenueExpensesChart data={view.series} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Invoice status" subtitle="Invoices issued in this period" />
          <CardBody>
            <SegmentedStatus
              segments={view.statuses.map((st) => ({ key: st.status, label: INVOICE_STATUS_LABELS[st.status], color: STATUS_COLORS[st.status], count: st.count, amount: st.amount }))}
            />
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Net profit trend" subtitle="Revenue received minus expenses, per month" />
          <CardBody>
            <ProfitTrendChart data={view.series} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Project distribution" subtitle="Open and completed projects by status" />
          <CardBody>
            <RankedBars
              valueLabel="Projects by status"
              rows={view.projects.map((p) => ({ id: p.status, name: PROJECT_STATUS_LABELS[p.status], amount: p.count, count: p.count }))}
              color={SERIES.profit}
              format={(n) => `${n} project${n === 1 ? '' : 's'}`}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <ListCard title="Recent invoices" icon={<FileText className="h-4 w-4" />} to="/invoices" empty="No invoices yet" newTo="/invoices/new">
          {recentInvoices.map((i) => (
            <ListRow key={i.id} to={`/invoices/${i.id}`} title={i.number} sub={clientDisplayName(i.clientSnapshot)} right={fmt.money(i.total, i.currency)} badge={<InvoiceStatusBadge status={invoiceStatus(i, today)} />} mono />
          ))}
        </ListCard>
        <ListCard title="Recent payments" icon={<Banknote className="h-4 w-4" />} to="/payments" empty="No payments recorded" newTo="/payments?new=1">
          {recentPayments.map((p) => {
            const inv = invoices.get(p.invoiceId);
            return (
              <ListRow
                key={p.id}
                to={inv ? `/invoices/${inv.id}` : '/payments'}
                title={clientDisplayName(inv?.clientSnapshot)}
                sub={`${fmt.date(p.date)} · ${PAYMENT_METHOD_LABELS[p.method]} · ${inv?.number ?? ''}`}
                right={<span className="text-success">{fmt.money(p.amount)}</span>}
              />
            );
          })}
        </ListCard>
        <ListCard title="Pending quotations" icon={<ScrollText className="h-4 w-4" />} to="/quotations" empty="No quotations awaiting a decision" newTo="/quotations/new">
          {pending.map((q) => (
            <ListRow key={q.id} to={`/quotations/${q.id}`} title={q.number} sub={`${clientDisplayName(q.clientSnapshot)} · until ${fmt.date(q.expiryDate)}`} right={fmt.money(q.total, q.currency)} badge={<QuotationStatusBadge status={quotationStatus(q, today)} />} mono />
          ))}
        </ListCard>
        <ListCard title="Active projects" icon={<FolderKanban className="h-4 w-4" />} to="/projects" empty="No active projects" newTo="/projects?new=1">
          {activeProjects.map((p) => (
            <ListRow key={p.id} to={`/projects/${p.id}`} title={p.name} sub={clientDisplayName(clients.get(p.clientId))} right={<ProjectStatusBadge status={p.status} />} />
          ))}
        </ListCard>
        <ListCard title="Recent clients" icon={<Users className="h-4 w-4" />} to="/clients" empty="No clients yet" newTo="/clients?new=1">
          {recentClients.map((c) => (
            <ListRow key={c.id} to={`/clients/${c.id}`} title={clientDisplayName(c)} sub={c.email || c.phone || 'No contact details'} right={<span className="text-xs text-faint">{fmt.date(c.createdAt.slice(0, 10))}</span>} />
          ))}
        </ListCard>
      </div>
    </>
  );
}

function ListCard({ title, icon, to, empty, newTo, children }: { title: string; icon: React.ReactNode; to: string; empty: string; newTo: string; children: React.ReactNode[] }) {
  return (
    <Card>
      <CardHeader
        title={title}
        icon={icon}
        action={
          <Link to={to} className="text-xs text-muted transition-colors hover:text-text">
            View all
          </Link>
        }
      />
      <CardBody className="pt-0">
        {children.length === 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-dashed border-border px-4 py-5 text-sm text-faint">
            {empty}
            <ButtonLink to={newTo} size="sm" variant="subtle" icon={<Plus className="h-3.5 w-3.5" />}>
              Add
            </ButtonLink>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">{children}</ul>
        )}
      </CardBody>
    </Card>
  );
}

function ListRow({ to, title, sub, right, badge, mono }: { to: string; title: string; sub: string; right: React.ReactNode; badge?: React.ReactNode; mono?: boolean }) {
  return (
    <li>
      <Link to={to} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.025]">
        <div className="min-w-0">
          <div className={`truncate text-sm text-text ${mono ? 'num font-mono text-[0.8rem]' : ''}`}>{title}</div>
          <div className="truncate text-xs text-faint">{sub}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="num text-sm">{right}</span>
          {badge}
        </div>
      </Link>
    </li>
  );
}

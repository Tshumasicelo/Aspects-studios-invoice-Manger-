import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileText, FolderKanban, Pencil, ScrollText, Trash2 } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { InvoiceStatusBadge, ProjectStatusBadge, QuotationStatusBadge } from '@/components/ui/Badge';
import { ActionMenu, DetailRow, EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui/Layout';
import { useConfirm } from '@/components/ui/Confirm';
import { ProjectFormModal } from '@/components/forms/ProjectFormModal';
import { HistoryList } from '@/components/documents/HistoryList';
import { invoiceStatus, quotationStatus, isIssued } from '@/domain/status';
import { useFormat, useToday } from '@/hooks/useApp';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useDataset } from '@/hooks/useLiveData';
import { projectFinancials } from '@/services/analytics';
import { lineTotal } from '@/domain/calculations';
import { deleteProject } from '@/services/projectService';
import { BudgetBar } from './ProjectsPage';

export default function ProjectDetailPage() {
  const { id = '' } = useParams();
  const data = useDataset();
  const fmt = useFormat();
  const today = useToday();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { run } = useAsyncAction();
  const [edit, setEdit] = useState(false);

  if (!data) return <Spinner />;
  const project = data.projects.find((p) => p.id === id);
  if (!project) {
    return (
      <Card>
        <EmptyState icon={<FolderKanban className="h-6 w-6" />} title="Project not found" action={<ButtonLink to="/projects">Back to projects</ButtonLink>} />
      </Card>
    );
  }
  const fin = projectFinancials(project, data.invoices, data.clients);
  const invoices = data.invoices.filter((i) => i.projectId === id).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const quotations = data.quotations.filter((q) => q.projectId === id || q.id === project.quotationId).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const linkedQuote = project.quotationId ? data.quotations.find((q) => q.id === project.quotationId) : undefined;

  // Services delivered on this project, aggregated from issued invoice lines.
  const serviceMap = new Map<string, { title: string; amount: number }>();
  for (const inv of invoices.filter(isIssued)) {
    for (const item of inv.items) {
      const key = item.serviceId ?? item.title;
      const row = serviceMap.get(key) ?? { title: item.title, amount: 0 };
      row.amount += lineTotal(item);
      serviceMap.set(key, row);
    }
  }
  const servicesUsed = [...serviceMap.values()].sort((a, b) => b.amount - a.amount);

  const remove = async () => {
    const { confirmed } = await confirm({
      title: `Delete project “${project.name}”?`,
      message: 'Linked invoices and quotations are kept; they are simply no longer associated with a project.',
      confirmLabel: 'Delete project',
    });
    if (confirmed && (await run(() => deleteProject(project.id).then(() => true), { success: 'Project deleted' }))) navigate('/projects', { replace: true });
  };

  return (
    <>
      <PageHeader
        back={{ to: '/projects', label: 'Projects' }}
        kicker={project.category}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {project.name} <ProjectStatusBadge status={project.status} />
          </span>
        }
        subtitle={
          <Link to={`/clients/${project.clientId}`} className="text-blue hover:underline">
            {fin.clientName}
          </Link>
        }
        actions={
          <>
            <ButtonLink to={`/quotations/new?client=${project.clientId}&project=${project.id}`} variant="secondary" icon={<ScrollText className="h-4 w-4" />}>
              Quote
            </ButtonLink>
            <ButtonLink to={`/invoices/new?client=${project.clientId}&project=${project.id}`} variant="primary" icon={<FileText className="h-4 w-4" />}>
              Invoice
            </ButtonLink>
            <ActionMenu
              items={[
                { label: 'Edit project', icon: <Pencil />, onClick: () => setEdit(true) },
                { label: 'Delete project', icon: <Trash2 />, tone: 'danger', onClick: () => void remove() },
              ]}
            />
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Budget" value={fin.budget ? fmt.money(fin.budget) : '—'} hint={fin.budgetUsed !== null ? <><span>{fin.budgetUsed}% invoiced</span><BudgetBar pct={fin.budgetUsed} /></> : 'No budget set'} />
        <StatCard label="Invoiced" value={fmt.money(fin.invoiced)} tone="blue" hint={`${fin.invoiceCount} issued invoice${fin.invoiceCount === 1 ? '' : 's'}`} />
        <StatCard label="Received" value={fmt.money(fin.paid)} tone="success" />
        <StatCard label="Outstanding" value={fmt.money(fin.outstanding)} tone={fin.outstanding ? 'warning' : 'neutral'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Card>
            <CardHeader title="Invoices" subtitle={invoices.length ? undefined : 'No invoices linked yet'} />
            <CardBody className="pt-0">
              <ul className="divide-y divide-border/60">
                {invoices.map((i) => (
                  <li key={i.id}>
                    <Link to={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-white/[0.02]">
                      <div>
                        <div className="num font-mono text-sm text-text">{i.number}</div>
                        <div className="text-xs text-faint">Due {fmt.date(i.dueDate)}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <InvoiceStatusBadge status={invoiceStatus(i, today)} />
                        <span className="num w-28 text-right text-sm">{fmt.money(i.total, i.currency)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Quotations" subtitle={quotations.length ? undefined : 'No quotations linked yet'} />
            <CardBody className="pt-0">
              <ul className="divide-y divide-border/60">
                {quotations.map((q) => (
                  <li key={q.id}>
                    <Link to={`/quotations/${q.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-white/[0.02]">
                      <div>
                        <div className="num font-mono text-sm text-text">{q.number}</div>
                        <div className="text-xs text-faint">Valid until {fmt.date(q.expiryDate)}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <QuotationStatusBadge status={quotationStatus(q, today)} />
                        <span className="num w-28 text-right text-sm">{fmt.money(q.total, q.currency)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Services delivered" subtitle="From issued invoices on this project" />
            <CardBody>
              {servicesUsed.length === 0 ? (
                <p className="text-sm text-faint">Nothing invoiced yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {servicesUsed.map((s) => (
                    <li key={s.title} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-muted">{s.title}</span>
                      <span className="num shrink-0">{fmt.money(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
        <aside className="space-y-6 lg:col-span-4">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="divide-y divide-border/60 pt-0">
              <DetailRow label="Start">{fmt.date(project.startDate)}</DetailRow>
              <DetailRow label="Expected completion">{fmt.date(project.expectedCompletionDate)}</DetailRow>
              <DetailRow label="Quotation">
                {linkedQuote ? (
                  <Link to={`/quotations/${linkedQuote.id}`} className="text-blue hover:underline">
                    {linkedQuote.number}
                  </Link>
                ) : (
                  '—'
                )}
              </DetailRow>
            </CardBody>
          </Card>
          {(project.description || project.notes) && (
            <Card>
              <CardHeader title="About" />
              <CardBody className="space-y-3 text-sm">
                {project.description && <p className="whitespace-pre-line text-muted">{project.description}</p>}
                {project.notes && (
                  <div>
                    <div className="kicker mb-1">Internal notes</div>
                    <p className="whitespace-pre-line text-muted">{project.notes}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="History" />
            <CardBody>
              <HistoryList history={project.history} />
            </CardBody>
          </Card>
        </aside>
      </div>
      <ProjectFormModal open={edit} onClose={() => setEdit(false)} project={project} />
    </>
  );
}

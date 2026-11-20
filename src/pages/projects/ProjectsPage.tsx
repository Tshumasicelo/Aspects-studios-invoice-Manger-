import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FolderKanban, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { ProjectStatusBadge } from '@/components/ui/Badge';
import { EmptyState, PageHeader, Spinner, Tabs } from '@/components/ui/Layout';
import { SearchInput, Select } from '@/components/ui/Field';
import { ProjectFormModal } from '@/components/forms/ProjectFormModal';
import { PROJECT_STATUS_LABELS } from '@/domain/defaults';
import type { ProjectStatus } from '@/domain/types';
import { useFormat } from '@/hooks/useApp';
import { useDataset } from '@/hooks/useLiveData';
import { projectFinancials } from '@/services/analytics';
import { clientDisplayName } from '@/services/clientService';
import { exportEntityCsv } from '@/services/exportService';

type Group = 'active' | 'all' | 'completed' | 'closed';
const ACTIVE: ProjectStatus[] = ['planning', 'quoted', 'approved', 'in_progress', 'review', 'on_hold'];

export default function ProjectsPage() {
  const data = useDataset();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [group, setGroup] = useState<Group>('active');
  const [status, setStatus] = useState<'' | ProjectStatus>('');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);

  useEffect(() => {
    if (params.get('new') === '1') {
      setModal(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.projects
      .filter((p) =>
        group === 'all' ? true : group === 'active' ? ACTIVE.includes(p.status) : group === 'completed' ? p.status === 'completed' : p.status === 'cancelled',
      )
      .filter((p) => !status || p.status === status)
      .map((p) => projectFinancials(p, data.invoices, data.clients))
      .filter((f) => !term || `${f.project.name} ${f.clientName} ${f.project.category}`.toLowerCase().includes(term))
      .sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt));
  }, [data, group, status, q]);

  if (!data) return <Spinner />;
  const count = (g: Group) =>
    data.projects.filter((p) => (g === 'all' ? true : g === 'active' ? ACTIVE.includes(p.status) : g === 'completed' ? p.status === 'completed' : p.status === 'cancelled')).length;

  return (
    <>
      <PageHeader
        kicker="Delivery"
        title="Projects"
        subtitle="Track budgets, delivery status and what has been invoiced and paid on each project."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} disabled={!rows.length} onClick={() => void exportEntityCsv('projects', rows.map((r) => r.project))}>
              Export CSV
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setModal(true)} disabled={data.clients.length === 0} title={data.clients.length ? undefined : 'Add a client first'}>
              New project
            </Button>
          </>
        }
      />
      {data.projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderKanban className="h-6 w-6" />}
            title="No projects yet"
            description={data.clients.length ? 'Group quotations and invoices under a project to track budget versus billing.' : 'Projects belong to a client — add a client first.'}
            action={
              data.clients.length ? (
                <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setModal(true)}>
                  Create project
                </Button>
              ) : (
                <Button variant="primary" onClick={() => navigate('/clients?new=1')}>
                  Add a client
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="space-y-4 border-b border-border p-4 md:p-5">
            <Tabs<Group>
              value={group}
              onChange={(g) => {
                setGroup(g);
                setStatus('');
              }}
              tabs={(
                [
                  ['active', 'Active'],
                  ['completed', 'Completed'],
                  ['closed', 'Cancelled'],
                  ['all', 'All'],
                ] as [Group, string][]
              ).map(([value, label]) => ({ value, label, count: count(value) }))}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <SearchInput value={q} onChange={setQ} placeholder="Search projects or clients…" className="sm:col-span-2" />
              <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | '')} aria-label="Filter by status">
                <option value="">Any status</option>
                {Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">No projects match these filters.</p>
          ) : (
            <DataTable
              rows={rows}
              rowKey={(r) => r.project.id}
              onRowClick={(r) => navigate(`/projects/${r.project.id}`)}
              columns={[
                {
                  key: 'name',
                  header: 'Project',
                  cell: (r) => (
                    <div className="min-w-0">
                      <div className="truncate text-text">{r.project.name}</div>
                      <div className="truncate text-xs text-faint">{r.clientName}</div>
                    </div>
                  ),
                },
                { key: 'cat', header: 'Category', hideBelow: 'lg', cell: (r) => <span className="text-muted">{r.project.category}</span> },
                { key: 'status', header: 'Status', cell: (r) => <ProjectStatusBadge status={r.project.status} /> },
                { key: 'due', header: 'Completion', hideBelow: 'xl', cell: (r) => <span className="text-muted">{fmt.date(r.project.expectedCompletionDate)}</span> },
                { key: 'budget', header: 'Budget', align: 'right', cell: (r) => <span className="num">{r.budget ? fmt.money(r.budget) : '—'}</span> },
                {
                  key: 'invoiced',
                  header: 'Invoiced',
                  align: 'right',
                  cell: (r) => (
                    <div>
                      <span className="num">{fmt.money(r.invoiced)}</span>
                      {r.budgetUsed !== null && <BudgetBar pct={r.budgetUsed} />}
                    </div>
                  ),
                },
              ]}
              mobile={(r) => (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-text">{r.project.name}</span>
                    <ProjectStatusBadge status={r.project.status} />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-faint">
                    <span className="truncate">{clientDisplayName(data.clients.find((c) => c.id === r.project.clientId))}</span>
                    <span className="num">
                      {fmt.money(r.invoiced)}
                      {r.budget ? ` / ${fmt.money(r.budget)}` : ''}
                    </span>
                  </div>
                </div>
              )}
            />
          )}
        </Card>
      )}
      <ProjectFormModal open={modal} onClose={() => setModal(false)} onSaved={(p) => navigate(`/projects/${p.id}`)} />
    </>
  );
}

export function BudgetBar({ pct }: { pct: number }) {
  const clamped = Math.min(pct, 100);
  const color = pct > 100 ? 'bg-danger' : pct > 85 ? 'bg-warning' : 'bg-blue';
  return (
    <div className="mt-1.5 ml-auto h-1 w-24 overflow-hidden rounded-full bg-white/[0.06]" title={`${pct}% of budget invoiced`}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

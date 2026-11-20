import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { ClientStatusBadge } from '@/components/ui/Badge';
import { EmptyState, PageHeader, Spinner, Tabs } from '@/components/ui/Layout';
import { SearchInput, Select } from '@/components/ui/Field';
import { ClientFormModal } from '@/components/forms/ClientFormModal';
import type { ClientStatus } from '@/domain/types';
import { useFormat, useToday } from '@/hooks/useApp';
import { useDataset } from '@/hooks/useLiveData';
import { clientFinancials } from '@/services/analytics';
import { clientDisplayName } from '@/services/clientService';
import { exportEntityCsv } from '@/services/exportService';

type Sort = 'name' | 'recent' | 'billing' | 'outstanding';

export default function ClientsPage() {
  const data = useDataset();
  const today = useToday();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | ClientStatus>('all');
  const [sort, setSort] = useState<Sort>('name');
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
    const list = data.clients
      .filter((c) => status === 'all' || c.status === status)
      .filter((c) => !term || [c.name, c.companyName, c.email, c.phone, c.vatNumber].join(' ').toLowerCase().includes(term))
      .map((c) => ({ client: c, fin: clientFinancials(c.id, data, today) }));
    const sorters: Record<Sort, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      name: (a, b) => clientDisplayName(a.client).localeCompare(clientDisplayName(b.client)),
      recent: (a, b) => b.client.createdAt.localeCompare(a.client.createdAt),
      billing: (a, b) => b.fin.lifetimeBilling - a.fin.lifetimeBilling,
      outstanding: (a, b) => b.fin.outstanding - a.fin.outstanding,
    };
    return list.sort(sorters[sort]);
  }, [data, q, status, sort, today]);

  if (!data) return <Spinner />;
  const count = (s: 'all' | ClientStatus) => data.clients.filter((c) => s === 'all' || c.status === s).length;

  return (
    <>
      <PageHeader
        kicker="Relationships"
        title="Clients"
        subtitle="Everyone you work with, with their projects, documents and balances."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} disabled={!rows.length} onClick={() => void exportEntityCsv('clients', rows.map((r) => r.client))}>
              Export CSV
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setModal(true)}>
              New client
            </Button>
          </>
        }
      />
      {data.clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No clients yet"
            description="Add a client once and reuse their billing details on every quotation and invoice."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setModal(true)}>
                Add your first client
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="space-y-4 border-b border-border p-4 md:p-5">
            <Tabs
              value={status}
              onChange={setStatus}
              tabs={(['all', 'active', 'lead', 'inactive'] as const).map((s) => ({ value: s, label: s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1), count: count(s) }))}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <SearchInput value={q} onChange={setQ} placeholder="Search name, company, email, phone…" className="sm:col-span-2" />
              <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort clients">
                <option value="name">Sort: Name</option>
                <option value="recent">Sort: Recently added</option>
                <option value="billing">Sort: Lifetime billing</option>
                <option value="outstanding">Sort: Outstanding balance</option>
              </Select>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">No clients match your search.</p>
          ) : (
            <DataTable
              rows={rows}
              rowKey={(r) => r.client.id}
              onRowClick={(r) => navigate(`/clients/${r.client.id}`)}
              columns={[
                {
                  key: 'name',
                  header: 'Client',
                  cell: (r) => (
                    <div className="flex items-center gap-3">
                      <Initials name={clientDisplayName(r.client)} />
                      <div className="min-w-0">
                        <div className="truncate text-text">{clientDisplayName(r.client)}</div>
                        <div className="truncate text-xs text-faint">{r.client.companyName && r.client.name ? r.client.name : r.client.email || '—'}</div>
                      </div>
                    </div>
                  ),
                },
                { key: 'email', header: 'Contact', hideBelow: 'lg', cell: (r) => <span className="text-muted">{r.client.email || r.client.phone || '—'}</span> },
                { key: 'status', header: 'Status', cell: (r) => <ClientStatusBadge status={r.client.status} /> },
                { key: 'billing', header: 'Lifetime billing', align: 'right', cell: (r) => <span className="num">{fmt.money(r.fin.lifetimeBilling)}</span> },
                {
                  key: 'outstanding',
                  header: 'Outstanding',
                  align: 'right',
                  cell: (r) => <span className={`num ${r.fin.overdue > 0 ? 'text-danger' : r.fin.outstanding > 0 ? 'text-warning' : 'text-faint'}`}>{fmt.money(r.fin.outstanding)}</span>,
                },
              ]}
              mobile={(r) => (
                <div className="flex items-center gap-3">
                  <Initials name={clientDisplayName(r.client)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-text">{clientDisplayName(r.client)}</span>
                      <ClientStatusBadge status={r.client.status} />
                    </div>
                    <div className="mt-0.5 flex justify-between text-xs text-faint">
                      <span>Billed {fmt.money(r.fin.lifetimeBilling)}</span>
                      {r.fin.outstanding > 0 && <span className="text-warning">{fmt.money(r.fin.outstanding)} due</span>}
                    </div>
                  </div>
                </div>
              )}
            />
          )}
        </Card>
      )}
      <ClientFormModal open={modal} onClose={() => setModal(false)} onSaved={(c) => navigate(`/clients/${c.id}`)} />
    </>
  );
}

export function Initials({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w[0] ?? ''))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl border border-border-strong bg-gradient-to-b from-card-2 to-bg-2 font-display font-semibold text-accent ${size === 'lg' ? 'h-14 w-14 text-lg' : 'h-9 w-9 text-xs'}`}
    >
      {initials || '?'}
    </span>
  );
}

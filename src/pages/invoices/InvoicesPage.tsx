import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, Plus } from 'lucide-react';
import { ButtonLink, Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { InvoiceStatusBadge } from '@/components/ui/Badge';
import { EmptyState, PageHeader, Spinner, Tabs } from '@/components/ui/Layout';
import { Input, SearchInput, Select } from '@/components/ui/Field';
import { outstandingBalance } from '@/domain/calculations';
import { invoiceStatus } from '@/domain/status';
import type { Invoice, InvoiceStatus } from '@/domain/types';
import { useFormat, useToday } from '@/hooks/useApp';
import { useDataset } from '@/hooks/useLiveData';
import { clientDisplayName } from '@/services/clientService';
import { exportEntityCsv } from '@/services/exportService';
import { sumCents } from '@/domain/money';

type Filter = 'all' | InvoiceStatus | 'unpaid';

export default function InvoicesPage() {
  const data = useDataset();
  const today = useToday();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [clientId, setClientId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const rows = useMemo(() => {
    if (!data) return [];
    const projects = new Map(data.projects.map((p) => [p.id, p.name]));
    const term = q.trim().toLowerCase();
    return data.invoices
      .map((inv) => ({ inv, status: invoiceStatus(inv, today), project: inv.projectId ? projects.get(inv.projectId) : undefined }))
      .filter(({ status }) => {
        if (tab === 'unpaid') return ['sent', 'partially_paid', 'overdue'].includes(status);
        return tab === 'all' || status === tab;
      })
      .filter(({ inv }) => !clientId || inv.clientId === clientId)
      .filter(({ inv }) => (!from || inv.issueDate >= from) && (!to || inv.issueDate <= to))
      .filter(({ inv, project }) => {
        if (!term) return true;
        return [inv.number, clientDisplayName(inv.clientSnapshot), inv.clientSnapshot.email, project ?? '', ...inv.items.map((i) => i.title)]
          .join(' ')
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => b.inv.issueDate.localeCompare(a.inv.issueDate) || b.inv.number.localeCompare(a.inv.number));
  }, [data, today, tab, q, clientId, from, to]);

  if (!data) return <Spinner />;

  const counts = (s: Filter) =>
    data.invoices.filter((i) => {
      const st = invoiceStatus(i, today);
      return s === 'all' || (s === 'unpaid' ? ['sent', 'partially_paid', 'overdue'].includes(st) : st === s);
    }).length;

  const outstandingTotal = sumCents(rows.filter((r) => r.inv.storedStatus === 'sent').map((r) => outstandingBalance(r.inv.total, r.inv.amountPaid)));
  const clients = [...data.clients].sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b)));

  return (
    <>
      <PageHeader
        kicker="Billing"
        title="Invoices"
        subtitle="Create, send and track invoices. Statuses update automatically from payments and due dates."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              disabled={rows.length === 0}
              onClick={() => void exportEntityCsv('invoices', rows.map((r) => r.inv))}
            >
              Export CSV
            </Button>
            <ButtonLink to="/invoices/new" variant="primary" icon={<Plus className="h-4 w-4" />}>
              New invoice
            </ButtonLink>
          </>
        }
      />

      {data.invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="No invoices yet"
            description="Create your first invoice. Invoice numbers are generated automatically and every figure is calculated for you."
            action={
              <ButtonLink to="/invoices/new" variant="primary" icon={<Plus className="h-4 w-4" />}>
                Create invoice
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="space-y-4 border-b border-border p-4 md:p-5">
            <Tabs<Filter>
              value={tab}
              onChange={setTab}
              tabs={(
                [
                  ['all', 'All'],
                  ['unpaid', 'Unpaid'],
                  ['draft', 'Draft'],
                  ['sent', 'Sent'],
                  ['partially_paid', 'Partially paid'],
                  ['overdue', 'Overdue'],
                  ['paid', 'Paid'],
                  ['cancelled', 'Cancelled'],
                ] as [Filter, string][]
              ).map(([value, label]) => ({ value, label, count: counts(value) }))}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SearchInput value={q} onChange={setQ} placeholder="Search number, client, item…" className="sm:col-span-2 lg:col-span-1" />
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Filter by client">
                <option value="">All clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clientDisplayName(c)}
                  </option>
                ))}
              </Select>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Issued from" title="Issued from" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Issued to" title="Issued to" />
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">No invoices match these filters.</p>
          ) : (
            <>
              <DataTable
                rows={rows}
                rowKey={(r) => r.inv.id}
                onRowClick={(r) => navigate(`/invoices/${r.inv.id}`)}
                columns={[
                  { key: 'num', header: 'Invoice', cell: (r) => <span className="num font-mono text-[0.8rem] text-text">{r.inv.number}</span> },
                  {
                    key: 'client',
                    header: 'Client',
                    cell: (r) => (
                      <div className="min-w-0">
                        <div className="truncate text-text">{clientDisplayName(r.inv.clientSnapshot)}</div>
                        {r.project && <div className="truncate text-xs text-faint">{r.project}</div>}
                      </div>
                    ),
                  },
                  { key: 'issue', header: 'Issued', cell: (r) => <span className="text-muted">{fmt.date(r.inv.issueDate)}</span>, hideBelow: 'lg' },
                  { key: 'due', header: 'Due', cell: (r) => <span className={r.status === 'overdue' ? 'text-danger' : 'text-muted'}>{fmt.date(r.inv.dueDate)}</span> },
                  { key: 'status', header: 'Status', cell: (r) => <InvoiceStatusBadge status={r.status} /> },
                  { key: 'total', header: 'Total', align: 'right', cell: (r) => <span className="num">{fmt.money(r.inv.total, r.inv.currency)}</span> },
                  {
                    key: 'balance',
                    header: 'Balance',
                    align: 'right',
                    hideBelow: 'lg',
                    cell: (r) => (
                      <span className="num text-muted">
                        {r.inv.storedStatus === 'sent' ? fmt.money(outstandingBalance(r.inv.total, r.inv.amountPaid), r.inv.currency) : '—'}
                      </span>
                    ),
                  },
                ]}
                mobile={(r: { inv: Invoice; status: InvoiceStatus; project?: string }) => (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="num font-mono text-xs text-muted">{r.inv.number}</span>
                      <InvoiceStatusBadge status={r.status} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-text">{clientDisplayName(r.inv.clientSnapshot)}</span>
                      <span className="num shrink-0 text-sm font-medium">{fmt.money(r.inv.total, r.inv.currency)}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-faint">Due {fmt.date(r.inv.dueDate)}</div>
                  </div>
                )}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs text-muted">
                <span>
                  {rows.length} invoice{rows.length === 1 ? '' : 's'}
                </span>
                <span>
                  Outstanding in view: <span className="num font-medium text-text">{fmt.money(outstandingTotal)}</span>
                </span>
              </div>
            </>
          )}
        </Card>
      )}
    </>
  );
}

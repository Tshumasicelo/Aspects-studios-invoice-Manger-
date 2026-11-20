import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Plus, ScrollText } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { QuotationStatusBadge, Badge } from '@/components/ui/Badge';
import { EmptyState, PageHeader, Spinner, Tabs } from '@/components/ui/Layout';
import { SearchInput, Select } from '@/components/ui/Field';
import { quotationStatus } from '@/domain/status';
import type { QuotationStatus } from '@/domain/types';
import { useFormat, useToday } from '@/hooks/useApp';
import { useDataset } from '@/hooks/useLiveData';
import { clientDisplayName } from '@/services/clientService';
import { exportEntityCsv } from '@/services/exportService';

type Filter = 'all' | QuotationStatus;

export default function QuotationsPage() {
  const data = useDataset();
  const today = useToday();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [clientId, setClientId] = useState('');

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.quotations
      .map((quote) => ({ quote, status: quotationStatus(quote, today) }))
      .filter((r) => tab === 'all' || r.status === tab)
      .filter((r) => !clientId || r.quote.clientId === clientId)
      .filter(
        (r) =>
          !term ||
          [r.quote.number, clientDisplayName(r.quote.clientSnapshot), ...r.quote.items.map((i) => i.title)].join(' ').toLowerCase().includes(term),
      )
      .sort((a, b) => b.quote.issueDate.localeCompare(a.quote.issueDate) || b.quote.number.localeCompare(a.quote.number));
  }, [data, today, tab, q, clientId]);

  if (!data) return <Spinner />;
  const count = (s: Filter) => data.quotations.filter((x) => s === 'all' || quotationStatus(x, today) === s).length;

  return (
    <>
      <PageHeader
        kicker="Sales"
        title="Quotations"
        subtitle="Prepare professional quotations and convert accepted ones into invoices with one click."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} disabled={!rows.length} onClick={() => void exportEntityCsv('quotations', rows.map((r) => r.quote))}>
              Export CSV
            </Button>
            <ButtonLink to="/quotations/new" variant="primary" icon={<Plus className="h-4 w-4" />}>
              New quotation
            </ButtonLink>
          </>
        }
      />
      {data.quotations.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ScrollText className="h-6 w-6" />}
            title="No quotations yet"
            description="Quote a project using services from your catalogue. When the client accepts, convert it into an invoice without retyping anything."
            action={
              <ButtonLink to="/quotations/new" variant="primary" icon={<Plus className="h-4 w-4" />}>
                Create quotation
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
                  ['draft', 'Draft'],
                  ['sent', 'Sent'],
                  ['accepted', 'Accepted'],
                  ['rejected', 'Rejected'],
                  ['expired', 'Expired'],
                ] as [Filter, string][]
              ).map(([value, label]) => ({ value, label, count: count(value) }))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <SearchInput value={q} onChange={setQ} placeholder="Search number, client, item…" />
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Filter by client">
                <option value="">All clients</option>
                {[...data.clients]
                  .sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b)))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {clientDisplayName(c)}
                    </option>
                  ))}
              </Select>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">No quotations match these filters.</p>
          ) : (
            <DataTable
              rows={rows}
              rowKey={(r) => r.quote.id}
              onRowClick={(r) => navigate(`/quotations/${r.quote.id}`)}
              columns={[
                { key: 'num', header: 'Quotation', cell: (r) => <span className="num font-mono text-[0.8rem] text-text">{r.quote.number}</span> },
                { key: 'client', header: 'Client', cell: (r) => <span className="text-text">{clientDisplayName(r.quote.clientSnapshot)}</span> },
                { key: 'issue', header: 'Issued', hideBelow: 'lg', cell: (r) => <span className="text-muted">{fmt.date(r.quote.issueDate)}</span> },
                { key: 'exp', header: 'Valid until', cell: (r) => <span className="text-muted">{fmt.date(r.quote.expiryDate)}</span> },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (r) => (
                    <span className="flex flex-wrap gap-1.5">
                      <QuotationStatusBadge status={r.status} />
                      {r.quote.convertedInvoiceId && <Badge tone="neutral" dot={false}>Invoiced</Badge>}
                    </span>
                  ),
                },
                { key: 'total', header: 'Total', align: 'right', cell: (r) => <span className="num">{fmt.money(r.quote.total, r.quote.currency)}</span> },
              ]}
              mobile={(r) => (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="num font-mono text-xs text-muted">{r.quote.number}</span>
                    <QuotationStatusBadge status={r.status} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-text">{clientDisplayName(r.quote.clientSnapshot)}</span>
                    <span className="num shrink-0 text-sm font-medium">{fmt.money(r.quote.total, r.quote.currency)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-faint">Valid until {fmt.date(r.quote.expiryDate)}</div>
                </div>
              )}
            />
          )}
        </Card>
      )}
    </>
  );
}

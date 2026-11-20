import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileText, FolderKanban, Mail, MapPin, Pencil, Phone, Plus, ScrollText, Trash2, Users } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ClientStatusBadge, InvoiceStatusBadge, ProjectStatusBadge, QuotationStatusBadge } from '@/components/ui/Badge';
import { ActionMenu, EmptyState, PageHeader, Spinner, StatCard, Tabs } from '@/components/ui/Layout';
import { useConfirm } from '@/components/ui/Confirm';
import { ClientFormModal } from '@/components/forms/ClientFormModal';
import { ProjectFormModal } from '@/components/forms/ProjectFormModal';
import { PAYMENT_METHOD_LABELS } from '@/domain/defaults';
import { invoiceStatus, quotationStatus } from '@/domain/status';
import type { Address } from '@/domain/types';
import { useFormat, useToday } from '@/hooks/useApp';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useDataset } from '@/hooks/useLiveData';
import { clientFinancials } from '@/services/analytics';
import { clientDisplayName, deleteClient } from '@/services/clientService';
import { Initials } from './ClientsPage';

type Tab = 'invoices' | 'quotations' | 'projects' | 'payments';

const fmtAddress = (a: Address) => [a.line1, a.line2, a.city, a.province, a.postalCode, a.country].filter((x) => x.trim()).join(', ');

export default function ClientDetailPage() {
  const { id = '' } = useParams();
  const data = useDataset();
  const today = useToday();
  const fmt = useFormat();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { run } = useAsyncAction();
  const [tab, setTab] = useState<Tab>('invoices');
  const [edit, setEdit] = useState(false);
  const [projectModal, setProjectModal] = useState(false);

  if (!data) return <Spinner />;
  const client = data.clients.find((c) => c.id === id);
  if (!client) {
    return (
      <Card>
        <EmptyState icon={<Users className="h-6 w-6" />} title="Client not found" action={<ButtonLink to="/clients">Back to clients</ButtonLink>} />
      </Card>
    );
  }

  const fin = clientFinancials(client.id, data, today);
  const invoices = data.invoices.filter((i) => i.clientId === id).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const quotations = data.quotations.filter((q) => q.clientId === id).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const projects = data.projects.filter((p) => p.clientId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const invoiceById = new Map(data.invoices.map((i) => [i.id, i]));
  const payments = data.payments.filter((p) => p.clientId === id).sort((a, b) => b.date.localeCompare(a.date));
  const billing = client.billingSameAsPhysical ? client.physicalAddress : client.billingAddress;

  const remove = async () => {
    const { confirmed } = await confirm({
      title: `Delete ${clientDisplayName(client)}?`,
      message: 'This permanently removes the client. Clients with invoices, quotations, projects or payments cannot be deleted — set them to Inactive instead.',
      confirmLabel: 'Delete client',
    });
    if (confirmed && (await run(() => deleteClient(client.id).then(() => true), { success: 'Client deleted' }))) navigate('/clients', { replace: true });
  };

  const Row = ({ to, left, sub, right, badge }: { to: string; left: string; sub: string; right: string; badge: React.ReactNode }) => (
    <li>
      <Link to={to} className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-white/[0.02]">
        <div className="min-w-0">
          <div className="num truncate font-mono text-sm text-text">{left}</div>
          <div className="truncate text-xs text-faint">{sub}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {badge}
          <span className="num w-28 text-right text-sm">{right}</span>
        </div>
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader
        back={{ to: '/clients', label: 'Clients' }}
        title={
          <span className="flex items-center gap-4">
            <Initials name={clientDisplayName(client)} size="lg" />
            <span className="min-w-0">
              <span className="block truncate">{clientDisplayName(client)}</span>
              <span className="mt-1 flex items-center gap-2 text-sm font-normal text-muted">
                <ClientStatusBadge status={client.status} />
                {client.companyName && client.name && <span className="truncate">{client.name}</span>}
              </span>
            </span>
          </span>
        }
        actions={
          <>
            <ButtonLink to={`/quotations/new?client=${client.id}`} variant="secondary" icon={<ScrollText className="h-4 w-4" />}>
              Quote
            </ButtonLink>
            <ButtonLink to={`/invoices/new?client=${client.id}`} variant="primary" icon={<FileText className="h-4 w-4" />}>
              Invoice
            </ButtonLink>
            <ActionMenu
              items={[
                { label: 'Edit client', icon: <Pencil />, onClick: () => setEdit(true) },
                { label: 'New project', icon: <FolderKanban />, onClick: () => setProjectModal(true) },
                { label: 'Delete client', icon: <Trash2 />, tone: 'danger', onClick: () => void remove() },
              ]}
            />
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Lifetime billing" value={fmt.money(fin.lifetimeBilling)} hint={`${fin.invoiceCount} invoice${fin.invoiceCount === 1 ? '' : 's'}`} />
        <StatCard label="Payments received" value={fmt.money(fin.paymentsReceived)} tone="success" hint={`${payments.length} payment${payments.length === 1 ? '' : 's'}`} />
        <StatCard label="Outstanding" value={fmt.money(fin.outstanding)} tone={fin.outstanding ? 'warning' : 'neutral'} hint={fin.overdue ? <span className="text-danger">{fmt.money(fin.overdue)} overdue</span> : 'Nothing overdue'} />
        <StatCard label="Projects" value={fin.projectCount} hint={`${fin.quotationCount} quotation${fin.quotationCount === 1 ? '' : 's'}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Card>
            <div className="border-b border-border p-4">
              <Tabs<Tab>
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: 'invoices', label: 'Invoices', count: invoices.length },
                  { value: 'quotations', label: 'Quotations', count: quotations.length },
                  { value: 'projects', label: 'Projects', count: projects.length },
                  { value: 'payments', label: 'Payments', count: payments.length },
                ]}
              />
            </div>
            <CardBody className="pt-2">
              {tab === 'invoices' &&
                (invoices.length ? (
                  <ul className="divide-y divide-border/60">
                    {invoices.map((i) => (
                      <Row key={i.id} to={`/invoices/${i.id}`} left={i.number} sub={`Issued ${fmt.date(i.issueDate)} · Due ${fmt.date(i.dueDate)}`} right={fmt.money(i.total, i.currency)} badge={<InvoiceStatusBadge status={invoiceStatus(i, today)} />} />
                    ))}
                  </ul>
                ) : (
                  <Empty label="No invoices for this client yet." action={<ButtonLink size="sm" to={`/invoices/new?client=${client.id}`} variant="subtle" icon={<Plus className="h-3.5 w-3.5" />}>New invoice</ButtonLink>} />
                ))}
              {tab === 'quotations' &&
                (quotations.length ? (
                  <ul className="divide-y divide-border/60">
                    {quotations.map((q) => (
                      <Row key={q.id} to={`/quotations/${q.id}`} left={q.number} sub={`Valid until ${fmt.date(q.expiryDate)}`} right={fmt.money(q.total, q.currency)} badge={<QuotationStatusBadge status={quotationStatus(q, today)} />} />
                    ))}
                  </ul>
                ) : (
                  <Empty label="No quotations for this client yet." action={<ButtonLink size="sm" to={`/quotations/new?client=${client.id}`} variant="subtle" icon={<Plus className="h-3.5 w-3.5" />}>New quotation</ButtonLink>} />
                ))}
              {tab === 'projects' &&
                (projects.length ? (
                  <ul className="divide-y divide-border/60">
                    {projects.map((p) => (
                      <li key={p.id}>
                        <Link to={`/projects/${p.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-white/[0.02]">
                          <div className="min-w-0">
                            <div className="truncate text-sm text-text">{p.name}</div>
                            <div className="text-xs text-faint">{p.category}</div>
                          </div>
                          <ProjectStatusBadge status={p.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty label="No projects for this client yet." action={<Button size="sm" variant="subtle" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setProjectModal(true)}>New project</Button>} />
                ))}
              {tab === 'payments' &&
                (payments.length ? (
                  <ul className="divide-y divide-border/60">
                    {payments.map((p) => {
                      const inv = invoiceById.get(p.invoiceId);
                      return (
                        <li key={p.id}>
                          <Link to={inv ? `/invoices/${inv.id}` : '/payments'} className="flex items-center justify-between gap-3 py-3 hover:bg-white/[0.02]">
                            <div className="min-w-0">
                              <div className="num truncate font-mono text-sm text-text">{p.reference}</div>
                              <div className="truncate text-xs text-faint">
                                {fmt.date(p.date)} · {PAYMENT_METHOD_LABELS[p.method]} · {inv?.number ?? 'Unknown invoice'}
                              </div>
                            </div>
                            <span className="num shrink-0 text-sm text-success">{fmt.money(p.amount)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <Empty label="No payments received from this client yet." />
                ))}
            </CardBody>
          </Card>
        </div>
        <aside className="space-y-6 lg:col-span-4">
          <Card>
            <CardHeader title="Contact" action={<Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEdit(true)}>Edit</Button>} />
            <CardBody className="space-y-3 text-sm">
              {client.email && (
                <a href={`mailto:${client.email}`} className="flex items-center gap-2.5 text-muted hover:text-text">
                  <Mail className="h-4 w-4 shrink-0 text-faint" /> <span className="truncate">{client.email}</span>
                </a>
              )}
              {client.phone && (
                <a href={`tel:${client.phone.replace(/\s/g, '')}`} className="flex items-center gap-2.5 text-muted hover:text-text">
                  <Phone className="h-4 w-4 shrink-0 text-faint" /> {client.phone}
                </a>
              )}
              {fmtAddress(client.physicalAddress) && (
                <p className="flex items-start gap-2.5 text-muted">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-faint" /> {fmtAddress(client.physicalAddress)}
                </p>
              )}
              {!client.email && !client.phone && !fmtAddress(client.physicalAddress) && <p className="text-faint">No contact details yet.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Billing" />
            <CardBody className="space-y-2 text-sm text-muted">
              <p>{fmtAddress(billing) || <span className="text-faint">No billing address</span>}</p>
              {client.registrationNumber && <p>Reg. No: {client.registrationNumber}</p>}
              {client.vatNumber && <p>VAT No: {client.vatNumber}</p>}
              <p className="pt-2 text-xs text-faint">Client since {fmt.date(client.createdAt.slice(0, 10))}</p>
            </CardBody>
          </Card>
          {client.notes && (
            <Card>
              <CardHeader title="Notes" />
              <CardBody>
                <p className="text-sm whitespace-pre-line text-muted">{client.notes}</p>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
      <ClientFormModal open={edit} onClose={() => setEdit(false)} client={client} />
      <ProjectFormModal open={projectModal} onClose={() => setProjectModal(false)} defaultClientId={client.id} />
    </>
  );
}

function Empty({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm text-faint">{label}</p>
      {action}
    </div>
  );
}

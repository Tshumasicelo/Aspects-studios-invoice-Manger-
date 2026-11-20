import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Briefcase, Clock, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ActionMenu, EmptyState, PageHeader, Spinner, Tabs } from '@/components/ui/Layout';
import { SearchInput, Select } from '@/components/ui/Field';
import { useConfirm } from '@/components/ui/Confirm';
import { ServiceFormModal } from '@/components/forms/ServiceFormModal';
import { store } from '@/data/store';
import { PRICING_MODEL_LABELS } from '@/domain/defaults';
import type { Service } from '@/domain/types';
import { useFormat } from '@/hooks/useApp';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useLiveData } from '@/hooks/useLiveData';
import { deleteService, restoreDefaultServices, setServiceArchived } from '@/services/catalogService';

const unitSuffix: Record<Service['pricingModel'], string> = { fixed: '', hourly: ' / hour', daily: ' / day', custom: '' };

export default function ServicesPage() {
  const services = useLiveData(() => store().services.list(), []);
  const fmt = useFormat();
  const confirm = useConfirm();
  const { run } = useAsyncAction();
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Service | null>(null);
  const [modal, setModal] = useState(false);

  const categories = useMemo(() => [...new Set((services ?? []).map((s) => s.category))].sort(), [services]);
  const grouped = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (services ?? [])
      .filter((s) => (tab === 'archived' ? s.archived : !s.archived))
      .filter((s) => !category || s.category === category)
      .filter((s) => !term || `${s.name} ${s.description} ${s.category}`.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
    const map = new Map<string, Service[]>();
    for (const s of list) map.set(s.category, [...(map.get(s.category) ?? []), s]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [services, tab, q, category]);

  if (!services) return <Spinner />;
  const unpriced = services.filter((s) => !s.archived && s.defaultPrice === 0 && s.pricingModel !== 'custom').length;

  const open = (s: Service | null) => {
    setEditing(s);
    setModal(true);
  };

  return (
    <>
      <PageHeader
        kicker="Catalogue"
        title="Services"
        subtitle="Reusable services with professional descriptions. Select them when preparing quotations and invoices."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => open(null)}>
            New service
          </Button>
        }
      />
      {unpriced > 0 && tab === 'active' && (
        <div className="mb-5 rounded-xl border border-blue/25 bg-blue/[0.06] px-4 py-3 text-sm text-muted">
          <span className="text-text">{unpriced} service{unpriced === 1 ? ' has' : 's have'} no default price yet.</span> Set your rates so they fill in automatically — you can still adjust prices per document.
        </div>
      )}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'active', label: 'Active', count: services.filter((s) => !s.archived).length },
            { value: 'archived', label: 'Archived', count: services.filter((s) => s.archived).length },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2 md:w-[32rem]">
          <SearchInput value={q} onChange={setQ} placeholder="Search services…" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {grouped.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Briefcase className="h-6 w-6" />}
            title={tab === 'archived' ? 'No archived services' : services.length ? 'No services match' : 'Your catalogue is empty'}
            description={tab === 'active' && !services.length ? 'Restore the standard ASPECTS STUDIOS services, or create your own.' : undefined}
            action={
              tab === 'active' && !services.length ? (
                <Button variant="primary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void run(restoreDefaultServices, { success: 'Standard services restored' })}>
                  Restore standard services
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(([cat, list]) => (
            <section key={cat}>
              <h2 className="kicker mb-3">{cat}</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {list.map((s) => (
                  <Card key={s.id} className="group flex flex-col p-5 transition-colors hover:border-border-strong">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-[0.95rem] leading-snug font-semibold text-text">{s.name}</h3>
                      <ActionMenu
                        items={[
                          { label: 'Edit', icon: <Pencil />, onClick: () => open(s) },
                          {
                            label: s.archived ? 'Restore' : 'Archive',
                            icon: s.archived ? <ArchiveRestore /> : <Archive />,
                            onClick: () => void run(() => setServiceArchived(s.id, !s.archived), { success: s.archived ? 'Service restored' : 'Service archived' }),
                          },
                          {
                            label: 'Delete',
                            icon: <Trash2 />,
                            tone: 'danger',
                            onClick: async () => {
                              const { confirmed } = await confirm({
                                title: `Delete “${s.name}”?`,
                                message: 'Existing invoices and quotations keep their own copy of this service, so they are not affected. Consider archiving instead if you might use it again.',
                                confirmLabel: 'Delete service',
                              });
                              if (confirmed) await run(() => deleteService(s.id), { success: 'Service deleted' });
                            },
                          },
                        ]}
                      />
                    </div>
                    <p className="mt-2 line-clamp-4 flex-1 text-xs leading-relaxed text-muted">{s.description || <span className="text-faint">No description</span>}</p>
                    <div className="mt-4 flex items-end justify-between gap-2 border-t border-border/70 pt-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="muted" dot={false}>
                          {PRICING_MODEL_LABELS[s.pricingModel]}
                        </Badge>
                        {s.deliveryEstimate && (
                          <span className="inline-flex items-center gap-1 text-[0.7rem] text-faint">
                            <Clock className="h-3 w-3" /> {s.deliveryEstimate}
                          </span>
                        )}
                      </div>
                      <button type="button" onClick={() => open(s)} className="num text-right text-sm font-semibold text-text hover:text-blue">
                        {s.defaultPrice ? `${fmt.money(s.defaultPrice)}${unitSuffix[s.pricingModel]}` : <span className="text-xs font-normal text-blue">Set price</span>}
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {tab === 'active' && services.length > 0 && (
        <div className="mt-8 text-center">
          <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => void run(async () => {
            const n = await restoreDefaultServices();
            return n;
          }, { success: 'Standard services checked', successMessage: 'Any missing standard services have been re-added.' })}>
            Re-add missing standard services
          </Button>
        </div>
      )}
      <ServiceFormModal open={modal} onClose={() => setModal(false)} service={editing} />
    </>
  );
}

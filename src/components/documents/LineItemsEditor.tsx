import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Briefcase, PenLine, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, MoneyInput, SearchInput, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { lineTotal } from '@/domain/calculations';
import { PRICING_MODEL_LABELS, PRICING_MODEL_UNITS, VAT_CATEGORY_LABELS } from '@/domain/defaults';
import type { LineItem, Service, VatCategory } from '@/domain/types';
import { useFormat } from '@/hooks/useApp';
import { lineFromService, newLineItem } from '@/services/documentCommon';
import type { ValidationErrors } from '@/domain/validation';

export function LineItemsEditor({
  items,
  onChange,
  services,
  vatEnabled,
  currency,
  errors,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  services: Service[];
  vatEnabled: boolean;
  currency: string;
  errors: ValidationErrors;
}) {
  const fmt = useFormat();
  const [picker, setPicker] = useState(false);

  const update = (id: string, patch: Partial<LineItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id: string) => onChange(items.filter((i) => i.id !== id));
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...items];
    const [it] = next.splice(idx, 1);
    next.splice(idx + dir, 0, it);
    onChange(next);
  };

  return (
    <div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-bg-2/50 px-6 py-10 text-center">
          <p className="text-sm text-muted">No line items yet.</p>
          <p className="mt-1 text-xs text-faint">Add a service from your catalogue, or a custom item.</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((item, idx) => {
            const service = item.serviceId ? services.find((s) => s.id === item.serviceId) : undefined;
            const unit = service ? PRICING_MODEL_UNITS[service.pricingModel] : 'item';
            return (
              <li key={item.id} className="rounded-xl border border-border bg-bg-2/60 p-3 md:p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-faint">
                    <span className="num font-mono">{String(idx + 1).padStart(2, '0')}</span>
                    {service ? <Badge tone="blue" dot={false}>Catalogue · {PRICING_MODEL_LABELS[service.pricingModel]}</Badge> : <Badge tone="muted" dot={false}>Custom item</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move up" disabled={idx === 0} onClick={() => move(idx, -1)} icon={<ArrowUp className="h-3.5 w-3.5" />} />
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move down" disabled={idx === items.length - 1} onClick={() => move(idx, 1)} icon={<ArrowDown className="h-3.5 w-3.5" />} />
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-danger" aria-label="Remove line" onClick={() => remove(item.id)} icon={<Trash2 className="h-3.5 w-3.5" />} />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-12">
                  <Field label="Item" htmlFor={`li-t-${item.id}`} error={errors[`items.${idx}.title`]} className="md:col-span-12">
                    <Input id={`li-t-${item.id}`} value={item.title} onChange={(e) => update(item.id, { title: e.target.value })} invalid={!!errors[`items.${idx}.title`]} />
                  </Field>
                  <Field label="Description" htmlFor={`li-d-${item.id}`} className="md:col-span-12" hint={service ? 'Edits apply to this document only — the catalogue entry is unchanged.' : undefined}>
                    <Textarea id={`li-d-${item.id}`} rows={2} value={item.description} onChange={(e) => update(item.id, { description: e.target.value })} />
                  </Field>
                  <Field label={`Qty (${unit}s)`} htmlFor={`li-q-${item.id}`} error={errors[`items.${idx}.quantity`]} className="md:col-span-2">
                    <Input
                      id={`li-q-${item.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      className="num text-right"
                      value={Number.isFinite(item.quantity) ? item.quantity : ''}
                      invalid={!!errors[`items.${idx}.quantity`]}
                      onChange={(e) => update(item.id, { quantity: e.target.value === '' ? NaN : Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Unit price" htmlFor={`li-p-${item.id}`} error={errors[`items.${idx}.unitPrice`]} className="md:col-span-4">
                    <MoneyInput id={`li-p-${item.id}`} value={item.unitPrice} currency={currency} onChange={(c) => update(item.id, { unitPrice: c })} />
                  </Field>
                  {vatEnabled ? (
                    <Field label="VAT treatment" htmlFor={`li-v-${item.id}`} className="md:col-span-3">
                      <Select id={`li-v-${item.id}`} value={item.vatCategory} onChange={(e) => update(item.id, { vatCategory: e.target.value as VatCategory })}>
                        {Object.entries(VAT_CATEGORY_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : (
                    <div className="hidden md:col-span-3 md:block" />
                  )}
                  <div className="flex items-end justify-between gap-2 md:col-span-3 md:flex-col md:items-end md:justify-end">
                    <span className="label mb-0 md:mb-1.5">Line total</span>
                    <span className="num pb-2 font-display text-base font-semibold">{fmt.money(lineTotal(item), currency)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {errors.items && <p className="mt-2 text-xs text-danger">{errors.items}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" icon={<Briefcase className="h-4 w-4" />} onClick={() => setPicker(true)}>
          Add from catalogue
        </Button>
        <Button variant="ghost" icon={<PenLine className="h-4 w-4" />} onClick={() => onChange([...items, newLineItem()])}>
          Add custom item
        </Button>
      </div>
      <ServicePicker
        open={picker}
        onClose={() => setPicker(false)}
        services={services}
        currency={currency}
        onPick={(s) => {
          onChange([...items, lineFromService(s)]);
          setPicker(false);
        }}
      />
    </div>
  );
}

function ServicePicker({
  open,
  onClose,
  services,
  onPick,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  services: Service[];
  onPick: (s: Service) => void;
  currency: string;
}) {
  const fmt = useFormat();
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return services
      .filter((s) => !s.archived)
      .filter((s) => !term || `${s.name} ${s.category} ${s.description}`.toLowerCase().includes(term))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [services, q]);

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Add from service catalogue" description="The service's description and price are copied onto this document, where you can adjust them.">
      <SearchInput value={q} onChange={setQ} placeholder="Search services…" className="mb-4" />
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No matching services. Add services in the Services section.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className="group w-full rounded-xl border border-border bg-bg-2/60 p-3 text-left transition-colors hover:border-blue/50 hover:bg-blue/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text">{s.name}</div>
                    <div className="mt-0.5 text-xs text-faint">{s.category} · {PRICING_MODEL_LABELS[s.pricingModel]}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="num text-sm text-accent">{s.defaultPrice ? fmt.money(s.defaultPrice, currency) : 'Set price'}</span>
                    <Plus className="h-4 w-4 text-faint group-hover:text-blue" />
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{s.description}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

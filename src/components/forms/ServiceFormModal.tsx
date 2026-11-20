import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { PRICING_MODEL_LABELS, SERVICE_CATEGORIES } from '@/domain/defaults';
import type { PricingModel, Service } from '@/domain/types';
import { validateService, type ValidationErrors } from '@/domain/validation';
import { emptyService, saveService, type ServiceInput } from '@/services/catalogService';
import { useSettings } from '@/hooks/useApp';

export function ServiceFormModal({ open, onClose, service }: { open: boolean; onClose: () => void; service?: Service | null }) {
  const toast = useToast();
  const settings = useSettings();
  const [values, setValues] = useState<ServiceInput>(emptyService());
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (service) {
      const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = service;
      setValues(rest);
    } else setValues(emptyService());
    setErrors({});
  }, [open, service]);

  const set = <K extends keyof ServiceInput>(k: K, v: ServiceInput[K]) => setValues((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateService(values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await saveService(values, service?.id);
      toast.success(service ? 'Service updated' : 'Service added', values.name);
      onClose();
    } catch (err) {
      toast.error('Could not save service', err);
    } finally {
      setSaving(false);
    }
  };

  const priceLabel = {
    fixed: 'Default price',
    hourly: 'Hourly rate',
    daily: 'Day rate',
    custom: 'Indicative price (optional)',
  }[values.pricingModel];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={service ? 'Edit service' : 'New service'}
      description="Catalogue descriptions are copied onto documents. Editing them later never changes invoices already created."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="service-form" loading={saving}>
            {service ? 'Save changes' : 'Add service'}
          </Button>
        </>
      }
    >
      <form id="service-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Service name" htmlFor="s-name" error={errors.name} required className="sm:col-span-2">
          <Input id="s-name" value={values.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />
        </Field>
        <Field label="Category" htmlFor="s-cat" error={errors.category}>
          <Input id="s-cat" list="service-categories" value={values.category} onChange={(e) => set('category', e.target.value)} />
          <datalist id="service-categories">
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Pricing model" htmlFor="s-model">
          <Select id="s-model" value={values.pricingModel} onChange={(e) => set('pricingModel', e.target.value as PricingModel)}>
            {Object.entries(PRICING_MODEL_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={priceLabel} htmlFor="s-price" error={errors.defaultPrice}>
          <MoneyInput id="s-price" value={values.defaultPrice} onChange={(c) => set('defaultPrice', c)} currency={settings.currency} />
        </Field>
        <Field label="Estimated delivery (optional)" htmlFor="s-delivery">
          <Input id="s-delivery" value={values.deliveryEstimate} onChange={(e) => set('deliveryEstimate', e.target.value)} placeholder="e.g. 2–4 weeks" />
        </Field>
        <Field label="Professional description" htmlFor="s-desc" className="sm:col-span-2" hint="Appears under the item name on invoices and quotations.">
          <Textarea id="s-desc" rows={5} value={values.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Internal notes (optional)" htmlFor="s-notes" className="sm:col-span-2" hint="Never shown to clients.">
          <Textarea id="s-notes" rows={2} value={values.internalNotes} onChange={(e) => set('internalNotes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

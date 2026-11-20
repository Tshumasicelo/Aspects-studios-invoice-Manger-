import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { store } from '@/data/store';
import { CLIENT_STATUS_LABELS } from '@/domain/defaults';
import type { Client, ClientStatus } from '@/domain/types';
import { validateClient, type ValidationErrors } from '@/domain/validation';
import { useLiveData } from '@/hooks/useLiveData';
import { clientDisplayName, emptyClient, findPossibleDuplicates, saveClient, type ClientInput } from '@/services/clientService';
import { errorMessage } from '@/services/errors';
import { AddressFields } from './AddressFields';

export function ClientFormModal({
  open,
  onClose,
  client,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  client?: Client | null;
  onSaved?: (c: Client) => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState<ClientInput>(emptyClient());
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const [duplicateAck, setDuplicateAck] = useState(false);
  const clients = useLiveData(() => store().clients.list(), []) ?? [];

  useEffect(() => {
    if (!open) return;
    if (client) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = client;
      setValues(rest);
    } else setValues(emptyClient());
    setErrors({});
    setDuplicateAck(false);
  }, [open, client]);

  const duplicates = useMemo(
    () => (values.name || values.companyName || values.email ? findPossibleDuplicates(values, clients, client?.id) : []),
    [values, clients, client?.id],
  );

  const set = <K extends keyof ClientInput>(k: K, v: ClientInput[K]) => setValues((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateClient(values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (duplicates.length && !duplicateAck) {
      setDuplicateAck(true);
      return;
    }
    setSaving(true);
    try {
      const saved = await saveClient(values, client?.id);
      toast.success(client ? 'Client updated' : 'Client created', clientDisplayName(saved));
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error('Could not save client', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={client ? 'Edit client' : 'New client'}
      description="Client details appear on invoices and quotations. Either a contact name or a company name is required."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="client-form" loading={saving}>
            {duplicates.length && duplicateAck ? 'Save anyway' : client ? 'Save changes' : 'Create client'}
          </Button>
        </>
      }
    >
      <form id="client-form" onSubmit={submit} className="space-y-6" noValidate>
        {duplicates.length > 0 && (
          <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-warning">Possible duplicate</p>
              <p className="mt-0.5 text-xs text-muted">
                A client with the same {duplicates.some((d) => d.email && d.email === values.email.trim().toLowerCase()) ? 'email' : 'name'} already
                exists: <span className="text-text">{duplicates.map((d) => clientDisplayName(d)).join(', ')}</span>.
                {duplicateAck ? ' Press “Save anyway” to create it regardless.' : ''}
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name" htmlFor="c-name" error={errors.name}>
            <Input id="c-name" value={values.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} autoComplete="name" />
          </Field>
          <Field label="Company name" htmlFor="c-company">
            <Input id="c-company" value={values.companyName} onChange={(e) => set('companyName', e.target.value)} autoComplete="organization" />
          </Field>
          <Field label="Email" htmlFor="c-email" error={errors.email}>
            <Input id="c-email" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} autoComplete="email" />
          </Field>
          <Field label="Telephone" htmlFor="c-phone" error={errors.phone}>
            <Input id="c-phone" type="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} invalid={!!errors.phone} autoComplete="tel" placeholder="+27 …" />
          </Field>
          <Field label="Company registration no. (optional)" htmlFor="c-reg">
            <Input id="c-reg" value={values.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value)} />
          </Field>
          <Field label="VAT number (optional)" htmlFor="c-vat">
            <Input id="c-vat" value={values.vatNumber} onChange={(e) => set('vatNumber', e.target.value)} />
          </Field>
          <Field label="Status" htmlFor="c-status">
            <Select id="c-status" value={values.status} onChange={(e) => set('status', e.target.value as ClientStatus)}>
              {Object.entries(CLIENT_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="space-y-3">
          <legend className="kicker mb-3">Physical address</legend>
          <AddressFields idPrefix="c-phys" value={values.physicalAddress} onChange={(a) => set('physicalAddress', a)} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="kicker mb-3">Billing address</legend>
          <Checkbox
            checked={values.billingSameAsPhysical}
            onChange={(v) => set('billingSameAsPhysical', v)}
            label="Same as physical address"
          />
          {!values.billingSameAsPhysical && (
            <AddressFields idPrefix="c-bill" value={values.billingAddress} onChange={(a) => set('billingAddress', a)} />
          )}
        </fieldset>

        <Field label="Notes" htmlFor="c-notes" hint="Internal only — never shown on documents.">
          <Textarea id="c-notes" value={values.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { EXPENSE_CATEGORIES, PAYMENT_METHOD_LABELS } from '@/domain/defaults';
import { todayISO } from '@/domain/dates';
import type { Expense, PaymentMethod } from '@/domain/types';
import { validateExpense, type ValidationErrors } from '@/domain/validation';
import { saveExpense, type ExpenseInput } from '@/services/projectService';
import { useSettings } from '@/hooks/useApp';

const empty = (): ExpenseInput => ({
  description: '',
  category: EXPENSE_CATEGORIES[0],
  amount: 0,
  date: todayISO(),
  paymentMethod: 'card',
  supplier: '',
  reference: '',
  notes: '',
});

export function ExpenseFormModal({ open, onClose, expense }: { open: boolean; onClose: () => void; expense?: Expense | null }) {
  const toast = useToast();
  const settings = useSettings();
  const [values, setValues] = useState<ExpenseInput>(empty());
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (expense) {
      const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = expense;
      setValues(rest);
    } else setValues(empty());
    setErrors({});
  }, [open, expense]);

  const set = <K extends keyof ExpenseInput>(k: K, v: ExpenseInput[K]) => setValues((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateExpense(values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await saveExpense(values, expense?.id);
      toast.success(expense ? 'Expense updated' : 'Expense recorded');
      onClose();
    } catch (err) {
      toast.error('Could not save expense', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={expense ? 'Edit expense' : 'Add expense'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="expense-form" loading={saving}>
            {expense ? 'Save changes' : 'Add expense'}
          </Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Description" htmlFor="x-desc" error={errors.description} required className="sm:col-span-2">
          <Input id="x-desc" value={values.description} onChange={(e) => set('description', e.target.value)} invalid={!!errors.description} placeholder="e.g. Figma subscription" />
        </Field>
        <Field label="Amount" htmlFor="x-amount" error={errors.amount} required>
          <MoneyInput id="x-amount" value={values.amount} onChange={(c) => set('amount', c)} currency={settings.currency} invalid={!!errors.amount} />
        </Field>
        <Field label="Date" htmlFor="x-date" error={errors.date} required>
          <Input id="x-date" type="date" value={values.date} onChange={(e) => set('date', e.target.value)} invalid={!!errors.date} />
        </Field>
        <Field label="Category" htmlFor="x-cat" error={errors.category}>
          <Input id="x-cat" list="expense-categories" value={values.category} onChange={(e) => set('category', e.target.value)} />
          <datalist id="expense-categories">
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Payment method" htmlFor="x-method">
          <Select id="x-method" value={values.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value as PaymentMethod)}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Supplier" htmlFor="x-supplier">
          <Input id="x-supplier" value={values.supplier} onChange={(e) => set('supplier', e.target.value)} />
        </Field>
        <Field label="Reference" htmlFor="x-ref">
          <Input id="x-ref" value={values.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Receipt / invoice no." />
        </Field>
        <Field label="Notes" htmlFor="x-notes" className="sm:col-span-2">
          <Textarea id="x-notes" rows={2} value={values.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

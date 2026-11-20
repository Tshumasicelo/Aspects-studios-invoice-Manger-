import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { store } from '@/data/store';
import { outstandingBalance } from '@/domain/calculations';
import { todayISO } from '@/domain/dates';
import { PAYMENT_METHOD_LABELS } from '@/domain/defaults';
import type { Payment, PaymentMethod } from '@/domain/types';
import { useFormat } from '@/hooks/useApp';
import { useLiveData } from '@/hooks/useLiveData';
import { clientDisplayName } from '@/services/clientService';
import { recordPayment, updatePayment } from '@/services/paymentService';

/**
 * Record (or edit) a payment received outside the app. The amount is validated
 * against the invoice's outstanding balance here and again in the service.
 */
export function PaymentFormModal({
  open,
  onClose,
  invoiceId,
  payment,
}: {
  open: boolean;
  onClose: () => void;
  /** Pre-select (and lock) an invoice. */
  invoiceId?: string;
  payment?: Payment | null;
}) {
  const toast = useToast();
  const fmt = useFormat();
  const [selected, setSelected] = useState('');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>('eft');
  const [txRef, setTxRef] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  /** True once the user edits the amount — the default must never overwrite their input. */
  const amountTouched = useRef(false);

  const invoices = useLiveData(() => store().invoices.list(), []) ?? [];
  const payable = useMemo(
    () =>
      invoices
        .filter((i) => i.storedStatus === 'sent' && (outstandingBalance(i.total, i.amountPaid) > 0 || i.id === payment?.invoiceId))
        .sort((a, b) => b.number.localeCompare(a.number)),
    [invoices, payment?.invoiceId],
  );
  const invoice = invoices.find((i) => i.id === selected);
  const outstanding = invoice ? outstandingBalance(invoice.total, invoice.amountPaid) + (payment?.amount ?? 0) : 0;

  useEffect(() => {
    if (!open) return;
    setError('');
    amountTouched.current = false;
    if (payment) {
      setSelected(payment.invoiceId);
      setAmount(payment.amount);
      setDate(payment.date);
      setMethod(payment.method);
      setTxRef(payment.transactionReference);
      setNotes(payment.notes);
    } else {
      setSelected(invoiceId ?? '');
      setAmount(0);
      setDate(todayISO());
      setMethod('eft');
      setTxRef('');
      setNotes('');
    }
  }, [open, payment, invoiceId]);

  // Suggest the full outstanding balance once the chosen invoice is known — but only
  // until the user types an amount themselves (data may load after they start typing).
  const suggested = invoice ? outstandingBalance(invoice.total, invoice.amountPaid) : null;
  useEffect(() => {
    if (open && !payment && suggested !== null && !amountTouched.current) setAmount(suggested);
  }, [open, payment, selected, suggested]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!selected) return setError('Select the invoice this payment is for.');
    if (amount <= 0) return setError('Enter an amount greater than zero.');
    if (amount > outstanding) return setError(`The amount exceeds the outstanding balance of ${fmt.money(outstanding, invoice?.currency)}.`);
    setSaving(true);
    try {
      if (payment) {
        await updatePayment(payment.id, { date, amount, method, transactionReference: txRef, notes });
        toast.success('Payment updated');
      } else {
        const p = await recordPayment({ invoiceId: selected, date, amount, method, transactionReference: txRef, notes });
        toast.success('Payment recorded', `${p.reference} · ${fmt.money(p.amount, invoice?.currency)}`);
      }
      onClose();
    } catch (err) {
      toast.error('Could not save payment', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={payment ? `Edit payment ${payment.reference}` : 'Record payment'}
      description="Record money you have already received (EFT, cash, card…). This does not process any transaction."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="payment-form" loading={saving} disabled={!payment && payable.length === 0}>
            {payment ? 'Save changes' : 'Record payment'}
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Invoice" htmlFor="pay-invoice" required>
          <Select id="pay-invoice" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={!!invoiceId || !!payment}>
            <option value="">{payable.length ? 'Select an invoice…' : 'No sent invoices with an outstanding balance'}</option>
            {payable.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number} · {clientDisplayName(i.clientSnapshot)} · {fmt.money(outstandingBalance(i.total, i.amountPaid), i.currency)} due
              </option>
            ))}
          </Select>
        </Field>
        {invoice && (
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-bg-2 p-3 text-center text-xs">
            <div>
              <div className="text-faint">Total</div>
              <div className="num mt-1 font-medium">{fmt.money(invoice.total, invoice.currency)}</div>
            </div>
            <div>
              <div className="text-faint">Paid</div>
              <div className="num mt-1 font-medium text-success">{fmt.money(invoice.amountPaid - (payment?.amount ?? 0), invoice.currency)}</div>
            </div>
            <div>
              <div className="text-faint">Outstanding</div>
              <div className="num mt-1 font-medium text-warning">{fmt.money(outstanding, invoice.currency)}</div>
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount received" htmlFor="pay-amount" required>
            <MoneyInput
              id="pay-amount"
              value={amount}
              onChange={(c) => {
                amountTouched.current = true;
                setAmount(c);
              }}
              currency={invoice?.currency ?? fmt.currency}
            />
          </Field>
          <Field label="Payment date" htmlFor="pay-date" required>
            <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} />
          </Field>
          <Field label="Method" htmlFor="pay-method">
            <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Transaction reference" htmlFor="pay-ref">
            <Input id="pay-ref" value={txRef} onChange={(e) => setTxRef(e.target.value)} placeholder="Bank reference" />
          </Field>
        </div>
        <Field label="Notes" htmlFor="pay-notes">
          <Textarea id="pay-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

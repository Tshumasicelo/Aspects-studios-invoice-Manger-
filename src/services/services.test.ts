import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDataStore, store } from '@/data/store';
import { createDexieStore } from '@/data/dexie/dexieStore';
import { AspectsDatabase } from '@/data/dexie/database';
import { addDays, todayISO } from '@/domain/dates';
import { invoiceStatus } from '@/domain/status';
import { emptyClient, saveClient, deleteClient, findPossibleDuplicates } from './clientService';
import { newLineItem } from './documentCommon';
import {
  cancelInvoice,
  createInvoice,
  deleteDraftInvoice,
  duplicateInvoice,
  markInvoiceSent,
  newInvoiceValues,
  unlockForCorrection,
  updateDraftInvoice,
  invoiceToValues,
} from './invoiceService';
import { deletePayment, recordPayment } from './paymentService';
import { acceptQuotation, convertQuotationToInvoice, createQuotation, markQuotationSent, newQuotationValues } from './quotationService';
import { initialiseDatabase, saveSettings, getSettings } from './settingsService';
import { createBackup, planRestore, restoreBackup, validateBackup, clearAllData } from './backupService';
import { saveProject, emptyProject } from './projectService';
import { financialSummary, monthlySeries, revenueByService } from './analytics';
import { presetRange } from '@/domain/dates';

let dbCounter = 0;

beforeEach(async () => {
  setDataStore(createDexieStore(new AspectsDatabase(`test-db-${++dbCounter}`)));
  await initialiseDatabase();
});

async function makeClient(name = 'Acme') {
  return saveClient({ ...emptyClient(), name, companyName: `${name} (Pty) Ltd`, email: `${name.toLowerCase()}@example.com` });
}

async function makeInvoice(clientId: string, amounts: number[] = [100000]) {
  const values = await newInvoiceValues({
    clientId,
    items: amounts.map((a, i) => newLineItem({ title: `Item ${i + 1}`, unitPrice: a, quantity: 1 })),
  });
  return createInvoice(values);
}

describe('initialisation', () => {
  it('seeds the 15 catalogue services and default settings once', async () => {
    expect(await store().services.count()).toBe(15);
    await initialiseDatabase();
    expect(await store().services.count()).toBe(15);
    const settings = await getSettings();
    expect(settings.vatEnabled).toBe(false);
    expect(settings.currency).toBe('ZAR');
    expect(settings.paymentDetails).toBe('');
  });
});

describe('clients', () => {
  it('detects possible duplicates and blocks deleting clients with documents', async () => {
    const c = await makeClient();
    const all = await store().clients.list();
    expect(findPossibleDuplicates({ name: 'x', companyName: 'ACME (PTY) LTD', email: '' }, all)).toHaveLength(1);
    expect(findPossibleDuplicates({ name: 'x', companyName: '', email: 'ACME@example.com' }, all)).toHaveLength(1);
    await makeInvoice(c.id);
    await expect(deleteClient(c.id)).rejects.toThrow(/cannot be deleted/);
  });
});

describe('invoices', () => {
  it('allocates sequential, unique numbers', async () => {
    const c = await makeClient();
    const a = await makeInvoice(c.id);
    const b = await makeInvoice(c.id);
    const year = new Date().getFullYear();
    expect(a.number).toBe(`AS-INV-${year}-0001`);
    expect(b.number).toBe(`AS-INV-${year}-0002`);
    await deleteDraftInvoice(b.id);
    const d = await makeInvoice(c.id);
    expect(d.number).toBe(`AS-INV-${year}-0003`); // numbers are never reused
  });

  it('snapshots VAT settings and computes totals', async () => {
    await saveSettings({ vatEnabled: true, vatRate: 15 });
    const c = await makeClient();
    const inv = await makeInvoice(c.id, [100000, 50000]);
    expect(inv.vatEnabled).toBe(true);
    expect(inv.total).toBe(172500);
  });

  it('only allows editing drafts and supports controlled correction', async () => {
    const c = await makeClient();
    const inv = await makeInvoice(c.id);
    const edited = await updateDraftInvoice(inv.id, { ...invoiceToValues(inv), items: [newLineItem({ title: 'X', unitPrice: 200000 })] });
    expect(edited.total).toBe(200000);
    await markInvoiceSent(inv.id);
    await expect(updateDraftInvoice(inv.id, invoiceToValues(edited))).rejects.toThrow(/Only draft/);
    await expect(unlockForCorrection(inv.id, '')).rejects.toThrow(/reason/);
    const unlocked = await unlockForCorrection(inv.id, 'Wrong price');
    expect(unlocked.storedStatus).toBe('draft');
    expect(unlocked.number).toBe(inv.number);
    expect(unlocked.history.some((h) => h.note === 'Wrong price')).toBe(true);
  });

  it('duplicates with a new number and copies of the lines', async () => {
    const c = await makeClient();
    const inv = await makeInvoice(c.id);
    const dup = await duplicateInvoice(inv.id);
    expect(dup.number).not.toBe(inv.number);
    expect(dup.items[0].id).not.toBe(inv.items[0].id);
    expect(dup.total).toBe(inv.total);
  });
});

describe('payments', () => {
  it('handles partial and full payments, rejects overpayment and drafts', async () => {
    const c = await makeClient();
    const inv = await makeInvoice(c.id, [100000]);
    const pay = (amount: number) =>
      recordPayment({ invoiceId: inv.id, amount, date: todayISO(), method: 'eft', transactionReference: '', notes: '' });

    await expect(pay(1000)).rejects.toThrow(/sent/);
    await markInvoiceSent(inv.id);
    const p1 = await pay(40000);
    let current = (await store().invoices.get(inv.id))!;
    expect(current.amountPaid).toBe(40000);
    expect(invoiceStatus(current, todayISO())).toBe('partially_paid');

    await expect(pay(60001)).rejects.toThrow(/exceeds/);
    await pay(60000);
    current = (await store().invoices.get(inv.id))!;
    expect(invoiceStatus(current, todayISO())).toBe('paid');
    await expect(pay(1)).rejects.toThrow(/paid in full/);

    await expect(cancelInvoice(inv.id, 'x')).rejects.toThrow(/payments/);
    await deletePayment(p1.id);
    current = (await store().invoices.get(inv.id))!;
    expect(current.amountPaid).toBe(60000);
    expect(current.history.some((h) => h.action.includes('removed'))).toBe(true);
  });

  it('marks unpaid invoices past their due date as overdue', async () => {
    const c = await makeClient();
    const values = await newInvoiceValues({
      clientId: c.id,
      issueDate: addDays(todayISO(), -30),
      endDate: addDays(todayISO(), -1),
      items: [newLineItem({ title: 'A', unitPrice: 5000 })],
    });
    const inv = await createInvoice(values);
    await markInvoiceSent(inv.id);
    expect(invoiceStatus((await store().invoices.get(inv.id))!, todayISO())).toBe('overdue');
  });
});

describe('quotations', () => {
  it('converts an accepted quotation exactly once, preserving the quotation', async () => {
    const c = await makeClient();
    const project = await saveProject({ ...emptyProject(), name: 'Site', clientId: c.id, status: 'quoted' });
    const q = await createQuotation(
      await newQuotationValues({
        clientId: c.id,
        projectId: project.id,
        items: [newLineItem({ title: 'Website', unitPrice: 2500000 })],
        discount: { type: 'percent', value: 10 },
      }),
    );
    await expect(convertQuotationToInvoice(q.id)).rejects.toThrow(/accepted/);
    await markQuotationSent(q.id);
    await acceptQuotation(q.id);
    expect((await store().projects.get(project.id))!.status).toBe('approved');

    const first = await convertQuotationToInvoice(q.id);
    expect(first.created).toBe(true);
    expect(first.invoice.quotationId).toBe(q.id);
    expect(first.invoice.projectId).toBe(project.id);
    expect(first.invoice.total).toBe(q.total);
    expect(first.invoice.number).toMatch(/^AS-INV-/);

    const second = await convertQuotationToInvoice(q.id);
    expect(second.created).toBe(false);
    expect(second.invoice.id).toBe(first.invoice.id);
    expect(await store().invoices.count()).toBe(1);
    expect((await store().quotations.get(q.id))!.convertedInvoiceId).toBe(first.invoice.id);
  });
});

describe('analytics', () => {
  it('uses payments received (not invoices issued) for revenue', async () => {
    const c = await makeClient();
    const inv = await makeInvoice(c.id, [100000, 300000]);
    await markInvoiceSent(inv.id);
    await recordPayment({ invoiceId: inv.id, amount: 200000, date: todayISO(), method: 'cash', transactionReference: '', notes: '' });
    await store().expenses.put({
      id: 'e1', description: 'Hosting', category: 'Hosting', amount: 50000, date: todayISO(),
      paymentMethod: 'card', supplier: '', reference: '', notes: '', createdAt: '', updatedAt: '',
    });
    const data = {
      invoices: await store().invoices.list(),
      payments: await store().payments.list(),
      expenses: await store().expenses.list(),
      clients: await store().clients.list(),
      projects: [],
      quotations: [],
    };
    const range = presetRange('this_month');
    const summary = financialSummary(data, range, todayISO());
    expect(summary.revenue).toBe(200000);
    expect(summary.invoiced).toBe(400000);
    expect(summary.outstanding).toBe(200000);
    expect(summary.netProfit).toBe(150000);
    const byService = revenueByService(data, range);
    expect(byService.map((r) => r.amount)).toEqual([150000, 50000]);
    expect(monthlySeries(data, range).at(-1)!.revenue).toBe(200000);
  });
});

describe('backup & restore', () => {
  it('round-trips all data through a JSON backup (replace)', async () => {
    const c = await makeClient();
    const inv = await makeInvoice(c.id);
    await markInvoiceSent(inv.id);
    await recordPayment({ invoiceId: inv.id, amount: 1000, date: todayISO(), method: 'eft', transactionReference: 'T1', notes: '' });
    await saveSettings({ businessName: 'Backup Test' });
    const json = JSON.stringify(await createBackup());

    await clearAllData();
    expect(await store().invoices.count()).toBe(0);

    const v = validateBackup(json);
    expect(v.ok).toBe(true);
    expect(v.counts.invoices).toBe(1);
    await restoreBackup(v.backup!, 'replace');
    expect(await store().invoices.count()).toBe(1);
    expect((await store().invoices.get(inv.id))!.amountPaid).toBe(1000);
    expect((await getSettings()).businessName).toBe('Backup Test');
    // Counter restored => next invoice does not collide
    const next = await makeInvoice(c.id);
    expect(next.number).not.toBe(inv.number);
  });

  it('merges without duplicating and skips number conflicts', async () => {
    const c = await makeClient();
    await makeInvoice(c.id);
    const backup = await createBackup();
    const plan = await planRestore(backup, 'merge');
    expect(plan.added.invoices).toBe(0);
    expect(plan.skipped.invoices).toBe(1);

    const conflicting = structuredClone(backup);
    conflicting.data.invoices[0].id = 'different-id';
    const plan2 = await restoreBackup(conflicting, 'merge');
    expect(plan2.conflicts.length).toBe(1);
    expect(await store().invoices.count()).toBe(1);
  });

  it('rejects malformed backups', () => {
    expect(validateBackup('not json').ok).toBe(false);
    expect(validateBackup('{"app":"other"}').ok).toBe(false);
    const bad = { app: 'aspects-studios-invoice-manager', schemaVersion: 1, data: { invoices: [{ id: 'x', number: 'A', clientId: 'c', issueDate: 'nope' }] } };
    const v = validateBackup(JSON.stringify(bad));
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toMatch(/Invoices #1/);
    const future = { app: 'aspects-studios-invoice-manager', schemaVersion: 99, data: {} };
    expect(validateBackup(JSON.stringify(future)).errors[0]).toMatch(/newer/);
  });
});

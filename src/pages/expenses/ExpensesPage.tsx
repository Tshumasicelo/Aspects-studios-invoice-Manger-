import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { ActionMenu, EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui/Layout';
import { Input, SearchInput, Select } from '@/components/ui/Field';
import { useConfirm } from '@/components/ui/Confirm';
import { ExpenseFormModal } from '@/components/forms/ExpenseFormModal';
import { store } from '@/data/store';
import { EXPENSE_CATEGORIES, PAYMENT_METHOD_LABELS } from '@/domain/defaults';
import { monthKey } from '@/domain/dates';
import { sumCents } from '@/domain/money';
import type { Expense } from '@/domain/types';
import { useFormat, useToday } from '@/hooks/useApp';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useLiveData } from '@/hooks/useLiveData';
import { exportEntityCsv } from '@/services/exportService';
import { deleteExpense } from '@/services/projectService';

export default function ExpensesPage() {
  const expenses = useLiveData(() => store().expenses.list(), []);
  const fmt = useFormat();
  const today = useToday();
  const confirm = useConfirm();
  const { run } = useAsyncAction();
  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    if (params.get('new') === '1') {
      setModal(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const categories = useMemo(() => [...new Set([...EXPENSE_CATEGORIES, ...(expenses ?? []).map((e) => e.category)])].sort(), [expenses]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (expenses ?? [])
      .filter((e) => !category || e.category === category)
      .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
      .filter((e) => !term || [e.description, e.supplier, e.reference, e.notes].join(' ').toLowerCase().includes(term))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, q, category, from, to]);

  if (!expenses) return <Spinner />;
  const thisMonth = sumCents(expenses.filter((e) => monthKey(e.date) === monthKey(today)).map((e) => e.amount));
  const yearTotal = sumCents(expenses.filter((e) => e.date.startsWith(today.slice(0, 4))).map((e) => e.amount));

  const remove = async (e: Expense) => {
    const { confirmed } = await confirm({ title: 'Delete expense?', message: `“${e.description}” (${fmt.money(e.amount)}) will be permanently deleted.`, confirmLabel: 'Delete expense' });
    if (confirmed) await run(() => deleteExpense(e.id), { success: 'Expense deleted' });
  };
  const open = (e: Expense | null) => {
    setEditing(e);
    setModal(true);
  };

  const menu = (e: Expense) => (
    <ActionMenu
      items={[
        { label: 'Edit', icon: <Pencil />, onClick: () => open(e) },
        { label: 'Delete', icon: <Trash2 />, tone: 'danger', onClick: () => void remove(e) },
      ]}
    />
  );

  return (
    <>
      <PageHeader
        kicker="Costs"
        title="Expenses"
        subtitle="Business costs used to calculate net profit."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} disabled={!rows.length} onClick={() => void exportEntityCsv('expenses', rows)}>
              Export CSV
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => open(null)}>
              Add expense
            </Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="This month" value={fmt.money(thisMonth)} tone="danger" />
        <StatCard label="This year" value={fmt.money(yearTotal)} />
        <div className="col-span-2 lg:col-span-1">
          <StatCard label="In current view" value={fmt.money(sumCents(rows.map((r) => r.amount)))} hint={`${rows.length} expense${rows.length === 1 ? '' : 's'}`} />
        </div>
      </div>
      {expenses.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Receipt className="h-6 w-6" />}
            title="No expenses recorded"
            description="Track subscriptions, hosting, hardware and other costs to see your true net profit."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => open(null)}>
                Add first expense
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 md:p-5 lg:grid-cols-4">
            <SearchInput value={q} onChange={setQ} placeholder="Search description, supplier…" />
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" title="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" title="To date" />
          </div>
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">No expenses match these filters.</p>
          ) : (
            <DataTable
              rows={rows}
              rowKey={(e) => e.id}
              columns={[
                { key: 'date', header: 'Date', cell: (e) => <span className="text-muted">{fmt.date(e.date)}</span> },
                {
                  key: 'desc',
                  header: 'Description',
                  cell: (e) => (
                    <div className="min-w-0">
                      <div className="truncate text-text">{e.description}</div>
                      {e.supplier && <div className="truncate text-xs text-faint">{e.supplier}</div>}
                    </div>
                  ),
                },
                { key: 'cat', header: 'Category', cell: (e) => <Badge tone="muted" dot={false}>{e.category}</Badge> },
                { key: 'method', header: 'Method', hideBelow: 'lg', cell: (e) => <span className="text-muted">{PAYMENT_METHOD_LABELS[e.paymentMethod]}</span> },
                { key: 'amount', header: 'Amount', align: 'right', cell: (e) => <span className="num">{fmt.money(e.amount)}</span> },
                { key: 'act', header: <span className="sr-only">Actions</span>, align: 'right', className: 'w-12', cell: menu },
              ]}
              mobile={(e) => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-text">{e.description}</div>
                    <div className="text-xs text-faint">
                      {fmt.date(e.date)} · {e.category}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="num text-sm">{fmt.money(e.amount)}</span>
                    {menu(e)}
                  </div>
                </div>
              )}
            />
          )}
        </Card>
      )}
      <ExpenseFormModal open={modal} onClose={() => setModal(false)} expense={editing} />
    </>
  );
}

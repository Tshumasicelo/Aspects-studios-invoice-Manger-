import { store } from '@/data/store';
import type { Expense, Project } from '@/domain/types';
import { hasErrors, validateExpense, validateProject } from '@/domain/validation';
import { newId, nowISO } from '@/lib/id';
import { historyEntry } from './documentCommon';
import { BusinessRuleError } from './errors';
import { PROJECT_STATUS_LABELS } from '@/domain/defaults';

export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'history'>;

export function emptyProject(partial: Partial<ProjectInput> = {}): ProjectInput {
  return {
    name: '',
    clientId: '',
    description: '',
    category: 'Website',
    startDate: '',
    expectedCompletionDate: '',
    budget: 0,
    status: 'planning',
    quotationId: null,
    notes: '',
    ...partial,
  };
}

export async function saveProject(input: ProjectInput, id?: string): Promise<Project> {
  const errors = validateProject(input);
  if (hasErrors(errors)) throw new BusinessRuleError(Object.values(errors)[0]);
  const s = store();
  return s.transaction(async () => {
    if (!(await s.clients.get(input.clientId))) throw new BusinessRuleError('The selected client no longer exists.');
    const now = nowISO();
    const existing = id ? await s.projects.get(id) : undefined;
    const history = existing ? [...existing.history] : [historyEntry('Project created')];
    if (existing && existing.status !== input.status)
      history.push(historyEntry(`Status changed to ${PROJECT_STATUS_LABELS[input.status]}`));
    if (existing && existing.budget !== input.budget) history.push(historyEntry('Budget updated'));
    const project: Project = {
      ...input,
      name: input.name.trim(),
      id: existing?.id ?? newId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      history,
    };
    await s.projects.put(project);
    return project;
  });
}

/** Deleting a project unlinks (but never deletes) its invoices and quotations. */
export async function deleteProject(id: string): Promise<void> {
  const s = store();
  await s.transaction(async () => {
    const [invoices, quotations] = await Promise.all([s.invoices.findBy('projectId', id), s.quotations.findBy('projectId', id)]);
    const now = nowISO();
    for (const inv of invoices) await s.invoices.put({ ...inv, projectId: null, updatedAt: now });
    for (const q of quotations) await s.quotations.put({ ...q, projectId: null, updatedAt: now });
    await s.projects.delete(id);
  });
}

export type ExpenseInput = Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>;

export async function saveExpense(input: ExpenseInput, id?: string): Promise<Expense> {
  const errors = validateExpense(input);
  if (hasErrors(errors)) throw new BusinessRuleError(Object.values(errors)[0]);
  const s = store();
  const now = nowISO();
  const existing = id ? await s.expenses.get(id) : undefined;
  const expense: Expense = {
    ...input,
    description: input.description.trim(),
    supplier: input.supplier.trim(),
    reference: input.reference.trim(),
    notes: input.notes.trim(),
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await s.expenses.put(expense);
  return expense;
}

export async function deleteExpense(id: string): Promise<void> {
  await store().expenses.delete(id);
}

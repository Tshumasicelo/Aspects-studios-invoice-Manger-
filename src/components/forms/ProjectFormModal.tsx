import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { store } from '@/data/store';
import { PROJECT_CATEGORIES, PROJECT_STATUS_LABELS } from '@/domain/defaults';
import type { Project, ProjectStatus } from '@/domain/types';
import { validateProject, type ValidationErrors } from '@/domain/validation';
import { useLiveData } from '@/hooks/useLiveData';
import { useSettings } from '@/hooks/useApp';
import { clientDisplayName } from '@/services/clientService';
import { emptyProject, saveProject, type ProjectInput } from '@/services/projectService';
import { ClientFormModal } from './ClientFormModal';

export function ProjectFormModal({
  open,
  onClose,
  project,
  defaultClientId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  project?: Project | null;
  defaultClientId?: string;
  onSaved?: (p: Project) => void;
}) {
  const toast = useToast();
  const settings = useSettings();
  const [values, setValues] = useState<ProjectInput>(emptyProject());
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const [clientModal, setClientModal] = useState(false);
  const clients = useLiveData(() => store().clients.list(), []) ?? [];
  const quotations = useLiveData(() => (values.clientId ? store().quotations.findBy('clientId', values.clientId) : Promise.resolve([])), [values.clientId]) ?? [];

  useEffect(() => {
    if (!open) return;
    if (project) {
      const { id: _i, createdAt: _c, updatedAt: _u, history: _h, ...rest } = project;
      setValues(rest);
    } else setValues(emptyProject({ clientId: defaultClientId ?? '' }));
    setErrors({});
  }, [open, project, defaultClientId]);

  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setValues((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateProject(values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const saved = await saveProject(values, project?.id);
      toast.success(project ? 'Project updated' : 'Project created', saved.name);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error('Could not save project', err);
    } finally {
      setSaving(false);
    }
  };

  const sortedClients = [...clients].sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b)));

  return (
    <>
      <Modal
        open={open && !clientModal}
        onClose={onClose}
        size="lg"
        title={project ? 'Edit project' : 'New project'}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="project-form" loading={saving}>
              {project ? 'Save changes' : 'Create project'}
            </Button>
          </>
        }
      >
        <form id="project-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Project name" htmlFor="p-name" error={errors.name} required className="sm:col-span-2">
            <Input id="p-name" value={values.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />
          </Field>
          <Field label="Client" htmlFor="p-client" error={errors.clientId} required>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select
                  id="p-client"
                  value={values.clientId}
                  invalid={!!errors.clientId}
                  onChange={(e) => setValues((p) => ({ ...p, clientId: e.target.value, quotationId: null }))}
                >
                  <option value="">Select a client…</option>
                  {sortedClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {clientDisplayName(c)}
                    </option>
                  ))}
                </Select>
              </div>
              <Button size="icon" className="h-10 w-10" aria-label="New client" onClick={() => setClientModal(true)} icon={<Plus className="h-4 w-4" />} />
            </div>
          </Field>
          <Field label="Category" htmlFor="p-cat">
            <Input id="p-cat" list="project-categories" value={values.category} onChange={(e) => set('category', e.target.value)} />
            <datalist id="project-categories">
              {PROJECT_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Status" htmlFor="p-status">
            <Select id="p-status" value={values.status} onChange={(e) => set('status', e.target.value as ProjectStatus)}>
              {Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Budget" htmlFor="p-budget" error={errors.budget}>
            <MoneyInput id="p-budget" value={values.budget} onChange={(c) => set('budget', c)} currency={settings.currency} />
          </Field>
          <Field label="Start date" htmlFor="p-start">
            <Input id="p-start" type="date" value={values.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Expected completion" htmlFor="p-end" error={errors.expectedCompletionDate}>
            <Input id="p-end" type="date" value={values.expectedCompletionDate} onChange={(e) => set('expectedCompletionDate', e.target.value)} />
          </Field>
          <Field label="Associated quotation" htmlFor="p-quote" className="sm:col-span-2">
            <Select id="p-quote" value={values.quotationId ?? ''} onChange={(e) => set('quotationId', e.target.value || null)} disabled={!values.clientId}>
              <option value="">None</option>
              {quotations.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.number}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description" htmlFor="p-desc" className="sm:col-span-2">
            <Textarea id="p-desc" value={values.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field label="Internal notes" htmlFor="p-notes" className="sm:col-span-2">
            <Textarea id="p-notes" rows={2} value={values.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </form>
      </Modal>
      <ClientFormModal
        open={open && clientModal}
        onClose={() => setClientModal(false)}
        onSaved={(c) => setValues((p) => ({ ...p, clientId: c.id, quotationId: null }))}
      />
    </>
  );
}

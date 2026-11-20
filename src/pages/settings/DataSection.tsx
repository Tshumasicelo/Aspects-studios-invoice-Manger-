import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Database, Download, FileJson, HardDrive, ShieldCheck, Trash2, Upload, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { store } from '@/data/store';
import { downloadFile } from '@/lib/csv';
import { useFormat } from '@/hooks/useApp';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { cn } from '@/lib/cn';
import {
  COLLECTIONS,
  COLLECTION_LABELS,
  backupFileName,
  clearAllData,
  createBackup,
  lastBackupAt,
  markBackupTaken,
  planRestore,
  repairDerivedValues,
  restoreBackup,
  validateBackup,
  type BackupValidation,
  type RestoreMode,
  type RestorePlan,
} from '@/services/backupService';
import { EXPORT_LABELS, exportEntityCsv, type ExportEntity } from '@/services/exportService';
import { initialiseDatabase } from '@/services/settingsService';

function useStorageInfo() {
  const [info, setInfo] = useState<{ persisted: boolean; usage?: number; quota?: number }>({ persisted: false });
  const refresh = async () => {
    const persisted = await store().isPersisted();
    let usage: number | undefined;
    let quota: number | undefined;
    try {
      const est = await navigator.storage?.estimate?.();
      usage = est?.usage;
      quota = est?.quota;
    } catch {
      /* not supported */
    }
    setInfo({ persisted, usage, quota });
  };
  useEffect(() => {
    void refresh();
  }, []);
  return { info, refresh };
}

const mb = (n?: number) => (n === undefined ? '—' : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function DataSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const fmt = useFormat();
  const { run, busy } = useAsyncAction();
  const file = useRef<HTMLInputElement>(null);
  const [validation, setValidation] = useState<BackupValidation | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [last, setLast] = useState(lastBackupAt());
  const { info, refresh } = useStorageInfo();

  useEffect(() => {
    if (validation?.backup) void planRestore(validation.backup, mode).then(setPlan);
    else setPlan(null);
  }, [validation, mode]);

  const backup = async () => {
    await run(async () => {
      const data = await createBackup();
      downloadFile(JSON.stringify(data, null, 2), backupFileName(), 'application/json');
      markBackupTaken();
      setLast(lastBackupAt());
    }, { success: 'Backup downloaded', successMessage: 'Keep it somewhere safe, such as cloud storage or an external drive.' });
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      toast.error('File too large', 'Backups larger than 50 MB are not accepted.');
      return;
    }
    const text = await f.text();
    const v = validateBackup(text);
    setMode('merge');
    setValidation(v);
    if (file.current) file.current.value = '';
  };

  const doRestore = async () => {
    if (!validation?.backup) return;
    if (mode === 'replace') {
      const { confirmed } = await confirm({
        title: 'Replace all data?',
        message: 'Every record currently on this device will be deleted and replaced with the backup contents. Download a backup of the current data first if you might need it.',
        confirmLabel: 'Replace everything',
        typeToConfirm: 'REPLACE',
      });
      if (!confirmed) return;
    }
    setRestoring(true);
    try {
      const result = await restoreBackup(validation.backup, mode);
      const added = Object.values(result.added).reduce((a, b) => a + b, 0);
      const updated = Object.values(result.updated).reduce((a, b) => a + b, 0);
      toast.success('Backup restored', mode === 'replace' ? `${added} records loaded.` : `${added} added, ${updated} updated.`);
      setValidation(null);
    } catch (err) {
      toast.error('Restore failed — no changes were made', err);
    } finally {
      setRestoring(false);
    }
  };

  const clearAll = async () => {
    const { confirmed } = await confirm({
      title: 'Permanently delete all data?',
      message: (
        <div className="space-y-2">
          <p>This removes every client, invoice, quotation, project, payment, expense, service and setting stored in this browser.</p>
          <p className="text-warning">It cannot be undone unless you have a backup file.</p>
        </div>
      ),
      confirmLabel: 'Delete all data',
      typeToConfirm: 'DELETE',
    });
    if (!confirmed) return;
    await run(async () => {
      await clearAllData();
      await initialiseDatabase();
    }, { success: 'All data cleared', successMessage: 'The app has been reset to a fresh installation.' });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={<FileJson className="h-4 w-4" />} title="Backup" subtitle="Download everything (including settings and logo) as a single JSON file." />
        <CardBody className="space-y-4">
          <div className={cn('rounded-xl border px-4 py-3 text-sm', last ? 'border-border bg-bg-2/60 text-muted' : 'border-warning/30 bg-warning/10 text-warning')}>
            {last ? <>Last backup on this device: <span className="text-text">{fmt.dateTime(last)}</span></> : 'No backup has been downloaded from this device yet.'}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Download className="h-4 w-4" />} loading={busy} onClick={() => void backup()}>
              Download backup
            </Button>
            <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button icon={<Upload className="h-4 w-4" />} onClick={() => file.current?.click()}>
              Restore from backup…
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-faint">
            Restoring always shows a preview first and runs as a single transaction — if anything fails, nothing is changed.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Database className="h-4 w-4" />} title="CSV exports" subtitle="Spreadsheet-friendly files for your accountant or other tools." />
        <CardBody className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(EXPORT_LABELS) as ExportEntity[]).map((e) => (
            <Button key={e} icon={<Download className="h-4 w-4" />} onClick={() => void run(() => exportEntityCsv(e), { errorTitle: 'Export failed' })}>
              {EXPORT_LABELS[e]}
            </Button>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<HardDrive className="h-4 w-4" />} title="Storage on this device" />
        <CardBody className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">Used</span>
            <span className="num text-text">
              {mb(info.usage)} {info.quota ? <span className="text-faint">of {mb(info.quota)} available</span> : null}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">Protected from automatic clean-up</span>
            <span className={info.persisted ? 'text-success' : 'text-warning'}>{info.persisted ? 'Yes' : 'Not granted'}</span>
          </div>
          {!info.persisted && (
            <Button size="sm" icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={async () => {
              const ok = await store().requestPersistence();
              await refresh();
              if (ok) toast.success('Storage protection granted');
              else toast.info('Not granted by the browser', 'Installing the app usually allows it. Regular backups are still recommended.');
            }}>
              Request protection
            </Button>
          )}
          <div className="border-t border-border pt-3">
            <Button size="sm" variant="ghost" icon={<Wrench className="h-3.5 w-3.5" />} onClick={() => void run(async () => {
              const r = await repairDerivedValues();
              toast.success('Integrity check complete', `${r.invoicesRepaired + r.quotationsRepaired} cached total(s) corrected · ${r.orphanPayments} orphaned payment(s) found.`);
            })}>
              Run data integrity check
            </Button>
            <p className="mt-1 text-xs text-faint">Recalculates every invoice total and paid amount from its line items and payment records.</p>
          </div>
        </CardBody>
      </Card>

      <Card className="border-danger/30">
        <CardHeader icon={<AlertTriangle className="h-4 w-4 text-danger" />} title="Danger zone" />
        <CardBody className="space-y-3">
          <p className="text-sm text-muted">
            Clearing data permanently removes all records stored in this browser. Records are stored locally only, so they cannot be recovered unless you have a backup file.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download className="h-4 w-4" />} onClick={() => void backup()}>
              Back up first
            </Button>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => void clearAll()}>
              Clear all data…
            </Button>
          </div>
        </CardBody>
      </Card>

      <Modal
        open={!!validation}
        onClose={() => setValidation(null)}
        size="lg"
        title={validation?.ok ? 'Restore backup' : 'Backup cannot be restored'}
        description={validation?.backup?.exportedAt ? `Created ${fmt.dateTime(validation.backup.exportedAt)}` : undefined}
        footer={
          validation?.ok ? (
            <>
              <Button variant="ghost" onClick={() => setValidation(null)}>
                Cancel
              </Button>
              <Button variant={mode === 'replace' ? 'danger' : 'primary'} loading={restoring} onClick={() => void doRestore()}>
                {mode === 'replace' ? 'Replace all data' : 'Merge into current data'}
              </Button>
            </>
          ) : (
            <Button onClick={() => setValidation(null)}>Close</Button>
          )
        }
      >
        {validation && !validation.ok && (
          <div className="space-y-2">
            <p className="text-sm text-muted">The file failed validation, so nothing was imported:</p>
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              {validation.errors.slice(0, 25).map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
          </div>
        )}
        {validation?.ok && (
          <div className="space-y-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {(['merge', 'replace'] as RestoreMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn('rounded-xl border p-3 text-left transition-colors', mode === m ? 'border-blue bg-blue/10' : 'border-border bg-bg-2 hover:border-border-strong')}
                >
                  <div className="text-sm font-medium text-text">{m === 'merge' ? 'Merge (recommended)' : 'Replace everything'}</div>
                  <div className="mt-1 text-xs text-muted">
                    {m === 'merge'
                      ? 'Adds new records and updates older copies. Keeps your current settings. Never deletes anything.'
                      : 'Deletes all current data and settings, then loads the backup exactly.'}
                  </div>
                </button>
              ))}
            </div>
            {plan && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[0.68rem] tracking-[0.14em] text-faint uppercase">
                    <th className="py-1 text-left">Records</th>
                    <th className="py-1 text-right">In backup</th>
                    <th className="py-1 text-right">Added</th>
                    <th className="py-1 text-right">Updated</th>
                    <th className="py-1 text-right">Skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {COLLECTIONS.map((c) => (
                    <tr key={c} className="border-t border-border/60">
                      <td className="py-1.5 text-muted">{COLLECTION_LABELS[c]}</td>
                      <td className="num py-1.5 text-right">{validation.counts[c]}</td>
                      <td className="num py-1.5 text-right text-success">{plan.added[c]}</td>
                      <td className="num py-1.5 text-right text-blue">{plan.updated[c]}</td>
                      <td className="num py-1.5 text-right text-faint">{plan.skipped[c]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {[...validation.warnings, ...(plan?.conflicts ?? [])].length > 0 && (
              <ul className="space-y-1 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                {[...validation.warnings, ...(plan?.conflicts ?? [])].slice(0, 12).map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

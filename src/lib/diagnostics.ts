/**
 * Start-up diagnostics, shown when the app cannot open its on-device database.
 * Everything is read locally and shown to the user only — nothing is sent anywhere.
 */

export interface StartupDiagnostics {
  appVersion: string;
  indexedDbAvailable: boolean;
  /** Can the browser open a brand-new, empty test database? (ok / error / no response) */
  probe: 'ok' | 'error' | 'timeout' | 'unavailable';
  probeError?: string;
  storagePersisted: boolean | null;
  storageUsed?: string;
  storageQuota?: string;
  serviceWorker: 'controlling' | 'not controlling' | 'unsupported';
  online: boolean;
  standalone: boolean;
  userAgent: string;
}

const mb = (n?: number) => (n === undefined ? undefined : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Open (then delete) a throwaway database to see whether IndexedDB itself responds. */
function probeIndexedDb(timeoutMs = 4000): Promise<{ result: StartupDiagnostics['probe']; error?: string }> {
  if (typeof indexedDB === 'undefined') return Promise.resolve({ result: 'unavailable' });
  return new Promise((resolve) => {
    const name = `aspects-probe-${Date.now()}`;
    const timer = setTimeout(() => resolve({ result: 'timeout' }), timeoutMs);
    try {
      const req = indexedDB.open(name, 1);
      req.onsuccess = () => {
        clearTimeout(timer);
        req.result.close();
        try {
          indexedDB.deleteDatabase(name);
        } catch {
          /* best effort */
        }
        resolve({ result: 'ok' });
      };
      req.onerror = () => {
        clearTimeout(timer);
        resolve({ result: 'error', error: req.error?.name ?? 'Unknown error' });
      };
    } catch (err) {
      clearTimeout(timer);
      resolve({ result: 'error', error: err instanceof Error ? err.name : String(err) });
    }
  });
}

export async function collectDiagnostics(): Promise<StartupDiagnostics> {
  const probe = await probeIndexedDb();
  let storagePersisted: boolean | null = null;
  let usage: number | undefined;
  let quota: number | undefined;
  try {
    storagePersisted = (await navigator.storage?.persisted?.()) ?? null;
    const est = await navigator.storage?.estimate?.();
    usage = est?.usage;
    quota = est?.quota;
  } catch {
    /* not supported */
  }
  return {
    appVersion: __APP_VERSION__,
    indexedDbAvailable: typeof indexedDB !== 'undefined',
    probe: probe.result,
    probeError: probe.error,
    storagePersisted,
    storageUsed: mb(usage),
    storageQuota: mb(quota),
    serviceWorker: !('serviceWorker' in navigator) ? 'unsupported' : navigator.serviceWorker.controller ? 'controlling' : 'not controlling',
    online: navigator.onLine,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    userAgent: navigator.userAgent,
  };
}

export function diagnosticsText(d: StartupDiagnostics, phase: string): string {
  return [
    `Aspects Invoice Manager ${d.appVersion}`,
    `Stuck at: ${phase}`,
    `IndexedDB available: ${d.indexedDbAvailable ? 'yes' : 'no'}`,
    `IndexedDB test: ${d.probe}${d.probeError ? ` (${d.probeError})` : ''}`,
    `Storage: ${d.storageUsed ?? '?'} used of ${d.storageQuota ?? '?'} · persisted: ${d.storagePersisted ?? 'unknown'}`,
    `Service worker: ${d.serviceWorker} · online: ${d.online} · installed app: ${d.standalone}`,
    `Browser: ${d.userAgent}`,
  ].join('\n');
}

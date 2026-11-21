import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import type { BootState } from '@/hooks/useApp';
import { collectDiagnostics, diagnosticsText, type StartupDiagnostics } from '@/lib/diagnostics';

const PHASE_LABEL: Record<BootState['phase'], string> = {
  'opening-database': 'Opening the on-device database',
  'loading-settings': 'Reading your business settings',
};

/**
 * Start-up screen. Normally a brief spinner; if start-up fails or stalls it
 * explains the likely cause, offers recovery steps and shows diagnostics, so the
 * app never sits on an endless spinner.
 */
export function BootScreen({ error, phase, stalled, blocked }: BootState) {
  const trouble = !!error || stalled || blocked;
  const [diag, setDiag] = useState<StartupDiagnostics | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (trouble && !diag) void collectDiagnostics().then(setDiag);
  }, [trouble, diag]);

  if (!trouble) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
        <LogoMark className="h-14 w-14" />
        <div className="flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-blue" /> Opening your workspace…
        </div>
      </div>
    );
  }

  const probeBroken = diag && diag.probe !== 'ok';
  const text = diag ? diagnosticsText(diag, PHASE_LABEL[phase]) : '';

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-5 py-10">
      <div className="flex items-center gap-3">
        <LogoMark className="h-11 w-11" />
        <div>
          <div className="kicker">Start-up problem</div>
          <h1 className="font-display text-xl font-semibold">{error ? 'The app could not start' : 'The app is taking too long to start'}</h1>
        </div>
      </div>

      <div className="surface space-y-3 p-5 text-sm leading-relaxed text-muted">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            {error ? (
              <span className="text-text">{error}</span>
            ) : blocked ? (
              <span className="text-text">Another open tab or window of this app is holding the database.</span>
            ) : probeBroken ? (
              <span className="text-text">This browser’s on-device storage is not responding at all (not only for this app).</span>
            ) : (
              <span className="text-text">The browser has not finished opening the app’s database.</span>
            )}{' '}
            Stuck at: {PHASE_LABEL[phase].toLowerCase()}.
          </span>
        </p>
        <p>Your saved records are not deleted by this. Try these steps in order:</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <span className="text-text">Close every other tab</span> and window of the Invoice Manager, including the installed app, then press{' '}
            <span className="text-text">Try again</span>.
          </li>
          <li>
            <span className="text-text">Fully restart the browser</span>: close it from the recent-apps screen (or Settings → Apps → Chrome → Force stop), then reopen this page.
          </li>
          <li>Make sure the phone has free storage space and you are not in an incognito/private tab.</li>
          <li>
            Still stuck? Copy the diagnostics below and send them for support. Clearing this site’s data in the browser settings will fix it, but{' '}
            <span className="text-warning">permanently deletes records that are not in a backup</span>.
          </li>
        </ol>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => window.location.reload()}>
          Try again
        </Button>
        <Button
          variant="secondary"
          disabled={!diag}
          icon={copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              /* clipboard unavailable: text is visible below to select manually */
            }
          }}
        >
          {copied ? 'Copied' : 'Copy diagnostics'}
        </Button>
      </div>

      <details className="surface-flat text-xs" open={!!probeBroken}>
        <summary className="cursor-pointer px-4 py-3 text-muted select-none">Diagnostics (stays on this device)</summary>
        <pre className="overflow-x-auto border-t border-border px-4 py-3 whitespace-pre-wrap text-faint">{diag ? text : 'Collecting…'}</pre>
      </details>
    </div>
  );
}

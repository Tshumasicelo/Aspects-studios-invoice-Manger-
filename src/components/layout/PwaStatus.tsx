import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useOnlineStatus } from '@/hooks/usePwa';
import { useToast } from '@/components/ui/Toast';

/**
 * Service-worker lifecycle UI.
 * - New version available: a banner asks before reloading (never automatic, so
 *   unsaved form input is not lost). Records live in IndexedDB and are untouched by updates.
 * - First install: a toast confirms the app now works offline.
 * - Checks for updates every hour while open.
 */
export function UpdateBanner() {
  const toast = useToast();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        if (navigator.onLine) void registration.update().catch(() => undefined);
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.warn('[pwa] service worker registration failed', error);
    },
  });

  useEffect(() => {
    if (offlineReady) {
      toast.success('Ready to work offline', 'The app has been cached on this device.');
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady, toast]);

  if (!needRefresh) return null;
  return (
    <div className="sticky top-0 z-40 border-b border-blue/30 bg-[#0e1626]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-8">
        <div className="flex items-start gap-3 text-sm">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-blue" />
          <div>
            <p className="font-medium text-text">A new version of the app is available.</p>
            <p className="text-xs text-muted">Your records are stored separately and will not be affected. Save any open form first.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
            Later
          </Button>
          <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
            Update now
          </Button>
        </div>
      </div>
    </div>
  );
}

export function OfflineIndicator({ compact = false }: { compact?: boolean }) {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <span
      role="status"
      title="You are offline. Everything keeps working and is saved on this device."
      className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[0.7rem] font-medium text-warning"
    >
      <WifiOff className="h-3.5 w-3.5" />
      {!compact && 'Offline'}
    </span>
  );
}

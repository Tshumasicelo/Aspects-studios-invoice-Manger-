import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui/Toast';

/**
 * Wrap an async action with a busy flag and consistent error notifications.
 * Returns the action result, or undefined when it failed.
 */
export function useAsyncAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, opts: { success?: string; successMessage?: string; errorTitle?: string } = {}): Promise<T | undefined> => {
      setBusy(true);
      try {
        const result = await fn();
        if (opts.success) toast.success(opts.success, opts.successMessage);
        return result;
      } catch (err) {
        console.error(err);
        toast.error(opts.errorTitle ?? 'Action failed', err);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { busy, run };
}

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { store } from '@/data/store';
import { formatDate, formatDateTime, todayISO } from '@/domain/dates';
import { formatMoney, formatMoneyCompact } from '@/domain/money';
import type { BusinessSettings, ISODate } from '@/domain/types';
import { initialiseDatabase, withDefaults } from '@/services/settingsService';
import { errorMessage } from '@/services/errors';
import { useLiveQueryState } from './useLiveData';
import { DB_BLOCKED_EVENT } from '@/data/types';

interface AppContextValue {
  settings: BusinessSettings;
  today: ISODate;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Keeps "today" current so overdue/expired statuses update past midnight without a reload. */
function useTodayTicker(): ISODate {
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    const t = setInterval(() => {
      const now = todayISO();
      setToday((prev) => (prev === now ? prev : now));
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  return today;
}

export type BootPhase = 'opening-database' | 'loading-settings';

export interface BootState {
  /** A definite failure (shown with its message). */
  error?: string;
  /** Which start-up step is in progress. */
  phase: BootPhase;
  /** True when the current step has taken longer than STALL_MS. */
  stalled: boolean;
  /** True when another tab reported it is blocking the database. */
  blocked: boolean;
}

const STALL_MS = 10_000;

function describeStorageError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === 'InvalidStateError' || name === 'MissingAPIError')
    return 'This browser is blocking on-device storage (IndexedDB). Private/incognito windows and some privacy settings prevent the app from saving data.';
  if (name === 'QuotaExceededError') return 'This device is out of storage space for the app. Free up space on the phone, then try again.';
  if (name === 'DatabaseClosedError') return 'The app database was closed by the browser (often because another tab of the app changed it). Close other tabs of the app and try again.';
  return errorMessage(err);
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: (state: BootState) => ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [stalled, setStalled] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const today = useTodayTicker();

  useEffect(() => {
    const onBlocked = () => setBlocked(true);
    window.addEventListener(DB_BLOCKED_EVENT, onBlocked);
    initialiseDatabase()
      .then(() => {
        setReady(true);
        void store().requestPersistence();
      })
      .catch((err) => {
        console.error('[startup] database could not be opened', err);
        setError(describeStorageError(err));
      });
    return () => window.removeEventListener(DB_BLOCKED_EVENT, onBlocked);
  }, []);

  const { value: stored, error: settingsError } = useLiveQueryState(
    async () => (ready ? { value: await store().settings.get() } : undefined),
    [ready],
  );
  const settings = useMemo(() => (stored?.value ? withDefaults(stored.value) : undefined), [stored]);

  useEffect(() => {
    if (settingsError) {
      console.error('[startup] settings could not be read', settingsError);
      setError(describeStorageError(settingsError));
    }
  }, [settingsError]);

  // If settings disappear (e.g. after "Clear all data"), re-create a fresh installation.
  useEffect(() => {
    if (ready && stored && !stored.value) void initialiseDatabase().catch((err) => setError(describeStorageError(err)));
  }, [ready, stored]);

  // Watchdog: never wait silently. If a start-up step takes too long, say so.
  const phase: BootPhase = ready ? 'loading-settings' : 'opening-database';
  const started = !!settings;
  useEffect(() => {
    setStalled(false);
    if (started) return;
    const t = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(t);
  }, [phase, started]);

  if (!settings) return <>{fallback({ error, phase, stalled, blocked })}</>;
  return <AppContext.Provider value={{ settings, today }}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function useSettings(): BusinessSettings {
  return useApp().settings;
}

export function useToday(): ISODate {
  return useApp().today;
}

/** Formatters bound to the business currency and date format. */
export function useFormat() {
  const { settings } = useApp();
  return useMemo(
    () => ({
      money: (cents: number, currency = settings.currency) => formatMoney(cents, currency),
      compact: (cents: number) => formatMoneyCompact(cents, settings.currency),
      date: (iso: string | null | undefined) => formatDate(iso, settings.dateFormat),
      dateTime: (iso: string) => formatDateTime(iso, settings.dateFormat),
      currency: settings.currency,
    }),
    [settings.currency, settings.dateFormat],
  );
}

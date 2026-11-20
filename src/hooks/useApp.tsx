import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { store } from '@/data/store';
import { formatDate, formatDateTime, todayISO } from '@/domain/dates';
import { formatMoney, formatMoneyCompact } from '@/domain/money';
import type { BusinessSettings, ISODate } from '@/domain/types';
import { initialiseDatabase, withDefaults } from '@/services/settingsService';
import { errorMessage } from '@/services/errors';
import { useLiveData } from './useLiveData';

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

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: (state: { error?: string }) => ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const today = useTodayTicker();

  useEffect(() => {
    initialiseDatabase()
      .then(() => {
        setReady(true);
        void store().requestPersistence();
      })
      .catch((err) => {
        console.error(err);
        setError(
          err?.name === 'InvalidStateError' || err?.name === 'MissingAPIError'
            ? 'This browser is blocking local storage (IndexedDB). Private/incognito windows and some privacy settings prevent the app from saving data.'
            : errorMessage(err),
        );
      });
  }, []);

  const stored = useLiveData(async () => (ready ? { value: await store().settings.get() } : undefined), [ready]);
  const settings = useMemo(() => (stored?.value ? withDefaults(stored.value) : undefined), [stored]);

  // If settings disappear (e.g. after "Clear all data"), re-create a fresh installation.
  useEffect(() => {
    if (ready && stored && !stored.value) void initialiseDatabase();
  }, [ready, stored]);

  if (!ready || !settings) return <>{fallback({ error })}</>;
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

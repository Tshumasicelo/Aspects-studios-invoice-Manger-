import { useEffect, useState } from 'react';
import { store } from '@/data/store';
import type { Dataset } from '@/services/analytics';

/**
 * Subscribe to a data query. The component re-renders automatically whenever the
 * underlying records change (in this tab or another tab). Returns `undefined`
 * while the first result is loading.
 */
export function useLiveData<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<{ v: T } | undefined>(undefined);
  useEffect(() => {
    return store().watch(query, (v) => setValue({ v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value?.v;
}

/** All business records, live. Suitable for a local single-business dataset. */
export function useDataset(): Dataset | undefined {
  return useLiveData(async () => {
    const s = store();
    const [invoices, payments, expenses, clients, projects, quotations] = await Promise.all([
      s.invoices.list(),
      s.payments.list(),
      s.expenses.list(),
      s.clients.list(),
      s.projects.list(),
      s.quotations.list(),
    ]);
    return { invoices, payments, expenses, clients, projects, quotations };
  });
}

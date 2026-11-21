import { useEffect, useState } from 'react';
import { store } from '@/data/store';
import type { Dataset } from '@/services/analytics';

/**
 * Subscribe to a data query. The component re-renders automatically whenever the
 * underlying records change (in this tab or another tab). Returns `undefined`
 * while the first result is loading.
 */
export function useLiveData<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  return useLiveQueryState(query, deps).value;
}

/**
 * Like useLiveData, but also reports failures, so callers that block on the
 * result (such as app start-up) can show an error instead of waiting forever.
 */
export function useLiveQueryState<T>(query: () => Promise<T>, deps: unknown[] = []): { value: T | undefined; error: unknown } {
  const [state, setState] = useState<{ v?: { value: T }; error?: unknown }>({});
  useEffect(() => {
    return store().watch(
      query,
      (value) => setState({ v: { value } }),
      (error) => setState((prev) => ({ ...prev, error })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { value: state.v?.value, error: state.error };
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

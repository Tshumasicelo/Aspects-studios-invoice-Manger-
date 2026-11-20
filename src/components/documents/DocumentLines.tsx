import { calculateTotals } from '@/domain/calculations';
import { VAT_CATEGORY_LABELS } from '@/domain/defaults';
import type { PricingInput } from '@/domain/types';
import { useFormat } from '@/hooks/useApp';

/** Read-only line item list for document detail pages. */
export function DocumentLines({ pricing, currency }: { pricing: PricingInput; currency: string }) {
  const fmt = useFormat();
  const totals = calculateTotals(pricing);
  return (
    <ul className="divide-y divide-border/70">
      {pricing.items.map((item, idx) => (
        <li key={item.id} className="flex gap-4 py-4 first:pt-0">
          <span className="num mt-0.5 w-6 shrink-0 font-mono text-xs text-faint">{String(idx + 1).padStart(2, '0')}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <p className="text-sm font-medium text-text">{item.title}</p>
              <p className="num shrink-0 text-sm font-medium">{fmt.money(totals.lineTotals[item.id], currency)}</p>
            </div>
            {item.description && <p className="mt-1 text-xs leading-relaxed whitespace-pre-line text-muted">{item.description}</p>}
            <p className="num mt-1.5 text-xs text-faint">
              {item.quantity} × {fmt.money(item.unitPrice, currency)}
              {pricing.vatEnabled && ` · ${VAT_CATEGORY_LABELS[item.vatCategory]}`}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

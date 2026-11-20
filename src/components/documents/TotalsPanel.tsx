import { calculateTotals, outstandingBalance } from '@/domain/calculations';
import type { PricingInput } from '@/domain/types';
import { useFormat, useSettings } from '@/hooks/useApp';
import { cn } from '@/lib/cn';

export function TotalsPanel({
  pricing,
  currency,
  amountPaid,
  showBalance = false,
}: {
  pricing: PricingInput;
  currency: string;
  amountPaid?: number;
  showBalance?: boolean;
}) {
  const fmt = useFormat();
  const settings = useSettings();
  const t = calculateTotals(pricing);
  const Row = ({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) => (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5', strong && 'border-t border-border pt-3')}>
      <span className={cn('text-sm', strong ? 'font-medium text-text' : 'text-muted')}>{label}</span>
      <span className={cn('num', strong ? 'font-display text-xl font-semibold text-text' : 'text-sm text-text', tone)}>{value}</span>
    </div>
  );
  return (
    <div>
      <Row label="Subtotal" value={fmt.money(t.subtotal, currency)} />
      {t.discount > 0 && (
        <Row
          label={pricing.discount.type === 'percent' ? `Discount (${pricing.discount.value}%)` : 'Discount'}
          value={`-${fmt.money(t.discount, currency)}`}
          tone="text-warning"
        />
      )}
      {pricing.vatEnabled ? (
        <Row label={`${settings.vatLabel} (${pricing.vatRate}%)`} value={fmt.money(t.vat, currency)} />
      ) : (
        <div className="py-1.5 text-xs text-faint">VAT not applied</div>
      )}
      <Row label="Total" value={fmt.money(t.total, currency)} strong />
      {showBalance && (
        <>
          <Row label="Amount paid" value={`-${fmt.money(amountPaid ?? 0, currency)}`} tone="text-success" />
          <Row label="Balance due" value={fmt.money(outstandingBalance(t.total, amountPaid ?? 0), currency)} strong />
        </>
      )}
    </div>
  );
}

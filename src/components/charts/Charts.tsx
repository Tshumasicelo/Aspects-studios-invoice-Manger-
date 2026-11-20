import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { monthLabel } from '@/domain/dates';
import { useFormat } from '@/hooks/useApp';
import type { MonthlyPoint, NamedAmount } from '@/services/analytics';

/**
 * Chart palette (validated for colour-vision deficiency on the #151922 card surface):
 * series identity only — status colours are reserved for status displays.
 */
export const SERIES = {
  revenue: '#3985FF',
  expenses: '#D95926',
  profit: '#9085E9',
} as const;

const AXIS = { stroke: '#646B78', fontSize: 11 };
const GRID = '#272D38';

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-[10rem] rounded-lg border border-border bg-[#10131a]/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-1.5 font-medium text-text">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted">
            {r.color && <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="num text-text">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function ChartFrame({ height = 260, children, empty }: { height?: number; children: ReactNode; empty?: boolean }) {
  if (empty)
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-border text-sm text-faint" style={{ height }}>
        No data for this period yet
      </div>
    );
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

/** Monthly revenue (cash received) vs expenses — grouped bars on one shared axis. */
export function RevenueExpensesChart({ data, height = 260 }: { data: MonthlyPoint[]; height?: number }) {
  const fmt = useFormat();
  const empty = data.every((d) => d.revenue === 0 && d.expenses === 0);
  return (
    <ChartFrame height={height} empty={empty}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={2} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="0" />
        <XAxis dataKey="key" tickFormatter={monthLabel} tickLine={false} axisLine={false} tick={AXIS} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickFormatter={(v: number) => fmt.compact(v)} tickLine={false} axisLine={false} tick={AXIS} width={64} />
        <Tooltip
          cursor={{ fill: '#ffffff08', stroke: 'none' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                title={monthLabel(String(label))}
                rows={[
                  { label: 'Revenue', value: fmt.money(Number(payload[0]?.payload.revenue)), color: SERIES.revenue },
                  { label: 'Expenses', value: fmt.money(Number(payload[0]?.payload.expenses)), color: SERIES.expenses },
                  { label: 'Net', value: fmt.money(Number(payload[0]?.payload.profit)) },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="revenue" name="Revenue" fill={SERIES.revenue} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={450} />
        <Bar dataKey="expenses" name="Expenses" fill={SERIES.expenses} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={450} />
      </BarChart>
    </ChartFrame>
  );
}

/** Net profit per month (single series) with a zero baseline. */
export function ProfitTrendChart({ data, height = 200 }: { data: MonthlyPoint[]; height?: number }) {
  const fmt = useFormat();
  const empty = data.every((d) => d.profit === 0);
  return (
    <ChartFrame height={height} empty={empty}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.profit} stopOpacity={0.28} />
            <stop offset="100%" stopColor={SERIES.profit} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="key" tickFormatter={monthLabel} tickLine={false} axisLine={false} tick={AXIS} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickFormatter={(v: number) => fmt.compact(v)} tickLine={false} axisLine={false} tick={AXIS} width={64} />
        <ReferenceLine y={0} stroke="#343B48" />
        <Tooltip
          cursor={{ stroke: '#AEB8C7', strokeOpacity: 0.35, strokeWidth: 1 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox title={monthLabel(String(label))} rows={[{ label: 'Net profit', value: fmt.money(Number(payload[0]?.value)), color: SERIES.profit }]} />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="profit"
          stroke={SERIES.profit}
          strokeWidth={2}
          fill="url(#profitFill)"
          dot={data.length <= 2 ? { r: 3, fill: SERIES.profit, strokeWidth: 0 } : false}
          animationDuration={450}
          activeDot={{ r: 4.5, stroke: '#151922', strokeWidth: 2, fill: SERIES.profit }}
        />
      </AreaChart>
    </ChartFrame>
  );
}

/** Ranked horizontal bars for a single measure (e.g. revenue by client). */
export function RankedBars({
  rows,
  color = SERIES.revenue,
  limit = 8,
  valueLabel = 'Amount',
  format,
}: {
  rows: NamedAmount[];
  color?: string;
  limit?: number;
  valueLabel?: string;
  /** Value formatter (defaults to currency). */
  format?: (value: number) => string;
}) {
  const fmt = useFormat();
  const show = format ?? ((v: number) => fmt.money(v));
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-faint">No data for this period yet</p>;
  const top = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const list = rest.length ? [...top, { id: 'other', name: `Other (${rest.length})`, amount: rest.reduce((a, r) => a + r.amount, 0), count: 0 }] : top;
  const max = Math.max(...list.map((r) => r.amount), 1);
  return (
    <ul className="space-y-3" aria-label={valueLabel}>
      {list.map((r) => (
        <li key={r.id} className="group" title={`${r.name}: ${show(r.amount)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-muted group-hover:text-text">{r.name}</span>
            <span className="num shrink-0 text-text">{show(r.amount)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max((r.amount / max) * 100, 1.5)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Proportion bar for statuses: segmented bar + labelled legend with counts (never colour alone). */
export function SegmentedStatus({
  segments,
}: {
  segments: { key: string; label: string; color: string; count: number; amount: number }[];
}) {
  const fmt = useFormat();
  const total = segments.reduce((a, s) => a + s.count, 0);
  if (total === 0) return <p className="py-8 text-center text-sm text-faint">No invoices in this period</p>;
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {segments.map((s) => (
          <div key={s.key} title={`${s.label}: ${s.count}`} style={{ width: `${(s.count / total) * 100}%`, background: s.color }} className="min-w-[4px] first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-muted">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
              <span className="num text-xs text-faint">× {s.count}</span>
            </span>
            <span className="num text-text">{fmt.money(s.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

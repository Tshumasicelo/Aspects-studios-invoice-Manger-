import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Input, Select } from '@/components/ui/Field';
import { RANGE_PRESETS, presetRange, type DateRange, type RangePreset } from '@/domain/dates';
import { useToday } from '@/hooks/useApp';

const KEY = 'aspects.rangePreset';

/** Date-range filter (preset + optional custom range). The chosen preset is remembered per device. */
export function useDateRange(earliest?: string) {
  const today = useToday();
  const [preset, setPreset] = useState<RangePreset>(() => {
    try {
      return (localStorage.getItem(KEY) as RangePreset) || 'last_6_months';
    } catch {
      return 'last_6_months';
    }
  });
  const [custom, setCustom] = useState<DateRange>(() => presetRange('last_3_months', today));

  useEffect(() => {
    try {
      localStorage.setItem(KEY, preset);
    } catch {
      /* preference only */
    }
  }, [preset]);

  const range: DateRange = preset === 'custom' ? custom : presetRange(preset, today, earliest);
  return { preset, setPreset, custom, setCustom, range };
}

export function RangeFilter({
  preset,
  setPreset,
  custom,
  setCustom,
}: ReturnType<typeof useDateRange>) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative sm:w-48">
        <Select value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)} aria-label="Date range" className="pl-9">
          {RANGE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        <Calendar className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" />
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="From" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} />
          <span className="text-xs text-faint">to</span>
          <Input type="date" aria-label="To" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}

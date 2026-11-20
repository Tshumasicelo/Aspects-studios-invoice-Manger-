import type { HistoryEntry } from '@/domain/types';
import { useFormat } from '@/hooks/useApp';

export function HistoryList({ history }: { history: HistoryEntry[] }) {
  const fmt = useFormat();
  if (history.length === 0) return <p className="text-sm text-faint">No history yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {[...history].reverse().map((h, i) => (
        <li key={`${h.at}-${i}`} className="relative">
          <span className={`absolute top-1.5 -left-[1.42rem] h-2 w-2 rounded-full ${i === 0 ? 'bg-blue shadow-[0_0_8px_#3985ff]' : 'bg-border-strong'}`} />
          <p className="text-sm text-text">{h.action}</p>
          {h.note && <p className="mt-0.5 text-xs text-muted">{h.note}</p>}
          <p className="mt-0.5 text-[0.7rem] text-faint">{fmt.dateTime(h.at)}</p>
        </li>
      ))}
    </ol>
  );
}

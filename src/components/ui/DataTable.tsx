import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right';
  /** Hide below this breakpoint on the desktop table. */
  hideBelow?: 'lg' | 'xl';
}

/**
 * Responsive data table: a real <table> on tablet/desktop, stacked cards on phones.
 * `mobile` renders the card body for each row.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  mobile,
  footer,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  mobile: (row: T) => ReactNode;
  footer?: ReactNode;
}) {
  const hide = (c: Column<T>) => (c.hideBelow === 'lg' ? 'hidden lg:table-cell' : c.hideBelow === 'xl' ? 'hidden xl:table-cell' : '');
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-[0.68rem] font-semibold tracking-[0.14em] whitespace-nowrap text-faint uppercase first:pl-5 last:pr-5',
                    c.align === 'right' ? 'text-right' : 'text-left',
                    hide(c),
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-border/60 transition-colors last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-white/[0.025]',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn('px-4 py-3.5 align-middle first:pl-5 last:pr-5', c.align === 'right' && 'text-right', hide(c), c.className)}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
      </div>
      <ul className="divide-y divide-border/70 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)}>
            {onRowClick ? (
              <button
                type="button"
                onClick={() => onRowClick(row)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-white/[0.03]"
              >
                <div className="min-w-0 flex-1">{mobile(row)}</div>
                <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
              </button>
            ) : (
              <div className="px-4 py-3.5">{mobile(row)}</div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

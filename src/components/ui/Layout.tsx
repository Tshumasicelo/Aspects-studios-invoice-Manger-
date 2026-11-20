import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  kicker,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  kicker?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-text">
            <ArrowLeft className="h-3.5 w-3.5" /> {back.label}
          </Link>
        )}
        {kicker && <div className="kicker mb-1.5">{kicker}</div>}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text md:text-[1.75rem]">{title}</h1>
        {subtitle && <div className="mt-1.5 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-2xl bg-blue/20 blur-xl" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-border-strong bg-gradient-to-b from-card-2 to-bg-2 text-accent">
          {icon}
        </div>
      </div>
      <h3 className="font-display text-base font-semibold text-text">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin text-blue" /> {label}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'blue' | 'success' | 'warning' | 'danger';
  to?: string;
}) {
  const accent = {
    neutral: 'text-accent',
    blue: 'text-blue',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  }[tone];
  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className="kicker">{label}</span>
        {icon && <span className={cn('opacity-80', accent)}>{icon}</span>}
      </div>
      <div className="num mt-3 font-display text-[1.45rem] leading-tight font-semibold tracking-tight text-text">{value}</div>
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </>
  );
  const cls = 'surface block p-4 transition-colors md:p-5';
  return to ? (
    <Link to={to} className={cn(cls, 'hover:border-border-strong')}>
      {content}
    </Link>
  ) : (
    <div className={cls}>{content}</div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('-mx-1 flex gap-1 overflow-x-auto px-1 pb-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            value === t.value ? 'bg-white/[0.07] text-text shadow-[0_0_0_1px_#343b48_inset]' : 'text-muted hover:bg-white/[0.03] hover:text-text',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="num rounded bg-white/[0.06] px-1.5 text-[0.65rem] text-faint">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  tone?: 'danger';
  disabled?: boolean;
  hidden?: boolean;
}

/** Overflow ("more actions") menu, rendered in a portal so it is never clipped by tables or cards. */
export function ActionMenu({ items, label = 'More actions', trigger }: { items: MenuItem[]; label?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (visible.length === 0) return null;

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          const r = btn.current!.getBoundingClientRect();
          setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
          setOpen((o) => !o);
        }}
        className={cn(
          trigger
            ? ''
            : 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card-2 text-muted transition-colors hover:border-border-strong hover:text-text',
        )}
      >
        {trigger ?? <MoreHorizontal className="h-4 w-4" />}
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
            <div
              role="menu"
              className="fixed z-[56] min-w-[13rem] animate-pop-in overflow-hidden rounded-xl border border-border bg-[#141821] p-1"
              style={{ top: Math.min(pos.top, window.innerHeight - visible.length * 40 - 16), right: Math.max(pos.right, 8), boxShadow: 'var(--shadow-pop)' }}
            >
              {visible.map((item) => (
                <button
                  key={item.label}
                  role="menuitem"
                  type="button"
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    item.onClick();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-40',
                    item.tone === 'danger' ? 'text-danger hover:bg-danger/10' : 'text-muted hover:bg-white/[0.05] hover:text-text',
                  )}
                >
                  <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

/** Label/value pair used in detail panels. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-right break-words text-text">{children}</span>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="kicker">{children}</h3>
      {action}
    </div>
  );
}

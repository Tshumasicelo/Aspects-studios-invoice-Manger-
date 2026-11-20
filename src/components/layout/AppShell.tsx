import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, Download, Grid2x2, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Wordmark, LogoMark } from '@/components/brand/Logo';
import { ActionMenu } from '@/components/ui/Layout';
import { Spinner } from '@/components/ui/Layout';
import { Modal } from '@/components/ui/Modal';
import { useInstallPrompt } from '@/hooks/usePwa';
import { useSettings } from '@/hooks/useApp';
import { NAV_ITEMS, QUICK_CREATE } from './navigation';
import { OfflineIndicator, UpdateBanner } from './PwaStatus';

const COLLAPSE_KEY = 'aspects.sidebarCollapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function isActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
}

function SidebarLink({ to, label, icon: Icon, collapsed }: { to: string; label: string; icon: typeof Plus; collapsed: boolean }) {
  const { pathname } = useLocation();
  const active = isActive(pathname, to);
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all',
        collapsed && 'justify-center px-0',
        active ? 'bg-white/[0.06] text-text shadow-[0_0_0_1px_#272d38_inset]' : 'text-muted hover:bg-white/[0.03] hover:text-text',
      )}
    >
      {active && <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-blue shadow-[0_0_12px_#3985ff]" />}
      <Icon className={cn('h-[1.05rem] w-[1.05rem] shrink-0', active ? 'text-blue' : 'text-faint group-hover:text-accent')} />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

function QuickCreate({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  return (
    <ActionMenu
      label="Create new"
      trigger={
        <span
          className={cn(
            'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue px-3 text-sm font-medium text-white shadow-[0_1px_0_0_#ffffff30_inset,0_8px_24px_-10px_#3985ffaa] transition-colors hover:bg-[#4b91ff]',
            compact && 'w-9 px-0',
          )}
        >
          <Plus className="h-4 w-4" />
          {!compact && 'New'}
        </span>
      }
      items={QUICK_CREATE.map((q) => ({ label: q.label, icon: <q.icon />, onClick: () => navigate(q.to) }))}
    />
  );
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const settings = useSettings();
  const { canInstall, install } = useInstallPrompt();

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* preference only */
    }
  }, [collapsed]);

  useEffect(() => {
    setMoreOpen(false);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const mobilePrimary = NAV_ITEMS.filter((n) => n.primaryMobile);
  const mobileMoreActive = NAV_ITEMS.filter((n) => !n.primaryMobile).some((n) => isActive(pathname, n.to));

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-bg-2/80 backdrop-blur-xl transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        <div className={cn('flex h-16 items-center border-b border-border', collapsed ? 'justify-center' : 'px-5')}>
          <Wordmark collapsed={collapsed} />
        </div>
        <nav className={cn('flex-1 space-y-0.5 overflow-y-auto py-4', collapsed ? 'px-3' : 'px-3')} aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <SidebarLink key={item.to} {...item} collapsed={collapsed} />
          ))}
        </nav>
        <div className={cn('space-y-2 border-t border-border p-3')}>
          {canInstall && (
            <button
              type="button"
              onClick={() => void install()}
              title="Install app"
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-accent transition-colors hover:bg-white/[0.04] hover:text-text',
                collapsed && 'justify-center px-0',
              )}
            >
              <Download className="h-4 w-4 shrink-0" />
              {!collapsed && 'Install app'}
            </button>
          )}
          {!collapsed && (
            <div className="surface-flat px-3 py-2.5">
              <div className="truncate text-xs font-medium text-text">{settings.businessName}</div>
              <div className="mt-0.5 text-[0.68rem] text-faint">Local-first · data stays on this device</div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-faint transition-colors hover:bg-white/[0.04] hover:text-text',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </aside>

      <div className={cn('flex min-h-dvh flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64')}>
        <UpdateBanner />
        {/* Top bar */}
        <header className="pt-safe sticky top-0 z-20 border-b border-border/70 bg-bg/75 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 md:h-16 md:px-8">
            <div className="flex items-center gap-3 lg:hidden">
              <LogoMark className="h-8 w-8" />
              <span className="metal-text font-display text-sm font-bold tracking-[0.2em]">ASPECTS</span>
            </div>
            <div className="hidden text-xs text-faint lg:block">
              {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
            <div className="flex items-center gap-2">
              <OfflineIndicator />
              <span className="hidden sm:inline-flex">
                <QuickCreate />
              </span>
              <span className="sm:hidden">
                <QuickCreate compact />
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-8 lg:pb-12">
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg-2/90 backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {mobilePrimary.map((item) => (
            <MobileTab key={item.to} to={item.to} label={item.label} icon={<item.icon className="h-5 w-5" />} active={isActive(pathname, item.to)} />
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn('flex flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium', mobileMoreActive ? 'text-text' : 'text-faint')}
          >
            <Grid2x2 className={cn('h-5 w-5', mobileMoreActive && 'text-blue')} />
            More
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="All sections" size="sm">
        <div className="grid grid-cols-3 gap-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border px-2 py-4 text-xs transition-colors',
                isActive(pathname, item.to) ? 'border-blue/40 bg-blue/10 text-text' : 'border-border bg-bg-2 text-muted hover:text-text',
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </div>
        {canInstall && (
          <button
            type="button"
            onClick={() => void install()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg-2 py-3 text-sm text-accent"
          >
            <Download className="h-4 w-4" /> Install app on this device
          </button>
        )}
      </Modal>
    </div>
  );
}

function MobileTab({ to, label, icon, active }: { to: string; label: string; icon: ReactNode; active: boolean }) {
  return (
    <NavLink
      to={to}
      className={cn('relative flex flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium', active ? 'text-text' : 'text-faint')}
    >
      {active && <span className="absolute top-0 h-[2px] w-8 rounded-b-full bg-blue shadow-[0_0_10px_#3985ff]" />}
      <span className={cn(active && 'text-blue')}>{icon}</span>
      {label}
    </NavLink>
  );
}

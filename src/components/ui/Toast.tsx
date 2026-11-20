import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/services/errors';

type Tone = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  duration: number;
}

interface ToastApi {
  success: (title: string, message?: string) => void;
  error: (title: string, errOrMessage?: unknown) => void;
  info: (title: string, message?: string, action?: ToastItem['action'], duration?: number) => void;
  warning: (title: string, message?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const icons: Record<Tone, ReactNode> = {
  success: <CheckCircle2 className="h-4.5 w-4.5 text-success" />,
  error: <XCircle className="h-4.5 w-4.5 text-danger" />,
  info: <Info className="h-4.5 w-4.5 text-blue" />,
  warning: <AlertTriangle className="h-4.5 w-4.5 text-warning" />,
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (t: Omit<ToastItem, 'id'>) => {
      const id = nextId++;
      setItems((list) => [...list.slice(-2), { ...t, id }]);
      if (t.duration > 0) setTimeout(() => dismiss(id), t.duration);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, message) => push({ tone: 'success', title, message, duration: 3500 }),
      error: (title, err) =>
        push({ tone: 'error', title, message: err === undefined ? undefined : typeof err === 'string' ? err : errorMessage(err), duration: 7000 }),
      info: (title, message, action, duration = 5000) => push({ tone: 'info', title, message, action, duration }),
      warning: (title, message) => push({ tone: 'warning', title, message, duration: 6000 }),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:right-6 md:bottom-6 md:left-auto md:items-end"
        >
          {items.map((t) => (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm animate-pop-in items-start gap-3 rounded-xl border border-border bg-[#141821]/95 px-4 py-3 backdrop-blur-xl',
              )}
              style={{ boxShadow: 'var(--shadow-pop)' }}
            >
              <div className="mt-0.5 shrink-0">{icons[t.tone]}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">{t.title}</p>
                {t.message && <p className="mt-0.5 text-xs leading-relaxed break-words text-muted">{t.message}</p>}
                {t.action && (
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-blue hover:underline"
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-faint hover:text-text">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

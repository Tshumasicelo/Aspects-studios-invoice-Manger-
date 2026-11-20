import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Field, Input, Textarea } from './Field';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  /** Ask for a free-text reason (returned on confirm). */
  reason?: { label: string; required?: boolean; placeholder?: string };
  /** Require the user to type this exact phrase before confirming (for irreversible actions). */
  typeToConfirm?: string;
}

type Resolver = (value: { confirmed: boolean; reason: string }) => void;

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<{ confirmed: boolean; reason: string }>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const resolver = useRef<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOptions(o);
    setReason('');
    setTyped('');
    return new Promise<{ confirmed: boolean; reason: string }>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((confirmed: boolean) => {
    resolver.current?.({ confirmed, reason: reason.trim() });
    resolver.current = null;
    setOptions(null);
  }, [reason]);

  const blocked =
    !!options &&
    ((options.reason?.required && !reason.trim()) || (options.typeToConfirm !== undefined && typed.trim() !== options.typeToConfirm));

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!options}
        onClose={() => close(false)}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            {options?.tone !== 'primary' && <AlertTriangle className="h-4 w-4 text-warning" />}
            {options?.title}
          </span>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {options?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              variant={options?.tone === 'primary' ? 'primary' : 'danger'}
              disabled={blocked}
              onClick={() => close(true)}
              data-autofocus={!options?.reason && !options?.typeToConfirm ? true : undefined}
            >
              {options?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm leading-relaxed text-muted">
          <div>{options?.message}</div>
          {options?.reason && (
            <Field label={options.reason.label} required={options.reason.required}>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={options.reason.placeholder} data-autofocus />
            </Field>
          )}
          {options?.typeToConfirm !== undefined && (
            <Field label={<>Type <span className="font-mono text-text">{options.typeToConfirm}</span> to confirm</>}>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-autofocus />
            </Field>
          )}
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

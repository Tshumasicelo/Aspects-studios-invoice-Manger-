import { Link } from 'react-router-dom';
import { Check, ChevronRight, Sparkles, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import type { BusinessSettings } from '@/domain/types';
import type { Dataset } from '@/services/analytics';
import { saveSettings } from '@/services/settingsService';
import { cn } from '@/lib/cn';

export interface SetupStep {
  key: string;
  label: string;
  done: boolean;
  to: string;
}

export function setupSteps(settings: BusinessSettings, data: Pick<Dataset, 'clients' | 'invoices'>): SetupStep[] {
  return [
    { key: 'business', label: 'Add business information', done: !!(settings.email || settings.phone || settings.address.line1), to: '/setup?step=0' },
    { key: 'logo', label: 'Upload your logo', done: !!settings.logoDataUrl, to: '/setup?step=1' },
    { key: 'currency', label: 'Confirm currency & regional format', done: settings.onboarding.setupCompleted, to: '/setup?step=2' },
    { key: 'vat', label: 'Configure VAT (or confirm not registered)', done: settings.onboarding.setupCompleted, to: '/setup?step=3' },
    { key: 'payment', label: 'Add payment / banking details', done: !!settings.paymentDetails.trim(), to: '/setup?step=4' },
    { key: 'client', label: 'Create your first client', done: data.clients.length > 0, to: '/clients?new=1' },
    { key: 'invoice', label: 'Create your first invoice', done: data.invoices.length > 0, to: '/invoices/new' },
  ];
}

export function SetupChecklist({ settings, data }: { settings: BusinessSettings; data: Dataset }) {
  const steps = setupSteps(settings, data);
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length || settings.onboarding.welcomeDismissed) return null;
  const pct = Math.round((done / steps.length) * 100);
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:p-6">
        <div className="md:w-72 md:shrink-0">
          <div className="flex items-center gap-2 text-blue">
            <Sparkles className="h-4 w-4" />
            <span className="kicker text-blue">Getting started</span>
          </div>
          <h2 className="mt-2 font-display text-lg font-semibold">Set up ASPECTS STUDIOS</h2>
          <p className="mt-1 text-sm text-muted">Every step is optional — explore freely and come back any time.</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-blue transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="num text-xs text-muted">
              {done}/{steps.length}
            </span>
          </div>
          <div className="mt-4 flex gap-2">
            <ButtonLink to="/setup" variant="primary" size="sm">
              {done === 0 ? 'Start setup' : 'Continue setup'}
            </ButtonLink>
            <Button
              size="sm"
              variant="ghost"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={() => void saveSettings({ onboarding: { ...settings.onboarding, welcomeDismissed: true } })}
            >
              Hide
            </Button>
          </div>
        </div>
        <ol className="grid flex-1 gap-1.5 sm:grid-cols-2">
          {steps.map((s, i) => (
            <li key={s.key}>
              <Link
                to={s.to}
                className={cn(
                  'group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                  s.done ? 'border-transparent text-faint' : 'border-border bg-bg-2/60 text-text hover:border-border-strong',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.65rem]',
                    s.done ? 'border-success/50 bg-success/15 text-success' : 'border-border-strong text-faint',
                  )}
                >
                  {s.done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className={cn('flex-1', s.done && 'line-through decoration-faint/50')}>{s.label}</span>
                {!s.done && <ChevronRight className="h-4 w-4 text-faint group-hover:text-text" />}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

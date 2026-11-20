import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, FileText, Users } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LogoMark } from '@/components/brand/Logo';
import { cn } from '@/lib/cn';
import { useDataset } from '@/hooks/useLiveData';
import { BrandingSection, BusinessSection, PaymentDetailsField, RegionalSection, VatSection } from './settings/SettingsSections';
import { useSettingsDraft } from './settings/useSettingsDraft';

const STEPS = [
  { title: 'Business information', text: 'How your business appears on quotations and invoices.' },
  { title: 'Logo & branding', text: 'Upload a logo for your client documents. Optional — your business name is used otherwise.' },
  { title: 'Currency & region', text: 'Defaults to South Africa: ZAR shown as R 1,250.00.' },
  { title: 'VAT', text: 'VAT stays off unless you are VAT-registered. You can change this any time.' },
  { title: 'Payment details', text: 'Banking details printed on invoices so clients know how to pay.' },
  { title: 'You’re ready', text: 'Add your first client and send your first invoice.' },
];

/**
 * First-time setup. Every step is skippable and saves as you go — the user is
 * never forced through setup before exploring the app.
 */
export default function SetupPage() {
  const [params, setParams] = useSearchParams();
  const s = useSettingsDraft();
  const data = useDataset();
  const initial = Math.min(Math.max(Number(params.get('step')) || 0, 0), STEPS.length - 1);
  const [step, setStep] = useState(initial);

  useEffect(() => {
    setParams({ step: String(step) }, { replace: true });
  }, [step, setParams]);

  const go = async (next: number) => {
    // Reaching the currency/VAT steps and moving past them counts as confirming them.
    const completing = next >= 4 && !s.draft.onboarding.setupCompleted;
    const patch = completing ? { onboarding: { ...s.draft.onboarding, setupCompleted: true } } : undefined;
    if (s.dirty || patch) {
      const ok = await s.save(patch);
      if (!ok) return;
    }
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const current = STEPS[step];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 w-9" />
          <div>
            <div className="kicker">Setup · step {step + 1} of {STEPS.length}</div>
            <h1 className="font-display text-xl font-semibold tracking-tight">{current.title}</h1>
          </div>
        </div>
        <Link to="/" className="text-xs text-muted hover:text-text">
          Skip for now
        </Link>
      </div>

      <div className="mb-6 flex gap-1.5" aria-hidden="true">
        {STEPS.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => void go(i)}
            className={cn('h-1.5 flex-1 rounded-full transition-colors', i < step ? 'bg-blue/60' : i === step ? 'bg-blue shadow-[0_0_10px_#3985ff]' : 'bg-white/[0.07]')}
          />
        ))}
      </div>

      <Card className="p-5 md:p-7">
        <p className="mb-6 text-sm text-muted">{current.text}</p>
        {step === 0 && <BusinessSection s={s} showPayment={false} />}
        {step === 1 && <BrandingSection s={s} />}
        {step === 2 && <RegionalSection s={s} />}
        {step === 3 && <VatSection s={s} />}
        {step === 4 && <PaymentDetailsField s={s} />}
        {step === 5 && (
          <div className="space-y-3">
            {[
              { done: (data?.clients.length ?? 0) > 0, icon: Users, label: 'Create your first client', to: '/clients?new=1' },
              { done: (data?.invoices.length ?? 0) > 0, icon: FileText, label: 'Create your first invoice', to: '/invoices/new' },
            ].map((x) => (
              <Link key={x.label} to={x.to} className="flex items-center gap-4 rounded-xl border border-border bg-bg-2/60 p-4 transition-colors hover:border-border-strong">
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg border', x.done ? 'border-success/40 bg-success/10 text-success' : 'border-border-strong text-blue')}>
                  {x.done ? <Check className="h-4 w-4" /> : <x.icon className="h-4 w-4" />}
                </span>
                <span className="flex-1 text-sm text-text">{x.label}</span>
                <ArrowRight className="h-4 w-4 text-faint" />
              </Link>
            ))}
            <p className="pt-2 text-xs text-faint">Tip: set your rates in Services so prices fill in automatically, and download a backup regularly from Settings → Data & backup.</p>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
          <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} disabled={step === 0} onClick={() => void go(step - 1)}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => void go(step + 1)} disabled={s.saving}>
                {s.dirty ? 'Save & skip' : 'Skip'}
              </Button>
              <Button variant="primary" loading={s.saving} onClick={() => void go(step + 1)}>
                {s.dirty ? 'Save & continue' : 'Continue'}
              </Button>
            </div>
          ) : (
            <ButtonLink to="/" variant="primary">
              Go to dashboard
            </ButtonLink>
          )}
        </div>
      </Card>
    </div>
  );
}

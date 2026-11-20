import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { ClientStatus, InvoiceStatus, ProjectStatus, QuotationStatus } from '@/domain/types';
import { INVOICE_STATUS_LABELS, QUOTATION_STATUS_LABELS } from '@/domain/status';
import { CLIENT_STATUS_LABELS, PROJECT_STATUS_LABELS } from '@/domain/defaults';

export type Tone = 'neutral' | 'blue' | 'success' | 'warning' | 'danger' | 'muted';

const tones: Record<Tone, string> = {
  neutral: 'border-accent/25 bg-accent/10 text-accent',
  blue: 'border-blue/30 bg-blue/10 text-[#7fb0ff]',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  muted: 'border-border bg-white/[0.03] text-faint',
};

const dots: Record<Tone, string> = {
  neutral: 'bg-accent',
  blue: 'bg-blue',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  muted: 'bg-faint',
};

export function Badge({ tone = 'neutral', children, className, dot = true }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dots[tone])} />}
      {children}
    </span>
  );
}

const invoiceTones: Record<InvoiceStatus, Tone> = {
  draft: 'muted',
  sent: 'blue',
  partially_paid: 'warning',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'muted',
};

const quotationTones: Record<QuotationStatus, Tone> = {
  draft: 'muted',
  sent: 'blue',
  accepted: 'success',
  rejected: 'danger',
  expired: 'warning',
};

const projectTones: Record<ProjectStatus, Tone> = {
  planning: 'muted',
  quoted: 'neutral',
  approved: 'blue',
  in_progress: 'blue',
  review: 'warning',
  completed: 'success',
  on_hold: 'warning',
  cancelled: 'danger',
};

const clientTones: Record<ClientStatus, Tone> = { active: 'success', lead: 'blue', inactive: 'muted' };

export const InvoiceStatusBadge = ({ status }: { status: InvoiceStatus }) => (
  <Badge tone={invoiceTones[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>
);
export const QuotationStatusBadge = ({ status }: { status: QuotationStatus }) => (
  <Badge tone={quotationTones[status]}>{QUOTATION_STATUS_LABELS[status]}</Badge>
);
export const ProjectStatusBadge = ({ status }: { status: ProjectStatus }) => (
  <Badge tone={projectTones[status]}>{PROJECT_STATUS_LABELS[status]}</Badge>
);
export const ClientStatusBadge = ({ status }: { status: ClientStatus }) => (
  <Badge tone={clientTones[status]}>{CLIENT_STATUS_LABELS[status]}</Badge>
);

export const STATUS_COLORS = {
  draft: '#646B78',
  sent: '#3985FF',
  partially_paid: '#F0B84B',
  paid: '#35C98A',
  overdue: '#F16B75',
  cancelled: '#3A404C',
} satisfies Record<InvoiceStatus, string>;

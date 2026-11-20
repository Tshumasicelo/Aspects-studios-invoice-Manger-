import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-150 select-none disabled:pointer-events-none disabled:opacity-50 active:translate-y-px';

const variants: Record<Variant, string> = {
  primary:
    'bg-blue text-white shadow-[0_1px_0_0_#ffffff30_inset,0_8px_24px_-10px_#3985ffaa] hover:bg-[#4b91ff] hover:shadow-[0_1px_0_0_#ffffff30_inset,0_10px_28px_-10px_#3985ffcc]',
  secondary:
    'border border-border bg-card-2 text-text shadow-[0_1px_0_0_#ffffff0a_inset] hover:border-border-strong hover:bg-[#202634]',
  ghost: 'text-muted hover:bg-white/[0.04] hover:text-text',
  subtle: 'bg-white/[0.04] text-accent hover:bg-white/[0.07] hover:text-text',
  danger: 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 hover:border-danger/50',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-sm',
  icon: 'h-9 w-9 p-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function ButtonLink({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

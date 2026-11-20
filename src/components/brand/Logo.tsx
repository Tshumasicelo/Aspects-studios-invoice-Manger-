import { useId } from 'react';
import { cn } from '@/lib/cn';

/** ASPECTS STUDIOS monogram: a faceted prism ("aspects") in brushed silver with an electric-blue edge. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" className={cn('h-8 w-8', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-m`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F4F5F7" />
          <stop offset="0.55" stopColor="#AEB8C7" />
          <stop offset="1" stopColor="#5D6573" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#3985FF" />
          <stop offset="1" stopColor="#8DB8FF" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="15" fill="#101217" stroke="#272D38" strokeWidth="2" />
      <path d="M32 11 L51 47 H13 Z" fill="none" stroke={`url(#${id}-m)`} strokeWidth="4.2" strokeLinejoin="round" />
      <path d="M32 11 L41.5 29" stroke={`url(#${id}-b)`} strokeWidth="4.2" strokeLinecap="round" />
      <path d="M22.5 38 H41.5" stroke={`url(#${id}-m)`} strokeWidth="3.4" strokeLinecap="round" opacity="0.85" />
      <circle cx="51" cy="47" r="3" fill="#3985FF" />
    </svg>
  );
}

export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark className="h-9 w-9 shrink-0" />
      {!collapsed && (
        <div className="min-w-0 leading-none">
          <div className="metal-text font-display text-[0.95rem] font-bold tracking-[0.2em]">ASPECTS</div>
          <div className="mt-1 text-[0.6rem] font-medium tracking-[0.32em] text-faint">STUDIOS · INVOICE</div>
        </div>
      )}
    </div>
  );
}

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Inbox } from 'lucide-react';
import { cn, initials } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-soft text-success-deep',
  warning: 'bg-warning-soft text-warning-deep',
  danger: 'bg-danger-soft text-danger-deep',
  info: 'bg-info-soft text-info-deep',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  dot = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span className={cn('chip', TONES[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function Avatar({
  name,
  src,
  size = 'md',
  className,
  ring = false,
}: {
  name?: string | null;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ring?: boolean;
}) {
  const sizes = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-8 w-8 text-[11px]',
    md: 'h-10 w-10 text-xs',
    lg: 'h-14 w-14 text-sm',
    xl: 'h-20 w-20 text-lg',
  } as const;

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? 'Profile'}
        className={cn('shrink-0 rounded-full object-cover', sizes[size], ring && 'ring-2 ring-white', className)}
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700',
        sizes[size],
        ring && 'ring-2 ring-white',
        className,
      )}
      title={name ?? undefined}
    >
      {initials(name)}
    </span>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
      {label ? <span className="text-[13px] text-ink-muted">{label}</span> : null}
      <span className="sr-only">Loading</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-400">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="text-[15px] font-bold text-ink">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'brand',
  className,
  showLabel = false,
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  className?: string;
  showLabel?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  const tones = {
    brand: 'bg-brand-500',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  } as const;

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <motion.div
          className={cn('h-full rounded-full', tones[tone])}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      {showLabel ? (
        <span className="w-10 shrink-0 text-right text-[12px] font-semibold text-ink-muted">
          {Math.round(pct)}%
        </span>
      ) : null}
    </div>
  );
}

/**
 * A count-up number used in KPI cards. Uses the Web Animations-free approach
 * of a simple rAF loop so it stays cheap and respects reduced motion.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={className}>
      {prefix}
      <NumberTicker value={value} decimals={decimals} />
      {suffix}
    </span>
  );
}

function NumberTicker({ value, decimals }: { value: number; decimals: number }) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const from = display;
    const delta = value - from;
    const duration = 620;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + delta * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <>
      {display.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </>
  );
}

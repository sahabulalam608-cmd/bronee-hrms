import { motion, useReducedMotion } from 'framer-motion';
import { type ReactNode, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { avatarHue, initials } from '@/lib/format';

/* ------------------------------------------------------------------ *
 * Badge
 * ------------------------------------------------------------------ */

export type BadgeTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'chip-neutral',
  brand: 'chip-brand',
  ok: 'chip-ok',
  warn: 'chip-warn',
  bad: 'chip-bad',
  info: 'chip-info',
};

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn(BADGE_TONES[tone], 'whitespace-nowrap', className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Avatar
 * ------------------------------------------------------------------ */

export function Avatar({
  name,
  src,
  size = 40,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const hue = avatarHue(name);
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(10, size * 0.36),
  };
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={style}
        className={cn('shrink-0 rounded-full object-cover ring-1 ring-black/5', className)}
      />
    );
  }
  return (
    <span
      style={{
        ...style,
        background: `linear-gradient(135deg, hsl(${hue} 72% 58%), hsl(${(hue + 42) % 360} 76% 46%))`,
      }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Section card
 * ------------------------------------------------------------------ */

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
  padded = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
}) {
  return (
    <section className={cn('card', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="section-title">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-faint">{subtitle}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn(padded && 'p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Stat card
 * ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  trend,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: BadgeTone;
  trend?: { value: number; positive: boolean };
  onClick?: () => void;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-surface-sunken text-ink-muted',
    brand: 'bg-brand-50 text-brand-700',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad',
    info: 'bg-info-soft text-info',
  };
  const Wrapper = onClick ? motion.button : motion.div;
  return (
    <Wrapper
      onClick={onClick}
      whileHover={onClick ? { y: -2 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={cn('kpi group text-left', onClick && 'cursor-pointer hover:shadow-lift')}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-ink-muted">{label}</p>
        {icon && (
          <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', tones[tone])}>{icon}</span>
        )}
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</p>
      {(hint || trend) && (
        <p className="mt-2 text-[12px] text-ink-faint">
          {trend && (
            <span className={cn('mr-1.5 font-semibold', trend.positive ? 'text-ok' : 'text-bad')}>
              {trend.positive ? '▲' : '▼'} {Math.abs(trend.value)}%
            </span>
          )}
          {hint}
        </p>
      )}
    </Wrapper>
  );
}

/* ------------------------------------------------------------------ *
 * Progress ring — used for the live working timer
 * ------------------------------------------------------------------ */

export function ProgressRing({
  progress,
  size = 132,
  stroke = 9,
  children,
  trackClass = 'text-brand-100',
  barClass = 'text-brand-600',
}: {
  progress: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  trackClass?: string;
  barClass?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className={cn('fill-none', trackClass)} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          className={cn('fill-none transition-[stroke-dashoffset] duration-700 ease-out', barClass)}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Empty state & skeleton
 * ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-surface-sunken text-ink-faint">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card p-5">
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-full" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Toggle
 * ------------------------------------------------------------------ */

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex items-start gap-3', disabled && 'opacity-60')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-brand-600' : 'bg-line-strong',
          disabled && 'cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[12px] text-ink-faint">{description}</span>}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Animated counter
 * ------------------------------------------------------------------ */

export function AnimatedCounter({
  value,
  duration = 0.9,
  format,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      key={value}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : Math.min(duration, 0.6) }}
    >
      {format ? format(value) : value.toLocaleString('en-US')}
    </motion.span>
  );
}

/* ------------------------------------------------------------------ *
 * Page header
 * ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Meta row — label/value pair used across detail views
 * ------------------------------------------------------------------ */

export function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="text-right text-[13px] font-medium text-ink">{value}</span>
    </div>
  );
}

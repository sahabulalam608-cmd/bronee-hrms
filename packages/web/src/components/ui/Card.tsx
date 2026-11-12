import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({
  className,
  children,
  lift = false,
  ...rest
}: {
  className?: string;
  children: ReactNode;
  lift?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', lift && 'card-lift', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-5 pb-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold tracking-[-0.01em] text-ink">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 pb-5', className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex items-center justify-end gap-2 border-t border-line px-5 py-3.5', className)}>
      {children}
    </div>
  );
}

/** Section heading used above grouped content. */
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-muted">{children}</h2>
      {action}
    </div>
  );
}

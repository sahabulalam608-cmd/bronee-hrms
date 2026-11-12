import { useEffect, useState } from 'react';
import { dhakaClockParts, formatBanglaDate, toBanglaDigits } from '@bronee/shared';
import { cn } from '@/lib/utils';

/**
 * A live Dhaka clock. The server is the source of truth for attendance, but
 * the UI clock keeps the employee oriented in local time.
 */
export function LiveClock({
  className,
  showDate = true,
  compact = false,
}: {
  className?: string;
  showDate?: boolean;
  compact?: boolean;
}) {
  const [parts, setParts] = useState(() => dhakaClockParts(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => setParts(dhakaClockParts(new Date())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const time = `${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}:${String(parts.seconds).padStart(2, '0')}`;
  const dateKey = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;

  return (
    <div className={cn('text-right leading-tight', className)}>
      <div
        className={cn(
          'font-bold tracking-tight text-ink tabular-nums',
          compact ? 'text-[15px]' : 'text-[17px]',
        )}
      >
        {toBanglaDigits(time)}
      </div>
      {showDate ? (
        <div className="mt-0.5 text-[11.5px] font-medium text-ink-muted">
          {formatBanglaDate(dateKey, { withDay: true })}
        </div>
      ) : null}
    </div>
  );
}

/** A large hero clock used on the employee dashboard. */
export function HeroClock({ className }: { className?: string }) {
  const [parts, setParts] = useState(() => dhakaClockParts(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => setParts(dhakaClockParts(new Date())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const hh = String(parts.hours).padStart(2, '0');
  const mm = String(parts.minutes).padStart(2, '0');
  const ss = String(parts.seconds).padStart(2, '0');

  return (
    <div className={cn('flex items-baseline gap-1 font-extrabold tracking-[-0.03em] text-ink tabular-nums', className)}>
      <span className="text-[44px] leading-none sm:text-[52px]">{toBanglaDigits(hh)}</span>
      <span className="text-[28px] leading-none text-ink-muted sm:text-[34px]">:</span>
      <span className="text-[44px] leading-none sm:text-[52px]">{toBanglaDigits(mm)}</span>
      <span className="text-[22px] leading-none text-ink-muted sm:text-[26px]">:</span>
      <span className="text-[22px] leading-none text-brand-500 sm:text-[26px]">{toBanglaDigits(ss)}</span>
    </div>
  );
}

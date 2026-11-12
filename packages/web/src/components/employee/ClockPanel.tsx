import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Coffee, LogIn, LogOut, TimerReset, Zap } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAttendanceStatus } from '@/lib/queries';
import { Button, useToast } from '@/components/ui';
import { HeroClock } from '@/components/layout/Clock';
import { formatDuration } from '@bronee/shared';
import { cn, shiftColor } from '@/lib/utils';

/**
 * A smoothly ticking counter that anchors on the server value and adds the
 * locally elapsed time, so the clock never drifts away from the truth.
 */
export function LiveTimer({
  baseSeconds,
  className,
  format = 'clock',
}: {
  baseSeconds: number;
  className?: string;
  format?: 'clock' | 'duration';
}) {
  const [extra, setExtra] = useState(0);
  const anchor = useRef(Date.now());

  useEffect(() => {
    anchor.current = Date.now();
    setExtra(0);
  }, [baseSeconds]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setExtra(Math.floor((Date.now() - anchor.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const total = Math.max(0, baseSeconds) + extra;
  if (format === 'duration') {
    return <span className={className}>{formatDuration(total)}</span>;
  }
  const hh = String(Math.floor(total / 3600)).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return (
    <span className={className}>
      {hh}:{mm}:{ss}
    </span>
  );
}

/**
 * The live attendance panel — status, timer, and the clock in / clock out /
 * break controls. Shared by the dashboard and the attendance screen.
 */
export function ClockPanel({ compact = false }: { compact?: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useAttendanceStatus();

  const session = data?.session ?? null;
  const activeBreak = data?.activeBreak ?? null;
  const shift = data?.rosterShift ?? data?.scheduledShift ?? null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const clockIn = useMutation({
    mutationFn: async () => {
      const position = await requestPosition();
      return api.post<{ message: string; workingStarted: boolean }>('/attendance/clock-in', {
        latitude: position?.coords.latitude ?? null,
        longitude: position?.coords.longitude ?? null,
        accuracyMeters: position?.coords.accuracy ?? null,
        source: 'pwa',
      });
    },
    onSuccess: (result) => {
      toast.success('Clocked in', result.message);
      refresh();
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Unable to clock in.';
      toast.error('Clock-in blocked', message);
    },
  });

  const clockOut = useMutation({
    mutationFn: () => api.post<{ message: string; workingSeconds: number }>('/attendance/clock-out'),
    onSuccess: (result) => {
      toast.success('Clocked out', result.message);
      refresh();
    },
    onError: (error) => {
      toast.error('Clock-out failed', error instanceof ApiError ? error.message : 'Please try again.');
    },
  });

  const startBreak = useMutation({
    mutationFn: () => api.post('/attendance/break/start'),
    onSuccess: () => {
      toast.info('Break started', 'Your working timer is paused.');
      refresh();
    },
    onError: (error) => {
      toast.error('Cannot start break', error instanceof ApiError ? error.message : 'Please try again.');
    },
  });

  const endBreak = useMutation({
    mutationFn: () => api.post('/attendance/break/end'),
    onSuccess: () => {
      toast.success('Break ended', 'Welcome back — your working timer has resumed.');
      refresh();
    },
    onError: (error) => {
      toast.error('Cannot end break', error instanceof ApiError ? error.message : 'Please try again.');
    },
  });

  const busy =
    clockIn.isPending || clockOut.isPending || startBreak.isPending || endBreak.isPending;

  if (isLoading) {
    return <div className="skeleton h-[220px] w-full rounded-2xl" />;
  }

  const onBreak = Boolean(activeBreak);
  const working = session?.status === 'open' && !onBreak && !session?.clockOutAt;
  const closed = Boolean(session?.clockOutAt);
  const isOffDay = Boolean(data?.isOffDay);
  const colors = shiftColor(shift?.code);

  const statusMeta = closed
    ? { label: 'Shift closed', tone: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' }
    : onBreak
      ? { label: 'On break', tone: 'bg-warning-soft text-warning-deep', dot: 'bg-warning' }
      : working
        ? { label: 'Working', tone: 'bg-success-soft text-success-deep', dot: 'bg-success' }
        : { label: 'Not clocked in', tone: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' };

  return (
    <div className="card card-lift relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-100/60 blur-3xl" />

      <div className="relative p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', statusMeta.dot, working && 'animate-pulse')} />
              <span className={cn('chip', statusMeta.tone)}>{statusMeta.label}</span>
            </div>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
              Live working time
            </p>
            <LiveTimer
              baseSeconds={data?.liveWorkingSeconds ?? 0}
              className="mt-0.5 block text-[38px] font-extrabold leading-none tracking-[-0.035em] text-ink tabular-nums sm:text-[46px]"
            />
            {onBreak ? (
              <p className="mt-2 text-[12.5px] font-medium text-warning-deep">
                Break timer ·{' '}
                <LiveTimer
                  baseSeconds={data?.liveBreakSeconds ?? 0}
                  format="duration"
                  className="tabular-nums"
                />
              </p>
            ) : null}
          </div>

          <div className="text-right">
            <HeroClock />
            {shift ? (
              <div className="mt-2 flex justify-end">
                <span className={cn('chip ring-1', colors.bg, colors.text, colors.ring)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', colors.dot)} />
                  {shift.shortName} · {shift.startTime}–{shift.endTime}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Controls */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {!working && !closed && !onBreak ? (
            <Button
              size="lg"
              onClick={() => clockIn.mutate()}
              loading={clockIn.isPending}
              disabled={busy || isOffDay}
              icon={<LogIn className="h-4 w-4" />}
            >
              {isOffDay ? 'Off day today' : 'Clock in'}
            </Button>
          ) : null}

          {working ? (
            <Button
              size="lg"
              onClick={() => startBreak.mutate()}
              loading={startBreak.isPending}
              disabled={busy}
              variant="soft"
              icon={<Coffee className="h-4 w-4" />}
            >
              Take break
            </Button>
          ) : null}

          {onBreak ? (
            <Button
              size="lg"
              onClick={() => endBreak.mutate()}
              loading={endBreak.isPending}
              disabled={busy}
              icon={<TimerReset className="h-4 w-4" />}
            >
              Resume working
            </Button>
          ) : null}

          {(working || onBreak) ? (
            <Button
              size="lg"
              variant="danger"
              onClick={() => clockOut.mutate()}
              loading={clockOut.isPending}
              disabled={busy}
              icon={<LogOut className="h-4 w-4" />}
            >
              Clock out
            </Button>
          ) : null}

          {closed ? (
            <span className="inline-flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-[13px] font-semibold text-success-deep">
              <Zap className="h-4 w-4" />
              Duty completed · {formatDuration(session?.workingSeconds ?? 0)} worked
            </span>
          ) : null}
        </div>

        {/* Verification note */}
        {session?.verificationResult === 'failed' ? (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] font-medium leading-relaxed text-danger-deep"
          >
            Office attendance could not be verified, so your working timer has not started. Please
            contact HR — they can approve an exception from the attendance review screen.
          </motion.p>
        ) : null}

        {session?.lateStatus === 'pending_review' && session?.verificationResult === 'verified' ? (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[12.5px] font-medium leading-relaxed text-warning-deep"
          >
            Attendance was verified after the 1-minute verification window. HR will finalise your
            late status.
          </motion.p>
        ) : null}

        <AnimatePresence>
          {data?.approvedOvertime ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden"
            >
              <div className="flex items-center gap-2.5 rounded-xl bg-brand-50 px-3.5 py-3 text-[12.5px] font-medium text-brand-800">
                <Zap className="h-4 w-4 shrink-0" />
                Approved overtime is active from{' '}
                {new Date(data.approvedOvertime.approvedStart ?? '').toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })}
                . Overtime hours count towards your payslip.
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {compact ? null : null}
      </div>
    </div>
  );
}

/** Ask for the device position, but never block the user if it is denied. */
function requestPosition(): Promise<GeolocationPosition | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: GeolocationPosition | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer);
        finish(position);
      },
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
  });
}

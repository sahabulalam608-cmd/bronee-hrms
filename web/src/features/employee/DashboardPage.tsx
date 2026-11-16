import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BellRing,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Coffee,
  LogIn,
  LogOut,
  PlayCircle,
  ShieldCheck,
  Timer,
  Wallet,
} from 'lucide-react';
import { NumberingBar } from '@/components/ui/list-numbering';
import { api } from '@/lib/api';
import { useAsync, useNow } from '@/lib/hooks';
import { getCachedPosition, getPosition } from '@/lib/geo';
import { cn } from '@/lib/cn';
import { formatDate, formatDuration, formatHoursMinutes, formatTime, todayBD } from '@/lib/time';
import { shiftLabel } from '@/lib/status';
import { useToast } from '@/components/ui/overlay';
import { Alert } from '@/components/ui/forms';
import { Badge, PageHeader, ProgressRing, SectionCard, StatCard } from '@/components/ui/primitives';
import { scheduleFor } from '@shared/attendance';
import { SHIFT_BY_CODE, VERIFICATION } from '@shared/constants';
import type { EmployeeDashboard } from '@shared/types';

export function DashboardPage() {
  const toast = useToast();
  const now = useNow(1000);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, reload, error } = useAsync<EmployeeDashboard>(
    () => api.employeeDashboard(),
    [],
  );

  useEffect(() => {
    if (!data) return;
    const timer = window.setInterval(() => reload(), 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data)]);

  /**
   * The automatic attendance tick (§6.2 – §6.8).
   *
   * It performs the automatic clock in at the scheduled shift start and the
   * automatic clock out at the scheduled shift end, so the employee never has
   * to press a button for either of them.
   */
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const position = await getCachedPosition();
        const result = await api.attendanceTick({
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
          accuracy: position?.accuracy ?? null,
        });
        if (cancelled) return;
        if (result.changed) {
          toast.success(
            result.changed === 'CLOCKED_IN' ? 'Clocked in automatically' : 'Shift closed automatically',
            result.message,
          );
          reload();
        }
      } catch {
        /* the tick is best effort — the next one will try again */
      }
    };
    const timer = window.setInterval(() => void tick(), 20_000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data)]);

  const liveSeconds = useMemo(() => {
    if (!data?.today.workingStart || data.today.clockOut) {
      return data?.today.totalWorkingSeconds ?? 0;
    }
    // The working counter keeps running while the employee is on a break —
    // the break time is tracked on its own.
    const elapsed = Math.floor((now - new Date(data.today.workingStart).getTime()) / 1000);
    return Math.max(0, elapsed);
  }, [data, now]);

  /** The break that is running right now. */
  const liveBreakSeconds = useMemo(() => {
    if (!data?.today.onBreak || !data.today.breakStartedAt) return 0;
    const elapsed = Math.floor((now - new Date(data.today.breakStartedAt).getTime()) / 1000);
    return Math.max(0, elapsed);
  }, [data, now]);

  /** The break time of today, including the break that is running. */
  const breakSecondsToday = (data?.today.totalBreakSeconds ?? 0) + liveBreakSeconds;

  /** The schedule of today — it drives the pre-clock-in window. */
  const schedule = useMemo(
    () => scheduleFor(data?.user.shiftCode ?? 'MORNING', data?.today.workDate ?? todayBD()),
    [data?.user.shiftCode, data?.today.workDate],
  );

  const shift = data ? SHIFT_BY_CODE[data.today.shiftCode] : null;

  async function doClockIn() {
    setBusy('in');
    try {
      const position = await getPosition();
      const result = await api.clockIn({
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
        accuracy: position?.accuracy ?? null,
      });
      if (result.verification === 'SUCCESS') {
        toast.success('Clocked in', result.message);
      } else if (result.verification === 'PENDING') {
        toast.info('Pre-clock-in recorded', result.message);
      } else {
        toast.warning('Verification failed', result.message);
      }
      reload();
    } catch (err) {
      toast.error('Clock in failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function doClockOut() {
    setBusy('out');
    try {
      const result = await api.clockOut();
      toast.success('Clocked out', result.message);
      reload();
    } catch (err) {
      toast.error('Clock out failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function toggleBreak() {
    setBusy('break');
    try {
      if (data?.today.onBreak) {
        await api.endBreak();
        toast.success('Break ended', 'Working time has resumed.');
      } else {
        await api.startBreak();
        toast.info('Break started', 'The working counter keeps running while you are on break.');
      }
      reload();
    } catch (err) {
      toast.error('Break update failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  /**
   * Stops the running break and opens Break Management.
   * The break timer pauses the moment the break is closed.
   */
  async function stopBreak() {
    setBusy('break');
    try {
      await api.endBreak();
      toast.success('Break stopped', 'The break timer is stopped and the working counter keeps running.');
      reload();
      navigate('/employee/break');
    } catch (err) {
      toast.error('Could not stop the break', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <DashboardSkeleton />;
  if (error || !data) {
    return (
      <Alert tone="bad" title="Could not load the dashboard">
        {error ?? 'Unknown error.'}
      </Alert>
    );
  }

  const { user, today, month, recentActivity, quickAccess } = data;
  const working = today.working;
  const minutesToStart = Math.round((Date.parse(schedule.start) - now) / 60000);
  /** A punch taken before the scheduled start is a pre-clock-in (§6.2). */
  const isBeforeShift = minutesToStart > 0;
  const tooEarly = minutesToStart > VERIFICATION.PRE_CLOCK_IN_MAX;
  /** The pre-clock-in opens 15 minutes before the shift. */
  const preClockInOpensAt = new Date(
    Date.parse(schedule.start) - VERIFICATION.PRE_CLOCK_IN_MAX * 60_000,
  );
  const waitingForShift = Boolean(today.punchIn) && !today.workingStart && !today.clockOut;
  const shiftProgress = shift
    ? Math.min(
        1,
        Math.max(
          0,
          (liveSeconds / 60) /
            Math.max(
              1,
              shift.endMinutes -
                shift.startMinutes +
                (shift.endNextDay ? 1440 : 0),
            ),
          ),
        )
    : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Good ${greeting()}, ${user.fullName.split(' ')[0]}`}
        subtitle={`${formatDate(new Date())} · ${user.designation}`}
        actions={
          <Link to="/employee/roster" className="btn-secondary btn-sm">
            <CalendarDays size={15} />
            View roster
          </Link>
        }
      />

      {/* ---------------- welcome ---------------- */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="card overflow-hidden"
      >
        <div className="flex flex-wrap items-center gap-4 border-b border-line bg-[linear-gradient(110deg,#faf9ff,#ffffff_60%)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{user.fullName}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              {user.employeeId} · {user.designation}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{user.departmentName}</Badge>
            {user.subDepartmentName && <Badge tone="neutral">{user.subDepartmentName}</Badge>}
            <Badge tone="info" dot>
              {shiftLabel(user.shiftCode)}
            </Badge>
          </div>
        </div>

        {/* ---------------- live attendance ---------------- */}
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-sunken px-5 py-6">
            <ProgressRing
              progress={shiftProgress}
              size={150}
              stroke={10}
              barClass={working ? 'text-brand-600' : 'text-line-strong'}
            >
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-faint">
                  {today.onBreak
                    ? 'On break'
                    : working
                      ? 'Working'
                      : waitingForShift
                        ? 'Pre-clocked'
                        : today.punchIn
                          ? 'Recorded'
                          : 'Not started'}
                </p>
                <p className="mt-1 font-mono text-[27px] font-semibold leading-none tabular-nums text-ink">
                  {formatDuration(liveSeconds).slice(0, 5)}
                </p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  {waitingForShift
                    ? `Automatic clock in at ${formatTime(schedule.start)}`
                    : today.onBreak
                      ? `Working ${formatDuration(liveSeconds).slice(0, 5)} · break ${formatDuration(liveBreakSeconds).slice(0, 5)}`
                      : 'Live working timer'}
                </p>
              </div>
            </ProgressRing>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {!today.punchIn && (
                <button
                  type="button"
                  className={cn('btn-sm', isBeforeShift ? 'btn-primary' : 'btn-secondary')}
                  onClick={doClockIn}
                  disabled={busy !== null || tooEarly}
                  title={
                    isBeforeShift
                      ? 'Pre-clock-in: the punch is stored and the system verifies you at the shift start.'
                      : 'Clock in and verify the office network or the office location.'
                  }
                >
                  <LogIn size={15} />
                  {busy === 'in'
                    ? 'Verifying…'
                    : isBeforeShift
                      ? 'Pre-Clock In'
                      : 'Clock In'}
                </button>
              )}
              {waitingForShift && (
                <span className="chip-info">
                  <Timer size={13} />
                  Verified automatically at {formatTime(schedule.start)}
                </span>
              )}
              {today.punchIn && today.workingStart && !today.clockOut && (
                <>
                  {today.onBreak ? (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={stopBreak}
                      disabled={busy !== null}
                      title="Stop the running break and open Break Management"
                    >
                      <PlayCircle size={15} />
                      Stop break
                    </button>
                  ) : (
                    <button type="button" className="btn-secondary btn-sm" onClick={toggleBreak} disabled={busy !== null}>
                      <Coffee size={15} />
                      Take break
                    </button>
                  )}
                  <button type="button" className="btn-secondary btn-sm" onClick={doClockOut} disabled={busy !== null}>
                    <LogOut size={15} />
                    {busy === 'out' ? 'Closing…' : 'Clock Out'}
                  </button>
                </>
              )}
              {today.clockOut && (
                <span className="chip-ok">
                  <CheckCircle2 size={13} />
                  Duty closed
                </span>
              )}
            </div>

            {tooEarly && !today.punchIn && (
              <p className="mt-3 text-center text-[11.5px] text-ink-faint">
                Pre-clock-in opens at {formatTime(preClockInOpensAt)} — {VERIFICATION.PRE_CLOCK_IN_MIN} to{' '}
                {VERIFICATION.PRE_CLOCK_IN_MAX} minutes before your shift starts at{' '}
                {formatTime(schedule.start)}.
              </p>
            )}
            {!tooEarly && isBeforeShift && !today.punchIn && (
              <p className="mt-3 text-center text-[11.5px] text-ink-faint">
                Pre-clock-in is open. The punch is stored now and the system verifies the office network
                or the office location at {formatTime(schedule.start)}.
              </p>
            )}

            {today.verificationResult === 'FAILED' && (
              <Alert tone="bad" className="mt-4 w-full text-left">
                Verification failed — the working timer stays stopped until an HR review or
                exception approval.
              </Alert>
            )}
            {today.verificationResult === 'SUCCESS' && today.verificationMethod !== 'NONE' && (
              <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                <ShieldCheck size={13} className="text-ok" />
                Verified via {today.verificationMethod === 'OFFICE_IP' ? 'office network' : 'office GPS'}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SectionCard title="Today's summary" className="sm:col-span-2" padded={false}>
              <div className="grid grid-cols-2 divide-x divide-line sm:grid-cols-4">
                {[
                  {
                    label: 'Total working time',
                    value: formatHoursMinutes(
                      today.clockOut ? today.totalWorkingSeconds : liveSeconds,
                    ),
                    icon: <Timer size={15} />,
                  },
                  {
                    label: 'Total break time',
                    value: formatHoursMinutes(breakSecondsToday),
                    icon: <Coffee size={15} />,
                  },
                  {
                    label: 'Break sessions',
                    value: String(today.breakSessions + (today.onBreak ? 1 : 0)),
                    icon: <ClipboardList size={15} />,
                  },
                  {
                    label: 'Attendance status',
                    value: today.attendanceStatus,
                    icon: <CheckCircle2 size={15} />,
                    tone: today.attendanceStatus === 'Verified' ? 'ok' : 'warn',
                  },
                ].map((item) => (
                  <div key={item.label} className="px-4 py-4">
                    <p className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                      <span className="text-ink-faint">{item.icon}</span>
                      {item.label}
                    </p>
                    <p
                      className={cn(
                        'mt-1.5 text-[16px] font-semibold tracking-[-0.01em]',
                        item.tone === 'ok' ? 'text-ok' : item.tone === 'warn' ? 'text-warn' : 'text-ink',
                      )}
                    >
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Monthly summary" padded={false}>
              <div className="divide-y divide-line">
                {[
                  ['This month working hours', formatHoursMinutes(month.totalWorkingSeconds)],
                  ['This month break hours', formatHoursMinutes(month.totalBreakSeconds)],
                  ['Total overtime hours', formatHoursMinutes(month.totalOvertimeSeconds)],
                  ['Monthly late days', `${month.lateDays} day${month.lateDays === 1 ? '' : 's'}`],
                  ['Completed tasks', String(month.completedTasks)],
                  ['Pending tasks', String(month.pendingTasks)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-[12.5px] text-ink-muted">{label}</span>
                    <span className="text-[13px] font-semibold text-ink">{value}</span>
                  </div>
                ))}
              </div>
              <p className="border-t border-line bg-surface-raised px-5 py-2.5 text-[11px] text-ink-faint">
                Attendance bonus amounts are only visible to HR.
              </p>
            </SectionCard>

            <SectionCard title="Recent activity" padded={false}>
              <div className="divide-y divide-line">
                {[
                  ['Last duty date', recentActivity.lastDutyDate ? formatDate(recentActivity.lastDutyDate) : '—'],
                  ['Last clock in', formatTime(recentActivity.lastClockIn)],
                  ['Last clock out', formatTime(recentActivity.lastClockOut)],
                  ['Last break start', formatTime(recentActivity.lastBreakStart)],
                  ['Last break end', formatTime(recentActivity.lastBreakEnd)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-[12.5px] text-ink-muted">{label}</span>
                    <span className="text-[13px] font-medium text-ink">{value}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      </motion.section>

      {/* ---------------- quick access ---------------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending tasks"
          value={quickAccess.pendingTasks}
          icon={<ClipboardList size={17} />}
          hint="Assigned to you"
        />
        <StatCard
          label="Leave balance"
          value={`${quickAccess.leaveBalance} days`}
          icon={<CalendarClock size={17} />}
          tone="info"
          hint="Remaining entitlement"
        />
        <StatCard
          label="Notifications"
          value={quickAccess.unreadNotifications}
          icon={<BellRing size={17} />}
          tone="warn"
          hint="Unread items"
        />
        <StatCard
          label="Current shift"
          value={
            quickAccess.currentRoster
              ? shiftLabel(quickAccess.currentRoster.shiftCode)
              : 'Not scheduled'
          }
          icon={<BriefcaseBusiness size={17} />}
          tone="ok"
          hint={quickAccess.currentRoster ? formatDate(quickAccess.currentRoster.date) : 'No roster entry'}
        />
      </div>

      {/* ---------------- upcoming deadlines ---------------- */}
      <SectionCard
        title="Upcoming deadlines"
        subtitle="Your nearest task due dates"
        action={
          <Link to="/employee/tasks" className="btn-ghost btn-sm">
            All tasks
            <ArrowRight size={14} />
          </Link>
        }
        padded={false}
      >
        {quickAccess.upcomingDeadlines.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-faint">No upcoming deadlines.</p>
        ) : (
                    <div>
            <NumberingBar className="mb-2" />
            <ul className="serial-list divide-y divide-line">
            {quickAccess.upcomingDeadlines.map((deadline) => (
            <li key={deadline.taskId} className="flex items-center gap-3 px-5 py-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-sunken text-ink-faint">
            <CalendarClock size={15} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
            {deadline.name}
            </span>
            <span className="shrink-0 text-[12.5px] text-ink-muted">{formatDate(deadline.dueDate)}</span>
            </li>
            ))}
            </ul>
          </div>
        )}
      </SectionCard>

    </div>
  );
}

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', hour12: false }).format(
      new Date(),
    ),
  );
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="skeleton h-9 w-72" />
      <div className="skeleton h-64 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export { Wallet };

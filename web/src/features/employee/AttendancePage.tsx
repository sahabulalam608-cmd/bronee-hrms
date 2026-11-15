import { useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  CheckCircle2,
  Clock3,
  LogIn,
  LogOut,
  ShieldCheck,
  ShieldX,
  Timer,
} from 'lucide-react';
import { NumberingBar } from '@/components/ui/list-numbering';
import { api } from '@/lib/api';
import { useAsync, useNow } from '@/lib/hooks';
import { getCachedPosition, getPosition } from '@/lib/geo';
import { formatDate, formatDateTime, formatHoursMinutes, formatTime, todayBD } from '@/lib/time';
import { cn } from '@/lib/cn';
import { attendanceTone, lateTone } from '@/lib/status';
import { useToast } from '@/components/ui/overlay';
import { Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data';
import { scheduleFor } from '@shared/attendance';
import { VERIFICATION } from '@shared/constants';
import { useAuth } from '@/features/auth/AuthProvider';
import type { AttendanceRecord } from '@shared/types';

const MONTHS = buildMonthOptions();

export function AttendancePage() {
  const toast = useToast();
  const { user } = useAuth();
  const now = useNow(1000);
  const [month, setMonth] = useState(currentMonth());
  const [busy, setBusy] = useState(false);
  const { data, loading, reload } = useAsync(() => api.employeeAttendance(month), [month]);

  const schedule = useMemo(
    () => (user ? scheduleFor(user.shiftCode, todayBD()) : null),
    [user?.shiftCode],
  );
  const minutesToStart = schedule
    ? Math.round((Date.parse(schedule.start) - now) / 60000)
    : 0;
  /** A punch taken before the scheduled start is a pre-clock-in (§6.2). */
  const isBeforeShift = minutesToStart > 0;
  const tooEarly = minutesToStart > VERIFICATION.PRE_CLOCK_IN_MAX;
  const preClockInOpensAt = schedule
    ? new Date(Date.parse(schedule.start) - VERIFICATION.PRE_CLOCK_IN_MAX * 60_000)
    : null;

  /**
   * The automatic attendance tick (§6.2 – §6.8) — the automatic clock in at
   * the shift start and the automatic clock out at the shift end.
   */
  useEffect(() => {
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
  }, [month]);

  async function clockIn() {
    setBusy(true);
    try {
      const position = await getPosition();
      const result = await api.clockIn({
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
        accuracy: position?.accuracy ?? null,
      });
      if (result.verification === 'SUCCESS') toast.success('Clocked in', result.message);
      else if (result.verification === 'PENDING') toast.info('Pre-clock-in recorded', result.message);
      else toast.warning('Verification failed', result.message);
      reload();
    } catch (err) {
      toast.error('Clock in failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function clockOut() {
    setBusy(true);
    try {
      const result = await api.clockOut();
      toast.success('Clocked out', result.message);
      reload();
    } catch (err) {
      toast.error('Clock out failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<Column<AttendanceRecord & Record<string, unknown>>[]>(
    () => [
      {
        key: 'workDate',
        header: 'Date',
        width: '120px',
        render: (row) => <span className="font-medium text-ink">{formatDate(row.workDate)}</span>,
      },
      { key: 'shiftName', header: 'Shift', render: (row) => row.shiftName },
      {
        key: 'punchIn',
        header: 'Clock in',
        render: (row) => <span className="font-mono tabular-nums">{formatTime(row.punchIn)}</span>,
      },
      {
        key: 'clockOut',
        header: 'Clock out',
        render: (row) => <span className="font-mono tabular-nums">{formatTime(row.clockOut)}</span>,
      },
      {
        key: 'totalWorkingSeconds',
        header: 'Working',
        align: 'right',
        render: (row) => formatHoursMinutes(row.totalWorkingSeconds),
      },
      {
        key: 'verificationMethod',
        header: 'Verification',
        render: (row) =>
          row.verificationResult === 'SUCCESS' ? (
            <Badge tone="ok">
              <ShieldCheck size={12} />
              {row.verificationMethod === 'OFFICE_IP' ? 'Office IP' : row.verificationMethod === 'GPS' ? 'GPS' : '—'}
            </Badge>
          ) : row.verificationResult === 'FAILED' ? (
            <Badge tone="bad">
              <ShieldX size={12} />
              Failed
            </Badge>
          ) : (
            <Badge tone="neutral">Pending</Badge>
          ),
      },
      {
        key: 'attendanceStatus',
        header: 'Status',
        render: (row) => <Badge tone={attendanceTone(row.attendanceStatus)}>{row.attendanceStatus}</Badge>,
      },
      {
        key: 'lateStatus',
        header: 'Late',
        render: (row) => <Badge tone={lateTone(row.lateStatus)}>{row.lateStatus}</Badge>,
      },
    ],
    [],
  );

  const summary = data
    ? [
        { label: 'Present', value: data.totalPresent, tone: 'ok' as const, icon: <CheckCircle2 size={17} /> },
        { label: 'Late', value: data.totalLate, tone: 'bad' as const, icon: <Clock3 size={17} /> },
        { label: 'On leave', value: data.totalOnLeave, tone: 'info' as const, icon: <CalendarRange size={17} /> },
        {
          label: 'Pending review',
          value: data.totalPendingReview,
          tone: 'warn' as const,
          icon: <ShieldX size={17} />,
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance"
        subtitle="Your verified attendance record for the selected month"
        actions={
          <>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="select-field w-auto min-w-[150px]"
              aria-label="Month"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={cn('btn-sm', isBeforeShift ? 'btn-primary' : 'btn-secondary')}
              onClick={clockIn}
              disabled={busy || tooEarly}
              title={
                isBeforeShift
                  ? 'Pre-clock-in: the punch is stored and the system verifies you at the shift start.'
                  : 'Clock in and verify the office network or the office location.'
              }
            >
              <LogIn size={15} />
              {busy ? 'Verifying…' : isBeforeShift ? 'Pre-Clock In' : 'Clock in'}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={clockOut} disabled={busy}>
              <LogOut size={15} />
              Clock out
            </button>
          </>
        }
      />

      {schedule && (
        <SectionCard title="Today" subtitle="Automatic clock in and clock out for your shift">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface-sunken px-4 py-3">
              <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink-faint">
                Scheduled shift
              </p>
              <p className="mt-1 text-[14px] font-semibold text-ink">
                {formatTime(schedule.start)} – {formatTime(schedule.end)}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-muted">{user?.shiftName}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-sunken px-4 py-3">
              <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink-faint">
                Verification window
              </p>
              <p className="mt-1 text-[14px] font-semibold text-ink">
                First {VERIFICATION.WINDOW_MINUTES} minute of the shift
              </p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                Office network first, then the office location
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-sunken px-4 py-3">
              <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink-faint">
                Pre-clock-in
              </p>
              <p className="mt-1 text-[14px] font-semibold text-ink">
                {VERIFICATION.PRE_CLOCK_IN_MIN}–{VERIFICATION.PRE_CLOCK_IN_MAX} minutes before the shift
              </p>
              {preClockInOpensAt && (
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  Opens at {formatTime(preClockInOpensAt.toISOString())}
                </p>
              )}
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-muted">
                <Timer size={12} />
                The working timer starts at the scheduled shift start
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <StatCard
            key={item.label}
            label={item.label}
            value={item.value}
            icon={item.icon}
            tone={item.tone}
          />
        ))}
      </div>

      <SectionCard title="Attendance records" padded={false}>
        <DataTable
          columns={columns as Column<(AttendanceRecord & Record<string, unknown>)>[]}
          rows={(data?.records ?? []) as (AttendanceRecord & Record<string, unknown>)[]}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No attendance records"
          emptyDescription="Records appear here once you clock in on a scheduled working day."
          emptyIcon={<Clock3 size={22} />}
        />
      </SectionCard>

      {data && data.records.some((r) => r.hrReviewStatus === 'Reviewed') && (
        <SectionCard title="Review history" padded={false}>
                    <div>
            <NumberingBar className="mb-2" />
            <ul className="serial-list divide-y divide-line">
            {data.records
            .filter((r) => r.hrReviewStatus === 'Reviewed')
            .slice(0, 6)
            .map((r) => (
            <li key={r.id} className="px-5 py-3">
            <p className="text-[13px] font-medium text-ink">
            {formatDate(r.workDate)} · {r.attendanceStatus}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-muted">
            {r.hrReviewNote ?? 'Reviewed by HR.'}
            {r.reviewedBy ? ` — ${r.reviewedBy}, ${formatDateTime(r.reviewedAt)}` : ''}
            </p>
            </li>
            ))}
            </ul>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function buildMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(d),
    });
  }
  return options;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export { cn };

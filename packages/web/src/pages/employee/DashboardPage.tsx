import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlarmClock,
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Coffee,
  Moon,
  Sun,
  Timer,
} from 'lucide-react';
import {
  formatBanglaDate,
  formatDhakaTime,
  formatDuration,
  humanDuration,
  dhakaDateKey,
} from '@bronee/shared';
import { useDashboard } from '@/lib/queries';
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar, Skeleton } from '@/components/ui';
import { AnimatedNumber } from '@/components/ui';
import { ClockPanel } from '@/components/employee/ClockPanel';
import { cn, shiftColor } from '@/lib/utils';

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();

  if (isLoading || !data) {
    return (
      <div className="space-y-5">
        <div className="skeleton h-44 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const { profile, today, month, recent, quick } = data;
  const shift = today.rosterShift ?? today.scheduledShift;
  const colors = shiftColor(shift?.code);

  const leaveTotal = quick.leaveBalance.reduce((sum, l) => sum + l.remaining, 0);

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------------- welcome */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="card card-lift relative overflow-hidden"
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand-100/70 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5 p-5 sm:p-6">
          <Avatar name={profile.fullName} src={profile.avatarUrl} size="xl" ring />

          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Welcome back
            </p>
            <h1 className="mt-1 text-[24px] font-extrabold tracking-[-0.03em] text-ink sm:text-[28px]">
              {profile.fullName}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="chip bg-slate-100 text-slate-700">{profile.employeeCode}</span>
              {profile.designation ? (
                <span className="chip bg-brand-50 text-brand-700">{profile.designation}</span>
              ) : null}
              {profile.department ? (
                <span className="chip bg-brand-50 text-brand-700">
                  {profile.department}
                  {profile.subDepartment ? ` · ${profile.subDepartment}` : ''}
                </span>
              ) : null}
              {shift ? (
                <span className={cn('chip ring-1', colors.bg, colors.text, colors.ring)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', colors.dot)} />
                  {shift.shortName} · {shift.startTime}–{shift.endTime}
                </span>
              ) : (
                <span className="chip bg-slate-100 text-slate-600">No shift assigned today</span>
              )}
            </div>
          </div>

          <div className="hidden text-right lg:block">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Joining date
            </p>
            <p className="mt-1 text-[14px] font-bold text-ink">
              {formatBanglaDate(profile.joiningDate, { withYear: true })}
            </p>
          </div>
        </div>
      </motion.div>

      {/* -------------------------------------------------------- live panel */}
      <ClockPanel />

      {/* ---------------------------------------------------- today's stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Timer className="h-4 w-4" />}
          label="Working time today"
          value={formatDuration(today.workingSeconds)}
          sub={humanDuration(today.workingSeconds)}
          tone="brand"
        />
        <StatCard
          icon={<Coffee className="h-4 w-4" />}
          label="Break time today"
          value={formatDuration(today.breakSeconds)}
          sub={`${today.breakCount} session${today.breakCount === 1 ? '' : 's'}`}
          tone="warning"
        />
        <StatCard
          icon={<ClipboardList className="h-4 w-4" />}
          label="Tasks this month"
          value={String(month.tasksCompleted)}
          sub={`${month.tasksPending} still pending`}
          tone="success"
        />
        <StatCard
          icon={<AlarmClock className="h-4 w-4" />}
          label="Late days this month"
          value={String(month.lateDays)}
          sub="Attendance bonus is reviewed by HR"
          tone={month.lateDays > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* ------------------------------------------------------ month panel */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Monthly summary"
            subtitle={`${formatBanglaDate(`${month.year}-${String(month.month).padStart(2, '0')}-01`, { withYear: true })} onwards`}
            icon={<CalendarDays className="h-4 w-4" />}
            action={
              <Link
                to="/app/attendance"
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-600 transition-colors hover:text-brand-800"
              >
                View history
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Metric
                icon={<Clock3 className="h-3.5 w-3.5" />}
                label="Total working hours"
                value={humanDuration(month.totalWorkingSeconds)}
              />
              <Metric
                icon={<Coffee className="h-3.5 w-3.5" />}
                label="Total break hours"
                value={humanDuration(month.totalBreakSeconds)}
              />
              <Metric
                icon={<Moon className="h-3.5 w-3.5" />}
                label="Approved overtime"
                value={humanDuration(month.totalOvertimeSeconds)}
              />
              <Metric
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="Days present"
                value={String(month.presentDays)}
              />
              <Metric
                icon={<ClipboardList className="h-3.5 w-3.5" />}
                label="Tasks completed"
                value={String(month.tasksCompleted)}
              />
              <Metric
                icon={<AlarmClock className="h-3.5 w-3.5" />}
                label="Late days"
                value={String(month.lateDays)}
              />
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[12.5px] font-semibold text-ink-soft">Attendance consistency</p>
                <p className="text-[12.5px] font-bold text-ink">
                  {month.presentDays - month.lateDays}/{month.presentDays} on time
                </p>
              </div>
              <ProgressBar
                value={Math.max(0, month.presentDays - month.lateDays)}
                max={Math.max(1, month.presentDays)}
                tone={month.lateDays > 2 ? 'danger' : month.lateDays > 0 ? 'warning' : 'success'}
              />
            </div>
          </CardBody>
        </Card>

        {/* ------------------------------------------------------ recent */}
        <Card>
          <CardHeader title="Recent activity" subtitle="Your last duty record" icon={<Clock3 className="h-4 w-4" />} />
          <CardBody>
            <dl className="space-y-3">
              <RecentRow label="Last duty date" value={recent.lastDutyDate ? formatBanglaDate(recent.lastDutyDate, { withDay: true }) : '—'} />
              <RecentRow label="Last clock in" value={formatDhakaTime(recent.lastClockIn)} />
              <RecentRow label="Last clock out" value={formatDhakaTime(recent.lastClockOut)} />
              <RecentRow label="Last break start" value={formatDhakaTime(recent.lastBreakStart)} />
              <RecentRow label="Last break end" value={formatDhakaTime(recent.lastBreakEnd)} />
            </dl>
          </CardBody>
        </Card>
      </div>

      {/* ------------------------------------------------------ quick access */}
      <div>
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-muted">
          Quick access
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <QuickCard
            to="/app/tasks"
            icon={<ClipboardList className="h-4 w-4" />}
            title="Pending tasks"
            value={quick.pendingTasks}
            hint={`${quick.upcomingDeadlines} upcoming deadline${quick.upcomingDeadlines === 1 ? '' : 's'}`}
          />
          <QuickCard
            to="/app/leave"
            icon={<Briefcase className="h-4 w-4" />}
            title="Leave balance"
            value={leaveTotal}
            hint="days remaining"
          />
          <QuickCard
            to="/app/notifications"
            icon={<BellIcon />}
            title="Notifications"
            value={quick.unreadNotifications}
            hint={`${quick.unreadRosterUpdates} roster update${quick.unreadRosterUpdates === 1 ? '' : 's'}`}
          />
          <QuickCard
            to="/app/roster"
            icon={<Sun className="h-4 w-4" />}
            title="Current roster"
            value={today.isOffDay ? 'Off' : (shift?.shortName ?? '—')}
            hint={shift ? `${shift.startTime} – ${shift.endTime}` : 'No shift published'}
            text
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- pieces */

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: 'brand' | 'warning' | 'success' | 'danger';
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    warning: 'bg-warning-soft text-warning-deep',
    success: 'bg-success-soft text-success-deep',
    danger: 'bg-danger-soft text-danger-deep',
  } as const;

  return (
    <div className="card card-lift p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', tones[tone])}>{icon}</span>
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{label}</p>
      </div>
      <p className="mt-3 text-[24px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">
        {value}
      </p>
      {sub ? <p className="mt-1.5 text-[12px] text-ink-muted">{sub}</p> : null}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-line/80 bg-canvas/50 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 text-[17px] font-bold tracking-[-0.02em] text-ink tabular-nums">{value}</p>
    </div>
  );
}

function RecentRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/70 pb-2.5 last:border-0 last:pb-0">
      <dt className="text-[12.5px] text-ink-muted">{label}</dt>
      <dd className="text-right text-[13px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

function QuickCard({
  to,
  icon,
  title,
  value,
  hint,
  text = false,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  value: string | number;
  hint?: string;
  text?: boolean;
}) {
  return (
    <Link
      to={to}
      className="card card-lift group flex items-center gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{title}</p>
        {text ? (
          <p className="mt-0.5 truncate text-[19px] font-extrabold tracking-[-0.02em] text-ink">{value}</p>
        ) : (
          <p className="mt-0.5 text-[22px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">
            <AnimatedNumber value={Number(value)} />
          </p>
        )}
        {hint ? <p className="mt-1 truncate text-[11.5px] text-ink-muted">{hint}</p> : null}
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-500" />
    </Link>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </svg>
  );
}

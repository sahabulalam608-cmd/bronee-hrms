import { useMemo, type ReactNode } from 'react';
import {
  AlarmClockCheck,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Coins,
  Gauge,
  MapPin,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import { BarChart, DonutChart, HorizontalBars } from '@/components/charts';
import {
  AnimatedNumber,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ListRow,
  Skeleton,
  type BadgeTone,
} from '@/components/ui';
import { useHrDashboard } from '@/lib/queries';
import { cn, formatBDT, formatNumber } from '@/lib/utils';

const LEAVE_TYPE_LABELS: Record<string, string> = {
  casual: 'Casual leave',
  sick: 'Sick leave',
  earned: 'Earned leave',
  unpaid: 'Unpaid leave',
};

const ATTENDANCE_STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  present: { label: 'Present', tone: 'success' },
  absent: { label: 'Absent', tone: 'danger' },
  leave: { label: 'On leave', tone: 'warning' },
  off: { label: 'Off day', tone: 'neutral' },
  partial: { label: 'Partial', tone: 'info' },
};

const SHORT_MONTHS = [
  'জানু',
  'ফেব',
  'মার্চ',
  'এপ্রি',
  'মে',
  'জুন',
  'জুলা',
  'আগ',
  'সেপ',
  'অক্টো',
  'নভে',
  'ডিসে',
];

function monthBucketLabel(key: string): string {
  const month = Number(key.split('-')[1] ?? '1');
  return SHORT_MONTHS[month - 1] ?? key;
}

function KpiCard({
  label,
  value,
  icon,
  tone = 'brand',
  hint,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
  hint?: string;
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    success: 'bg-success-soft text-success-deep',
    warning: 'bg-warning-soft text-warning-deep',
    danger: 'bg-danger-soft text-danger-deep',
    neutral: 'bg-slate-100 text-slate-600',
  } as const;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-bold uppercase tracking-[0.07em] text-ink-muted">
            {label}
          </p>
          <p className="mt-1.5 text-[24px] font-extrabold leading-none tracking-[-0.02em] text-ink">
            <AnimatedNumber value={value} />
          </p>
          {hint ? <p className="mt-1.5 truncate text-[11.5px] text-ink-muted">{hint}</p> : null}
        </div>
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
          {icon}
        </span>
      </div>
    </Card>
  );
}

export default function HrDashboardPage() {
  const { data, isLoading, isError, error } = useHrDashboard();

  const leaveDonut = useMemo(
    () =>
      (data?.leaveTypeDistribution ?? []).map((row) => ({
        label: LEAVE_TYPE_LABELS[row.leaveType] ?? row.leaveType,
        value: row.count,
      })),
    [data],
  );

  const applicationBars = useMemo(
    () =>
      (data?.applicationsByMonth ?? []).map((row) => ({
        label: monthBucketLabel(row.month),
        value: row.count,
      })),
    [data],
  );

  const headcountBars = useMemo(
    () =>
      (data?.departmentHeadcount ?? []).map((row) => ({
        label: row.department,
        value: row.count,
      })),
    [data],
  );

  const attendanceBreakdown = useMemo(
    () =>
      (data?.attendanceStatusToday ?? []).filter((row) => row.count > 0),
    [data],
  );

  const attendanceTotal = attendanceBreakdown.reduce((sum, row) => sum + row.count, 0);

  if (isError) {
    return (
      <div>
        <PageHeader
          title="HR Dashboard"
          description="Live workforce signals across people, attendance, roster and compensation."
        />
        <Card>
          <EmptyState
            title="The dashboard could not be loaded"
            description={
              error instanceof Error ? error.message : 'Please refresh and try again in a moment.'
            }
            icon={<Gauge className="h-5 w-5" />}
          />
        </Card>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div>
        <PageHeader
          title="HR Dashboard"
          description="Live workforce signals across people, attendance, roster and compensation."
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-[104px]" />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton className="h-[280px] xl:col-span-2" />
          <Skeleton className="h-[280px]" />
        </div>
      </div>
    );
  }

  const { kpi, overtimeSummary, payrollSummary } = data;

  return (
    <div>
      <PageHeader
        title="HR Dashboard"
        description="Live workforce signals across people, attendance, roster and compensation."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-soft ring-1 ring-line">
            <TrendingUp className="h-4 w-4 text-brand-600" />
            {formatNumber(kpi.totalApplications)} total applications
          </span>
        }
      />

      {/* ------------------------------------------------------------- KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
        <KpiCard
          label="Total employees"
          value={kpi.totalEmployees}
          icon={<Users className="h-4 w-4" />}
          hint="Active workforce on the roster"
        />
        <KpiCard
          label="Pending applications"
          value={kpi.pendingApplications}
          icon={<Briefcase className="h-4 w-4" />}
          tone="warning"
          hint="Signups + leave awaiting a decision"
        />
        <KpiCard
          label="Approved this month"
          value={kpi.approvedThisMonth}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
          hint="Signup approvals this calendar month"
        />
        <KpiCard
          label="Today's applications"
          value={kpi.todayApplications}
          icon={<UserPlus className="h-4 w-4" />}
          hint="New registrations received today"
        />
        <KpiCard
          label="Active today"
          value={kpi.activeToday}
          icon={<UserCheck className="h-4 w-4" />}
          tone="success"
          hint="Sessions currently open"
        />
        <KpiCard
          label="On break"
          value={kpi.onBreak}
          icon={<AlarmClockCheck className="h-4 w-4" />}
          tone="neutral"
          hint="Employees in an open break"
        />
        <KpiCard
          label="Late today"
          value={kpi.lateToday}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="danger"
          hint="Late or pending-review arrivals"
        />
        <KpiCard
          label="Absent today"
          value={kpi.absentToday}
          icon={<UserX className="h-4 w-4" />}
          tone="danger"
          hint="Marked absent for today"
        />
      </div>

      {/* ----------------------------------------------------------- charts */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Signup applications by month"
            subtitle="The last six months of registration requests."
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <CardBody>
            {applicationBars.length ? (
              <BarChart data={applicationBars} height={190} />
            ) : (
              <EmptyState
                title="No application history yet"
                description="Signup requests will chart here once the first one arrives."
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Leave type mix"
            subtitle="Every leave request raised to date."
            icon={<Briefcase className="h-4 w-4" />}
          />
          <CardBody>
            {leaveDonut.length ? (
              <DonutChart
                data={leaveDonut}
                centerLabel="Requests"
                centerValue={leaveDonut.reduce((sum, item) => sum + item.value, 0)}
                size={150}
              />
            ) : (
              <EmptyState title="No leave requests" description="Leave types will be charted here." />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="Department headcount"
            subtitle="Employees grouped by their primary department."
            icon={<Users className="h-4 w-4" />}
          />
          <CardBody>
            {headcountBars.length ? (
              <HorizontalBars data={headcountBars} />
            ) : (
              <EmptyState title="No departments assigned" description="Assign departments to build this chart." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Today's attendance"
            subtitle="Live breakdown for the current Dhaka day."
            icon={<MapPin className="h-4 w-4" />}
          />
          <CardBody className="px-2 pb-3">
            {attendanceBreakdown.length ? (
              <ul className="divide-y divide-line/70">
                {attendanceBreakdown.map((row) => {
                  const meta = ATTENDANCE_STATUS_META[row.status] ?? {
                    label: row.status,
                    tone: 'neutral' as BadgeTone,
                  };
                  const pct = attendanceTotal ? Math.round((row.count / attendanceTotal) * 100) : 0;
                  return (
                    <ListRow
                      key={row.status}
                      title={meta.label}
                      subtitle={`${pct}% of today's recorded sessions`}
                      trailing={
                        <Badge tone={meta.tone}>
                          <AnimatedNumber value={row.count} />
                        </Badge>
                      }
                    />
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                title="No sessions recorded today"
                description="Attendance will appear here as employees clock in."
              />
            )}
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Card>
            <CardHeader
              title="Overtime"
              subtitle="Requests and approved hours."
              icon={<Coins className="h-4 w-4" />}
            />
            <CardBody>
              <dl className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[12.5px] font-medium text-ink-soft">Pending requests</dt>
                  <dd className="text-[13.5px] font-bold text-ink">
                    <AnimatedNumber value={overtimeSummary.pending} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[12.5px] font-medium text-ink-soft">Approved requests</dt>
                  <dd className="text-[13.5px] font-bold text-ink">
                    <AnimatedNumber value={overtimeSummary.approved} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[12.5px] font-medium text-ink-soft">Hours this month</dt>
                  <dd className="text-[13.5px] font-bold text-ink">
                    <AnimatedNumber value={overtimeSummary.hoursThisMonth} decimals={1} />h
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Payroll"
              subtitle={`Run for ${payrollSummary.month}/${payrollSummary.year}`}
              icon={<Gauge className="h-4 w-4" />}
            />
            <CardBody>
              <p className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">
                {formatBDT(payrollSummary.totalNet)}
              </p>
              <p className="mt-1 text-[12.5px] text-ink-muted">
                {formatNumber(payrollSummary.employees)} employee record
                {payrollSummary.employees === 1 ? '' : 's'} ·{' '}
                {formatNumber(payrollSummary.published)} published
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

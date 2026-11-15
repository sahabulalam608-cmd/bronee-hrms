import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlarmClock,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  Coffee,
  FileStack,
  Timer,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { NumberingBar } from '@/components/ui/list-numbering';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDate, formatMonthKey, formatTime } from '@/lib/time';
import { formatMoney, formatNumber } from '@/lib/format';
import { approvalTone } from '@/lib/status';
import { Alert } from '@/components/ui/forms';
import { Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { ChartLegend, DistributionBar } from '@/components/ui/data';
import type { HrDashboard, LeaveApplication } from '@shared/types';

const PALETTE = ['#6d28d9', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#64748b', '#8b5cf6'];

export function DashboardPage() {
  const { data, loading, error } = useAsync<HrDashboard>(() => api.hrDashboard(), []);
  const { data: leaves } = useAsync<LeaveApplication[]>(() => api.hrLeaves(), []);

  const pending = useMemo(
    () => (leaves ?? []).filter((leave) => leave.status === 'Pending').slice(0, 6),
    [leaves],
  );

  if (loading) return <DashboardSkeleton />;
  if (error || !data) {
    return (
      <Alert tone="bad" title="Could not load the HR dashboard">
        {error ?? 'Unknown error.'}
      </Alert>
    );
  }

  const attendance = data.todaysAttendance;
  const payroll = data.monthlyPayroll;
  const overtime = data.overtimeSummary;
  const tasks = data.taskSummary;

  const pieData = data.leaveTypeDistribution.map((entry) => ({ name: entry.label, value: entry.value }));
  const monthData = data.applicationsByMonth.map((entry) => ({
    month: formatMonthKey(entry.month),
    Applied: entry.applied,
    Approved: entry.approved,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="HR Dashboard"
        subtitle="Live workforce, attendance, applications and payroll overview for BRONEE Limited."
        actions={
          <Link to="/hr/attendance-review" className="btn-secondary btn-sm">
            <AlarmClock size={15} />
            Attendance review queue
          </Link>
        }
      />

      {/* ---------------- KPI grid ---------------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total employees"
          value={formatNumber(data.totalEmployees)}
          icon={<Users size={17} />}
          hint={`${data.activeEmployees} active accounts`}
        />
        <StatCard
          label="Pending applications"
          value={formatNumber(data.pendingApplications)}
          icon={<FileStack size={17} />}
          tone="warn"
          hint="Awaiting an HR decision"
        />
        <StatCard
          label="Approved this month"
          value={formatNumber(data.approvedThisMonth)}
          icon={<BadgeCheck size={17} />}
          tone="ok"
          hint="Leave applications approved"
        />
        <StatCard
          label="Total applications"
          value={formatNumber(data.totalApplications)}
          icon={<ClipboardList size={17} />}
          hint="All recorded applications"
        />
        <StatCard
          label="Today's applications"
          value={formatNumber(data.todaysApplications)}
          icon={<CalendarDays size={17} />}
          tone="info"
          hint="Submitted today"
        />
        <StatCard
          label="Today's attendance"
          value={formatNumber(attendance.present)}
          icon={<BadgeCheck size={17} />}
          tone="ok"
          hint={`${attendance.absent} absent · ${attendance.onLeave} on leave`}
        />
        <StatCard
          label="Late employees"
          value={formatNumber(attendance.late)}
          icon={<TriangleAlert size={17} />}
          tone="bad"
          hint="Late arrivals recorded today"
        />
        <StatCard
          label="Currently working"
          value={formatNumber(data.currentlyWorking)}
          icon={<Timer size={17} />}
          tone="ok"
          hint="Active working sessions"
        />
        <StatCard
          label="Employees on break"
          value={formatNumber(data.onBreak)}
          icon={<Coffee size={17} />}
          tone="info"
          hint="Running break sessions"
        />
        <StatCard
          label="Overtime summary"
          value={`${overtime.actualHours}h`}
          icon={<TrendingUp size={17} />}
          hint={`${overtime.requested} requested · ${overtime.approved} approved`}
        />
        <StatCard
          label="Monthly payroll"
          value={formatMoney(payroll.netPayable)}
          icon={<Wallet size={17} />}
          tone="brand"
          hint={`${payroll.employees} employees · ${formatMonthKey(payroll.month)}`}
        />
        <StatCard
          label="Open tasks"
          value={formatNumber(tasks.total - tasks.completed)}
          icon={<BriefcaseBusiness size={17} />}
          tone="warn"
          hint={`${tasks.overdue} overdue`}
        />
      </div>

      {/* ---------------- charts ---------------- */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <SectionCard title="Leave type distribution" subtitle="Applications by leave type" padded={false}>
          <div className="h-[260px] px-2 py-4">
            {pieData.length === 0 ? (
              <p className="grid h-full place-items-center text-[13px] text-ink-faint">
                No applications recorded yet.
              </p>
            ) : (
              <>
                <div className="h-[212px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={54}
                        outerRadius={84}
                        paddingAngle={2}
                        startAngle={90}
                        endAngle={-270}
                        cx="50%"
                        cy="50%"
                        stroke="#ffffff"
                        strokeWidth={2}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #e7e9f2',
                          fontSize: 12.5,
                          boxShadow: '0 10px 24px rgba(15,23,42,0.08)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ChartLegend
                  className="mt-1"
                  items={pieData.map((entry, index) => ({
                    label: entry.name,
                    color: PALETTE[index % PALETTE.length],
                    value: entry.value,
                  }))}
                />
              </>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Applications by month" subtitle="Submitted versus approved leave applications" padded={false}>
          <div className="h-[260px] px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthData} margin={{ top: 4, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11.5, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11.5, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: '#f5f3ff' }}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #e7e9f2',
                    fontSize: 12.5,
                    boxShadow: '0 10px 24px rgba(15,23,42,0.08)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#64748b' }} />
                <Bar dataKey="Applied" fill="#6d28d9" radius={[5, 5, 0, 0]} maxBarSize={26} />
                <Bar dataKey="Approved" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* ---------------- task distribution + overtime ---------------- */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <SectionCard title="Task status distribution" subtitle="All assigned tasks in the organisation">
          <DistributionBar items={tasks.byStatus.map((entry) => ({ label: entry.label, value: entry.value }))} />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MiniStat label="Total tasks" value={tasks.total} />
            <MiniStat label="Completed" value={tasks.completed} tone="ok" />
            <MiniStat label="Overdue" value={tasks.overdue} tone="bad" />
          </div>
        </SectionCard>

        <SectionCard title="Overtime summary" subtitle="Requested, approved and actual overtime" padded={false}>
          <div className="divide-y divide-line">
            <Meta label="Requests pending" value={overtime.requested} />
            <Meta label="Requests approved" value={overtime.approved} />
            <Meta label="Actual overtime hours" value={`${overtime.actualHours}h`} />
          </div>
          <div className="border-t border-line px-5 py-3">
            <Link to="/hr/overtime" className="btn-ghost btn-sm">
              Manage overtime
            </Link>
          </div>
        </SectionCard>
      </div>

      {/* ---------------- lists ---------------- */}
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Late employees today"
          subtitle="Late arrivals already confirmed by the attendance engine"
          action={
            <Link to="/hr/attendance" className="btn-ghost btn-sm">
              Attendance
            </Link>
          }
          padded={false}
        >
          {data.lateEmployees.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-ink-faint">No late arrivals recorded today.</p>
          ) : (
                        <div>
              <NumberingBar className="mb-2" />
              <ul className="serial-list divide-y divide-line">
              {data.lateEmployees.map((late) => (
              <li key={late.employeeId} className="flex items-center gap-3 px-5 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-bad-soft text-bad">
              <TriangleAlert size={15} />
              </span>
              <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-ink">{late.name}</span>
              <span className="block truncate text-[12px] text-ink-faint">{late.department}</span>
              </span>
              <span className="shrink-0 text-[12.5px] text-ink-muted">
              {late.punchIn ? formatTime(late.punchIn) : '—'}
              </span>
              </li>
              ))}
              </ul>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Pending applications"
          subtitle="Leave applications waiting for an HR decision"
          action={
            <Link to="/hr/leave" className="btn-ghost btn-sm">
              Leave queue
            </Link>
          }
          padded={false}
        >
          {pending.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-ink-faint">Nothing is pending right now.</p>
          ) : (
                        <div>
              <NumberingBar className="mb-2" />
              <ul className="serial-list divide-y divide-line">
              {pending.map((leave) => (
              <li key={leave.id} className="flex items-center gap-3 px-5 py-3">
              <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-ink">{leave.employeeName}</span>
              <span className="block truncate text-[12px] text-ink-faint">
              {leave.leaveType} · {leave.departmentName} · {formatDate(leave.fromDate)}
              </span>
              </span>
              <Badge tone={approvalTone(leave.status)}>{leave.status}</Badge>
              </li>
              ))}
              </ul>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-[12.5px] text-ink-muted">{label}</span>
      <span className="text-[13px] font-semibold text-ink">{value}</span>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'ok' | 'bad';
}) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : 'text-ink';
  return (
    <div className="rounded-xl bg-surface-sunken px-3.5 py-3">
      <p className="text-[11.5px] text-ink-faint">{label}</p>
      <p className={`mt-1 text-[17px] font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="skeleton h-9 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="skeleton h-[300px] rounded-2xl" />
        <div className="skeleton h-[300px] rounded-2xl" />
      </div>
    </div>
  );
}

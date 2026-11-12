import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, CheckCircle2, Clock3, History } from 'lucide-react';
import { formatBanglaDate, formatDhakaTime, formatDuration, humanDuration } from '@bronee/shared';
import { useAttendanceHistory, useMonthlySummary } from '@/lib/queries';
import { Badge, Card, CardBody, CardHeader, EmptyState, Skeleton, Table, TBody, TD, TH, THead, TR } from '@/components/ui';
import { ClockPanel } from '@/components/employee/ClockPanel';
import { LATE_STATUS_META, cn, shiftColor } from '@/lib/utils';

export default function AttendancePage() {
  const { data: history, isLoading } = useAttendanceHistory(60);
  const { data: summary } = useMonthlySummary();

  return (
    <div className="space-y-5">
      <ClockPanel />

      {/* Monthly summary */}
      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={<Clock3 className="h-4 w-4" />}
            label="Working hours"
            value={humanDuration(summary.totalWorkingSeconds)}
            tone="brand"
          />
          <SummaryCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="Break hours"
            value={humanDuration(summary.totalBreakSeconds)}
            tone="warning"
          />
          <SummaryCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Days present"
            value={String(summary.presentDays)}
            tone="success"
          />
          <SummaryCard
            icon={<History className="h-4 w-4" />}
            label="Late days"
            value={String(summary.lateDays)}
            tone={summary.lateDays > 0 ? 'danger' : 'success'}
          />
        </div>
      ) : null}

      {/* History */}
      <Card>
        <CardHeader
          title="Attendance history"
          subtitle="Your last 60 duty records"
          icon={<History className="h-4 w-4" />}
          action={
            <Link
              to="/app/breaks"
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-600 transition-colors hover:text-brand-800"
            >
              Break records
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <CardBody className="px-0 pb-0 sm:px-0">
          {isLoading ? (
            <div className="space-y-2 px-5 pb-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : !history?.items.length ? (
            <EmptyState
              title="No attendance records yet"
              description="Once you clock in, your daily duty records will appear here."
            />
          ) : (
            <Table>
              <THead>
                <TH>Date</TH>
                <TH>Shift</TH>
                <TH>Clock in</TH>
                <TH>Clock out</TH>
                <TH align="right">Working</TH>
                <TH align="right">Break</TH>
                <TH>Status</TH>
              </THead>
              <TBody>
                {history.items.map((record) => {
                  const colors = shiftColor(record.shiftCode);
                  const late = LATE_STATUS_META[record.lateStatus] ?? LATE_STATUS_META.on_time;
                  return (
                    <TR key={record.id}>
                      <TD>
                        <span className="font-semibold text-ink">
                          {formatBanglaDate(record.date, { withDay: true })}
                        </span>
                      </TD>
                      <TD>
                        {record.shiftCode ? (
                          <span className={cn('chip ring-1', colors.bg, colors.text, colors.ring)}>
                            <span className={cn('h-1.5 w-1.5 rounded-full', colors.dot)} />
                            {record.shiftName}
                          </span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </TD>
                      <TD>{formatDhakaTime(record.punchInAt)}</TD>
                      <TD>{formatDhakaTime(record.clockOutAt)}</TD>
                      <TD align="right" className="font-semibold text-ink tabular-nums">
                        {formatDuration(record.workingSeconds)}
                      </TD>
                      <TD align="right" className="tabular-nums">
                        {formatDuration(record.breakSeconds)}
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone={late.className.includes('success') ? 'success' : late.className.includes('danger') ? 'danger' : late.className.includes('warning') ? 'warning' : 'neutral'}>
                            {late.label}
                          </Badge>
                          {record.verificationResult === 'failed' ? (
                            <Badge tone="danger">Not verified</Badge>
                          ) : null}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
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
      <p className="mt-3 text-[22px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">
        {value}
      </p>
    </div>
  );
}

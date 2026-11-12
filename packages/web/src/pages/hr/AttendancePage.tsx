import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  Coffee,
  LogIn,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Segmented,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type BadgeTone,
} from '@/components/ui';
import { useHrAttendance, useHrBreakRecords } from '@/lib/queries';
import { formatBanglaDate, formatDhakaTime, humanDuration } from '@bronee/shared';
import { LATE_STATUS_META, cn } from '@/lib/utils';

const VERIFICATION_TONE: Record<string, BadgeTone> = {
  verified: 'success',
  failed: 'danger',
  pending: 'warning',
  not_required: 'neutral',
};

const VERIFICATION_LABEL: Record<string, string> = {
  verified: 'Verified',
  failed: 'Failed',
  pending: 'Pending',
  not_required: 'Not required',
};

function SummaryTile({
  label,
  value,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: number;
  tone?: BadgeTone;
  icon: ReactNode;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-slate-100 text-slate-700',
    brand: 'bg-brand-50 text-brand-700',
    success: 'bg-success-soft text-success-deep',
    warning: 'bg-warning-soft text-warning-deep',
    danger: 'bg-danger-soft text-danger-deep',
    info: 'bg-info-soft text-info-deep',
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-line">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-muted">{label}</p>
        <p className="text-[19px] font-extrabold leading-tight tracking-[-0.02em] text-ink">{value}</p>
      </div>
    </div>
  );
}

export default function HrAttendancePage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tab, setTab] = useState<'sessions' | 'breaks'>('sessions');

  const attendanceQuery = useHrAttendance(date);
  const breaksQuery = useHrBreakRecords(date);

  const sessions = attendanceQuery.data?.items ?? [];
  const summary = attendanceQuery.data?.summary;

  const breakRows = useMemo(() => breaksQuery.data?.items ?? [], [breaksQuery.data]);

  return (
    <div>
      <PageHeader
        title="Attendance Management"
        description="Daily punch records, verification outcomes and break usage for the whole workforce."
        action={
          <Link to="/hr/attendance-review">
            <Button variant="outline" icon={<ShieldCheck className="h-4 w-4" />}>
              Open review queue
            </Button>
          </Link>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <Input
              label="Attendance date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              containerClassName="sm:w-56"
              hint={formatBanglaDate(date, { withDay: true })}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDate(new Date().toISOString().slice(0, 10))}
              >
                Today
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const next = new Date(`${date}T00:00:00`);
                  next.setDate(next.getDate() - 1);
                  setDate(next.toISOString().slice(0, 10));
                }}
              >
                Previous day
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* -------------------------------------------------------- summary strip */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryTile
          label="Present"
          value={summary?.present ?? 0}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <SummaryTile
          label="Late"
          value={summary?.late ?? 0}
          tone="danger"
          icon={<Timer className="h-4 w-4" />}
        />
        <SummaryTile
          label="Verification failed"
          value={summary?.verificationFailed ?? 0}
          tone="warning"
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <SummaryTile
          label="Pending review"
          value={summary?.pendingReview ?? 0}
          tone="brand"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <SummaryTile
          label="Total records"
          value={summary?.total ?? 0}
          tone="neutral"
          icon={<CalendarDays className="h-4 w-4" />}
        />
      </div>

      <div className="mt-4">
        <Segmented<'sessions' | 'breaks'>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'sessions', label: 'Attendance records' },
            { value: 'breaks', label: 'Break records' },
          ]}
        />
      </div>

      {tab === 'sessions' ? (
        <Card className="mt-4">
          <CardHeader
            title={`Attendance on ${formatBanglaDate(date, { withDay: true })}`}
            subtitle="Punch times are shown in Dhaka local time."
            icon={<CalendarDays className="h-4 w-4" />}
          />
          {attendanceQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-11" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState
              title="No attendance recorded"
              description="No employee punched in for this date. Pick another day to review history."
              icon={<CalendarDays className="h-5 w-5" />}
            />
          ) : (
            <Table>
              <THead>
                <TH>Employee</TH>
                <TH>Shift</TH>
                <TH>Punch in</TH>
                <TH>Clock out</TH>
                <TH align="right">Working time</TH>
                <TH align="right">Break time</TH>
                <TH>Late status</TH>
                <TH>Verification</TH>
              </THead>
              <TBody>
                {sessions.map((session) => {
                  const lateMeta = LATE_STATUS_META[session.lateStatus] ?? {
                    label: session.lateStatus,
                    className: 'bg-slate-100 text-slate-600',
                  };
                  return (
                    <TR key={session.id}>
                      <TD>
                        <p className="font-semibold text-ink">{session.employeeName ?? '—'}</p>
                        <p className="text-[11.5px] text-ink-muted">{session.employeeCode ?? ''}</p>
                      </TD>
                      <TD>
                        {session.shiftName ? (
                          <span className="whitespace-nowrap">{session.shiftName}</span>
                        ) : (
                          '—'
                        )}
                      </TD>
                      <TD>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <LogIn className="h-3.5 w-3.5 text-ink-muted" />
                          {formatDhakaTime(session.punchInAt)}
                        </span>
                      </TD>
                      <TD>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <LogOut className="h-3.5 w-3.5 text-ink-muted" />
                          {formatDhakaTime(session.clockOutAt)}
                        </span>
                      </TD>
                      <TD align="right" className="whitespace-nowrap">
                        {session.workingSeconds ? humanDuration(session.workingSeconds) : '—'}
                      </TD>
                      <TD align="right" className="whitespace-nowrap">
                        {session.breakSeconds ? humanDuration(session.breakSeconds) : '—'}
                      </TD>
                      <TD>
                        <span
                          className={cn('chip', lateMeta.className)}
                          title={lateMeta.label}
                        >
                          {lateMeta.label}
                        </span>
                      </TD>
                      <TD>
                        <Badge tone={VERIFICATION_TONE[session.verificationResult] ?? 'neutral'}>
                          {VERIFICATION_LABEL[session.verificationResult] ??
                            session.verificationResult}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      ) : (
        <Card className="mt-4">
          <CardHeader
            title={`Break records on ${formatBanglaDate(date, { withDay: true })}`}
            subtitle="Every break taken, with the duration and how it was closed."
            icon={<Coffee className="h-4 w-4" />}
          />
          {breaksQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-11" />
              ))}
            </div>
          ) : breakRows.length === 0 ? (
            <EmptyState
              title="No breaks recorded"
              description="Breaks logged by employees on this date will be listed here."
              icon={<Coffee className="h-5 w-5" />}
            />
          ) : (
            <Table>
              <THead>
                <TH>Employee</TH>
                <TH>Break started</TH>
                <TH>Break ended</TH>
                <TH align="right">Duration</TH>
                <TH>Closed by</TH>
              </THead>
              <TBody>
                {breakRows.map((record) => (
                  <TR key={record.id}>
                    <TD>
                      <p className="font-semibold text-ink">{record.employeeName}</p>
                      <p className="text-[11.5px] text-ink-muted">{record.employeeCode}</p>
                    </TD>
                    <TD className="whitespace-nowrap">{formatDhakaTime(record.startedAt)}</TD>
                    <TD className="whitespace-nowrap">{formatDhakaTime(record.endedAt)}</TD>
                    <TD align="right" className="whitespace-nowrap">
                      {record.durationSeconds ? humanDuration(record.durationSeconds) : '—'}
                    </TD>
                    <TD>
                      <Badge tone={record.closedBy === 'employee' ? 'info' : 'neutral'}>
                        {record.closedBy}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

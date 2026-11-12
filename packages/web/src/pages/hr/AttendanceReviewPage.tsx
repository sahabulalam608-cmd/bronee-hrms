import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  History,
  MapPin,
  Network,
  ShieldCheck,
  Wifi,
  Wrench,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Drawer,
  EmptyState,
  Input,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  useToast,
  type BadgeTone,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import {
  useHrAttendance,
  useHrAttendanceRecord,
  useHrOfficeNetwork,
  useInvalidate,
} from '@/lib/queries';
import { formatBanglaDate, formatDhakaTime, humanDuration } from '@bronee/shared';
import { LATE_STATUS_META, cn } from '@/lib/utils';

type ReviewAction =
  | 'verify'
  | 'approve_late'
  | 'excuse_late'
  | 'reject'
  | 'correct'
  | 'clear_issue'
  | 'manual_attendance';

const ACTIONS: Array<{ value: ReviewAction; label: string; tone: 'primary' | 'secondary' | 'danger' | 'outline' }> = [
  { value: 'verify', label: 'Verify', tone: 'primary' },
  { value: 'approve_late', label: 'Approve late', tone: 'outline' },
  { value: 'excuse_late', label: 'Excuse late', tone: 'outline' },
  { value: 'reject', label: 'Reject', tone: 'danger' },
  { value: 'correct', label: 'Correct record', tone: 'secondary' },
  { value: 'clear_issue', label: 'Clear technical issue', tone: 'secondary' },
  { value: 'manual_attendance', label: 'Manual approval', tone: 'outline' },
];

const VERIFICATION_TONE: Record<string, BadgeTone> = {
  verified: 'success',
  failed: 'danger',
  pending: 'warning',
  not_required: 'neutral',
};

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/70 py-2 last:border-0">
      <span className="shrink-0 text-[12.5px] font-medium text-ink-muted">{label}</span>
      <span className="min-w-0 text-right text-[12.5px] font-semibold text-ink">{value}</span>
    </div>
  );
}

export default function HrAttendanceReviewPage() {
  const toast = useToast();
  const invalidate = useInvalidate();

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [action, setAction] = useState<ReviewAction>('verify');
  const [note, setNote] = useState('');
  const [correctStart, setCorrectStart] = useState('');
  const [correctClockOut, setCorrectClockOut] = useState('');
  const [busy, setBusy] = useState(false);

  const [allowlistText, setAllowlistText] = useState('');
  const [networkBusy, setNetworkBusy] = useState(false);

  const attendanceQuery = useHrAttendance(date);
  const recordQuery = useHrAttendanceRecord(selectedId);
  const networkQuery = useHrOfficeNetwork();

  const queue = useMemo(
    () =>
      (attendanceQuery.data?.items ?? []).filter(
        (session) => session.reviewStatus === 'pending' || session.verificationResult === 'failed',
      ),
    [attendanceQuery.data],
  );

  useEffect(() => {
    const allowlist = networkQuery.data?.allowlist ?? [];
    setAllowlistText(allowlist.join('\n'));
  }, [networkQuery.data]);

  async function submitReview() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { action, note: note.trim() || undefined };
      if (action === 'correct') {
        if (correctStart) body.actualWorkingStart = new Date(correctStart).toISOString();
        if (correctClockOut) body.clockOutAt = new Date(correctClockOut).toISOString();
      }
      await api.post(`/hr/attendance/${selectedId}/review`, body);
      const label = ACTIONS.find((item) => item.value === action)?.label ?? 'Review';
      toast.success('Review saved', `${label} was applied to the attendance record.`);
      invalidate([['hr', 'attendance'], ['hr', 'dashboard']]);
      setSelectedId(undefined);
      setNote('');
      setCorrectStart('');
      setCorrectClockOut('');
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The review decision could not be saved.';
      toast.error('Review failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAllowlist() {
    setNetworkBusy(true);
    try {
      const allowlist = allowlistText
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      await api.post('/hr/attendance/office-network', { allowlist });
      toast.success('Office network updated', `${allowlist.length} IP address(es) saved.`);
      invalidate([['hr', 'office-network']]);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The office network could not be saved.';
      toast.error('Update failed', message);
    } finally {
      setNetworkBusy(false);
    }
  }

  const record = recordQuery.data?.record;
  const history = recordQuery.data?.history ?? [];

  return (
    <div>
      <PageHeader
        title="Attendance Review"
        description="Resolve verification failures and late arrivals — every decision is written to the audit trail."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-soft ring-1 ring-line">
            <ShieldCheck className="h-4 w-4 text-brand-600" />
            {queue.length} awaiting review
          </span>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <Input
              label="Review date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              containerClassName="sm:w-56"
              hint={formatBanglaDate(date, { withDay: true })}
            />
            <Button size="sm" variant="ghost" onClick={() => setDate(new Date().toISOString().slice(0, 10))}>
              Today
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Review queue"
          subtitle="Records that failed verification or are waiting for an HR decision."
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        {attendanceQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : queue.length === 0 ? (
          <EmptyState
            title="Nothing to review"
            description="Every attendance record for this date has been verified and closed."
            icon={<CheckCircle2 className="h-5 w-5" />}
          />
        ) : (
          <Table>
            <THead>
              <TH>Employee</TH>
              <TH>Shift</TH>
              <TH>Scheduled</TH>
              <TH>Punch in</TH>
              <TH>Verification</TH>
              <TH>Late status</TH>
              <TH>Review</TH>
            </THead>
            <TBody>
              {queue.map((session) => {
                const lateMeta = LATE_STATUS_META[session.lateStatus] ?? {
                  label: session.lateStatus,
                  className: 'bg-slate-100 text-slate-600',
                };
                return (
                  <TR key={session.id} onClick={() => setSelectedId(session.id)}>
                    <TD>
                      <p className="font-semibold text-ink">{session.employeeName ?? '—'}</p>
                      <p className="text-[11.5px] text-ink-muted">{session.employeeCode ?? ''}</p>
                    </TD>
                    <TD>{session.shiftName ?? '—'}</TD>
                    <TD className="whitespace-nowrap">{formatDhakaTime(session.scheduledStart)}</TD>
                    <TD className="whitespace-nowrap">{formatDhakaTime(session.punchInAt)}</TD>
                    <TD>
                      <Badge tone={VERIFICATION_TONE[session.verificationResult] ?? 'neutral'}>
                        {session.verificationResult}
                      </Badge>
                    </TD>
                    <TD>
                      <span className={cn('chip', lateMeta.className)}>{lateMeta.label}</span>
                    </TD>
                    <TD>
                      <Badge tone={session.reviewStatus === 'pending' ? 'warning' : 'neutral'} dot>
                        {session.reviewStatus.replace('_', ' ')}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {/* --------------------------------------------------- office network panel */}
      <Card className="mt-4">
        <CardHeader
          title="Office network allowlist"
          subtitle="Public IP addresses that count as being inside the BRONEE office."
          icon={<Network className="h-4 w-4" />}
        />
        <CardBody>
          {networkQuery.isLoading ? (
            <Skeleton className="h-24" />
          ) : networkQuery.isError ? (
            <p className="rounded-xl bg-warning-soft/60 px-3.5 py-3 text-[12.5px] font-medium text-warning-deep">
              The office network configuration is only available to Super Admins. Ask a Super Admin
              to update the allowlist.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Textarea
                  label="Allowed public IPs"
                  value={allowlistText}
                  onChange={(event) => setAllowlistText(event.target.value)}
                  placeholder={'203.0.113.10\n198.51.100.24'}
                  hint="One address per line. Employees punching in from these addresses pass office verification."
                />
                <div className="mt-3 flex justify-end">
                  <Button size="sm" loading={networkBusy} onClick={saveAllowlist}>
                    Save allowlist
                  </Button>
                </div>
              </div>
              <div className="space-y-2.5">
                <div className="rounded-xl bg-canvas px-3.5 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-muted">
                    Geofence radius
                  </p>
                  <p className="mt-1 text-[16px] font-extrabold text-ink">
                    {networkQuery.data?.geofenceMeters ?? 0} m
                  </p>
                  <p className="text-[11.5px] text-ink-muted">Read-only — set by the platform env.</p>
                </div>
                <div className="rounded-xl bg-canvas px-3.5 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-muted">
                    GPS accuracy limit
                  </p>
                  <p className="mt-1 text-[16px] font-extrabold text-ink">
                    {networkQuery.data?.maxAccuracyMeters ?? 0} m
                  </p>
                  <p className="text-[11.5px] text-ink-muted">
                    Fixes wider than this are treated as a failed check.
                  </p>
                </div>
                <div className="rounded-xl bg-canvas px-3.5 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-muted">
                    Verification window
                  </p>
                  <p className="mt-1 text-[16px] font-extrabold text-ink">
                    {networkQuery.data?.verificationWindowMinutes ?? 0} min
                  </p>
                  <p className="text-[11.5px] text-ink-muted">From the scheduled shift start.</p>
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ------------------------------------------------------------- drawer */}
      <Drawer
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(undefined)}
        title={record?.employeeName ? `Review · ${record.employeeName}` : 'Attendance review'}
        width="max-w-2xl"
      >
        {recordQuery.isLoading || !record ? (
          <div className="space-y-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl bg-canvas p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-muted">
                Record
              </p>
              <div className="mt-1.5">
                <DetailRow label="Scheduled start" value={formatDhakaTime(record.scheduledStart)} />
                <DetailRow label="Scheduled end" value={formatDhakaTime(record.scheduledEnd)} />
                <DetailRow label="Punch in" value={formatDhakaTime(record.punchInAt)} />
                <DetailRow
                  label="Actual working start"
                  value={formatDhakaTime(record.actualWorkingStart)}
                />
                <DetailRow label="Clock out" value={formatDhakaTime(record.clockOutAt)} />
                <DetailRow
                  label="Working time"
                  value={record.workingSeconds ? humanDuration(record.workingSeconds) : '—'}
                />
                <DetailRow
                  label="Break time"
                  value={record.breakSeconds ? humanDuration(record.breakSeconds) : '—'}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-canvas p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-muted">
                Verification
              </p>
              <div className="mt-1.5">
                <DetailRow
                  label="Verification time"
                  value={formatDhakaTime(record.verificationCompletedAt)}
                />
                <DetailRow label="Method" value={record.verificationMethod} />
                <DetailRow
                  label="Result"
                  value={
                    <Badge tone={VERIFICATION_TONE[record.verificationResult] ?? 'neutral'}>
                      {record.verificationResult}
                    </Badge>
                  }
                />
                <DetailRow
                  label="GPS latitude"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <Crosshair className="h-3.5 w-3.5 text-ink-muted" />
                      {record.latitude ?? '—'}
                    </span>
                  }
                />
                <DetailRow
                  label="GPS longitude"
                  value={record.longitude ?? '—'}
                />
                <DetailRow
                  label="GPS accuracy"
                  value={record.accuracyMeters != null ? `${record.accuracyMeters} m` : '—'}
                />
                <DetailRow
                  label="Office IP matched"
                  value={
                    record.officeIpMatched == null ? (
                      '—'
                    ) : record.officeIpMatched ? (
                      <span className="inline-flex items-center gap-1.5 text-success-deep">
                        <Wifi className="h-3.5 w-3.5" />
                        Matched
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-danger-deep">
                        <MapPin className="h-3.5 w-3.5" />
                        Not matched
                      </span>
                    )
                  }
                />
                <DetailRow label="Office IP" value={record.officeIp ?? '—'} />
                <DetailRow
                  label="Late status"
                  value={
                    <span
                      className={cn(
                        'chip',
                        LATE_STATUS_META[record.lateStatus]?.className ??
                          'bg-slate-100 text-slate-600',
                      )}
                    >
                      {LATE_STATUS_META[record.lateStatus]?.label ?? record.lateStatus}
                    </span>
                  }
                />
                <DetailRow label="Auto action" value={record.autoAction ?? '—'} />
              </div>
            </div>

            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                <History className="h-3.5 w-3.5" />
                Previous attendance
              </h3>
              {history.length ? (
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="w-full min-w-[420px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="table-head px-3 py-2">Date</th>
                        <th className="table-head px-3 py-2">Punch in</th>
                        <th className="table-head px-3 py-2">Clock out</th>
                        <th className="table-head px-3 py-2">Late</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice(0, 10).map((entry) => {
                        const lateMeta = LATE_STATUS_META[entry.lateStatus] ?? {
                          label: entry.lateStatus,
                          className: 'bg-slate-100 text-slate-600',
                        };
                        return (
                          <tr key={entry.id} className="table-row">
                            <td className="whitespace-nowrap px-3 py-2 text-[12.5px] text-ink-soft">
                              {formatBanglaDate(entry.date)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-[12.5px] text-ink-soft">
                              {formatDhakaTime(entry.punchInAt)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-[12.5px] text-ink-soft">
                              {formatDhakaTime(entry.clockOutAt)}
                            </td>
                            <td className="px-3 py-2">
                              <span className={cn('chip', lateMeta.className)}>{lateMeta.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-xl bg-canvas px-3.5 py-3 text-[12.5px] text-ink-muted">
                  No earlier attendance records for this employee.
                </p>
              )}
            </div>

            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                <Wrench className="h-3.5 w-3.5" />
                Review decision
              </h3>
              <div className="flex flex-wrap gap-2">
                {ACTIONS.map((item) => (
                  <Button
                    key={item.value}
                    size="sm"
                    variant={action === item.value ? item.tone : 'outline'}
                    onClick={() => setAction(item.value)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>

              {action === 'correct' ? (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Actual working start"
                    type="datetime-local"
                    value={correctStart}
                    onChange={(event) => setCorrectStart(event.target.value)}
                  />
                  <Input
                    label="Clock out"
                    type="datetime-local"
                    value={correctClockOut}
                    onChange={(event) => setCorrectClockOut(event.target.value)}
                  />
                </div>
              ) : null}

              <Textarea
                label="Internal note"
                className="mt-3"
                placeholder="Why this decision was taken — stored on the record and the audit trail."
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(undefined)}>
                Cancel
              </Button>
              <Button size="sm" loading={busy} onClick={submitReview}>
                Apply decision
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

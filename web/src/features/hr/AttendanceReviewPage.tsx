import { useMemo, useState } from 'react';
import {
  ClipboardCheck,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { currentMonthKey, formatDate, formatDateTime, formatMonthKey, formatTime } from '@/lib/time';
import { formatNumber } from '@/lib/format';
import { attendanceTone, lateTone, shiftAccent } from '@/lib/status';
import { Alert, Select, Textarea } from '@/components/ui/forms';
import { Badge, MetaRow, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/data';
import { ConfirmDialog, Modal, useToast } from '@/components/ui/overlay';
import type { AttendanceRecord } from '@shared/types';

type Row<T> = { [K in keyof T]: T[K] };
type AttendanceRow = Row<AttendanceRecord>;

const REVIEW_ACTIONS = [
  {
    action: 'verify',
    label: 'Attendance verify',
    description: 'Confirm the attendance and clear the working timer from the scheduled shift start.',
  },
  {
    action: 'approve-late',
    label: 'Approve late status',
    description: 'Accept the late arrival and finalise the record as a late day.',
  },
  {
    action: 'excuse',
    label: 'Excuse attendance',
    description: 'Mark the attendance as excused — the day is not counted as a late day.',
  },
  {
    action: 'reject',
    label: 'Reject attendance',
    description: 'Reject the record when the punch cannot be accepted.',
  },
  {
    action: 'correct',
    label: 'Correct attendance record',
    description: 'Record a manual correction while keeping the original values in the audit log.',
  },
  {
    action: 'clear-issue',
    label: 'Clear login / clock-in issue',
    description: 'Clear a technical login or clock-in issue and mark the record as verified.',
  },
] as const;

export function AttendanceReviewPage() {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonthKey());
  const [reviewing, setReviewing] = useState<AttendanceRow | null>(null);
  const [action, setAction] = useState<string>('verify');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(() => api.hrAttendance(month), [month]);
  const { data: previousMonth } = useAsync(
    () => api.hrAttendance(shiftMonth(month, -1)),
    [month],
  );

  const months = useMemo(() => {
    const list: string[] = [];
    const base = new Date();
    for (let i = 0; i < 6; i += 1) {
      const date = new Date(base.getFullYear(), base.getMonth() - i, 1);
      list.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    return list;
  }, []);

  const queue = useMemo(() => {
    const records = (data?.records ?? []) as AttendanceRow[];
    return records.filter(
      (record) =>
        record.attendanceStatus === 'Pending Review' ||
        record.attendanceStatus === 'Verification Failed' ||
        record.lateStatus === 'Pending Review' ||
        record.lateStatus === 'Late',
    );
  }, [data]);

  const counts = useMemo(() => {
    const records = (data?.records ?? []) as AttendanceRow[];
    return {
      pending: records.filter((record) => record.attendanceStatus === 'Pending Review').length,
      failed: records.filter((record) => record.attendanceStatus === 'Verification Failed').length,
      late: records.filter((record) => record.lateStatus === 'Late').length,
      reviewed: records.filter((record) => record.hrReviewStatus === 'Reviewed').length,
    };
  }, [data]);

  const history = useMemo(() => {
    if (!reviewing) return [];
    const all = [
      ...((previousMonth?.records ?? []) as AttendanceRow[]),
      ...((data?.records ?? []) as AttendanceRow[]),
    ];
    return all
      .filter(
        (record) => record.employeeId === reviewing.employeeId && record.workDate < reviewing.workDate,
      )
      .sort((a, b) => b.workDate.localeCompare(a.workDate))
      .slice(0, 6);
  }, [reviewing, data, previousMonth]);

  async function apply() {
    if (!reviewing) return;
    setBusy(true);
    try {
      await api.reviewAttendance(reviewing.id, { action, note: note.trim() || undefined });
      toast.success('Attendance record updated', `${reviewing.employeeName} · ${formatDate(reviewing.workDate)}`);
      setConfirm(false);
      setReviewing(null);
      setNote('');
      reload();
    } catch (err) {
      toast.error('Review failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'employeeName',
      header: 'Employee',
      render: (record: AttendanceRow) => (
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium text-ink">{record.employeeName}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{record.employeeCode}</p>
        </div>
      ),
    },
    { key: 'departmentName', header: 'Department' },
    {
      key: 'shiftName',
      header: 'Shift',
      render: (record: AttendanceRow) => (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft">
          <span className="h-2 w-2 rounded-full" style={{ background: shiftAccent(record.shiftCode) }} />
          {record.shiftName.split(' (')[0]}
        </span>
      ),
    },
    {
      key: 'scheduledStart',
      header: 'Scheduled start',
      render: (record: AttendanceRow) => (
        <span className="text-[13px] text-ink-muted">{formatTime(record.scheduledStart)}</span>
      ),
    },
    {
      key: 'punchIn',
      header: 'Punch in',
      render: (record: AttendanceRow) => (
        <span className="text-[13px] text-ink-soft">{formatTime(record.punchIn)}</span>
      ),
    },
    {
      key: 'verificationCompletedAt',
      header: 'Verified at',
      render: (record: AttendanceRow) => (
        <span className="text-[13px] text-ink-muted">{formatTime(record.verificationCompletedAt)}</span>
      ),
    },
    {
      key: 'verificationMethod',
      header: 'Method',
      render: (record: AttendanceRow) => (
        <Badge tone={record.verificationMethod === 'OFFICE_IP' ? 'brand' : record.verificationMethod === 'GPS' ? 'info' : 'neutral'}>
          {record.verificationMethod === 'OFFICE_IP'
            ? 'Office IP'
            : record.verificationMethod === 'GPS'
              ? 'GPS'
              : record.verificationMethod === 'AUTO'
                ? 'Auto'
                : 'None'}
        </Badge>
      ),
    },
    {
      key: 'gps',
      header: 'GPS',
      render: (record: AttendanceRow) =>
        record.gpsLat != null && record.gpsLng != null ? (
          <span className="font-mono text-[12px] text-ink-muted">
            {record.gpsLat.toFixed(4)}, {record.gpsLng.toFixed(4)}
            {record.gpsAccuracy != null && (
              <span className="block text-[11px] text-ink-faint">±{Math.round(record.gpsAccuracy)} m</span>
            )}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-faint">Not captured</span>
        ),
    },
    {
      key: 'verificationResult',
      header: 'Verification',
      render: (record: AttendanceRow) => (
        <Badge tone={record.verificationResult === 'SUCCESS' ? 'ok' : record.verificationResult === 'FAILED' ? 'bad' : 'warn'}>
          {record.verificationResult}
        </Badge>
      ),
    },
    {
      key: 'attendanceStatus',
      header: 'Status',
      render: (record: AttendanceRow) => (
        <Badge tone={attendanceTone(record.attendanceStatus)}>{record.attendanceStatus}</Badge>
      ),
    },
    {
      key: 'lateStatus',
      header: 'Late status',
      render: (record: AttendanceRow) => <Badge tone={lateTone(record.lateStatus)}>{record.lateStatus}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (record: AttendanceRow) => (
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => {
            setReviewing(record);
            setAction(record.attendanceStatus === 'Verification Failed' ? 'clear-issue' : 'verify');
            setNote('');
          }}
        >
          Review
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance Review & Late Login"
        subtitle="Records waiting for an HR decision — verification, late status and manual corrections."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="In the review queue" value={formatNumber(queue.length)} tone="warn" icon={<ClipboardCheck size={17} />} />
        <StatCard label="Pending review" value={formatNumber(counts.pending)} tone="warn" />
        <StatCard label="Verification failed" value={formatNumber(counts.failed)} tone="bad" icon={<ShieldAlert size={17} />} />
        <StatCard label="Late days" value={formatNumber(counts.late)} tone="bad" icon={<TriangleAlert size={17} />} />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load the review queue">
          {error}
        </Alert>
      )}

      <SectionCard
        title="Review queue"
        subtitle={`${formatMonthKey(month)} · ${queue.length} records need attention`}
        padded={false}
      >
        <div className="border-b border-line p-4">
          <div className="w-[175px]">
            <Select
              label="Month"
              value={month}
              options={months.map((value) => ({ value, label: formatMonthKey(value) }))}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        </div>
        <DataTable<AttendanceRow>
          columns={columns}
          rows={queue}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="Nothing to review"
          emptyDescription="Every attendance record for this month has been finalised."
          emptyIcon={<ShieldCheck size={22} />}
        />
      </SectionCard>

      <Modal
        open={reviewing !== null}
        onClose={() => setReviewing(null)}
        title="Attendance review"
        description={
          reviewing ? `${reviewing.employeeName} · ${formatDate(reviewing.workDate)}` : undefined
        }
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setReviewing(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => setConfirm(true)}>
              Apply action
            </button>
          </>
        }
      >
        {reviewing && (
          <div className="space-y-5">
            <div className="rounded-xl border border-line bg-surface-sunken px-4 py-1">
              <MetaRow label="Employee" value={`${reviewing.employeeName} (${reviewing.employeeCode})`} />
              <MetaRow label="Department" value={reviewing.departmentName} />
              <MetaRow label="Assigned shift" value={reviewing.shiftName} />
              <MetaRow label="Scheduled shift start" value={formatTime(reviewing.scheduledStart)} />
              <MetaRow label="Punch in" value={formatTime(reviewing.punchIn)} />
              <MetaRow
                label="Actual working start"
                value={formatTime(reviewing.actualWorkingStart)}
              />
              <MetaRow
                label="Verification completed"
                value={formatTime(reviewing.verificationCompletedAt)}
              />
              <MetaRow
                label="Verification method"
                value={
                  reviewing.verificationMethod === 'OFFICE_IP'
                    ? 'Office public IP'
                    : reviewing.verificationMethod === 'GPS'
                      ? 'GPS location'
                      : reviewing.verificationMethod === 'AUTO'
                        ? 'Automatic'
                        : 'Not captured'
                }
              />
              <MetaRow label="Verification result" value={reviewing.verificationResult} />
              <MetaRow
                label="GPS latitude / longitude"
                value={
                  reviewing.gpsLat != null && reviewing.gpsLng != null
                    ? `${reviewing.gpsLat.toFixed(5)}, ${reviewing.gpsLng.toFixed(5)}`
                    : 'Not captured'
                }
              />
              <MetaRow
                label="GPS accuracy radius"
                value={reviewing.gpsAccuracy != null ? `${Math.round(reviewing.gpsAccuracy)} m` : 'Not captured'}
              />
              <MetaRow label="Attendance status" value={reviewing.attendanceStatus} />
              <MetaRow label="Late status" value={reviewing.lateStatus} />
              <MetaRow label="HR review status" value={reviewing.hrReviewStatus} />
              {reviewing.reviewedBy && (
                <MetaRow
                  label="Last reviewed by"
                  value={`${reviewing.reviewedBy}${reviewing.reviewedAt ? ` · ${formatDateTime(reviewing.reviewedAt)}` : ''}`}
                />
              )}
            </div>

            <div className="rounded-xl border border-warn/25 bg-warn-soft px-4 py-3">
              <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warn">
                <TriangleAlert size={14} />
                Pending review reason
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{pendingReason(reviewing)}</p>
              {reviewing.hrReviewNote && (
                <p className="mt-1.5 text-[12.5px] text-ink-muted">
                  Previous internal note: {reviewing.hrReviewNote}
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 text-[12.5px] font-semibold text-ink">Previous attendance history</p>
              {history.length === 0 ? (
                <p className="rounded-xl border border-line px-4 py-3 text-[12.5px] text-ink-faint">
                  No earlier attendance record is available for this employee.
                </p>
              ) : (
                <ul className="serial-list divide-y divide-line rounded-xl border border-line">
                  {history.map((record) => (
                    <li key={record.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-medium text-ink">{formatDate(record.workDate)}</span>
                        <span className="block text-[11.5px] text-ink-faint">
                          Punch in {formatTime(record.punchIn)} ·{' '}
                          {record.verificationMethod === 'OFFICE_IP'
                            ? 'Office IP'
                            : record.verificationMethod === 'GPS'
                              ? 'GPS'
                              : 'Not captured'}
                        </span>
                      </span>
                      <Badge tone={attendanceTone(record.attendanceStatus)}>{record.attendanceStatus}</Badge>
                      <Badge tone={lateTone(record.lateStatus)}>{record.lateStatus}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 text-[12.5px] font-semibold text-ink">HR review action</p>
              <div className="grid gap-2">
                {REVIEW_ACTIONS.map((item) => (
                  <label
                    key={item.action}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors ${
                      action === item.action
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-line hover:bg-surface-sunken'
                    }`}
                  >
                    <input
                      type="radio"
                      name="review-action"
                      className="mt-1 accent-[#6d28d9]"
                      checked={action === item.action}
                      onChange={() => setAction(item.action)}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-ink">{item.label}</span>
                      <span className="block text-[12px] text-ink-faint">{item.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <Textarea
              label="Internal note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              hint="Optional. Stored with the record, the reason and the acting HR user in the audit log."
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={apply}
        title="Apply this attendance action?"
        confirmLabel="Apply action"
        loading={busy}
        message={
          <>
            {REVIEW_ACTIONS.find((item) => item.action === action)?.label} will be applied to{' '}
            {reviewing?.employeeName} for {reviewing ? formatDate(reviewing.workDate) : ''}. The previous and
            the new values are stored in the audit log.
          </>
        }
      />
    </div>
  );
}

function pendingReason(record: AttendanceRow): string {
  if (record.verificationResult === 'FAILED') {
    return 'Office verification did not succeed within the first minute of the shift, so the working timer was never started.';
  }
  if (record.attendanceStatus === 'Pending Review') {
    return 'Verification completed after the one minute verification window — the attendance needs an HR decision.';
  }
  if (record.lateStatus === 'Pending Review') {
    return 'The employee punched in after the verification window closed and the late status is not final yet.';
  }
  if (record.lateStatus === 'Late') {
    return `The employee punched in at ${formatTime(record.punchIn)} against a scheduled start of ${formatTime(
      record.scheduledStart,
    )}.`;
  }
  return 'This record is listed for an HR review.';
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(year, monthIndex - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

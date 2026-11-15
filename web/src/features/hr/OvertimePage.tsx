import { useMemo, useState } from 'react';
import { AlarmClockCheck, Clock, Hourglass, Timer, UserCheck, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDate, formatDateTime, formatMinutes } from '@/lib/time';
import { formatMoney, formatNumber } from '@/lib/format';
import { approvalTone } from '@/lib/status';
import { Alert, Input, Textarea } from '@/components/ui/forms';
import { Badge, MetaRow, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, Tabs } from '@/components/ui/data';
import { ConfirmDialog, Modal, useToast } from '@/components/ui/overlay';
import { OVERTIME_RATE_PER_HOUR } from '@shared/constants';
import type { OvertimeRequest } from '@shared/types';

type Row<T> = { [K in keyof T]: T[K] };
type OvertimeRow = Row<OvertimeRequest>;

export function OvertimePage() {
  const toast = useToast();
  const [tab, setTab] = useState('Pending');
  const [reviewing, setReviewing] = useState<OvertimeRow | null>(null);
  const [decision, setDecision] = useState<'approve' | 'decline'>('approve');
  const [approvedStart, setApprovedStart] = useState('');
  const [approvedEnd, setApprovedEnd] = useState('');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync<OvertimeRequest[]>(() => api.hrOvertime(), []);
  const { data: settings } = useAsync(() => api.hrSettings(), []);
  /** Overtime is paid at a flat rate per hour (§9). */
  const otRatePerHour = settings?.otRatePerHour ?? OVERTIME_RATE_PER_HOUR;

  const rows = useMemo(() => {
    const all = (data ?? []) as OvertimeRow[];
    if (tab === 'All') return all;
    return all.filter((request) => request.status === tab);
  }, [data, tab]);

  const counts = useMemo(() => {
    const all = data ?? [];
    return {
      pending: all.filter((request) => request.status === 'Pending').length,
      approved: all.filter((request) => request.status === 'Approved').length,
      declined: all.filter((request) => request.status === 'Declined').length,
      approvedHours: Math.round(
        all.reduce((sum, request) => sum + request.approvedMinutes, 0) / 60,
      ),
      actualHours: Math.round(
        all.reduce((sum, request) => sum + (request.actualMinutes ?? 0), 0) / 60,
      ),
    };
  }, [data]);

  function openReview(request: OvertimeRow) {
    setReviewing(request);
    setDecision('approve');
    setApprovedStart(request.requestedStart ?? '');
    setApprovedEnd(request.requestedEnd ?? '');
    setNote('');
  }

  async function decide() {
    if (!reviewing) return;
    if (decision === 'approve' && (!approvedStart || !approvedEnd)) {
      toast.error('Set the approved start and end time');
      return;
    }
    setBusy(true);
    try {
      await api.decideOvertime(reviewing.id, {
        decision,
        approvedStart: decision === 'approve' ? approvedStart : undefined,
        approvedEnd: decision === 'approve' ? approvedEnd : undefined,
        note: note.trim() || undefined,
      });
      toast.success(
        decision === 'approve' ? 'Overtime approved' : 'Overtime declined',
        `${reviewing.employeeName} · ${formatDate(reviewing.workDate)}`,
      );
      setConfirm(false);
      setReviewing(null);
      reload();
    } catch (err) {
      toast.error('Decision failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'employeeName',
      header: 'Employee',
      render: (request: OvertimeRow) => (
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium text-ink">{request.employeeName}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{request.departmentName}</p>
        </div>
      ),
    },
    {
      key: 'workDate',
      header: 'Work date',
      render: (request: OvertimeRow) => (
        <span className="text-[13px] text-ink-muted">{formatDate(request.workDate)}</span>
      ),
    },
    {
      key: 'requested',
      header: 'Requested',
      render: (request: OvertimeRow) => (
        <span className="text-[13px] text-ink-soft">
          {request.requestedStart ?? '—'} – {request.requestedEnd ?? '—'}
          <span className="block text-[11.5px] text-ink-faint">
            {formatMinutes(request.requestedMinutes)} requested
          </span>
        </span>
      ),
    },
    {
      key: 'approved',
      header: 'Approved',
      render: (request: OvertimeRow) =>
        request.approvedStart ? (
          <span className="text-[13px] text-ink-soft">
            {request.approvedStart} – {request.approvedEnd}
            <span className="block text-[11.5px] text-ink-faint">
              {formatMinutes(request.approvedMinutes)} approved
            </span>
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-faint">Not approved</span>
        ),
    },
    {
      key: 'actualMinutes',
      header: 'Actual',
      align: 'right' as const,
      render: (request: OvertimeRow) => (
        <span className="font-mono text-[13px] tabular-nums text-ink">
          {request.actualMinutes != null ? formatMinutes(request.actualMinutes) : '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (request: OvertimeRow) => {
        const minutes = request.approvedMinutes || 0;
        return (
          <span className="font-mono text-[13px] tabular-nums text-ink">
            {formatMoney(Math.round((minutes / 60) * otRatePerHour))}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (request: OvertimeRow) => (
        <Badge tone={approvalTone(request.status)}>{request.status}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (request: OvertimeRow) => (
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={request.status !== 'Pending'}
          onClick={() => openReview(request)}
        >
          Review
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Overtime Management"
        subtitle="Approve overtime with the exact start and end time — unapproved extra time is never paid."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Pending requests"
          value={formatNumber(counts.pending)}
          tone="warn"
          icon={<Hourglass size={17} />}
        />
        <StatCard
          label="Approved requests"
          value={formatNumber(counts.approved)}
          tone="ok"
          icon={<UserCheck size={17} />}
        />
        <StatCard
          label="Approved overtime"
          value={`${counts.approvedHours}h`}
          tone="info"
          icon={<Clock size={17} />}
        />
        <StatCard
          label="Actual overtime"
          value={`${counts.actualHours}h`}
          tone="warn"
          icon={<Timer size={17} />}
          hint="Recorded from the employee session"
        />
        <StatCard
          label="Overtime cost"
          value={formatMoney(
            Math.round(
              ((data ?? []).reduce((sum, request) => sum + request.approvedMinutes, 0) / 60) *
                otRatePerHour,
            ),
          )}
          tone="ok"
          icon={<AlarmClockCheck size={17} />}
          hint={`${formatMoney(otRatePerHour)} per approved overtime hour`}
        />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load overtime requests">
          {error}
        </Alert>
      )}

      <SectionCard title="Overtime requests" subtitle={`${rows.length} of ${(data ?? []).length} requests shown`}>
        <Tabs
          className="mb-4"
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'Pending', label: 'Pending', count: counts.pending },
            { key: 'Approved', label: 'Approved', count: counts.approved },
            { key: 'Declined', label: 'Declined', count: counts.declined },
            { key: 'All', label: 'All', count: (data ?? []).length },
          ]}
        />
        <DataTable<OvertimeRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No overtime requests"
          emptyDescription="Employee overtime requests appear here for approval."
          emptyIcon={<AlarmClockCheck size={22} />}
        />
      </SectionCard>

      <Modal
        open={reviewing !== null}
        onClose={() => setReviewing(null)}
        title="Review overtime request"
        description={reviewing ? `${reviewing.employeeName} · ${formatDate(reviewing.workDate)}` : undefined}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setReviewing(null)} disabled={busy}>
              Cancel
            </button>
            {decision === 'approve' ? (
              <button type="button" className="btn-primary" onClick={() => setConfirm(true)} disabled={busy}>
                <UserCheck size={15} />
                Approve overtime
              </button>
            ) : (
              <button type="button" className="btn-danger" onClick={() => setConfirm(true)} disabled={busy}>
                <UserX size={15} />
                Decline overtime
              </button>
            )}
          </>
        }
      >
        {reviewing && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface-sunken px-4 py-1">
              <MetaRow label="Employee" value={reviewing.employeeName} />
              <MetaRow label="Department" value={reviewing.departmentName} />
              <MetaRow label="Work date" value={formatDate(reviewing.workDate)} />
              <MetaRow
                label="Requested window"
                value={`${reviewing.requestedStart ?? '—'} – ${reviewing.requestedEnd ?? '—'} (${formatMinutes(
                  reviewing.requestedMinutes,
                )})`}
              />
              <MetaRow label="Requested at" value={formatDateTime(reviewing.createdAt)} />
              <MetaRow
                label="Actual overtime"
                value={reviewing.actualMinutes != null ? formatMinutes(reviewing.actualMinutes) : 'Not recorded yet'}
              />
              <MetaRow
                label="Approved overtime amount"
                value={formatMoney(Math.round((reviewing.approvedMinutes / 60) * otRatePerHour))}
              />
              <MetaRow label="Overtime rate" value={`${formatMoney(otRatePerHour)} per hour`} />
            </div>

            <div className="rounded-xl border border-line px-4 py-3">
              <p className="text-[12px] font-medium text-ink-faint">Employee reason</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{reviewing.reason}</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className={`btn-secondary btn-sm ${decision === 'approve' ? 'ring-2 ring-brand-500' : ''}`}
                onClick={() => setDecision('approve')}
              >
                Approve
              </button>
              <button
                type="button"
                className={`btn-secondary btn-sm ${decision === 'decline' ? 'ring-2 ring-brand-500' : ''}`}
                onClick={() => setDecision('decline')}
              >
                Decline
              </button>
            </div>

            {decision === 'approve' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Approved start time"
                  type="time"
                  value={approvedStart}
                  onChange={(e) => setApprovedStart(e.target.value)}
                  hint="Overtime starts at this time."
                />
                <Input
                  label="Approved end time"
                  type="time"
                  value={approvedEnd}
                  onChange={(e) => setApprovedEnd(e.target.value)}
                  hint="Automatic clock out happens here."
                />
              </div>
            )}

            <Textarea
              label="Review note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              hint="Optional. Stored with the approval and visible to the employee in the notification."
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={decide}
        title={decision === 'approve' ? 'Approve this overtime?' : 'Decline this overtime?'}
        confirmLabel={decision === 'approve' ? 'Approve' : 'Decline'}
        tone={decision === 'approve' ? 'primary' : 'danger'}
        loading={busy}
        message={
          decision === 'approve' ? (
            <>
              Overtime for {reviewing?.employeeName} is approved from {approvedStart} to {approvedEnd}. The
              employee sees the approved window on the dashboard and the hours are verified for payroll.
            </>
          ) : (
            <>The overtime request from {reviewing?.employeeName} will be declined and the employee notified.</>
          )
        }
      />
    </div>
  );
}

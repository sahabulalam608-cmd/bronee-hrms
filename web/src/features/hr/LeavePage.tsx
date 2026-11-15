import { useMemo, useState } from 'react';
import { CalendarCheck, CalendarClock, Mail, UserCheck, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { currentMonthKey, formatDate, formatDateTime } from '@/lib/time';
import { formatNumber } from '@/lib/format';
import { approvalTone } from '@/lib/status';
import { Alert, Textarea } from '@/components/ui/forms';
import { Badge, MetaRow, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, Tabs } from '@/components/ui/data';
import { ConfirmDialog, Modal, useToast } from '@/components/ui/overlay';
import type { LeaveApplication } from '@shared/types';

type Row<T> = { [K in keyof T]: T[K] };
type LeaveRow = Row<LeaveApplication>;

export function LeavePage() {
  const toast = useToast();
  const [tab, setTab] = useState('Pending');
  const [reviewing, setReviewing] = useState<LeaveRow | null>(null);
  const [decision, setDecision] = useState<'approve' | 'decline'>('approve');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync<LeaveApplication[]>(() => api.hrLeaves(), []);

  const rows = useMemo(() => {
    const all = (data ?? []) as LeaveRow[];
    if (tab === 'All') return all;
    return all.filter((leave) => leave.status === tab);
  }, [data, tab]);

  const counts = useMemo(() => {
    const all = data ?? [];
    const month = currentMonthKey();
    return {
      pending: all.filter((leave) => leave.status === 'Pending').length,
      approved: all.filter((leave) => leave.status === 'Approved').length,
      declined: all.filter((leave) => leave.status === 'Declined').length,
      approvedThisMonth: all.filter(
        (leave) => leave.status === 'Approved' && leave.approvedAt?.startsWith(month),
      ).length,
      total: all.length,
    };
  }, [data]);

  async function decide() {
    if (!reviewing) return;
    setBusy(true);
    try {
      await api.decideLeave(reviewing.id, {
        decision,
        note: note.trim() || undefined,
      });
      toast.success(
        decision === 'approve' ? 'Leave approved' : 'Leave declined',
        `${reviewing.employeeName} · ${reviewing.leaveType} · ${reviewing.totalDays} day(s)`,
      );
      setConfirm(false);
      setReviewing(null);
      setNote('');
      reload();
    } catch (err) {
      toast.error('Decision failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'applicationId',
      header: 'Application ID',
      render: (leave: LeaveRow) => (
        <span className="font-mono text-[12.5px] text-ink-soft">{leave.applicationId}</span>
      ),
    },
    {
      key: 'employeeName',
      header: 'Employee',
      render: (leave: LeaveRow) => (
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium text-ink">{leave.employeeName}</p>
          <p className="truncate text-[11.5px] text-ink-faint">
            {leave.employeeCode} · {leave.designation}
          </p>
        </div>
      ),
    },
    { key: 'departmentName', header: 'Department' },
    { key: 'leaveType', header: 'Leave type' },
    {
      key: 'dates',
      header: 'Dates',
      render: (leave: LeaveRow) => (
        <span className="text-[13px] text-ink-soft">
          {formatDate(leave.fromDate)} – {formatDate(leave.toDate)}
        </span>
      ),
    },
    {
      key: 'totalDays',
      header: 'Days',
      align: 'right' as const,
      render: (leave: LeaveRow) => <span className="text-[13px] text-ink-muted">{leave.totalDays}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (leave: LeaveRow) => <Badge tone={approvalTone(leave.status)}>{leave.status}</Badge>,
    },
    {
      key: 'emailStatus',
      header: 'Email',
      render: (leave: LeaveRow) => (
        <Badge tone={leave.emailStatus === 'Sent' ? 'ok' : leave.emailStatus === 'Failed' ? 'bad' : 'neutral'}>
          {leave.emailStatus}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (leave: LeaveRow) => (
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={leave.status !== 'Pending'}
          onClick={() => {
            setReviewing(leave);
            setDecision('approve');
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
        title="Leave Management"
        subtitle="Review leave applications, record the decision reason and notify the applicant."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending applications"
          value={formatNumber(counts.pending)}
          tone="warn"
          icon={<CalendarClock size={17} />}
        />
        <StatCard
          label="Approved this month"
          value={formatNumber(counts.approvedThisMonth)}
          tone="ok"
          icon={<UserCheck size={17} />}
        />
        <StatCard label="Approved" value={formatNumber(counts.approved)} tone="ok" icon={<CalendarCheck size={17} />} />
        <StatCard label="Declined" value={formatNumber(counts.declined)} tone="bad" icon={<UserX size={17} />} />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load leave applications">
          {error}
        </Alert>
      )}

      <SectionCard title="Leave applications" subtitle={`${rows.length} of ${counts.total} applications shown`}>
        <Tabs
          className="mb-4"
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'Pending', label: 'Pending', count: counts.pending },
            { key: 'Approved', label: 'Approved', count: counts.approved },
            { key: 'Declined', label: 'Declined', count: counts.declined },
            { key: 'All', label: 'All', count: counts.total },
          ]}
        />
        <DataTable<LeaveRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No applications in this state"
          emptyDescription="New leave applications appear here as soon as an employee submits them."
          emptyIcon={<CalendarClock size={22} />}
        />
      </SectionCard>

      <Modal
        open={reviewing !== null}
        onClose={() => setReviewing(null)}
        title="Review leave application"
        description={reviewing ? `${reviewing.applicationId} · ${reviewing.employeeName}` : undefined}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setReviewing(null)} disabled={busy}>
              Cancel
            </button>
            {decision === 'approve' ? (
              <button type="button" className="btn-primary" onClick={() => setConfirm(true)} disabled={busy}>
                <UserCheck size={15} />
                Approve leave
              </button>
            ) : (
              <button type="button" className="btn-danger" onClick={() => setConfirm(true)} disabled={busy}>
                <UserX size={15} />
                Decline leave
              </button>
            )}
          </>
        }
      >
        {reviewing && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface-sunken px-4 py-1">
              <MetaRow label="Employee" value={`${reviewing.employeeName} (${reviewing.employeeCode})`} />
              <MetaRow label="Designation" value={reviewing.designation} />
              <MetaRow label="Department" value={reviewing.departmentName} />
              <MetaRow label="Reporting manager" value={reviewing.reportingManager ?? 'Not specified'} />
              <MetaRow label="Leave type" value={reviewing.leaveType} />
              <MetaRow
                label="Period"
                value={`${formatDate(reviewing.fromDate)} – ${formatDate(reviewing.toDate)} (${reviewing.totalDays} days)`}
              />
              <MetaRow label="Submitted" value={formatDateTime(reviewing.submittedAt)} />
              <MetaRow
                label="Attachment"
                value={reviewing.attachmentName ?? 'No attachment'}
              />
              <MetaRow label="Email status" value={reviewing.emailStatus} />
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

            <Textarea
              label="Review reason"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              hint="Optional. Shared with the employee in the notification and stored in the audit log."
            />

            <p className="flex items-center gap-1.5 text-[12px] text-ink-faint">
              <Mail size={13} />
              An email notification is sent to the applicant with this decision.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={decide}
        title={decision === 'approve' ? 'Approve this leave?' : 'Decline this leave?'}
        confirmLabel={decision === 'approve' ? 'Approve' : 'Decline'}
        tone={decision === 'approve' ? 'primary' : 'danger'}
        loading={busy}
        message={
          <>
            {reviewing?.employeeName} · {reviewing?.leaveType} · {reviewing?.totalDays} day(s) from{' '}
            {reviewing ? formatDate(reviewing.fromDate) : ''} to {reviewing ? formatDate(reviewing.toDate) : ''}.
            {note.trim() !== '' && <> The review reason “{note.trim()}” will be shared with the applicant.</>}
          </>
        }
      />
    </div>
  );
}

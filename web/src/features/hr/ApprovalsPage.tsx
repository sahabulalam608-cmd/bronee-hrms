import { useMemo, useState } from 'react';
import { BadgeCheck, ClipboardCheck, UserRoundX } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDate, formatDateTime } from '@/lib/time';
import { formatMoney } from '@/lib/format';
import { approvalTone } from '@/lib/status';
import { Alert, Input, Textarea } from '@/components/ui/forms';
import { Badge, MetaRow, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, Tabs } from '@/components/ui/data';
import { ConfirmDialog, Modal, useToast } from '@/components/ui/overlay';
import type { PendingSignup } from '@/lib/api/db-types';

type Row<T> = { [K in keyof T]: T[K] };
type SignupRow = Row<PendingSignup>;

export function ApprovalsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('pending');
  const [reviewing, setReviewing] = useState<SignupRow | null>(null);
  const [salary, setSalary] = useState('');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState<'approve' | 'decline' | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync<PendingSignup[]>(() => api.hrSignups(), []);

  const rows = useMemo(() => {
    const all = (data ?? []) as SignupRow[];
    if (tab === 'all') return all;
    return all.filter((signup) => signup.status.toLowerCase() === tab);
  }, [data, tab]);

  const counts = useMemo(() => {
    const all = data ?? [];
    return {
      pending: all.filter((signup) => signup.status === 'Pending').length,
      approved: all.filter((signup) => signup.status === 'Approved').length,
      declined: all.filter((signup) => signup.status === 'Declined').length,
      total: all.length,
    };
  }, [data]);

  function openReview(signup: SignupRow) {
    setReviewing(signup);
    setSalary(signup.salary != null ? String(signup.salary) : '');
    setNote(signup.reviewNote ?? '');
  }

  async function decide(decision: 'approve' | 'decline') {
    if (!reviewing) return;
    setBusy(true);
    try {
      const parsedSalary = salary.trim() === '' ? undefined : Number(salary);
      if (parsedSalary !== undefined && Number.isNaN(parsedSalary)) {
        toast.error('Enter a valid salary amount');
        setBusy(false);
        return;
      }
      await api.decideSignup(reviewing.id, {
        decision,
        note: note.trim() || undefined,
        salary: decision === 'approve' ? parsedSalary : undefined,
      });
      toast.success(
        decision === 'approve' ? 'Signup approved' : 'Signup declined',
        decision === 'approve'
          ? `${reviewing.fullName} can now sign in with the approved email address.`
          : `${reviewing.fullName} has been notified about the decision.`,
      );
      setConfirm(null);
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
      key: 'fullName',
      header: 'Applicant',
      render: (signup: SignupRow) => (
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium text-ink">{signup.fullName}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{signup.email}</p>
        </div>
      ),
    },
    { key: 'employeeId', header: 'Employee ID' },
    { key: 'departmentName', header: 'Department' },
    { key: 'subDepartmentName', header: 'Sub-department' },
    { key: 'designation', header: 'Designation' },
    { key: 'mobile', header: 'Mobile' },
    {
      key: 'joiningDate',
      header: 'Joining date',
      render: (signup: SignupRow) => (
        <span className="text-[13px] text-ink-muted">{formatDate(signup.joiningDate)}</span>
      ),
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      render: (signup: SignupRow) => (
        <span className="text-[13px] text-ink-muted">{formatDateTime(signup.submittedAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (signup: SignupRow) => (
        <Badge tone={approvalTone(signup.status)}>{signup.status}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (signup: SignupRow) => (
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => openReview(signup)}
        >
          Review
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employee Signup Approval"
        subtitle="Verify submitted employee registrations before the account can be activated."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total applications" value={counts.total} icon={<ClipboardCheck size={17} />} />
        <StatCard
          label="Pending review"
          value={counts.pending}
          tone="warn"
          hint="Waiting for an HR decision"
        />
        <StatCard label="Approved" value={counts.approved} tone="ok" />
        <StatCard label="Declined" value={counts.declined} tone="bad" />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load the approval queue">
          {error}
        </Alert>
      )}

      <SectionCard title="Approval queue" subtitle="Every registration submitted through the signup form">
        <Tabs
          className="mb-4"
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'pending', label: 'Pending', count: counts.pending },
            { key: 'approved', label: 'Approved', count: counts.approved },
            { key: 'declined', label: 'Declined', count: counts.declined },
            { key: 'all', label: 'All', count: counts.total },
          ]}
        />
        <DataTable<SignupRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No applications in this state"
          emptyDescription="New signups appear here as soon as an employee submits the registration form."
          emptyIcon={<ClipboardCheck size={22} />}
        />
      </SectionCard>

      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        title="Review signup application"
        description={reviewing ? `${reviewing.fullName} · submitted ${formatDateTime(reviewing.submittedAt)}` : undefined}
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setReviewing(null)}>
              Close
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => setConfirm('decline')}
              disabled={busy}
            >
              <UserRoundX size={15} />
              Decline
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setConfirm('approve')}
              disabled={busy}
            >
              <BadgeCheck size={15} />
              Approve
            </button>
          </>
        }
      >
        {reviewing && (
          <div className="space-y-5">
            <div className="rounded-xl border border-line bg-surface-sunken px-4 py-1">
              <MetaRow label="Full name" value={reviewing.fullName} />
              <MetaRow label="Employee ID" value={reviewing.employeeId} />
              <MetaRow label="Official email" value={reviewing.email} />
              <MetaRow label="Mobile number" value={reviewing.mobile} />
              <MetaRow label="Designation" value={reviewing.designation} />
              <MetaRow label="Department" value={reviewing.departmentName} />
              <MetaRow label="Sub-department" value={reviewing.subDepartmentName ?? 'Not applicable'} />
              <MetaRow label="Reporting manager" value={reviewing.reportingManager ?? 'Not specified'} />
              <MetaRow label="Joining date" value={formatDate(reviewing.joiningDate)} />
              <MetaRow
                label="Previous decision"
                value={
                  reviewing.decidedAt
                    ? `${reviewing.status} · ${formatDateTime(reviewing.decidedAt)} · ${reviewing.decidedBy ?? '—'}`
                    : 'Not decided yet'
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Monthly salary"
                type="number"
                min={0}
                step={100}
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                hint={
                  salary.trim() === ''
                    ? `Optional. Salary is visible to HR only — leave blank to set it later.`
                    : `Recorded as ${formatMoney(Number(salary) || 0)} for HR only.`
                }
              />
              <Textarea
                label="Internal note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                hint="Optional. Included in the decision record and the audit log."
              />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => decide(confirm === 'approve' ? 'approve' : 'decline')}
        title={confirm === 'approve' ? 'Approve this signup?' : 'Decline this signup?'}
        confirmLabel={confirm === 'approve' ? 'Approve' : 'Decline'}
        tone={confirm === 'approve' ? 'primary' : 'danger'}
        loading={busy}
        message={
          confirm === 'approve' ? (
            <>
              {reviewing?.fullName} will be able to sign in immediately after approval.
              {salary.trim() !== '' && (
                <> The recorded monthly salary is {formatMoney(Number(salary) || 0)} and stays visible to HR only.</>
              )}
            </>
          ) : (
            <>
              {reviewing?.fullName} will be notified that the registration was declined.
              {note.trim() !== '' && <> The note “{note.trim()}” will be shared with the applicant.</>}
            </>
          )
        }
      />
    </div>
  );
}

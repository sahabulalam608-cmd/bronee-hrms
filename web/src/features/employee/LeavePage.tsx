import { useMemo, useState } from 'react';
import { CalendarClock, CalendarDays, Paperclip, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDate, todayBD } from '@/lib/time';
import { approvalTone } from '@/lib/status';
import { useToast } from '@/components/ui/overlay';
import { Input, Select, Textarea } from '@/components/ui/forms';
import { Badge, EmptyState, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data';
import { Modal } from '@/components/ui/overlay';
import { LEAVE_TYPES } from '@shared/constants';
import type { LeaveApplication, RosterChangeRequest } from '@shared/types';

export function LeavePage() {
  const toast = useToast();
  const [applyOpen, setApplyOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const leaveType = useMemo(() => LEAVE_TYPES[0] as string, []);
  const [form, setForm] = useState({
    leaveType,
    fromDate: todayBD(),
    toDate: todayBD(),
    reason: '',
    attachmentName: '',
  });

  const { data, loading, reload } = useAsync(() => api.employeeLeaves(), []);
  const changes = useAsync(() => api.employeeRosterChangeRequests(), []);
  const roster = useAsync(() => api.employeeRoster(), []);

  const totalDays = useMemo(() => {
    if (!form.fromDate || !form.toDate || form.toDate < form.fromDate) return 0;
    return (
      Math.round(
        (new Date(`${form.toDate}T00:00:00Z`).getTime() -
          new Date(`${form.fromDate}T00:00:00Z`).getTime()) /
          86400000,
      ) + 1
    );
  }, [form.fromDate, form.toDate]);

  async function submitLeave() {
    if (!form.reason.trim()) {
      toast.warning('Add a reason', 'HR needs a reason to review the application.');
      return;
    }
    setBusy(true);
    try {
      await api.submitLeave({
        leaveType: form.leaveType,
        fromDate: form.fromDate,
        toDate: form.toDate,
        reason: form.reason.trim(),
        attachmentName: form.attachmentName.trim() || null,
      });
      toast.success('Application submitted', 'HR will review it and you will be notified.');
      setApplyOpen(false);
      setForm({ ...form, reason: '', attachmentName: '' });
      reload();
    } catch (err) {
      toast.error('Could not submit', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function submitChange() {
    const current = roster.data?.entries.find((e) => e.offDay);
    const requested = (document.getElementById('requestedDate') as HTMLInputElement)?.value;
    const reason = (document.getElementById('changeReason') as HTMLInputElement)?.value;
    if (!current || !requested || !reason) {
      toast.warning('Complete the request', 'Current date, new date and reason are required.');
      return;
    }
    setBusy(true);
    try {
      await api.submitRosterChangeRequest({
        type: 'Off Day Change',
        currentDate: current.date,
        currentShift: current.shiftCode,
        requestedDate: requested,
        reason,
      });
      toast.success('Request sent', 'HR will decide and update the roster.');
      setChangeOpen(false);
      changes.reload();
    } catch (err) {
      toast.error('Could not send the request', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<LeaveApplication & Record<string, unknown>>[] = [
    {
      key: 'applicationId',
      header: 'Application',
      width: '150px',
      render: (row) => <span className="font-mono text-[12px] text-ink-muted">{row.applicationId}</span>,
    },
    { key: 'leaveType', header: 'Type', render: (row) => row.leaveType },
    {
      key: 'fromDate',
      header: 'From — To',
      render: (row) => (
        <span>
          {formatDate(row.fromDate)} — {formatDate(row.toDate)}
        </span>
      ),
    },
    { key: 'totalDays', header: 'Days', align: 'right', render: (row) => row.totalDays },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={approvalTone(row.status)}>{row.status}</Badge>,
    },
    {
      key: 'emailStatus',
      header: 'Email',
      render: (row) => <Badge tone={row.emailStatus === 'Sent' ? 'ok' : 'neutral'}>{row.emailStatus}</Badge>,
    },
  ];

  const balance = data?.balance ?? [];
  const applications = data?.applications ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leave Management"
        subtitle="Apply for leave and track every application"
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setChangeOpen(true)}>
              <CalendarClock size={15} />
              Request off day change
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => setApplyOpen(true)}>
              <Plus size={15} />
              Apply for leave
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {balance
          .filter((b) => b.entitlement > 0)
          .map((b) => (
            <StatCard
              key={b.type}
              label={b.type}
              value={`${b.remaining} days left`}
              hint={`${b.used} of ${b.entitlement} used`}
              icon={<CalendarDays size={17} />}
              tone={b.remaining === 0 ? 'bad' : b.remaining <= 2 ? 'warn' : 'brand'}
            />
          ))}
      </div>

      <SectionCard title="My applications" padded={false}>
        <DataTable
          columns={columns}
          rows={applications as (LeaveApplication & Record<string, unknown>)[]}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No leave applications"
          emptyDescription="Apply for leave and your applications will be listed here."
          emptyIcon={<CalendarDays size={22} />}
        />
      </SectionCard>

      {applications.some((a) => a.status === 'Declined') && (
        <SectionCard title="Declined applications" padded={false}>
          <ul className="serial-list divide-y divide-line">
            {applications
              .filter((a) => a.status === 'Declined')
              .map((a) => (
                <li key={a.id} className="px-5 py-3.5">
                  <p className="text-[13px] font-semibold text-ink">
                    {a.applicationId} · {a.leaveType} · {formatDate(a.fromDate)}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{a.reviewReason}</p>
                </li>
              ))}
          </ul>
        </SectionCard>
      )}

      {/* Roster change requests */}
      <SectionCard
        title="Roster change requests"
        subtitle="Off day or shift changes requested through leave management"
        padded={false}
      >
        {(changes.data ?? []).length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={22} />}
            title="No roster change requests"
            description="Request an off day change and track the decision here."
            action={
              <button type="button" className="btn-secondary btn-sm" onClick={() => setChangeOpen(true)}>
                <Plus size={14} />
                Request off day change
              </button>
            }
          />
        ) : (
          <ul className="serial-list divide-y divide-line">
            {(changes.data ?? []).map((change: RosterChangeRequest) => (
              <li key={change.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Badge tone={approvalTone(change.status)}>{change.status}</Badge>
                <span className="text-[13px] text-ink-soft">
                  {change.type} · {formatDate(change.currentDate)} → {formatDate(change.requestedDate)}
                </span>
                {change.updateMode && (
                  <Badge tone="info">
                    {change.updateMode === 'AUTO' ? 'Auto update' : 'Manual update required'}
                  </Badge>
                )}
                <span className="ml-auto text-[12px] text-ink-faint">{formatDate(change.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Apply modal */}
      <Modal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="Apply for leave"
        description="Your application goes to HR for approval"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setApplyOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={submitLeave} disabled={busy}>
              {busy ? 'Submitting…' : 'Submit application'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Leave Type"
            value={form.leaveType}
            onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
          >
            {LEAVE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="From Date"
              type="date"
              value={form.fromDate}
              onChange={(e) => setForm({ ...form, fromDate: e.target.value, toDate: e.target.value > e.target.value ? e.target.value : form.toDate })}
            />
            <Input
              label="To Date"
              type="date"
              value={form.toDate}
              onChange={(e) => setForm({ ...form, toDate: e.target.value })}
              error={form.toDate < form.fromDate ? 'The end date cannot be before the start date.' : null}
            />
          </div>
          <div className="rounded-xl border border-line bg-surface-raised px-4 py-2.5 text-[13px]">
            <span className="text-ink-muted">Total days: </span>
            <span className="font-semibold text-ink">{totalDays || '—'}</span>
          </div>
          <Textarea
            label="Reason"
            rows={3}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Why do you need this leave?"
          />
          <Input
            label="Attachment"
            placeholder="medical-certificate.pdf"
            leading={<Paperclip size={15} />}
            value={form.attachmentName}
            onChange={(e) => setForm({ ...form, attachmentName: e.target.value })}
            hint="Attachments are stored privately and only shared with HR."
          />
        </div>
      </Modal>

      {/* Roster change modal */}
      <Modal
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        title="Request an off day change"
        description="HR can approve and update the roster automatically, or update it manually"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setChangeOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={submitChange} disabled={busy}>
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
            <p className="text-[11.5px] uppercase tracking-[0.08em] text-ink-faint">
              Currently scheduled off day
            </p>
            <p className="mt-1 text-[14px] font-semibold text-ink">
              {(() => {
                const current = roster.data?.entries.find((e) => e.offDay);
                return current ? formatDate(current.date) : 'No off day scheduled';
              })()}
            </p>
          </div>
          <Input
            id="requestedDate"
            label="New off date"
            type="date"
            hint="The date you would like to take off instead."
          />
          <Textarea
            id="changeReason"
            label="Reason"
            rows={3}
            placeholder="Why should the off day be moved?"
          />
        </div>
      </Modal>
    </div>
  );
}

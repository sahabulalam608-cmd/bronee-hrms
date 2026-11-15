import { useState } from 'react';
import { Clock4, Plus, Timer } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDate, formatMinutes, todayBD } from '@/lib/time';
import { approvalTone } from '@/lib/status';
import { useToast } from '@/components/ui/overlay';
import { Input, Textarea } from '@/components/ui/forms';
import { Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data';
import { Modal } from '@/components/ui/overlay';
import type { OvertimeRequest } from '@shared/types';

export function OvertimePage() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ workDate: todayBD(), requestedStart: '21:00', requestedEnd: '22:00', reason: '' });

  const { data, loading, reload } = useAsync(() => api.employeeOvertime(), []);

  async function submit() {
    if (!form.reason.trim()) {
      toast.warning('Add a reason', 'HR needs a reason to approve the overtime.');
      return;
    }
    setBusy(true);
    try {
      await api.requestOvertime(form);
      toast.success('Overtime requested', 'HR will set the approved start and end times.');
      setOpen(false);
      setForm({ ...form, reason: '' });
      reload();
    } catch (err) {
      toast.error('Could not send the request', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<OvertimeRequest & Record<string, unknown>>[] = [
    {
      key: 'workDate',
      header: 'Date',
      render: (row) => <span className="font-medium text-ink">{formatDate(row.workDate)}</span>,
    },
    {
      key: 'requestedStart',
      header: 'Requested',
      render: (row) => (
        <span className="font-mono tabular-nums">
          {row.requestedStart ?? '—'} – {row.requestedEnd ?? '—'}
        </span>
      ),
    },
    {
      key: 'requestedMinutes',
      header: 'Requested hours',
      align: 'right',
      render: (row) => formatMinutes(row.requestedMinutes),
    },
    {
      key: 'approvedStart',
      header: 'Approved',
      render: (row) =>
        row.approvedStart ? (
          <span className="font-mono tabular-nums">
            {row.approvedStart} – {row.approvedEnd}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: 'approvedMinutes',
      header: 'Approved hours',
      align: 'right',
      render: (row) => (row.approvedMinutes ? formatMinutes(row.approvedMinutes) : '—'),
    },
    {
      key: 'actualMinutes',
      header: 'Actual hours',
      align: 'right',
      render: (row) =>
        row.actualMinutes != null ? formatMinutes(row.actualMinutes) : <span className="text-ink-faint">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={approvalTone(row.status)}>{row.status}</Badge>,
    },
  ];

  const requests = data ?? [];
  const approvedMinutes = requests
    .filter((r) => r.status === 'Approved')
    .reduce((sum, r) => sum + r.approvedMinutes, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Overtime"
        subtitle="Overtime is paid only for time approved by HR"
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>
            <Plus size={15} />
            Request overtime
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Approved hours" value={formatMinutes(approvedMinutes)} icon={<Timer size={17} />} tone="ok" />
        <StatCard
          label="Pending requests"
          value={requests.filter((r) => r.status === 'Pending').length}
          icon={<Clock4 size={17} />}
          tone="warn"
        />
        <StatCard
          label="Actual hours"
          value={formatMinutes(requests.reduce((sum, r) => sum + (r.actualMinutes ?? 0), 0))}
          icon={<Timer size={17} />}
          tone="brand"
        />
      </div>

      <SectionCard title="My overtime requests" padded={false}>
        <DataTable
          columns={columns}
          rows={requests as (OvertimeRequest & Record<string, unknown>)[]}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No overtime requests"
          emptyDescription="Request overtime and track the approval here."
          emptyIcon={<Timer size={22} />}
        />
      </SectionCard>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Request overtime"
        description="HR will set the approved start and end times"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Work date"
            type="date"
            value={form.workDate}
            onChange={(e) => setForm({ ...form, workDate: e.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Requested start"
              type="time"
              value={form.requestedStart}
              onChange={(e) => setForm({ ...form, requestedStart: e.target.value })}
            />
            <Input
              label="Requested end"
              type="time"
              value={form.requestedEnd}
              onChange={(e) => setForm({ ...form, requestedEnd: e.target.value })}
            />
          </div>
          <Textarea
            label="Reason"
            rows={3}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Why is the overtime needed?"
          />
        </div>
      </Modal>
    </div>
  );
}

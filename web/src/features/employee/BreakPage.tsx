import { useState } from 'react';
import { Coffee, PlayCircle, Timer } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDate, formatDuration, formatHoursMinutes, formatTime } from '@/lib/time';
import { useToast } from '@/components/ui/overlay';
import { Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data';
import type { BreakRecord } from '@shared/types';

export function BreakPage() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { data, reload } = useAsync(() => api.employeeDashboard(), []);
  const history = useAsync(() => api.employeeBreaks(), []);

  async function toggle() {
    setBusy(true);
    try {
      if (data?.today.onBreak) {
        const result = await api.endBreak();
        toast.success('Break ended', `Break length ${formatDuration(result.break.durationSeconds)}.`);
      } else {
        await api.startBreak();
        toast.info('Break started', 'The working timer is paused for the break.');
      }
      reload();
      history.reload();
    } catch (err) {
      toast.error('Could not update the break', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<BreakRecord & Record<string, unknown>>[] = [
    { key: 'workDate', header: 'Date', render: (row) => formatDate(row.workDate) },
    {
      key: 'startAt',
      header: 'Break start',
      render: (row) => <span className="font-mono tabular-nums">{formatTime(row.startAt)}</span>,
    },
    {
      key: 'endAt',
      header: 'Break end',
      render: (row) =>
        row.endAt ? (
          <span className="font-mono tabular-nums">{formatTime(row.endAt)}</span>
        ) : (
          <Badge tone="warn">Running</Badge>
        ),
    },
    {
      key: 'durationSeconds',
      header: 'Duration',
      align: 'right',
      render: (row) => formatDuration(row.durationSeconds),
    },
    {
      key: 'closedBy',
      header: 'Closed by',
      render: (row) => (row.closedBy === 'SYSTEM' ? 'System' : 'Employee'),
    },
  ];

  const today = data?.today;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Break Management"
        subtitle="Break sessions are never counted as working time"
        actions={
          <button
            type="button"
            className={today?.onBreak ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
            onClick={toggle}
            disabled={busy}
          >
            {today?.onBreak ? <PlayCircle size={15} /> : <Coffee size={15} />}
            {today?.onBreak ? 'Resume working' : 'Start break'}
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's break time"
          value={formatHoursMinutes(today?.totalBreakSeconds ?? 0)}
          icon={<Coffee size={17} />}
          tone="brand"
        />
        <StatCard
          label="Break sessions today"
          value={today?.breakSessions ?? 0}
          icon={<Timer size={17} />}
          tone="info"
        />
        <StatCard
          label="Monthly break time"
          value={formatHoursMinutes(data?.month.totalBreakSeconds ?? 0)}
          icon={<Coffee size={17} />}
          tone="warn"
        />
        <StatCard
          label="Current status"
          value={today?.onBreak ? 'On break' : today?.working ? 'Working' : 'Not working'}
          icon={<Timer size={17} />}
          tone={today?.onBreak ? 'warn' : today?.working ? 'ok' : 'neutral'}
        />
      </div>

      {today?.onBreak && (
        <SectionCard title="Break in progress" className="border-warn/30 bg-warn-soft/40">
          <p className="text-[13.5px] text-ink-soft">
            Break started at{' '}
            <span className="font-mono font-semibold">{formatTime(today.breakStartedAt)}</span>. The
            working timer is paused and resumes when you end the break.
          </p>
        </SectionCard>
      )}

      <SectionCard
        title="Break history"
        subtitle="This month"
        padded={false}
      >
        <DataTable
          columns={columns}
          rows={(history.data ?? []) as (BreakRecord & Record<string, unknown>)[]}
          rowKey={(row) => row.id}
          loading={history.loading}
          emptyTitle="No break sessions yet"
          emptyDescription="Break sessions are recorded automatically as you take them."
          emptyIcon={<Coffee size={22} />}
        />
      </SectionCard>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Coffee, Hourglass, Timer, UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { currentMonthKey, formatDate, formatHoursMinutes, formatMonthKey, formatTime } from '@/lib/time';
import { formatNumber } from '@/lib/format';
import { Alert, Select } from '@/components/ui/forms';
import { Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, FilterBar, SearchInput } from '@/components/ui/data';
import type { BreakRecord } from '@shared/types';

type Row<T> = { [K in keyof T]: T[K] };
type BreakRow = Row<BreakRecord>;

export function BreaksPage() {
  const [month, setMonth] = useState(currentMonthKey());
  const [query, setQuery] = useState('');

  const { data, loading, error } = useAsync(() => api.hrBreaks(month), [month]);

  const months = useMemo(() => {
    const list: string[] = [];
    const base = new Date();
    for (let i = 0; i < 12; i += 1) {
      const date = new Date(base.getFullYear(), base.getMonth() - i, 1);
      list.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    return list;
  }, []);

  const rows = useMemo(() => {
    const all = (data ?? []) as BreakRow[];
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((record) => record.employeeName.toLowerCase().includes(needle));
  }, [data, query]);

  const stats = useMemo(() => {
    const all = (data ?? []) as BreakRow[];
    const totalSeconds = all.reduce((sum, record) => sum + record.durationSeconds, 0);
    const longest = all.reduce((max, record) => Math.max(max, record.durationSeconds), 0);
    return {
      sessions: all.length,
      totalSeconds,
      longest,
      open: all.filter((record) => !record.endAt).length,
      employees: new Set(all.map((record) => record.employeeId)).size,
    };
  }, [data]);

  const columns = [
    {
      key: 'employeeName',
      header: 'Employee',
      render: (record: BreakRow) => (
        <span className="text-[13.5px] font-medium text-ink">{record.employeeName}</span>
      ),
    },
    {
      key: 'workDate',
      header: 'Date',
      render: (record: BreakRow) => (
        <span className="text-[13px] text-ink-muted">{formatDate(record.workDate)}</span>
      ),
    },
    {
      key: 'startAt',
      header: 'Break start',
      render: (record: BreakRow) => (
        <span className="text-[13px] text-ink-soft">{formatTime(record.startAt)}</span>
      ),
    },
    {
      key: 'endAt',
      header: 'Break end',
      render: (record: BreakRow) => (
        <span className="text-[13px] text-ink-soft">{record.endAt ? formatTime(record.endAt) : 'Running'}</span>
      ),
    },
    {
      key: 'durationSeconds',
      header: 'Duration',
      align: 'right' as const,
      render: (record: BreakRow) => (
        <span className="font-mono text-[13px] tabular-nums text-ink">
          {formatHoursMinutes(record.durationSeconds)}
        </span>
      ),
    },
    {
      key: 'closedBy',
      header: 'Closed by',
      render: (record: BreakRow) => (
        <Badge tone={record.closedBy === 'SYSTEM' ? 'info' : 'neutral'}>
          {record.closedBy === 'SYSTEM' ? 'Automatic' : 'Employee'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Break Records"
        subtitle="Every break session with start, end and duration. Break time is never counted as working time."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Break sessions" value={formatNumber(stats.sessions)} icon={<Coffee size={17} />} />
        <StatCard
          label="Total break time"
          value={formatHoursMinutes(stats.totalSeconds)}
          tone="info"
          icon={<Hourglass size={17} />}
        />
        <StatCard
          label="Longest break"
          value={formatHoursMinutes(stats.longest)}
          tone="warn"
          icon={<Timer size={17} />}
        />
        <StatCard
          label="Employees on break"
          value={formatNumber(stats.employees)}
          hint={`${stats.open} session(s) still running`}
          icon={<UserCheck size={17} />}
        />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load break records">
          {error}
        </Alert>
      )}

      <SectionCard
        title="Break register"
        subtitle={`${formatMonthKey(month)} · ${rows.length} sessions`}
        padded={false}
      >
        <div className="border-b border-line p-4">
          <FilterBar>
            <div className="w-[165px]">
              <Select
                label="Month"
                value={month}
                options={months.map((value) => ({ value, label: formatMonthKey(value) }))}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search employee"
              className="min-w-[220px] flex-1"
            />
          </FilterBar>
        </div>
        <DataTable<BreakRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No break records for this month"
          emptyDescription="Break sessions appear here as soon as an employee starts and ends a break."
          emptyIcon={<Coffee size={22} />}
        />
      </SectionCard>
    </div>
  );
}

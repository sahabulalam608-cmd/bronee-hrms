import { useMemo, useState } from 'react';
import { CalendarDays, Clock4, Timer, UserCheck, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { currentMonthKey, formatDate, formatHoursMinutes, formatMonthKey, formatTime } from '@/lib/time';
import { formatNumber } from '@/lib/format';
import { attendanceTone, lateTone, shiftAccent } from '@/lib/status';
import { Alert, Select } from '@/components/ui/forms';
import { Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, FilterBar, SearchInput } from '@/components/ui/data';
import type { AttendanceRecord } from '@shared/types';

type Row<T> = { [K in keyof T]: T[K] };
type AttendanceRow = Row<AttendanceRecord>;

export function AttendancePage() {
  const [month, setMonth] = useState(currentMonthKey());
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');

  const { data, loading, error } = useAsync(() => api.hrAttendance(month), [month]);

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
    const all = (data?.records ?? []) as AttendanceRow[];
    const needle = query.trim().toLowerCase();
    return all.filter((record) => {
      if (department && record.departmentName !== department) return false;
      if (status && record.attendanceStatus !== status) return false;
      if (!needle) return true;
      return [record.employeeName, record.employeeCode, record.departmentName]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [data, department, status, query]);

  const departments = useMemo(
    () => Array.from(new Set((data?.records ?? []).map((record) => record.departmentName))).sort(),
    [data],
  );

  const statuses = useMemo(
    () => Array.from(new Set((data?.records ?? []).map((record) => record.attendanceStatus))).sort(),
    [data],
  );

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
      key: 'workDate',
      header: 'Date',
      render: (record: AttendanceRow) => (
        <span className="text-[13px] text-ink-muted">{formatDate(record.workDate)}</span>
      ),
    },
    {
      key: 'scheduledStart',
      header: 'Scheduled',
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
      key: 'clockOut',
      header: 'Clock out',
      render: (record: AttendanceRow) => (
        <span className="text-[13px] text-ink-muted">{formatTime(record.clockOut)}</span>
      ),
    },
    {
      key: 'totalWorkingSeconds',
      header: 'Working time',
      align: 'right' as const,
      render: (record: AttendanceRow) => (
        <span className="font-mono text-[13px] tabular-nums text-ink">
          {formatHoursMinutes(record.totalWorkingSeconds)}
        </span>
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
      render: (record: AttendanceRow) => (
        <Badge tone={lateTone(record.lateStatus)}>{record.lateStatus}</Badge>
      ),
    },
    {
      key: 'hrReviewStatus',
      header: 'HR review',
      render: (record: AttendanceRow) => (
        <Badge tone={record.hrReviewStatus === 'Reviewed' ? 'brand' : 'neutral'}>
          {record.hrReviewStatus}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance Management"
        subtitle="Monthly attendance register with punch times, working hours and verification status."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Present"
          value={formatNumber(data?.totalPresent ?? 0)}
          tone="ok"
          icon={<UserCheck size={17} />}
        />
        <StatCard
          label="Absent"
          value={formatNumber(data?.totalAbsent ?? 0)}
          tone="bad"
          icon={<UserX size={17} />}
        />
        <StatCard label="Late" value={formatNumber(data?.totalLate ?? 0)} tone="warn" />
        <StatCard label="On leave" value={formatNumber(data?.totalOnLeave ?? 0)} tone="info" />
        <StatCard
          label="Pending review"
          value={formatNumber(data?.totalPendingReview ?? 0)}
          tone="warn"
          icon={<Clock4 size={17} />}
        />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load attendance">
          {error}
        </Alert>
      )}

      <SectionCard
        title="Monthly attendance register"
        subtitle={`${formatMonthKey(month)} · ${rows.length} records shown`}
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
            <div className="w-[190px]">
              <Select
                label="Department"
                value={department}
                placeholder="All departments"
                options={departments.map((value) => ({ value, label: value }))}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
            <div className="w-[190px]">
              <Select
                label="Status"
                value={status}
                placeholder="All statuses"
                options={statuses.map((value) => ({ value, label: value }))}
                onChange={(e) => setStatus(e.target.value)}
              />
            </div>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search employee or ID"
              className="min-w-[220px] flex-1"
            />
          </FilterBar>
        </div>

        <DataTable<AttendanceRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No attendance records for this month"
          emptyDescription="Attendance records appear as soon as employees punch in."
          emptyIcon={<CalendarDays size={22} />}
        />
      </SectionCard>

      <p className="flex items-center gap-1.5 text-[12px] text-ink-faint">
        <Timer size={13} />
        Working time excludes break sessions and is calculated from the actual working start time.
      </p>
    </div>
  );
}

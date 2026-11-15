import { useMemo, useState } from 'react';
import {
  AlarmClock,
  CheckCircle2,
  ClipboardList,
  Download,
  ListTodo,
  Pencil,
  PlayCircle,
  Plus,
  Timer,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { addDays, daysFromToday, formatDate, formatMonthKey, todayBD } from '@/lib/time';
import { formatNumber, percent } from '@/lib/format';
import { priorityTone, taskTone } from '@/lib/status';
import { Alert, Input, Select, Textarea } from '@/components/ui/forms';
import { Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, DistributionBar, FilterBar, SearchInput } from '@/components/ui/data';
import { Modal, useToast } from '@/components/ui/overlay';
import { PENDING_BUCKETS, TASK_PRIORITY } from '@shared/constants';
import type { Employee, Task } from '@shared/types';

type Row<T> = { [K in keyof T]: T[K] };
type TaskRow = Row<Task>;

interface Draft {
  id?: string;
  name: string;
  description: string;
  departmentName: string;
  employeeId: string;
  priority: string;
  assignedDate: string;
  startDate: string;
  dueDate: string;
  status: string;
  referenceLink: string;
  notes: string;
}

const STATUS_ORDER = ['Yet to Start', 'In Progress', 'Pending', 'Complete'];

export function TasksPage() {
  const toast = useToast();
  const [startDate, setStartDate] = useState(addDays(todayBD(), -30));
  const [endDate, setEndDate] = useState(todayBD());
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data, loading, error, reload } = useAsync<Task[]>(() => api.hrTasks(), []);
  const { data: employees } = useAsync<Employee[]>(() => api.hrEmployees(), []);

  const tasks = useMemo(() => (data ?? []) as TaskRow[], [data]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const overlaps =
        (!startDate || task.startDate <= endDate) && (!endDate || task.dueDate >= startDate);
      if (!overlaps) return false;
      if (!needle) return true;
      return [task.taskId, task.name, task.employeeName, task.departmentName]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [tasks, startDate, endDate, search]);

  const metrics = useMemo(() => {
    const count = (predicate: (task: TaskRow) => boolean) => filtered.filter(predicate).length;
    const today = todayBD();
    return {
      total: filtered.length,
      inProgress: count((task) => task.status === 'In Progress'),
      completed: count((task) => task.status === 'Complete'),
      yetToStart: count((task) => task.status === 'Yet to Start'),
      pending: count((task) => task.status === 'Pending'),
      overdue: count((task) => task.status !== 'Complete' && task.dueDate < today),
    };
  }, [filtered]);

  const byPriority = useMemo(
    () =>
      TASK_PRIORITY.map((priority) => ({
        label: priority,
        value: filtered.filter((task) => task.priority === priority).length,
      })),
    [filtered],
  );

  const byDepartment = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of filtered) map.set(task.departmentName, (map.get(task.departmentName) ?? 0) + 1);
    return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const byStatus = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        label: status,
        value: filtered.filter((task) => task.status === status).length,
      })),
    [filtered],
  );

  const overdueTasks = useMemo(() => {
    const today = todayBD();
    return filtered
      .filter((task) => task.status !== 'Complete' && task.dueDate < today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [filtered]);

  const pendingBuckets = useMemo(() => {
    const pending = filtered.filter((task) => task.status !== 'Complete');
    return PENDING_BUCKETS.map((bucket) => ({
      label: bucket.label,
      value: pending.filter((task) => {
        const age = pendingDays(task);
        return age >= bucket.min && age <= bucket.max;
      }).length,
    }));
  }, [filtered]);

  const months = useMemo(() => {
    const list: string[] = [];
    const base = new Date();
    for (let i = 0; i < 12; i += 1) {
      const date = new Date(base.getFullYear(), base.getMonth() - i, 1);
      list.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    return list;
  }, []);

  const years = useMemo(() => {
    const base = new Date().getFullYear();
    return [base, base - 1, base - 2].map((year) => String(year));
  }, []);

  function openCreate() {
    setDraft({
      name: '',
      description: '',
      departmentName: employees?.[0]?.departmentName ?? '',
      employeeId: employees?.[0]?.id ?? '',
      priority: 'Medium',
      assignedDate: todayBD(),
      startDate: todayBD(),
      dueDate: todayBD(),
      status: 'Yet to Start',
      referenceLink: '',
      notes: '',
    });
  }

  function openEdit(task: TaskRow) {
    setDraft({
      id: task.id,
      name: task.name,
      description: task.description,
      departmentName: task.departmentName,
      employeeId: task.employeeId,
      priority: task.priority,
      assignedDate: task.assignedDate,
      startDate: task.startDate,
      dueDate: task.dueDate,
      status: task.status,
      referenceLink: task.referenceLink ?? '',
      notes: task.notes ?? '',
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error('Task name is required');
      return;
    }
    if (!draft.employeeId) {
      toast.error('Assign the task to an employee');
      return;
    }
    setSaving(true);
    try {
      await api.saveTask({
        id: draft.id,
        name: draft.name.trim(),
        description: draft.description.trim(),
        departmentName: draft.departmentName.trim(),
        employeeId: draft.employeeId,
        priority: draft.priority as Task['priority'],
        assignedDate: draft.assignedDate,
        startDate: draft.startDate,
        dueDate: draft.dueDate,
        status: draft.status as Task['status'],
        referenceLink: draft.referenceLink.trim() || null,
        notes: draft.notes.trim() || null,
      });
      toast.success(draft.id ? 'Task updated' : 'Task created', draft.name.trim());
      setDraft(null);
      reload();
    } catch (err) {
      toast.error('Save failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function downloadCsv() {
    setExporting(true);
    try {
      const csv = await api.exportReport('task');
      const filteredCsv = filterCsv(csv, startDate, endDate);
      const blob = new Blob([filteredCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bronee-task-report-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      const rows = filteredCsv.split('\n').length - 1;
      toast.success('Task report downloaded', `${rows} row(s) exported as CSV.`);
    } catch (err) {
      toast.error('Export failed', err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  }

  const columns = [
    {
      key: 'taskId',
      header: 'Task ID',
      render: (task: TaskRow) => (
        <span className="font-mono text-[12.5px] text-ink-soft">{task.taskId}</span>
      ),
    },
    {
      key: 'name',
      header: 'Task name',
      render: (task: TaskRow) => (
        <div className="min-w-0 max-w-[280px]">
          <p className="truncate text-[13.5px] font-medium text-ink">{task.name}</p>
          {task.referenceLink && (
            <a
              href={task.referenceLink}
              target="_blank"
              rel="noreferrer"
              className="truncate text-[11.5px] text-brand-700 underline-offset-2 hover:underline"
            >
              {task.referenceLink}
            </a>
          )}
        </div>
      ),
    },
    { key: 'departmentName', header: 'Department' },
    { key: 'employeeName', header: 'Employee' },
    {
      key: 'priority',
      header: 'Priority',
      render: (task: TaskRow) => (
        <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
      ),
    },
    {
      key: 'startDate',
      header: 'Start',
      render: (task: TaskRow) => (
        <span className="text-[13px] text-ink-muted">{formatDate(task.startDate)}</span>
      ),
    },
    {
      key: 'dueDate',
      header: 'Due',
      render: (task: TaskRow) => (
        <span className="text-[13px] text-ink-muted">{formatDate(task.dueDate)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (task: TaskRow) => <Badge tone={taskTone(task.status)}>{task.status}</Badge>,
    },
    {
      key: 'completeDate',
      header: 'Completed',
      render: (task: TaskRow) => (
        <span className="text-[13px] text-ink-muted">
          {task.completeDate ? formatDate(task.completeDate) : '—'}
        </span>
      ),
    },
    {
      key: 'pendingDays',
      header: 'Pending days',
      align: 'right' as const,
      render: (task: TaskRow) => (
        <span className="font-mono text-[13px] tabular-nums text-ink-muted">
          {task.status === 'Complete' ? '0' : pendingDays(task)}
        </span>
      ),
    },
    {
      key: 'overdue',
      header: 'Overdue',
      render: (task: TaskRow) => {
        const overdue = task.status !== 'Complete' && task.dueDate < todayBD();
        return <Badge tone={overdue ? 'bad' : 'neutral'}>{overdue ? 'Yes' : 'No'}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (task: TaskRow) => (
        <button
          type="button"
          className="btn-icon h-8 w-8"
          onClick={() => openEdit(task)}
          aria-label={`Edit ${task.name}`}
        >
          <Pencil size={15} />
        </button>
      ),
    },
  ];

  const employeeOptions = useMemo(
    () =>
      (employees ?? []).map((employee) => ({
        value: employee.id,
        label: `${employee.fullName} — ${employee.departmentName}`,
      })),
    [employees],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Task Management Dashboard"
        subtitle="Department-wise task tracking with priority, status, overdue and pending-age analysis."
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={downloadCsv} disabled={exporting}>
              <Download size={15} />
              {exporting ? 'Preparing…' : 'Download CSV'}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={openCreate}>
              <Plus size={15} />
              New task
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Total assigned tasks" value={formatNumber(metrics.total)} icon={<ClipboardList size={17} />} />
        <StatCard
          label="In progress"
          value={formatNumber(metrics.inProgress)}
          tone="brand"
          icon={<PlayCircle size={17} />}
        />
        <StatCard
          label="Completed"
          value={formatNumber(metrics.completed)}
          tone="ok"
          icon={<CheckCircle2 size={17} />}
        />
        <StatCard
          label="Yet to start"
          value={formatNumber(metrics.yetToStart)}
          tone="neutral"
          icon={<ListTodo size={17} />}
        />
        <StatCard label="Pending" value={formatNumber(metrics.pending)} tone="warn" icon={<Timer size={17} />} />
        <StatCard
          label="Overdue"
          value={formatNumber(metrics.overdue)}
          tone="bad"
          icon={<AlarmClock size={17} />}
        />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load tasks">
          {error}
        </Alert>
      )}

      <SectionCard title="Filters" subtitle="Narrow the dashboard down to a date range, month or year">
        <FilterBar>
          <div className="w-[165px]">
            <Input
              label="Start date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="w-[165px]">
            <Input
              label="End date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="w-[155px]">
            <Select
              label="Month"
              value={startDate.slice(0, 7)}
              placeholder="Select month"
              options={months.map((value) => ({ value, label: formatMonthKey(value) }))}
              onChange={(e) => {
                const [year, month] = e.target.value.split('-');
                const lastDay = new Date(Number(year), Number(month), 0).getDate();
                setStartDate(`${year}-${month}-01`);
                setEndDate(`${year}-${month}-${String(lastDay).padStart(2, '0')}`);
              }}
            />
          </div>
          <div className="w-[120px]">
            <Select
              label="Year"
              value={startDate.slice(0, 4)}
              options={years.map((value) => ({ value, label: value }))}
              onChange={(e) => {
                setStartDate(`${e.target.value}-${startDate.slice(5, 7)}-${startDate.slice(8, 10)}`);
                setEndDate(`${e.target.value}-${endDate.slice(5, 7)}-${endDate.slice(8, 10)}`);
              }}
            />
          </div>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search task, employee or department"
            className="min-w-[240px] flex-1"
          />
        </FilterBar>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Priority-wise summary" subtitle="Tasks by priority">
          <DistributionBar items={byPriority} />
        </SectionCard>

        <SectionCard title="Department-wise summary" subtitle="Tasks by department">
          {byDepartment.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-faint">No tasks in this range.</p>
          ) : (
            <DistributionBar items={byDepartment} />
          )}
        </SectionCard>

        <SectionCard title="Task status distribution" subtitle="Share of tasks by status">
          <ul className="serial-list space-y-2.5">
            {byStatus.map((entry) => (
              <li key={entry.label}>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-ink-muted">{entry.label}</span>
                  <span className="font-semibold text-ink">
                    {entry.value} · {percent(entry.value, metrics.total)}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{ width: `${percent(entry.value, metrics.total)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Overdue tasks"
          subtitle="Past the due date and not completed"
          padded={false}
        >
          {overdueTasks.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-ink-faint">
              No overdue tasks in the selected range.
            </p>
          ) : (
            <ul className="serial-list divide-y divide-line">
              {overdueTasks.slice(0, 8).map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{task.name}</span>
                    <span className="block truncate text-[12px] text-ink-faint">
                      {task.employeeName} · {task.departmentName} · due {formatDate(task.dueDate)}
                    </span>
                  </span>
                  <Badge tone="bad">{Math.abs(daysFromToday(task.dueDate))}d overdue</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Pending age" subtitle="How long unfinished tasks have been open">
          <ul className="serial-list space-y-2.5">
            {pendingBuckets.map((bucket) => (
              <li key={bucket.label}>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-ink-muted">{bucket.label}</span>
                  <span className="font-semibold text-ink">
                    {bucket.value} · {percent(bucket.value, filtered.filter((t) => t.status !== 'Complete').length)}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{
                      width: `${percent(
                        bucket.value,
                        filtered.filter((t) => t.status !== 'Complete').length,
                      )}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        title="Task list"
        subtitle={`${filtered.length} of ${tasks.length} tasks in the selected range`}
        padded={false}
      >
        <DataTable<TaskRow>
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No tasks in this range"
          emptyDescription="Widen the date range or create a new task for an employee."
          emptyIcon={<ClipboardList size={22} />}
        />
      </SectionCard>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit task' : 'New task'}
        description="The task is mirrored to the Task Management spreadsheet after backend validation."
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : draft?.id ? 'Save changes' : 'Create task'}
            </button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label="Task name"
                value={draft.name}
                required
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Textarea
                label="Description"
                rows={3}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <Select
              label="Assigned employee"
              value={draft.employeeId}
              options={employeeOptions}
              onChange={(e) => {
                const employee = employees?.find((item) => item.id === e.target.value);
                setDraft({
                  ...draft,
                  employeeId: e.target.value,
                  departmentName: employee?.departmentName ?? draft.departmentName,
                });
              }}
            />
            <Input
              label="Department"
              value={draft.departmentName}
              onChange={(e) => setDraft({ ...draft, departmentName: e.target.value })}
            />
            <Select
              label="Priority"
              value={draft.priority}
              options={TASK_PRIORITY.map((value) => ({ value, label: value }))}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
            />
            <Select
              label="Status"
              value={draft.status}
              options={STATUS_ORDER.map((value) => ({ value, label: value }))}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            />
            <Input
              label="Assigned date"
              type="date"
              value={draft.assignedDate}
              onChange={(e) => setDraft({ ...draft, assignedDate: e.target.value })}
            />
            <Input
              label="Start date"
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
            />
            <Input
              label="Due date"
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
            />
            <Input
              label="Reference link"
              type="url"
              value={draft.referenceLink}
              onChange={(e) => setDraft({ ...draft, referenceLink: e.target.value })}
              hint="Optional link to the task brief, file or document."
            />
            <Textarea
              label="Notes"
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

function pendingDays(task: TaskRow): number {
  if (task.status === 'Complete') return 0;
  return Math.max(0, -daysFromToday(task.startDate));
}

/** Keep only the CSV data lines whose task dates fall inside the selected range. */
function filterCsv(csv: string, startDate: string, endDate: string): string {
  const lines = csv.split('\n');
  const header = lines[0];
  const data = lines.slice(1).filter((line) => {
    if (!line.trim()) return false;
    const dates = line.match(/\d{4}-\d{2}-\d{2}/g);
    if (!dates || dates.length === 0) return true;
    return dates.some((date) => date >= startDate && date <= endDate);
  });
  return [header, ...data].join('\n');
}

import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  Flag,
  Inbox,
  Plus,
  Timer,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import { DonutChart, HorizontalBars } from '@/components/charts';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  useToast,
  type BadgeTone,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useHrDepartments, useHrEmployees, useHrTaskSubmissions, useHrTasks, useInvalidate } from '@/lib/queries';
import { formatBanglaDate } from '@bronee/shared';
import { PRIORITY_META, TASK_STATUS_META, cn, downloadCsv, toCsv } from '@/lib/utils';

const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'];

function KpiTile({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone?: BadgeTone;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-slate-100 text-slate-700',
    brand: 'bg-brand-50 text-brand-700',
    success: 'bg-success-soft text-success-deep',
    warning: 'bg-warning-soft text-warning-deep',
    danger: 'bg-danger-soft text-danger-deep',
    info: 'bg-info-soft text-info-deep',
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-muted">
            {label}
          </p>
          <p className="mt-1.5 text-[22px] font-extrabold leading-none tracking-[-0.02em] text-ink">
            {value}
          </p>
        </div>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
          {icon}
        </span>
      </div>
    </Card>
  );
}

export default function HrTasksPage() {
  const toast = useToast();
  const invalidate = useInvalidate();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filters = useMemo(
    () => ({ from: from || undefined, to: to || undefined }),
    [from, to],
  );

  const tasksQuery = useHrTasks(filters);
  const submissionsQuery = useHrTaskSubmissions();
  const departmentsQuery = useHrDepartments();
  const employeesQuery = useHrEmployees();

  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    departmentId: '',
    assignedEmployeeId: '',
    priority: 'medium',
    assignedDate: new Date().toISOString().slice(0, 10),
    startDate: '',
    dueDate: '',
    referenceLink: '',
    notes: '',
  });

  const tasks = tasksQuery.data?.items ?? [];
  const summary = tasksQuery.data?.summary;
  const prioritySummary = tasksQuery.data?.prioritySummary ?? [];
  const departmentSummary = tasksQuery.data?.departmentSummary ?? [];
  const statusSummary = tasksQuery.data?.statusSummary ?? [];
  const submissions = submissionsQuery.data?.items ?? [];

  const overdueTasks = useMemo(() => tasks.filter((task) => task.overdue), [tasks]);

  const departments = departmentsQuery.data?.items ?? [];
  const employees = employeesQuery.data?.items ?? [];

  const departmentOptions = useMemo(
    () => [
      { value: '', label: 'No department' },
      ...departments.map((department) => ({ value: department.id, label: department.name })),
    ],
    [departments],
  );

  const employeeOptions = useMemo(
    () => [
      { value: '', label: 'Unassigned' },
      ...employees.map((employee) => ({
        value: employee.id,
        label: `${employee.fullName} · ${employee.employeeCode}`,
      })),
    ],
    [employees],
  );

  const statusDonut = useMemo(
    () =>
      statusSummary.map((row) => ({
        label: TASK_STATUS_META[row.status]?.label ?? row.status,
        value: row.count,
      })),
    [statusSummary],
  );

  const priorityBars = useMemo(
    () =>
      PRIORITY_ORDER.map((priority) => ({
        label: PRIORITY_META[priority]?.label ?? priority,
        value: prioritySummary.find((row) => row.priority === priority)?.count ?? 0,
      })).filter((bar) => bar.value > 0),
    [prioritySummary],
  );

  const departmentBars = useMemo(
    () => departmentSummary.map((row) => ({ label: row.department, value: row.count })),
    [departmentSummary],
  );

  function downloadTaskCsv() {
    const rows: Array<Array<string | number | null | undefined>> = [
      [
        'Task ID',
        'Task Name',
        'Department',
        'Assigned Employee',
        'Priority',
        'Start Date',
        'Due Date',
        'Task Status',
        'Complete Date',
        'Pending Days',
        'Overdue Status',
        'Notes',
        'Reference Link',
      ],
      ...tasks.map((task) => [
        task.taskCode,
        task.name,
        task.department ?? '',
        task.assignedEmployeeName ?? '',
        task.priority,
        task.startDate ?? '',
        task.dueDate ?? '',
        task.status,
        task.completedAt ?? '',
        task.pendingDays,
        task.overdue ? 'Yes' : 'No',
        task.notes ?? '',
        task.referenceLink ?? '',
      ]),
    ];
    downloadCsv(`bronee-tasks-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
    toast.success('CSV downloaded', `${tasks.length} task row(s) exported.`);
  }

  async function createTask() {
    if (!form.name.trim()) {
      toast.error('Task name is required', 'Give the task a name before saving.');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        departmentId: form.departmentId || null,
        assignedEmployeeId: form.assignedEmployeeId || null,
        priority: form.priority,
        assignedDate: form.assignedDate || undefined,
        startDate: form.startDate || undefined,
        dueDate: form.dueDate || undefined,
        referenceLink: form.referenceLink.trim() || null,
        notes: form.notes.trim() || undefined,
      };
      await api.post('/hr/tasks', body);
      toast.success('Task created', `${form.name.trim()} is now on the board.`);
      invalidate([['hr', 'tasks'], ['hr', 'task-submissions']]);
      setCreateOpen(false);
      setForm({
        name: '',
        description: '',
        departmentId: '',
        assignedEmployeeId: '',
        priority: 'medium',
        assignedDate: new Date().toISOString().slice(0, 10),
        startDate: '',
        dueDate: '',
        referenceLink: '',
        notes: '',
      });
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'The task could not be created.';
      toast.error('Create failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function reviewSubmission(taskId: string, decision: 'approve' | 'reject', feedback: string) {
    setBusy(true);
    try {
      await api.post(`/hr/tasks/${taskId}/review`, {
        decision,
        feedback: feedback.trim() || undefined,
      });
      toast.success(
        decision === 'approve' ? 'Submission approved' : 'Submission rejected',
        decision === 'approve'
          ? 'The task is marked complete and the employee was notified.'
          : 'The employee was notified that changes are needed.',
      );
      invalidate([['hr', 'tasks'], ['hr', 'task-submissions']]);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The submission could not be reviewed.';
      toast.error('Review failed', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Task Management"
        description="Every task across BRONEE — assignment, priority, deadlines and submissions awaiting review."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              icon={<Download className="h-4 w-4" />}
              onClick={downloadTaskCsv}
              disabled={tasks.length === 0}
            >
              Download CSV
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              New task
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------------------- KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Total assigned" value={summary?.total ?? 0} icon={<ClipboardList className="h-4 w-4" />} tone="brand" />
        <KpiTile label="In progress" value={summary?.inProgress ?? 0} icon={<Timer className="h-4 w-4" />} tone="info" />
        <KpiTile label="Completed" value={summary?.complete ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
        <KpiTile label="Yet to start" value={summary?.yetToStart ?? 0} icon={<Inbox className="h-4 w-4" />} />
        <KpiTile label="Pending review" value={summary?.pending ?? 0} icon={<Flag className="h-4 w-4" />} tone="warning" />
        <KpiTile label="Overdue" value={summary?.overdue ?? 0} icon={<AlertTriangle className="h-4 w-4" />} tone="danger" />
      </div>

      {/* --------------------------------------------------------- summaries */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Priority mix"
            subtitle="How the workload is prioritised."
            icon={<Flag className="h-4 w-4" />}
          />
          <CardBody>
            {priorityBars.length ? (
              <HorizontalBars data={priorityBars} />
            ) : (
              <EmptyState title="No tasks in range" description="Priority mix appears here." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Department load"
            subtitle="Tasks owned by each department."
            icon={<Users className="h-4 w-4" />}
          />
          <CardBody>
            {departmentBars.length ? (
              <HorizontalBars data={departmentBars} />
            ) : (
              <EmptyState title="No tasks in range" description="Department load appears here." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Status distribution"
            subtitle="Every task by its current state."
            icon={<ClipboardList className="h-4 w-4" />}
          />
          <CardBody>
            {statusDonut.length ? (
              <DonutChart data={statusDonut} centerLabel="Tasks" size={148} />
            ) : (
              <EmptyState title="No tasks in range" description="Status mix appears here." />
            )}
          </CardBody>
        </Card>
      </div>

      {/* ------------------------------------------------------- date filter */}
      <Card className="mt-4">
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input
              label="Start date from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              containerClassName="sm:w-48"
            />
            <Input
              label="Due date up to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              containerClassName="sm:w-48"
            />
            <Button
              size="sm"
              variant="ghost"
              className="sm:mb-0.5"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
            >
              Clear range
            </Button>
            <span className="flex items-center gap-1.5 pb-2 text-[12.5px] text-ink-muted">
              <CalendarRange className="h-3.5 w-3.5" />
              Filtering by task start and due date
            </span>
          </div>
        </CardBody>
      </Card>

      {/* ---------------------------------------------------- overdue + reviews */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Overdue tasks"
            subtitle="Past the due date and still open."
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          {tasksQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-10" />
              ))}
            </div>
          ) : overdueTasks.length === 0 ? (
            <EmptyState
              title="Nothing overdue"
              description="Every task in range is still inside its deadline."
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {overdueTasks.slice(0, 8).map((task) => (
                <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                  <Avatar name={task.assignedEmployeeName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">{task.name}</p>
                    <p className="text-[11.5px] text-ink-muted">
                      {task.taskCode} · {task.assignedEmployeeName ?? 'Unassigned'} · due{' '}
                      {task.dueDate ? formatBanglaDate(task.dueDate) : '—'}
                    </p>
                  </div>
                  <Badge tone="danger">{task.pendingDays}d late</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Submissions awaiting review"
            subtitle="Employee work waiting for an HR decision."
            icon={<Inbox className="h-4 w-4" />}
          />
          {submissionsQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-10" />
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <EmptyState
              title="No submissions waiting"
              description="Submitted work lands here for approval or rejection."
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {submissions.map((submission) => (
                <li key={submission.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink">
                        {submission.taskName}
                      </p>
                      <p className="text-[11.5px] text-ink-muted">
                        {submission.taskCode} · {submission.employeeName ?? 'Unknown'}
                      </p>
                    </div>
                    {submission.submissionLink ? (
                      <a
                        href={submission.submissionLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:text-brand-900"
                      >
                        Open link
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                  {submission.notes ? (
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] text-ink-soft">
                      {submission.notes}
                    </p>
                  ) : null}
                  <div className="mt-2.5 flex gap-2">
                    <Button
                      size="xs"
                      loading={busy}
                      onClick={() => reviewSubmission(submission.taskId, 'approve', '')}
                    >
                      Approve
                    </Button>
                    <Button
                      size="xs"
                      variant="danger"
                      loading={busy}
                      onClick={() => reviewSubmission(submission.taskId, 'reject', '')}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ----------------------------------------------------------- task table */}
      <Card className="mt-4">
        <CardHeader
          title="All tasks"
          subtitle="Full task register with deadlines and workload status."
          icon={<ClipboardList className="h-4 w-4" />}
        />
        {tasksQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            title="No tasks in this range"
            description="Widen the date filter or create the first task."
            icon={<ClipboardList className="h-5 w-5" />}
            action={
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                New task
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <TH>Task ID</TH>
              <TH>Task name</TH>
              <TH>Department</TH>
              <TH>Assigned employee</TH>
              <TH>Priority</TH>
              <TH>Start date</TH>
              <TH>Due date</TH>
              <TH>Status</TH>
              <TH align="right">Pending days</TH>
              <TH>Overdue</TH>
              <TH>Notes / link</TH>
            </THead>
            <TBody>
              {tasks.map((task) => {
                const statusMeta = TASK_STATUS_META[task.status] ?? {
                  label: task.status,
                  className: 'bg-slate-100 text-slate-600',
                };
                const priorityMeta = PRIORITY_META[task.priority] ?? {
                  label: task.priority,
                  className: 'bg-slate-100 text-slate-600',
                };
                return (
                  <TR key={task.id}>
                    <TD>
                      <span className="whitespace-nowrap font-mono text-[12px] font-semibold text-ink-soft">
                        {task.taskCode}
                      </span>
                    </TD>
                    <TD>
                      <p className="max-w-[220px] truncate font-semibold text-ink">{task.name}</p>
                      {task.description ? (
                        <p className="max-w-[220px] truncate text-[11.5px] text-ink-muted">
                          {task.description}
                        </p>
                      ) : null}
                    </TD>
                    <TD>{task.department ?? '—'}</TD>
                    <TD>{task.assignedEmployeeName ?? 'Unassigned'}</TD>
                    <TD>
                      <span className={cn('chip', priorityMeta.className)}>{priorityMeta.label}</span>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {task.startDate ? formatBanglaDate(task.startDate) : '—'}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {task.dueDate ? formatBanglaDate(task.dueDate) : '—'}
                    </TD>
                    <TD>
                      <span className={cn('chip', statusMeta.className)}>{statusMeta.label}</span>
                    </TD>
                    <TD align="right">{task.pendingDays}</TD>
                    <TD>
                      {task.overdue ? (
                        <Badge tone="danger" dot>
                          Overdue
                        </Badge>
                      ) : (
                        <span className="text-[12.5px] text-ink-muted">—</span>
                      )}
                    </TD>
                    <TD>
                      {task.referenceLink ? (
                        <a
                          href={task.referenceLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:text-brand-900"
                        >
                          Open
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : task.notes ? (
                        <span className="block max-w-[180px] truncate text-[12.5px] text-ink-soft">
                          {task.notes}
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-ink-muted">—</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {/* ---------------------------------------------------------- create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New task"
        description="Tasks are tracked against a department, an owner and a deadline."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={createTask}>
              Create task
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input
              label="Task name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Reconcile courier delivery register"
              required
            />
          </div>
          <Select
            label="Department"
            value={form.departmentId}
            onChange={(event) => setForm({ ...form, departmentId: event.target.value })}
            options={departmentOptions}
          />
          <Select
            label="Assigned employee"
            value={form.assignedEmployeeId}
            onChange={(event) => setForm({ ...form, assignedEmployeeId: event.target.value })}
            options={employeeOptions}
          />
          <Select
            label="Priority"
            value={form.priority}
            onChange={(event) => setForm({ ...form, priority: event.target.value })}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
            ]}
          />
          <Input
            label="Assigned date"
            type="date"
            value={form.assignedDate}
            onChange={(event) => setForm({ ...form, assignedDate: event.target.value })}
          />
          <Input
            label="Start date"
            type="date"
            value={form.startDate}
            onChange={(event) => setForm({ ...form, startDate: event.target.value })}
          />
          <Input
            label="Due date"
            type="date"
            value={form.dueDate}
            onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
          />
          <div className="sm:col-span-2">
            <Input
              label="Reference link"
              type="url"
              value={form.referenceLink}
              onChange={(event) => setForm({ ...form, referenceLink: event.target.value })}
              placeholder="https://docs.google.com/spreadsheets/…"
            />
          </div>
          <div className="sm:col-span-2">
            <Textarea
              label="Description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="What needs to be done?"
            />
          </div>
          <div className="sm:col-span-2">
            <Textarea
              label="Internal notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Extra context for the assignee."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Mail,
  Megaphone,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  Segmented,
  Select,
  Skeleton,
  Switch,
  Textarea,
  useToast,
  type BadgeTone,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import {
  useHrAnnouncementHistory,
  useHrAnnouncements,
  useHrDepartments,
  useHrEmployees,
  useInvalidate,
} from '@/lib/queries';
import { formatDhakaDateTime } from '@bronee/shared';
import { cn, relativeTime } from '@/lib/utils';

type TargetType = 'all' | 'department' | 'sub_department' | 'employees';

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  scheduled: 'info',
  published: 'success',
};

const TYPE_LABELS: Record<string, string> = {
  announcement: 'General announcement',
  holiday_notice: 'Holiday notice',
  salary_published: 'Salary published',
  attendance_notice: 'Attendance notice',
  individual_message: 'Individual message',
};

function Picker({
  label,
  hint,
  options,
  selected,
  onToggle,
  emptyLabel,
}: {
  label: string;
  hint?: string;
  options: Array<{ id: string; name: string; meta?: string | null }>;
  selected: string[];
  onToggle: (id: string) => void;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-xl border border-line p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink">{label}</p>
        <span className="text-[11.5px] text-ink-muted">{selected.length} selected</span>
      </div>
      {hint ? <p className="mt-0.5 text-[12px] text-ink-muted">{hint}</p> : null}
      {options.length ? (
        <ul className="mt-2.5 max-h-56 space-y-1 overflow-y-auto pr-1">
          {options.map((option) => (
            <li key={option.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-canvas">
                <input
                  type="checkbox"
                  checked={selected.includes(option.id)}
                  onChange={() => onToggle(option.id)}
                  className="h-4 w-4 shrink-0 rounded border-line accent-brand-600"
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                  {option.name}
                </span>
                {option.meta ? (
                  <span className="shrink-0 text-[11.5px] text-ink-muted">{option.meta}</span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[12.5px] text-ink-muted">{emptyLabel}</p>
      )}
    </div>
  );
}

export default function HrAnnouncementsPage() {
  const toast = useToast();
  const invalidate = useInvalidate();

  const [tab, setTab] = useState<'notices' | 'history'>('notices');
  const [statusFilter, setStatusFilter] = useState('');

  const announcementsQuery = useHrAnnouncements(statusFilter || undefined);
  const historyQuery = useHrAnnouncementHistory();
  const departmentsQuery = useHrDepartments();
  const employeesQuery = useHrEmployees();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('announcement');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [emailNotification, setEmailNotification] = useState(false);
  const [publishMode, setPublishMode] = useState<'now' | 'schedule' | 'draft'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const [messageOpen, setMessageOpen] = useState(false);
  const [messageEmployee, setMessageEmployee] = useState('');
  const [messageTitle, setMessageTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');

  const announcements = announcementsQuery.data?.items ?? [];
  const history = historyQuery.data?.items ?? [];

  const departments = departmentsQuery.data?.items ?? [];
  const employees = employeesQuery.data?.items ?? [];

  const topLevelDepartments = useMemo(
    () => departments.filter((department) => !department.parentId),
    [departments],
  );
  const subDepartments = useMemo(
    () => departments.filter((department) => department.parentId),
    [departments],
  );

  const filteredEmployees = useMemo(() => {
    const needle = employeeSearch.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter(
      (employee) =>
        employee.fullName.toLowerCase().includes(needle) ||
        employee.employeeCode.toLowerCase().includes(needle),
    );
  }, [employees, employeeSearch]);

  useEffect(() => {
    setTargetIds([]);
  }, [targetType]);

  function toggleTarget(id: string) {
    setTargetIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function publishAnnouncement() {
    if (!title.trim() || !body.trim()) {
      toast.error('Notice incomplete', 'A notice needs both a title and a message body.');
      return;
    }
    if (targetType !== 'all' && targetIds.length === 0) {
      toast.error('No audience selected', 'Choose at least one recipient group for this notice.');
      return;
    }
    if (publishMode === 'schedule' && !scheduledFor) {
      toast.error('Pick a publish time', 'Choose when this notice should go live.');
      return;
    }

    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        type,
        targetType,
        targetIds,
        emailNotification,
        publishMode,
      };
      if (publishMode === 'schedule') {
        payload.scheduledFor = new Date(`${scheduledFor}:00+06:00`).toISOString();
      }

      const response = await api.post<{ recipients: number }>('/hr/comms', payload);
      toast.success(
        publishMode === 'now'
          ? 'Notice published'
          : publishMode === 'schedule'
            ? 'Notice scheduled'
            : 'Draft saved',
        `${response.recipients ?? 0} recipient${(response.recipients ?? 0) === 1 ? '' : 's'} notified.`,
      );
      invalidate([['hr', 'announcements']]);
      setTitle('');
      setBody('');
      setTargetIds([]);
      setScheduledFor('');
      setEmailNotification(false);
      setPublishMode('now');
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The notice could not be published.';
      toast.error('Publish failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function sendIndividualMessage() {
    if (!messageEmployee || !messageTitle.trim() || !messageBody.trim()) {
      toast.error(
        'Message incomplete',
        'Pick an employee and write both a title and a message.',
      );
      return;
    }
    setBusy(true);
    try {
      await api.post(`/hr/comms/message/${messageEmployee}`, {
        title: messageTitle.trim(),
        body: messageBody.trim(),
        emailNotification,
      });
      toast.success('Message sent', 'The employee has been notified.');
      invalidate([['hr', 'announcements']]);
      setMessageOpen(false);
      setMessageEmployee('');
      setMessageTitle('');
      setMessageBody('');
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'The message could not be sent.';
      toast.error('Send failed', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Broadcast notices to the workforce and track who has read them."
        action={
          <Button variant="outline" icon={<Mail className="h-4 w-4" />} onClick={() => setMessageOpen(true)}>
            Send individual message
          </Button>
        }
      />

      {/* ------------------------------------------------------------ composer */}
      <Card>
        <CardHeader
          title="Compose a notice"
          subtitle="Published notices appear instantly in every recipient's notification centre."
          icon={<Megaphone className="h-4 w-4" />}
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              <Input
                label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Office closed on 21 December"
              />
              <Textarea
                label="Message"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Write the notice employees should read."
              />
            </div>

            <div className="space-y-3">
              <Select
                label="Notice type"
                value={type}
                onChange={(event) => setType(event.target.value)}
                options={[
                  { value: 'announcement', label: 'General announcement' },
                  { value: 'holiday_notice', label: 'Holiday notice' },
                  { value: 'attendance_notice', label: 'Attendance notice' },
                  { value: 'salary_published', label: 'Salary published' },
                ]}
              />
              <div>
                <span className="field-label">Audience</span>
                <Segmented<TargetType>
                  value={targetType}
                  onChange={setTargetType}
                  size="sm"
                  className="flex-wrap"
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'department', label: 'Dept' },
                    { value: 'sub_department', label: 'Sub-dept' },
                    { value: 'employees', label: 'People' },
                  ]}
                />
              </div>
              {publishMode === 'schedule' ? (
                <Input
                  label="Publish at (Dhaka time)"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                />
              ) : null}
              <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5">
                <span className="text-[12.5px] font-semibold text-ink">Email notification</span>
                <Switch
                  checked={emailNotification}
                  onChange={setEmailNotification}
                  label="Email notification"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  icon={
                    publishMode === 'schedule' ? (
                      <CalendarClock className="h-4 w-4" />
                    ) : publishMode === 'draft' ? (
                      <Bell className="h-4 w-4" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )
                  }
                  loading={busy}
                  onClick={publishAnnouncement}
                >
                  {publishMode === 'schedule'
                    ? 'Schedule publish'
                    : publishMode === 'draft'
                      ? 'Save draft'
                      : 'Publish now'}
                </Button>
                <Button
                  size="sm"
                  variant={publishMode === 'now' ? 'outline' : 'ghost'}
                  onClick={() => setPublishMode('now')}
                >
                  Publish now
                </Button>
                <Button
                  size="sm"
                  variant={publishMode === 'schedule' ? 'outline' : 'ghost'}
                  onClick={() => setPublishMode('schedule')}
                >
                  <CalendarClock className="h-4 w-4" />
                  Schedule
                </Button>
                <Button
                  size="sm"
                  variant={publishMode === 'draft' ? 'outline' : 'ghost'}
                  onClick={() => setPublishMode('draft')}
                >
                  Save draft
                </Button>
              </div>
            </div>
          </div>

          {targetType !== 'all' ? (
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {targetType === 'department' ? (
                <Picker
                  label="Departments"
                  hint="Everyone assigned to the selected departments is notified."
                  options={topLevelDepartments.map((department) => ({
                    id: department.id,
                    name: department.name,
                  }))}
                  selected={targetIds}
                  onToggle={toggleTarget}
                  emptyLabel="No departments available."
                />
              ) : null}

              {targetType === 'sub_department' ? (
                <Picker
                  label="Sub-departments"
                  hint="Pick the sub-teams that should receive this notice."
                  options={subDepartments.map((department) => ({
                    id: department.id,
                    name: department.name,
                    meta: topLevelDepartments.find((parent) => parent.id === department.parentId)?.name ?? null,
                  }))}
                  selected={targetIds}
                  onToggle={toggleTarget}
                  emptyLabel="No sub-departments available."
                />
              ) : null}

              {targetType === 'employees' ? (
                <div className="lg:col-span-2">
                  <Input
                    label="Find employees"
                    placeholder="Search by name or Employee ID"
                    value={employeeSearch}
                    onChange={(event) => setEmployeeSearch(event.target.value)}
                    leading={<Search className="h-4 w-4" />}
                    containerClassName="mb-3"
                  />
                  <Picker
                    label="Selected employees"
                    options={filteredEmployees.map((employee) => ({
                      id: employee.id,
                      name: employee.fullName,
                      meta: employee.employeeCode,
                    }))}
                    selected={targetIds}
                    onToggle={toggleTarget}
                    emptyLabel="No employees match that search."
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* --------------------------------------------------------------- tabs */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented<'notices' | 'history'>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'notices', label: 'Notices' },
            { value: 'history', label: 'Delivery history' },
          ]}
        />
        {tab === 'notices' ? (
          <div className="w-44">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'published', label: 'Published' },
                { value: 'scheduled', label: 'Scheduled' },
                { value: 'draft', label: 'Draft' },
              ]}
            />
          </div>
        ) : null}
      </div>

      {tab === 'notices' ? (
        <div className="mt-4 space-y-3">
          {announcementsQuery.isLoading ? (
            Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24" />)
          ) : announcements.length === 0 ? (
            <Card>
              <EmptyState
                title="No notices yet"
                description="Compose the first notice above to reach the workforce."
                icon={<Bell className="h-5 w-5" />}
              />
            </Card>
          ) : (
            announcements.map((notice) => (
              <Card key={notice.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14.5px] font-bold text-ink">{notice.title}</p>
                      <Badge tone={STATUS_TONE[notice.status] ?? 'neutral'} dot>
                        {notice.status}
                      </Badge>
                      <Badge tone="neutral">{TYPE_LABELS[notice.type] ?? notice.type}</Badge>
                    </div>
                    <p className="mt-1.5 line-clamp-2 max-w-2xl text-[12.5px] leading-relaxed text-ink-soft">
                      {notice.body}
                    </p>
                    <p className="mt-2 text-[11.5px] text-ink-muted">
                      {notice.targetLabel ?? 'All employees'} · by{' '}
                      {notice.createdByName ?? 'HR'} ·{' '}
                      {notice.publishedAt
                        ? formatDhakaDateTime(notice.publishedAt)
                        : notice.scheduledFor
                          ? `scheduled ${formatDhakaDateTime(notice.scheduledFor)}`
                          : `created ${relativeTime(notice.createdAt)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-center">
                      <p className="text-[16px] font-extrabold text-ink">{notice.recipientCount}</p>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                        Recipients
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[16px] font-extrabold text-ink">{notice.readCount}</p>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                        Read
                      </p>
                    </div>
                    {notice.emailNotification ? (
                      <Badge tone="info">
                        <Mail className="h-3 w-3" />
                        Email
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      ) : (
        <Card className="mt-4">
          {historyQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-16" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              title="No delivery history"
              description="Per-recipient read and email status appears here once notices are published."
              icon={<Users className="h-5 w-5" />}
            />
          ) : (
            <div className="space-y-4 p-4">
              {history.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-bold text-ink">{entry.title}</p>
                      <p className="text-[11.5px] text-ink-muted">
                        {entry.targetLabel ?? 'All employees'} ·{' '}
                        {entry.publishedAt
                          ? formatDhakaDateTime(entry.publishedAt)
                          : entry.scheduledFor
                            ? `scheduled ${formatDhakaDateTime(entry.scheduledFor)}`
                            : 'not published'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[entry.status] ?? 'neutral'} dot>
                        {entry.status}
                      </Badge>
                      <Badge tone="neutral">
                        {entry.readCount}/{entry.recipientCount} read
                      </Badge>
                    </div>
                  </div>
                  {entry.recipients.length ? (
                    <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {entry.recipients.map((recipient, index) => (
                        <li
                          key={`${entry.id}-${index}`}
                          className="flex items-center justify-between gap-2 rounded-lg bg-canvas px-2.5 py-1.5"
                        >
                          <span className="min-w-0 truncate text-[12px] font-medium text-ink">
                            {recipient.employeeName}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {recipient.read ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success-deep">
                                <CheckCircle2 className="h-3 w-3" />
                                Read
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-ink-muted">Unread</span>
                            )}
                            <Badge
                              tone={
                                recipient.emailStatus === 'sent'
                                  ? 'success'
                                  : recipient.emailStatus === 'failed'
                                    ? 'danger'
                                    : recipient.emailStatus === 'pending'
                                      ? 'warning'
                                      : 'neutral'
                              }
                            >
                              {recipient.emailStatus.replace('_', ' ')}
                            </Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[12px] text-ink-muted">
                      No recipients recorded for this notice yet.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* -------------------------------------------------- individual message */}
      <Modal
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        title="Send an individual message"
        description="Delivered straight to one employee as a notification."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setMessageOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} icon={<Send className="h-4 w-4" />} onClick={sendIndividualMessage}>
              Send message
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            label="Employee"
            value={messageEmployee}
            onChange={(event) => setMessageEmployee(event.target.value)}
            options={[
              { value: '', label: 'Select an employee' },
              ...employees.map((employee) => ({
                value: employee.id,
                label: `${employee.fullName} · ${employee.employeeCode}`,
              })),
            ]}
          />
          <Input
            label="Title"
            value={messageTitle}
            onChange={(event) => setMessageTitle(event.target.value)}
            placeholder="e.g. Please collect your ID card"
          />
          <Textarea
            label="Message"
            value={messageBody}
            onChange={(event) => setMessageBody(event.target.value)}
            placeholder="What do you need this employee to do?"
          />
          <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5">
            <span className="text-[12.5px] font-semibold text-ink">Email notification</span>
            <Switch
              checked={emailNotification}
              onChange={setEmailNotification}
              label="Email notification"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useMemo, useState } from 'react';
import {
  BellRing,
  CalendarClock,
  Mail,
  Megaphone,
  Pencil,
  Plus,
  Send,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDateTime } from '@/lib/time';
import { formatNumber } from '@/lib/format';
import { publishTone } from '@/lib/status';
import { Alert, Checkbox, Input, Select, Textarea } from '@/components/ui/forms';
import { Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, Tabs } from '@/components/ui/data';
import { Modal, useToast } from '@/components/ui/overlay';
import { ANNOUNCEMENT_TYPES } from '@shared/constants';
import type { Announcement, Employee } from '@shared/types';

type Row<T> = { [K in keyof T]: T[K] };
type AnnouncementRow = Row<Announcement>;

type Audience = 'all' | 'department' | 'sub-department' | 'individual';

interface Draft {
  id?: string;
  type: string;
  audience: Audience;
  audienceLabel: string;
  audienceValue: string;
  title: string;
  body: string;
  attachmentName: string;
  mode: 'now' | 'schedule' | 'draft';
  publishAt: string;
  emailNotification: boolean;
}

export function AnnouncementsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('All');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ employeeId: '', title: '', body: '', email: false });
  const [sending, setSending] = useState(false);

  const { data, loading, error, reload } = useAsync<Announcement[]>(() => api.hrAnnouncements(), []);
  const { data: employees } = useAsync<Employee[]>(() => api.hrEmployees(), []);

  const rows = useMemo(() => {
    const all = (data ?? []) as AnnouncementRow[];
    if (tab === 'All') return all;
    return all.filter((announcement) => announcement.status === tab);
  }, [data, tab]);

  const counts = useMemo(() => {
    const all = data ?? [];
    return {
      published: all.filter((item) => item.status === 'Published').length,
      scheduled: all.filter((item) => item.status === 'Scheduled').length,
      draft: all.filter((item) => item.status === 'Draft').length,
      recipients: all.reduce((sum, item) => sum + item.recipients.length, 0),
    };
  }, [data]);

  const departments = useMemo(
    () => Array.from(new Set((employees ?? []).map((employee) => employee.departmentName))).sort(),
    [employees],
  );

  const subDepartments = useMemo(
    () =>
      Array.from(
        new Set(
          (employees ?? [])
            .map((employee) => employee.subDepartmentName)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [employees],
  );

  function openCreate() {
    setDraft({
      type: 'General HR Announcement',
      audience: 'all',
      audienceLabel: 'All Employees',
      audienceValue: '',
      title: '',
      body: '',
      attachmentName: '',
      mode: 'now',
      publishAt: '',
      emailNotification: false,
    });
  }

  function openEdit(announcement: AnnouncementRow) {
    const audience = (['all', 'department', 'sub-department', 'individual'] as Audience[]).includes(
      announcement.audience as Audience,
    )
      ? (announcement.audience as Audience)
      : 'all';
    setDraft({
      id: announcement.id,
      type: announcement.type,
      audience,
      audienceLabel: announcement.audienceLabel,
      audienceValue:
        audience === 'individual' ? announcement.recipients[0] ?? '' : announcement.audienceLabel,
      title: announcement.title,
      body: announcement.body,
      attachmentName: announcement.attachmentName ?? '',
      mode: announcement.status === 'Draft' ? 'draft' : announcement.status === 'Scheduled' ? 'schedule' : 'now',
      publishAt: announcement.publishAt ? toLocalInput(announcement.publishAt) : '',
      emailNotification: announcement.emailNotification,
    });
  }

  function resolveRecipients(target: Draft): string[] {
    const all = employees ?? [];
    if (target.audience === 'all') return all.map((employee) => employee.id);
    if (target.audience === 'department') {
      return all
        .filter((employee) => employee.departmentName === target.audienceValue)
        .map((employee) => employee.id);
    }
    if (target.audience === 'sub-department') {
      return all
        .filter((employee) => employee.subDepartmentName === target.audienceValue)
        .map((employee) => employee.id);
    }
    return target.audienceValue ? [target.audienceValue] : [];
  }

  function audienceLabelFor(target: Draft): string {
    if (target.audience === 'all') return 'All Employees';
    if (target.audience === 'individual') {
      return employees?.find((employee) => employee.id === target.audienceValue)?.fullName ?? 'Selected Employee';
    }
    return target.audienceValue;
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim() || !draft.body.trim()) {
      toast.error('Title and message body are required');
      return;
    }
    const recipients = resolveRecipients(draft);
    if (recipients.length === 0) {
      toast.error('No recipient matches the selected audience');
      return;
    }
    if (draft.mode === 'schedule' && !draft.publishAt) {
      toast.error('Choose the scheduled publish date and time');
      return;
    }

    setSaving(true);
    try {
      const status = draft.mode === 'now' ? 'Published' : draft.mode === 'schedule' ? 'Scheduled' : 'Draft';
      await api.saveAnnouncement({
        id: draft.id,
        title: draft.title.trim(),
        body: draft.body.trim(),
        type: draft.type as Announcement['type'],
        audience: draft.audience,
        audienceLabel: audienceLabelFor(draft),
        attachmentName: draft.attachmentName.trim() || null,
        status,
        publishAt:
          draft.mode === 'schedule'
            ? new Date(draft.publishAt).toISOString()
            : draft.mode === 'now'
              ? new Date().toISOString()
              : null,
        publishedAt: draft.mode === 'now' ? new Date().toISOString() : null,
        emailNotification: draft.emailNotification,
        recipients,
      });
      toast.success(
        draft.mode === 'now' ? 'Announcement published' : draft.mode === 'schedule' ? 'Announcement scheduled' : 'Draft saved',
        `${recipients.length} recipient(s) · ${audienceLabelFor(draft)}`,
      );
      setDraft(null);
      reload();
    } catch (err) {
      toast.error('Could not save the announcement', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function sendIndividualMessage() {
    if (!message.employeeId) {
      toast.error('Select an employee');
      return;
    }
    if (!message.title.trim() || !message.body.trim()) {
      toast.error('Enter a notice title and message');
      return;
    }
    const employee = employees?.find((item) => item.id === message.employeeId);
    setSending(true);
    try {
      await api.saveAnnouncement({
        type: 'Individual Employee Message',
        audience: 'individual',
        audienceLabel: employee?.fullName ?? 'Selected Employee',
        title: message.title.trim(),
        body: message.body.trim(),
        attachmentName: null,
        status: 'Published',
        publishAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        emailNotification: message.email,
        recipients: [message.employeeId],
      });
      toast.success('Message sent', `${employee?.fullName ?? 'The employee'} has been notified.`);
      setMessage({ employeeId: '', title: '', body: '', email: false });
      reload();
    } catch (err) {
      toast.error('Could not send the message', err instanceof Error ? err.message : undefined);
    } finally {
      setSending(false);
    }
  }

  const columns = [
    {
      key: 'title',
      header: 'Notice',
      render: (announcement: AnnouncementRow) => (
        <div className="min-w-0 max-w-[320px]">
          <p className="truncate text-[13.5px] font-medium text-ink">{announcement.title}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{announcement.type}</p>
        </div>
      ),
    },
    {
      key: 'audienceLabel',
      header: 'Audience',
      render: (announcement: AnnouncementRow) => (
        <Badge tone="info">{announcement.audienceLabel}</Badge>
      ),
    },
    {
      key: 'recipients',
      header: 'Recipients',
      align: 'right' as const,
      render: (announcement: AnnouncementRow) => (
        <span className="text-[13px] text-ink-muted">{announcement.recipients.length}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (announcement: AnnouncementRow) => (
        <Badge tone={publishTone(announcement.status)}>{announcement.status}</Badge>
      ),
    },
    {
      key: 'emailNotification',
      header: 'Email',
      render: (announcement: AnnouncementRow) => (
        <Badge tone={announcement.emailNotification ? 'ok' : 'neutral'}>
          {announcement.emailNotification ? 'Sent' : 'Portal only'}
        </Badge>
      ),
    },
    {
      key: 'publishAt',
      header: 'Publish time',
      render: (announcement: AnnouncementRow) => (
        <span className="text-[13px] text-ink-muted">
          {announcement.publishedAt
            ? formatDateTime(announcement.publishedAt)
            : announcement.publishAt
              ? `Scheduled ${formatDateTime(announcement.publishAt)}`
              : '—'}
        </span>
      ),
    },
    {
      key: 'createdBy',
      header: 'Created by',
      render: (announcement: AnnouncementRow) => (
        <span className="text-[13px] text-ink-muted">{announcement.createdBy}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (announcement: AnnouncementRow) => (
        <button
          type="button"
          className="btn-icon h-8 w-8"
          onClick={() => openEdit(announcement)}
          aria-label={`Edit ${announcement.title}`}
        >
          <Pencil size={15} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Announcements & Notifications"
        subtitle="Publish HR notices, holiday announcements and individual employee messages."
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={openCreate}>
            <Plus size={15} />
            New announcement
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Published notices"
          value={formatNumber(counts.published)}
          tone="ok"
          icon={<Megaphone size={17} />}
        />
        <StatCard
          label="Scheduled notices"
          value={formatNumber(counts.scheduled)}
          tone="info"
          icon={<CalendarClock size={17} />}
        />
        <StatCard label="Drafts" value={formatNumber(counts.draft)} tone="neutral" icon={<BellRing size={17} />} />
        <StatCard
          label="Recipients reached"
          value={formatNumber(counts.recipients)}
          tone="warn"
          icon={<Users size={17} />}
        />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load announcements">
          {error}
        </Alert>
      )}

      <SectionCard title="Announcement history" subtitle="Published, scheduled and draft notices">
        <Tabs
          className="mb-4"
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'All', label: 'All', count: (data ?? []).length },
            { key: 'Published', label: 'Published', count: counts.published },
            { key: 'Scheduled', label: 'Scheduled', count: counts.scheduled },
            { key: 'Draft', label: 'Draft', count: counts.draft },
          ]}
        />
        <DataTable<AnnouncementRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No announcements yet"
          emptyDescription="Publish a notice to inform the whole company or a single employee."
          emptyIcon={<Megaphone size={22} />}
        />
      </SectionCard>

      <SectionCard
        title="Individual employee message"
        subtitle="Send a private notice to one employee with an optional email copy"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Employee"
            value={message.employeeId}
            placeholder="Select an employee"
            options={(employees ?? []).map((employee) => ({
              value: employee.id,
              label: `${employee.fullName} — ${employee.departmentName}`,
            }))}
            onChange={(e) => setMessage({ ...message, employeeId: e.target.value })}
          />
          <Input
            label="Notice title"
            value={message.title}
            onChange={(e) => setMessage({ ...message, title: e.target.value })}
          />
          <Textarea
            label="Message"
            rows={4}
            className="sm:col-span-2"
            value={message.body}
            onChange={(e) => setMessage({ ...message, body: e.target.value })}
          />
          <div className="sm:col-span-2">
            <Checkbox
              checked={message.email}
              onChange={(email) => setMessage({ ...message, email })}
              label="Send the message to the employee's official email address as well"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={sendIndividualMessage}
              disabled={sending}
            >
              <Send size={15} />
              {sending ? 'Sending…' : 'Send message'}
            </button>
          </div>
        </div>
      </SectionCard>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit announcement' : 'New announcement'}
        description="The notice is delivered to the portal notification centre of every recipient."
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : draft?.mode === 'now' ? 'Publish notice' : 'Save'}
            </button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Notice type"
              value={draft.type}
              options={ANNOUNCEMENT_TYPES.map((value) => ({ value, label: value }))}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
            />
            <Select
              label="Target audience"
              value={draft.audience}
              options={[
                { value: 'all', label: 'All Employees' },
                { value: 'department', label: 'Selected Department' },
                { value: 'sub-department', label: 'Selected Sub-department' },
                { value: 'individual', label: 'Selected Employee' },
              ]}
              onChange={(e) =>
                setDraft({ ...draft, audience: e.target.value as Audience, audienceValue: '' })
              }
            />

            {draft.audience === 'department' && (
              <Select
                label="Department"
                value={draft.audienceValue}
                placeholder="Select a department"
                options={departments.map((value) => ({ value, label: value }))}
                onChange={(e) => setDraft({ ...draft, audienceValue: e.target.value })}
              />
            )}
            {draft.audience === 'sub-department' && (
              <Select
                label="Sub-department"
                value={draft.audienceValue}
                placeholder="Select a sub-department"
                options={subDepartments.map((value) => ({ value, label: value }))}
                onChange={(e) => setDraft({ ...draft, audienceValue: e.target.value })}
              />
            )}
            {draft.audience === 'individual' && (
              <Select
                label="Employee"
                value={draft.audienceValue}
                placeholder="Select an employee"
                options={(employees ?? []).map((employee) => ({
                  value: employee.id,
                  label: `${employee.fullName} — ${employee.departmentName}`,
                }))}
                onChange={(e) => setDraft({ ...draft, audienceValue: e.target.value })}
              />
            )}

            <div className="sm:col-span-2">
              <Input
                label="Notice title"
                value={draft.title}
                required
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Textarea
                label="Message body"
                rows={5}
                value={draft.body}
                required
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </div>
            <Input
              label="Attachment name"
              value={draft.attachmentName}
              onChange={(e) => setDraft({ ...draft, attachmentName: e.target.value })}
              hint="Optional — the file itself is stored privately and only its name is shown."
            />
            <Select
              label="Publishing"
              value={draft.mode}
              options={[
                { value: 'now', label: 'Publish now' },
                { value: 'schedule', label: 'Schedule publish' },
                { value: 'draft', label: 'Save as draft' },
              ]}
              onChange={(e) => setDraft({ ...draft, mode: e.target.value as Draft['mode'] })}
            />
            {draft.mode === 'schedule' && (
              <Input
                label="Publish date and time"
                type="datetime-local"
                value={draft.publishAt}
                onChange={(e) => setDraft({ ...draft, publishAt: e.target.value })}
              />
            )}
            <div className="sm:col-span-2">
              <Checkbox
                checked={draft.emailNotification}
                onChange={(emailNotification) => setDraft({ ...draft, emailNotification })}
                label="Send an email copy of this notice to every recipient"
              />
            </div>
            <p className="flex items-center gap-1.5 text-[12px] text-ink-faint sm:col-span-2">
              <Mail size={13} />
              {resolveRecipients(draft).length} recipient(s) match the selected audience.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

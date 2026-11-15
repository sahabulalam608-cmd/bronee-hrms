import { useMemo, useState } from 'react';
import {
  ClipboardList,
  ExternalLink,
  FileUp,
  MessageSquare,
  Send,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDate, daysFromToday } from '@/lib/time';
import { cn } from '@/lib/cn';
import { priorityTone, taskTone } from '@/lib/status';
import { useToast } from '@/components/ui/overlay';
import { Input, Textarea } from '@/components/ui/forms';
import { Badge, EmptyState, MetaRow, PageHeader, SectionCard } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlay';
import { DataTable, type Column } from '@/components/ui/data';
import { Tabs } from '@/components/ui/data';
import type { Task } from '@shared/types';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'Yet to Start', label: 'Yet to Start' },
  { key: 'In Progress', label: 'In Progress' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Complete', label: 'Complete' },
];

export function TasksPage() {
  const toast = useToast();
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState<Task | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [link, setLink] = useState('');
  const [fileName, setFileName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading, reload } = useAsync(() => api.employeeTasks(), []);

  const filtered = useMemo(() => {
    const tasks = data ?? [];
    return tab === 'all' ? tasks : tasks.filter((t) => t.status === tab);
  }, [data, tab]);

  const counts = useMemo(() => {
    const tasks = data ?? [];
    return {
      all: tasks.length,
      'Yet to Start': tasks.filter((t) => t.status === 'Yet to Start').length,
      'In Progress': tasks.filter((t) => t.status === 'In Progress').length,
      Pending: tasks.filter((t) => t.status === 'Pending').length,
      Complete: tasks.filter((t) => t.status === 'Complete').length,
    };
  }, [data]);

  async function submit() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.submitTask(selected.id, {
        submissionLink: link.trim() || undefined,
        fileName: fileName.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast.success('Task submitted', 'Your submission is now with the reviewer.');
      setSubmitOpen(false);
      setLink('');
      setFileName('');
      setNote('');
      setSelected(null);
      reload();
    } catch (err) {
      toast.error('Submission failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Task & Record<string, unknown>>[] = [
    {
      key: 'taskId',
      header: 'Task ID',
      width: '110px',
      render: (row) => <span className="font-mono text-[12px] text-ink-muted">{row.taskId}</span>,
    },
    {
      key: 'name',
      header: 'Task',
      render: (row) => <span className="font-medium text-ink">{row.name}</span>,
    },
    { key: 'departmentName', header: 'Department', render: (row) => row.departmentName },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) => <Badge tone={priorityTone(row.priority)}>{row.priority}</Badge>,
    },
    {
      key: 'dueDate',
      header: 'Due',
      render: (row) => {
        const overdue = row.status !== 'Complete' && daysFromToday(row.dueDate) < 0;
        return (
          <span className={cn('font-medium', overdue ? 'text-bad' : 'text-ink-soft')}>
            {formatDate(row.dueDate)}
            {overdue && <span className="ml-1.5 text-[11px]">overdue</span>}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={taskTone(row.status)}>{row.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Tasks"
        subtitle="Tasks assigned to you by your department"
        actions={
          <Badge tone="brand">
            {counts['In Progress']} in progress · {counts.Pending} pending
          </Badge>
        }
      />

      <Tabs
        tabs={TABS.map((t) => ({ ...t, count: counts[t.key as keyof typeof counts] }))}
        active={tab}
        onChange={setTab}
      />

      {tab !== 'all' && counts[tab as keyof typeof counts] === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ClipboardList size={24} />}
            title={`No ${tab.toLowerCase()} tasks`}
            description="Tasks move between these stages as you submit them for review."
          />
        </div>
      ) : (
        <SectionCard padded={false}>
          <DataTable
            columns={columns}
            rows={filtered as (Task & Record<string, unknown>)[]}
            rowKey={(row) => row.id}
            loading={loading}
            emptyTitle="No tasks assigned"
            emptyDescription="Your assigned tasks will appear here."
            emptyIcon={<ClipboardList size={22} />}
            onRowClick={(row) => setSelected(row)}
          />
        </SectionCard>
      )}

      {/* Task detail */}
      <Modal
        open={Boolean(selected) && !submitOpen}
        onClose={() => setSelected(null)}
        title={selected?.name}
        description={selected ? `${selected.taskId} · ${selected.departmentName}` : undefined}
        size="lg"
        footer={
          selected && selected.status !== 'Complete' ? (
            <>
              <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
              <button type="button" className="btn-primary" onClick={() => setSubmitOpen(true)}>
                <Send size={15} />
                Submit work
              </button>
            </>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
              Close
            </button>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <p className="text-[13.5px] leading-relaxed text-ink-soft">{selected.description}</p>

            <div className="flex flex-wrap gap-2">
              <Badge tone={taskTone(selected.status)}>{selected.status}</Badge>
              <Badge tone={priorityTone(selected.priority)}>{selected.priority} priority</Badge>
            </div>

            <div className="rounded-xl border border-line bg-surface-raised px-4 py-2">
              <MetaRow label="Assigned date" value={formatDate(selected.assignedDate)} />
              <MetaRow label="Start date" value={formatDate(selected.startDate)} />
              <MetaRow label="Due date" value={formatDate(selected.dueDate)} />
              <MetaRow
                label="Reference link"
                value={
                  selected.referenceLink ? (
                    <a
                      href={selected.referenceLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800"
                    >
                      Open <ExternalLink size={12} />
                    </a>
                  ) : (
                    '—'
                  )
                }
              />
              <MetaRow label="Attachment" value={selected.attachmentName ?? '—'} />
            </div>

            {selected.submissions.length > 0 && (
              <div>
                <p className="mb-2 text-[13px] font-semibold text-ink">Submission history</p>
                <ul className="serial-list space-y-2">
                  {selected.submissions.map((submission) => (
                    <li key={submission.id} className="rounded-xl border border-line px-4 py-3">
                      <p className="text-[12.5px] text-ink-faint">
                        {formatDate(submission.submittedAt)}
                        {submission.fileName ? ` · ${submission.fileName}` : ''}
                      </p>
                      {submission.note && (
                        <p className="mt-1 text-[13px] text-ink-soft">{submission.note}</p>
                      )}
                      {submission.reviewerFeedback && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-ok">
                          <MessageSquare size={12} className="mt-0.5" />
                          {submission.reviewerFeedback}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Submit work */}
      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="Submit work"
        description={selected?.name}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setSubmitOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Submitting…' : 'Submit'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Submission Link"
            type="url"
            placeholder="https://docs.google.com/…"
            leading={<ExternalLink size={15} />}
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <Input
            label="File Name"
            placeholder="report.pdf"
            leading={<FileUp size={15} />}
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            hint="Files are stored privately in R2 — only the reference is recorded here."
          />
          <Textarea
            label="Notes"
            rows={3}
            placeholder="Anything the reviewer should know."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Modal>

    </div>
  );
}

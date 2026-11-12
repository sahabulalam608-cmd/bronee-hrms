import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Link2,
  Paperclip,
  Send,
  Timer,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatBanglaDate, dhakaDateKey } from '@bronee/shared';
import { api, ApiError } from '@/lib/api';
import { useMyTasks, useTask } from '@/lib/queries';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Drawer,
  EmptyState,
  Input,
  Segmented,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import { PRIORITY_META, TASK_STATUS_META, cn } from '@/lib/utils';

type Filter = 'all' | 'active' | 'complete';

export default function TasksPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useMyTasks();
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const summary = data?.summary;
  const items = (data?.items ?? []).filter((task) => {
    if (filter === 'complete') return task.status === 'complete';
    if (filter === 'active') return task.status !== 'complete';
    return true;
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.post(`/tasks/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Task updated');
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error) => {
      toast.error('Could not update', error instanceof ApiError ? error.message : 'Please try again.');
    },
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TaskStat label="Yet to start" value={summary?.yetToStart ?? 0} tone="neutral" />
        <TaskStat label="In progress" value={summary?.inProgress ?? 0} tone="brand" />
        <TaskStat label="Awaiting review" value={summary?.pending ?? 0} tone="warning" />
        <TaskStat label="Completed" value={summary?.complete ?? 0} tone="success" />
      </div>

      {summary?.overdue ? (
        <div className="rounded-2xl border border-danger/25 bg-danger-soft px-4 py-3">
          <p className="text-[13px] font-semibold text-danger-deep">
            {summary.overdue} task{summary.overdue === 1 ? ' is' : 's are'} past the due date. Please
            submit the work or update the status.
          </p>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="My tasks"
          subtitle={`${items.length} task${items.length === 1 ? '' : 's'} shown`}
          icon={<ClipboardList className="h-4 w-4" />}
          action={
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'active', label: 'Active' },
                { value: 'complete', label: 'Done' },
              ]}
            />
          }
        />
        <CardBody className="px-0 pb-0 sm:px-0">
          {isLoading ? (
            <div className="space-y-2 px-5 pb-5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-20 w-full" />
              ))}
            </div>
          ) : !items.length ? (
            <EmptyState
              title="No tasks here"
              description="Tasks assigned to you by HR will appear in this list."
              icon={<ClipboardList className="h-5 w-5" />}
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {items.map((task) => {
                const status = TASK_STATUS_META[task.status];
                const priority = PRIORITY_META[task.priority];
                return (
                  <motion.li
                    key={task.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="px-5 py-4"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <button
                        type="button"
                        onClick={() => setOpenId(task.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                            {task.taskCode}
                          </span>
                          <span className={cn('chip', priority?.className)}>{priority?.label}</span>
                          <span className={cn('chip', status?.className)}>{status?.label}</span>
                          {task.overdue ? <Badge tone="danger">Overdue</Badge> : null}
                        </div>
                        <p className="mt-1.5 text-[14px] font-bold text-ink">{task.name}</p>
                        {task.description ? (
                          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
                            {task.description}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-ink-muted">
                          {task.department ? <span>{task.department}</span> : null}
                          {task.dueDate ? (
                            <span className="inline-flex items-center gap-1">
                              <Timer className="h-3 w-3" />
                              Due {formatBanglaDate(task.dueDate)}
                            </span>
                          ) : null}
                          {task.referenceLink ? (
                            <span className="inline-flex items-center gap-1 text-brand-600">
                              <Link2 className="h-3 w-3" />
                              Reference
                            </span>
                          ) : null}
                          {task.submissions.length ? (
                            <span className="inline-flex items-center gap-1">
                              <Paperclip className="h-3 w-3" />
                              {task.submissions.length} submission
                              {task.submissions.length === 1 ? '' : 's'}
                            </span>
                          ) : null}
                        </div>
                      </button>

                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        {task.status === 'yet_to_start' ? (
                          <Button
                            size="xs"
                            variant="soft"
                            onClick={() =>
                              updateStatus.mutate({ id: task.id, status: 'in_progress' })
                            }
                            loading={updateStatus.isPending}
                          >
                            Start
                          </Button>
                        ) : null}
                        {task.status === 'in_progress' ? (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => updateStatus.mutate({ id: task.id, status: 'pending' })}
                            loading={updateStatus.isPending}
                            icon={<Send className="h-3 w-3" />}
                          >
                            Submit
                          </Button>
                        ) : null}
                        {task.status === 'complete' ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-success-deep">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Done
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <TaskDrawer taskId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function TaskStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'brand' | 'warning' | 'success';
}) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-600',
    brand: 'bg-brand-50 text-brand-600',
    warning: 'bg-warning-soft text-warning-deep',
    success: 'bg-success-soft text-success-deep',
  } as const;
  return (
    <div className="card card-lift p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', tones[tone])}>
          <ClipboardList className="h-4 w-4" />
        </span>
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{label}</p>
      </div>
      <p className="mt-3 text-[24px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">
        {value}
      </p>
    </div>
  );
}

/** The task detail drawer with the submission form and reviewer feedback. */
function TaskDrawer({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useTask(taskId);

  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/tasks/${taskId}/submit`, {
        submissionLink: link.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Submission sent', 'HR will review your work.');
      setLink('');
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (caught) => {
      toast.error('Could not submit', caught instanceof ApiError ? caught.message : 'Please try again.');
    },
  });

  const task = data?.task;

  return (
    <Drawer open={Boolean(taskId)} onClose={onClose} title="Task details" width="max-w-xl">
      {isLoading || !task ? (
        <div className="space-y-3">
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-32 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                {task.taskCode}
              </span>
              <span className={cn('chip', PRIORITY_META[task.priority]?.className)}>
                {PRIORITY_META[task.priority]?.label}
              </span>
              <span className={cn('chip', TASK_STATUS_META[task.status]?.className)}>
                {TASK_STATUS_META[task.status]?.label}
              </span>
            </div>
            <h3 className="mt-2 text-[18px] font-bold tracking-[-0.02em] text-ink">{task.name}</h3>
            {task.description ? (
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{task.description}</p>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-canvas/70 p-4">
            <Detail label="Department" value={task.department ?? '—'} />
            <Detail label="Reviewer" value={task.reviewerName ?? '—'} />
            <Detail label="Start date" value={task.startDate ? formatBanglaDate(task.startDate) : '—'} />
            <Detail label="Due date" value={task.dueDate ? formatBanglaDate(task.dueDate) : '—'} />
          </dl>

          {task.referenceLink ? (
            <a
              href={task.referenceLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:text-brand-800"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open the reference link
            </a>
          ) : null}

          {task.notes ? (
            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                Notes from HR
              </p>
              <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">
                {task.notes}
              </p>
            </div>
          ) : null}

          {/* Submission history */}
          {data.submissions.length ? (
            <div>
              <p className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                Submission history
              </p>
              <ul className="space-y-2">
                {data.submissions.map((submission) => (
                  <li key={submission.id} className="rounded-xl border border-line px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          submission.status === 'approved'
                            ? 'success'
                            : submission.status === 'rejected'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {submission.status === 'approved'
                          ? 'Approved'
                          : submission.status === 'rejected'
                            ? 'Rejected'
                            : 'Submitted'}
                      </Badge>
                      <span className="text-[11.5px] text-ink-muted">
                        {formatBanglaDate(submission.createdAt.slice(0, 10))}
                      </span>
                    </div>
                    {submission.submissionLink ? (
                      <a
                        href={submission.submissionLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-600"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open submission
                      </a>
                    ) : null}
                    {submission.notes ? (
                      <p className="mt-1 text-[12.5px] text-ink-soft">{submission.notes}</p>
                    ) : null}
                    {submission.feedback ? (
                      <p className="mt-1.5 rounded-lg bg-brand-50 px-2.5 py-2 text-[12.5px] text-brand-800">
                        Reviewer: {submission.feedback}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Submission form */}
          {task.status !== 'complete' ? (
            <div className="rounded-2xl border border-dashed border-line bg-canvas/50 p-4">
              <p className="text-[13px] font-bold text-ink">Submit your work</p>
              <div className="mt-3 space-y-3">
                <Input
                  label="Submission link"
                  type="url"
                  placeholder="https://drive.google.com/…"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
                <Textarea
                  label="Notes"
                  placeholder="Describe what you completed."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  error={error ?? undefined}
                />
                <Button
                  block
                  onClick={() => {
                    if (!link.trim() && !notes.trim()) {
                      setError('Add a submission link or a note before submitting.');
                      return;
                    }
                    setError(null);
                    submit.mutate();
                  }}
                  loading={submit.isPending}
                  icon={<Send className="h-4 w-4" />}
                >
                  Send for review
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

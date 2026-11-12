import { useState } from 'react';
import { Coins, Plus, Timer, Zap } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dhakaDateKey, formatDhakaDateTime, formatDuration, humanDuration } from '@bronee/shared';
import { api, ApiError } from '@/lib/api';
import { useMyOvertime } from '@/lib/queries';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';

export default function OvertimePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useMyOvertime();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    requestedStart: '',
    requestedEnd: '',
    reason: '',
  });
  const [error, setError] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: () =>
      api.post('/overtime', {
        requestedStart: new Date(form.requestedStart).toISOString(),
        requestedEnd: new Date(form.requestedEnd).toISOString(),
        reason: form.reason.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Overtime requested', 'HR will approve a start and end time.');
      setOpen(false);
      setForm({ requestedStart: '', requestedEnd: '', reason: '' });
      void queryClient.invalidateQueries({ queryKey: ['overtime'] });
    },
    onError: (caught) => {
      toast.error('Could not submit', caught instanceof ApiError ? caught.message : 'Please try again.');
    },
  });

  function submit() {
    setError(null);
    if (!form.requestedStart || !form.requestedEnd) {
      setError('Choose both a start and an end time.');
      return;
    }
    if (new Date(form.requestedEnd) <= new Date(form.requestedStart)) {
      setError('The end time must be after the start time.');
      return;
    }
    request.mutate();
  }

  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Timer className="h-4 w-4" />} label="Pending requests" value={String(summary?.pending ?? 0)} tone="warning" />
        <Stat icon={<Zap className="h-4 w-4" />} label="Active approvals" value={String(summary?.approved ?? 0)} tone="brand" />
        <Stat
          icon={<Coins className="h-4 w-4" />}
          label="Approved hours (month)"
          value={humanDuration((summary?.approvedHoursThisMonth ?? 0) * 3600)}
          tone="success"
        />
        <Stat
          icon={<Timer className="h-4 w-4" />}
          label="Worked overtime (month)"
          value={humanDuration((summary?.actualHoursThisMonth ?? 0) * 3600)}
          tone="neutral"
        />
      </div>

      <Card>
        <CardHeader
          title="Overtime requests"
          subtitle="Only HR-approved overtime is paid"
          icon={<Coins className="h-4 w-4" />}
          action={
            <Button size="sm" onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>
              Request overtime
            </Button>
          }
        />
        <CardBody className="px-0 pb-0 sm:px-0">
          {isLoading ? (
            <div className="space-y-2 px-5 pb-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-16 w-full" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <EmptyState
              title="No overtime requests"
              description="Submit a request and HR will approve the exact start and end time."
              icon={<Coins className="h-5 w-5" />}
              action={
                <Button size="sm" onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>
                  Request overtime
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {data.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Timer className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13.5px] font-bold text-ink">
                        {item.approvedHours != null
                          ? `${item.approvedHours}h approved`
                          : `${item.requestedHours}h requested`}
                      </p>
                      <OvertimeBadge status={item.status} />
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-ink-muted">
                      {item.approvedStart
                        ? `${formatDhakaDateTime(item.approvedStart)} → ${formatDhakaDateTime(item.approvedEnd)}`
                        : `${formatDhakaDateTime(item.requestedStart)} → ${formatDhakaDateTime(item.requestedEnd)}`}
                    </p>
                    {item.actualHours != null ? (
                      <p className="mt-1 text-[12px] font-medium text-success-deep">
                        Worked {formatDuration(item.actualHours * 3600)}
                      </p>
                    ) : null}
                    {item.reviewNote ? (
                      <p className="mt-1 text-[12px] italic text-ink-muted">HR: {item.reviewNote}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Request overtime"
        description="HR sets the final approved start and end time."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={request.isPending}>
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Start time"
            type="datetime-local"
            value={form.requestedStart}
            min={`${dhakaDateKey(new Date())}T00:00`}
            onChange={(e) => setForm((f) => ({ ...f, requestedStart: e.target.value }))}
            error={error ?? undefined}
            required
          />
          <Input
            label="End time"
            type="datetime-local"
            value={form.requestedEnd}
            min={form.requestedStart || `${dhakaDateKey(new Date())}T00:00`}
            onChange={(e) => setForm((f) => ({ ...f, requestedEnd: e.target.value }))}
            required
          />
          <Textarea
            label="Reason (optional)"
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Briefly explain why the extra hours were needed."
          />
        </div>
      </Modal>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'brand' | 'warning' | 'success' | 'neutral';
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    warning: 'bg-warning-soft text-warning-deep',
    success: 'bg-success-soft text-success-deep',
    neutral: 'bg-slate-100 text-slate-600',
  } as const;
  return (
    <div className="card card-lift p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className={cn2('flex h-8 w-8 items-center justify-center rounded-xl', tones[tone])}>{icon}</span>
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{label}</p>
      </div>
      <p className="mt-3 text-[22px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">
        {value}
      </p>
    </div>
  );
}

function cn2(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function OvertimeBadge({ status }: { status: string }) {
  if (status === 'approved') return <Badge tone="brand">Approved</Badge>;
  if (status === 'declined') return <Badge tone="danger">Declined</Badge>;
  if (status === 'completed') return <Badge tone="success">Completed</Badge>;
  if (status === 'cancelled') return <Badge tone="neutral">Cancelled</Badge>;
  return <Badge tone="warning">Pending</Badge>;
}

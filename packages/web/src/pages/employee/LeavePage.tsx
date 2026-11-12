import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, CalendarClock, CalendarDays, Plus, XCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addDays, daysInclusive, formatBanglaDate, dhakaDateKey } from '@bronee/shared';
import { api, ApiError } from '@/lib/api';
import { useMyLeave, useOffDays } from '@/lib/queries';
import {
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
  Textarea,
  useToast,
} from '@/components/ui';
import { cn } from '@/lib/utils';

const LEAVE_TYPES = [
  { value: 'casual', label: 'Casual Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'earned', label: 'Earned Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
];

export default function LeavePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useMyLeave();
  const { data: offDays } = useOffDays();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    leaveType: 'casual',
    fromDate: dhakaDateKey(new Date()),
    toDate: dhakaDateKey(new Date()),
    reason: '',
    isRosterChange: false,
    currentOffDate: '',
    requestedOffDate: '',
    note: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalDays = useMemo(
    () => daysInclusive(form.fromDate || form.toDate, form.toDate || form.fromDate),
    [form.fromDate, form.toDate],
  );

  const applyLeave = useMutation({
    mutationFn: () =>
      api.post('/leave', {
        leaveType: form.leaveType,
        fromDate: form.fromDate,
        toDate: form.toDate,
        reason: form.reason.trim(),
        isRosterChange: form.isRosterChange,
        rosterChange: form.isRosterChange
          ? {
              rosterId: 'roster',
              currentOffDate: form.currentOffDate,
              requestedOffDate: form.requestedOffDate,
              note: form.note.trim() || undefined,
            }
          : null,
      }),
    onSuccess: () => {
      toast.success('Application submitted', 'HR will review your leave request.');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      toast.error('Could not submit', error instanceof ApiError ? error.message : 'Please try again.');
    },
  });

  const cancelLeave = useMutation({
    mutationFn: (id: string) => api.post(`/leave/${id}/cancel`),
    onSuccess: () => {
      toast.success('Application cancelled');
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      toast.error('Could not cancel', error instanceof ApiError ? error.message : 'Please try again.');
    },
  });

  function submit() {
    const next: Record<string, string> = {};
    if (form.reason.trim().length < 3) next.reason = 'Please give a short reason.';
    if (!form.fromDate) next.fromDate = 'Select a start date.';
    if (!form.toDate) next.toDate = 'Select an end date.';
    if (form.fromDate && form.toDate && form.toDate < form.fromDate) {
      next.toDate = 'The end date cannot be earlier than the start date.';
    }
    if (form.isRosterChange) {
      if (!form.currentOffDate) next.currentOffDate = 'Select the off day you want to move.';
      if (!form.requestedOffDate) next.requestedOffDate = 'Select the new off date.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    applyLeave.mutate();
  }

  const balances = data?.balances ?? [];

  return (
    <div className="space-y-5">
      {/* Balances */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? [0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)
          : balances.map((balance) => {
              const label =
                LEAVE_TYPES.find((t) => t.value === balance.leaveType)?.label ?? balance.leaveType;
              const pct = balance.entitled > 0 ? (balance.remaining / balance.entitled) * 100 : 0;
              return (
                <div key={balance.leaveType} className="card card-lift p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                      {label}
                    </p>
                    <Briefcase className="h-4 w-4 text-ink-faint" />
                  </div>
                  <p className="mt-2.5 text-[26px] font-extrabold leading-none tracking-[-0.035em] text-ink tabular-nums">
                    {balance.remaining}
                    <span className="ml-1 text-[13px] font-semibold text-ink-muted">/ {balance.entitled}</span>
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                    <motion.div
                      className={cn('h-full rounded-full', pct > 50 ? 'bg-success' : pct > 20 ? 'bg-warning' : 'bg-danger')}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-ink-muted">{balance.used} used this year</p>
                </div>
              );
            })}
      </div>

      <Card>
        <CardHeader
          title="Leave applications"
          subtitle={`${data?.pending.length ?? 0} pending · ${data?.approved.length ?? 0} approved`}
          icon={<CalendarDays className="h-4 w-4" />}
          action={
            <Button size="sm" onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>
              Apply for leave
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
              title="No leave applications"
              description="Apply for leave and track every request here."
              icon={<CalendarDays className="h-5 w-5" />}
              action={
                <Button size="sm" onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>
                  Apply for leave
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {data.items.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    {request.isRosterChange ? (
                      <CalendarClock className="h-4.5 w-4.5" />
                    ) : (
                      <Briefcase className="h-4.5 w-4.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13.5px] font-bold text-ink">
                        {LEAVE_TYPES.find((t) => t.value === request.leaveType)?.label ?? request.leaveType}
                      </p>
                      <StatusBadge status={request.status} />
                      {request.isRosterChange ? <Badge tone="brand">Roster change</Badge> : null}
                      {request.rosterUpdateStatus === 'manual_required' ? (
                        <Badge tone="warning">Manual roster update required</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-ink-muted">
                      {formatBanglaDate(request.fromDate)} – {formatBanglaDate(request.toDate)} ·{' '}
                      {request.totalDays} day{request.totalDays === 1 ? '' : 's'}
                    </p>
                    <p className="mt-1 line-clamp-1 text-[12.5px] text-ink-soft">{request.reason}</p>
                    {request.reviewNote ? (
                      <p className="mt-1 text-[12px] italic text-ink-muted">HR: {request.reviewNote}</p>
                    ) : null}
                  </div>
                  {request.status === 'pending' ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => cancelLeave.mutate(request.id)}
                      loading={cancelLeave.isPending}
                      icon={<XCircle className="h-3.5 w-3.5" />}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Apply modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Apply for leave"
        description="Your request goes to HR for review."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={applyLeave.isPending}>
              Submit application
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Leave Type"
            value={form.leaveType}
            onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))}
            options={LEAVE_TYPES}
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="From Date"
              type="date"
              value={form.fromDate}
              min={dhakaDateKey(new Date())}
              onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))}
              error={errors.fromDate}
              required
            />
            <Input
              label="To Date"
              type="date"
              value={form.toDate}
              min={form.fromDate}
              onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))}
              error={errors.toDate}
              required
            />
          </div>

          <p className="text-[12.5px] font-medium text-ink-soft">
            Total duration: <span className="font-bold text-ink">{totalDays} day{totalDays === 1 ? '' : 's'}</span>
          </p>

          <Textarea
            label="Reason"
            placeholder="Briefly explain your leave."
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            error={errors.reason}
            required
          />

          <div className="rounded-2xl border border-dashed border-line bg-canvas/60 p-4">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={form.isRosterChange}
                onChange={(e) => setForm((f) => ({ ...f, isRosterChange: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-line accent-brand-600"
              />
              <span>
                <span className="block text-[13.5px] font-semibold text-ink">
                  Request a roster off-day change
                </span>
                <span className="block text-[12.5px] text-ink-muted">
                  Use this when you want to swap one of your published off days for another date.
                </span>
              </span>
            </label>

            {form.isRosterChange ? (
              <div className="mt-4 space-y-4">
                <Select
                  label="Current Off Date"
                  placeholder="Select your published off day"
                  value={form.currentOffDate}
                  onChange={(e) => setForm((f) => ({ ...f, currentOffDate: e.target.value }))}
                  error={errors.currentOffDate}
                  options={(offDays?.items ?? []).map((o) => ({
                    value: o.date,
                    label: formatBanglaDate(o.date, { withDay: true }),
                  }))}
                />
                <Input
                  label="New Off Date"
                  type="date"
                  value={form.requestedOffDate}
                  min={addDays(form.currentOffDate || dhakaDateKey(new Date()), 1)}
                  onChange={(e) => setForm((f) => ({ ...f, requestedOffDate: e.target.value }))}
                  error={errors.requestedOffDate}
                />
                <Textarea
                  label="Note (optional)"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="Anything HR should know about the swap."
                />
              </div>
            ) : null}
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') return <Badge tone="success">Approved</Badge>;
  if (status === 'declined') return <Badge tone="danger">Declined</Badge>;
  if (status === 'cancelled') return <Badge tone="neutral">Cancelled</Badge>;
  return <Badge tone="warning">Pending</Badge>;
}

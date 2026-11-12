import { useMemo, useState } from 'react';
import {
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Info,
  Repeat,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Segmented,
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
import { useHrLeave, useInvalidate } from '@/lib/queries';
import { formatBanglaDate } from '@bronee/shared';
import { cn, relativeTime } from '@/lib/utils';

type LeaveItem = NonNullable<ReturnType<typeof useHrLeave>['data']>['items'][number];

const LEAVE_TYPE_LABELS: Record<string, string> = {
  casual: 'Casual leave',
  sick: 'Sick leave',
  earned: 'Earned leave',
  unpaid: 'Unpaid leave',
};

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  declined: 'danger',
  cancelled: 'neutral',
};

export default function HrLeavePage() {
  const toast = useToast();
  const invalidate = useInvalidate();

  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const pendingQuery = useHrLeave('pending');
  const historyQuery = useHrLeave();

  const [selected, setSelected] = useState<LeaveItem | null>(null);
  const [note, setNote] = useState('');
  const [rosterUpdateMode, setRosterUpdateMode] = useState<'auto' | 'manual'>('auto');
  const [busy, setBusy] = useState<'approve' | 'decline' | 'complete' | null>(null);

  const pending = pendingQuery.data?.items ?? [];
  const history = historyQuery.data?.items ?? [];
  const rows = tab === 'pending' ? pending : history;

  const pendingRosterUpdates = useMemo(
    () => pending.filter((item) => item.rosterUpdateStatus === 'manual_required'),
    [pending],
  );

  async function review(decision: 'approve' | 'decline') {
    if (!selected) return;
    setBusy(decision);
    try {
      const body: Record<string, unknown> = {
        decision,
        note: note.trim() || undefined,
      };
      if (decision === 'approve' && selected.isRosterChange) {
        body.rosterUpdateMode = rosterUpdateMode;
      }
      await api.post(`/hr/requests/leave/${selected.id}/review`, body);
      toast.success(
        decision === 'approve' ? 'Leave approved' : 'Leave declined',
        decision === 'approve'
          ? `${selected.employeeName}'s ${selected.totalDays}-day request was approved.${
              selected.isRosterChange && rosterUpdateMode === 'auto'
                ? ' The roster was updated automatically.'
                : ''
            }`
          : `${selected.employeeName}'s request was declined.`,
      );
      invalidate([['hr', 'leave'], ['hr', 'dashboard'], ['hr', 'roster']]);
      setSelected(null);
      setNote('');
      setRosterUpdateMode('auto');
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The leave request could not be reviewed.';
      toast.error('Review failed', message);
    } finally {
      setBusy(null);
    }
  }

  async function completeRosterUpdate(item: LeaveItem) {
    setBusy('complete');
    try {
      await api.post(`/hr/requests/leave/${item.id}/complete-roster-update`);
      toast.success(
        'Roster updated',
        `The roster swap for ${item.employeeName} has been applied.`,
      );
      invalidate([['hr', 'leave'], ['hr', 'roster']]);
      setSelected(null);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The roster update could not be completed.';
      toast.error('Roster update failed', message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Leave Management"
        description="Approve or decline leave requests, including swaps that move an employee's off day."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-soft ring-1 ring-line">
            <ClipboardList className="h-4 w-4 text-brand-600" />
            {pending.length} pending
          </span>
        }
      />

      <div className="mb-4">
        <Segmented<'pending' | 'history'>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pending', label: 'Pending requests' },
            { value: 'history', label: 'All requests' },
          ]}
        />
      </div>

      <Card>
        {(tab === 'pending' ? pendingQuery.isLoading : historyQuery.isLoading) ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-14" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={tab === 'pending' ? 'No leave requests waiting' : 'No leave requests recorded'}
            description={
              tab === 'pending'
                ? 'Every submitted request has been reviewed. New applications arrive here instantly.'
                : 'Approved and declined leave requests will be listed here.'
            }
            icon={<CalendarRange className="h-5 w-5" />}
          />
        ) : (
          <Table>
            <THead>
              <TH>Employee</TH>
              <TH>Type</TH>
              <TH>Dates</TH>
              <TH align="right">Days</TH>
              <TH>Reason</TH>
              <TH>Status</TH>
            </THead>
            <TBody>
              {rows.map((item) => (
                <TR key={item.id} onClick={() => setSelected(item)}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={item.employeeName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{item.employeeName}</p>
                        <p className="text-[11.5px] text-ink-muted">{item.employeeCode}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <span className="whitespace-nowrap">
                      {LEAVE_TYPE_LABELS[item.leaveType] ?? item.leaveType}
                    </span>
                  </TD>
                  <TD>
                    <span className="whitespace-nowrap">
                      {formatBanglaDate(item.fromDate)} – {formatBanglaDate(item.toDate)}
                    </span>
                  </TD>
                  <TD align="right">{item.totalDays}</TD>
                  <TD>
                    <span className="line-clamp-2 max-w-[240px] text-[12.5px]">
                      {item.reason}
                    </span>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={STATUS_TONE[item.status] ?? 'neutral'} dot>
                        {item.status}
                      </Badge>
                      {item.isRosterChange ? (
                        <Badge tone="brand">
                          <Repeat className="h-3 w-3" />
                          Roster change
                        </Badge>
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {pendingRosterUpdates.length ? (
        <Card className="mt-4 border-warning/40 bg-warning-soft/30 p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning-deep" />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-bold text-warning-deep">
                {pendingRosterUpdates.length} roster swap
                {pendingRosterUpdates.length === 1 ? '' : 's'} awaiting a manual update
              </p>
              <ul className="mt-2 space-y-1.5">
                {pendingRosterUpdates.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-soft"
                  >
                    <span>
                      {item.employeeName} · {formatBanglaDate(item.fromDate)} –{' '}
                      {formatBanglaDate(item.toDate)}
                    </span>
                    <Button
                      size="xs"
                      variant="outline"
                      loading={busy === 'complete'}
                      onClick={() => completeRosterUpdate(item)}
                    >
                      Complete roster update
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Leave · ${selected.employeeName}` : 'Leave request'}
        width="max-w-lg"
      >
        {selected ? (
          <div className="space-y-5">
            <div className="rounded-2xl bg-canvas p-4">
              <div className="flex items-center gap-3">
                <Avatar name={selected.employeeName} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-bold text-ink">{selected.employeeName}</p>
                  <p className="truncate text-[12px] text-ink-muted">{selected.employeeCode}</p>
                </div>
              </div>
              <dl className="mt-4 space-y-2 text-[12.5px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-muted">Leave type</dt>
                  <dd className="font-semibold text-ink">
                    {LEAVE_TYPE_LABELS[selected.leaveType] ?? selected.leaveType}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-muted">Dates</dt>
                  <dd className="text-right font-semibold text-ink">
                    {formatBanglaDate(selected.fromDate)} – {formatBanglaDate(selected.toDate)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-muted">Days</dt>
                  <dd className="font-semibold text-ink">{selected.totalDays}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-muted">Applied</dt>
                  <dd className="font-semibold text-ink">{relativeTime(selected.createdAt)}</dd>
                </div>
              </dl>
              <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-soft">
                {selected.reason}
              </p>
            </div>

            {selected.isRosterChange ? (
              <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
                <p className="text-[13px] font-bold text-brand-800">Roster change requested</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                  Approving moves the off day to {formatBanglaDate(selected.toDate)}. Choose how the
                  roster should be updated.
                </p>
                <div className="mt-3 space-y-2">
                  {(
                    [
                      {
                        value: 'auto' as const,
                        label: 'Auto update roster',
                        hint: 'The swap is applied the moment you approve.',
                      },
                      {
                        value: 'manual' as const,
                        label: 'Manual update roster',
                        hint: 'HR applies the swap from the roster builder afterwards.',
                      },
                    ] as const
                  ).map((option) => (
                    <label
                      key={option.value}
                      className={cn(
                        'flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors',
                        rosterUpdateMode === option.value
                          ? 'border-brand-300 bg-white'
                          : 'border-line bg-white/60 hover:border-brand-200',
                      )}
                    >
                      <input
                        type="radio"
                        name="rosterUpdateMode"
                        value={option.value}
                        checked={rosterUpdateMode === option.value}
                        onChange={() => setRosterUpdateMode(option.value)}
                        className="mt-1 h-3.5 w-3.5 accent-brand-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-ink">
                          {option.label}
                        </span>
                        <span className="block text-[12px] text-ink-muted">{option.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <Textarea
              label="Note to employee"
              placeholder="Optional — shared with the employee and stored on the request."
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />

            {selected.reviewNote ? (
              <p className="rounded-xl bg-canvas px-3.5 py-3 text-[12.5px] text-ink-soft">
                Previous review note: {selected.reviewNote}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
              <Button
                variant="danger"
                size="sm"
                icon={<XCircle className="h-4 w-4" />}
                loading={busy === 'decline'}
                disabled={busy !== null}
                onClick={() => review('decline')}
              >
                Decline
              </Button>
              <Button
                size="sm"
                icon={<CheckCircle2 className="h-4 w-4" />}
                loading={busy === 'approve'}
                disabled={busy !== null}
                onClick={() => review('approve')}
              >
                Approve leave
              </Button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

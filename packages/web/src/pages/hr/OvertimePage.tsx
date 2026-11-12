import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Coins,
  Moon,
  Timer,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Input,
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
import { useHrOvertime, useInvalidate } from '@/lib/queries';
import { formatDhakaDateTime, toDhaka } from '@bronee/shared';
import { relativeTime } from '@/lib/utils';

type OvertimeItem = NonNullable<ReturnType<typeof useHrOvertime>['data']>['items'][number];

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  declined: 'danger',
  completed: 'info',
  cancelled: 'neutral',
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `YYYY-MM-DDTHH:mm` in Dhaka wall-clock time, for `datetime-local` inputs. */
function toDhakaInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const shifted = toDhaka(new Date(iso));
  if (Number.isNaN(shifted.getTime())) return '';
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** Dhaka wall-clock `datetime-local` value -> ISO instant. */
function fromDhakaInput(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}:00+06:00`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export default function HrOvertimePage() {
  const toast = useToast();
  const invalidate = useInvalidate();

  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const pendingQuery = useHrOvertime('pending');
  const historyQuery = useHrOvertime();

  const [selected, setSelected] = useState<OvertimeItem | null>(null);
  const [approvedStart, setApprovedStart] = useState('');
  const [approvedEnd, setApprovedEnd] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);

  const pending = pendingQuery.data?.items ?? [];
  const history = historyQuery.data?.items ?? [];
  const rows = tab === 'pending' ? pending : history;

  useEffect(() => {
    if (!selected) return;
    setApprovedStart(toDhakaInput(selected.requestedStart));
    setApprovedEnd(toDhakaInput(selected.requestedEnd));
    setNote('');
  }, [selected]);

  const approvedHours = useMemo(() => {
    const start = fromDhakaInput(approvedStart);
    const end = fromDhakaInput(approvedEnd);
    if (!start || !end) return 0;
    const diff = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
    return diff > 0 ? Math.round(diff * 100) / 100 : 0;
  }, [approvedStart, approvedEnd]);

  async function review(decision: 'approve' | 'decline') {
    if (!selected) return;
    if (decision === 'approve') {
      const start = fromDhakaInput(approvedStart);
      const end = fromDhakaInput(approvedEnd);
      if (!start || !end) {
        toast.error(
          'Approved time missing',
          'An approved overtime request needs both a start and an end time.',
        );
        return;
      }
    }

    setBusy(decision);
    try {
      const body: Record<string, unknown> = {
        decision,
        note: note.trim() || undefined,
      };
      if (decision === 'approve') {
        body.approvedStart = fromDhakaInput(approvedStart);
        body.approvedEnd = fromDhakaInput(approvedEnd);
      }
      await api.post(`/hr/requests/overtime/${selected.id}/review`, body);
      toast.success(
        decision === 'approve' ? 'Overtime approved' : 'Overtime declined',
        decision === 'approve'
          ? `${selected.employeeName}'s overtime was approved for ${approvedHours}h.`
          : `${selected.employeeName}'s overtime request was declined.`,
      );
      invalidate([['hr', 'overtime'], ['hr', 'dashboard']]);
      setSelected(null);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The overtime request could not be reviewed.';
      toast.error('Review failed', message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Overtime Management"
        description="Review overtime requests and set the exact approved window that payroll will pay for."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-soft ring-1 ring-line">
            <Coins className="h-4 w-4 text-brand-600" />
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
            title={tab === 'pending' ? 'No overtime waiting' : 'No overtime recorded'}
            description={
              tab === 'pending'
                ? 'Every overtime request has been decided. New requests arrive here instantly.'
                : 'Approved and declined overtime requests will be listed here.'
            }
            icon={<Moon className="h-5 w-5" />}
          />
        ) : (
          <Table>
            <THead>
              <TH>Employee</TH>
              <TH>Requested window</TH>
              <TH align="right">Hours</TH>
              <TH>Approved window</TH>
              <TH align="right">Actual</TH>
              <TH>Status</TH>
            </THead>
            <TBody>
              {rows.map((item) => (
                <TR key={item.id} onClick={() => setSelected(item)}>
                  <TD>
                    <p className="font-semibold text-ink">{item.employeeName}</p>
                    <p className="text-[11.5px] text-ink-muted">
                      Applied {relativeTime(item.createdAt)}
                    </p>
                  </TD>
                  <TD>
                    <span className="whitespace-nowrap">
                      {item.requestedStart ? formatDhakaDateTime(item.requestedStart) : '—'} →{' '}
                      {item.requestedEnd ? formatDhakaDateTime(item.requestedEnd) : '—'}
                    </span>
                  </TD>
                  <TD align="right">{item.requestedHours}h</TD>
                  <TD>
                    <span className="whitespace-nowrap">
                      {item.approvedStart ? formatDhakaDateTime(item.approvedStart) : '—'} →{' '}
                      {item.approvedEnd ? formatDhakaDateTime(item.approvedEnd) : '—'}
                    </span>
                  </TD>
                  <TD align="right">{item.actualHours != null ? `${item.actualHours}h` : '—'}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[item.status] ?? 'neutral'} dot>
                      {item.status}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Overtime · ${selected.employeeName}` : 'Overtime request'}
        width="max-w-lg"
      >
        {selected ? (
          <div className="space-y-5">
            <div className="rounded-2xl bg-canvas p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-muted">
                Requested
              </p>
              <div className="mt-2 space-y-1.5 text-[12.5px] text-ink-soft">
                <p className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-ink-muted" />
                  {selected.requestedStart
                    ? formatDhakaDateTime(selected.requestedStart)
                    : 'No start time'}
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-ink-muted" />
                  {selected.requestedEnd ? formatDhakaDateTime(selected.requestedEnd) : 'No end time'}
                </p>
                <p className="flex items-center gap-2">
                  <Timer className="h-3.5 w-3.5 text-ink-muted" />
                  {selected.requestedHours} hour(s) requested
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                Approved window
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Approved start"
                  type="datetime-local"
                  value={approvedStart}
                  onChange={(event) => setApprovedStart(event.target.value)}
                />
                <Input
                  label="Approved end"
                  type="datetime-local"
                  value={approvedEnd}
                  onChange={(event) => setApprovedEnd(event.target.value)}
                />
              </div>
              <p className="mt-2 text-[12px] text-ink-muted">
                Times are entered and shown in Asia/Dhaka. Approved overtime currently equals{' '}
                <span className="font-semibold text-ink">{approvedHours}h</span>.
              </p>
            </div>

            <Textarea
              label="Note to employee"
              placeholder="Optional — included with the approval notification."
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
                Approve overtime
              </Button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

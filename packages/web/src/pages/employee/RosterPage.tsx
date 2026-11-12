import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  History,
  Users,
} from 'lucide-react';
import {
  addDays,
  dhakaDateKey,
  formatBanglaDate,
  shortBanglaDay,
} from '@bronee/shared';
import { useCurrentRoster, useMyRoster, useRosterHistory, useTeamRoster } from '@/lib/queries';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Segmented,
  Skeleton,
} from '@/components/ui';
import { cn, shiftColor } from '@/lib/utils';

export default function RosterPage() {
  const today = dhakaDateKey(new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [selected, setSelected] = useState(today);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const { data, isLoading } = useMyRoster(weekStart, addDays(weekStart, 6));
  const { data: team, isLoading: teamLoading } = useTeamRoster(selected);
  const { data: current } = useCurrentRoster();
  const { data: history } = useRosterHistory();

  const byDate = useMemo(() => {
    const map = new Map<string, (typeof data extends undefined ? never : NonNullable<typeof data>)['items'][number]>();
    for (const cell of data?.items ?? []) map.set(cell.date, cell);
    return map;
  }, [data]);

  return (
    <div className="space-y-5">
      {/* Current shift */}
      <Card className="overflow-hidden">
        <div className="relative p-5 sm:p-6">
          <div
            className={cn(
              'pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl',
              current?.isOff ? 'bg-slate-100' : 'bg-brand-100/70',
            )}
          />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                Your shift today
              </p>
              {current?.isOff ? (
                <h2 className="mt-1 text-[24px] font-extrabold tracking-[-0.03em] text-ink">Off day</h2>
              ) : current?.shift ? (
                <>
                  <h2 className="mt-1 text-[24px] font-extrabold tracking-[-0.03em] text-ink">
                    {current.shift.name}
                  </h2>
                  <p className="mt-1 text-[13.5px] text-ink-muted">
                    {current.shift.startTime} – {current.shift.endTime}
                    {current.shift.endsNextDay ? ' (next day)' : ''} · {current.shift.locationPolicy === 'split' ? 'Office + Home' : current.shift.locationPolicy === 'wfh' ? 'Work from home' : 'Office'}
                  </p>
                </>
              ) : (
                <h2 className="mt-1 text-[20px] font-bold text-ink">No shift published yet</h2>
              )}
            </div>
            {current?.rosterName ? (
              <div className="text-right">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                  Roster period
                </p>
                <p className="mt-1 text-[13px] font-semibold text-ink">{current.rosterName}</p>
                <p className="text-[12px] text-ink-muted">
                  {current.rosterStart ? formatBanglaDate(current.rosterStart) : ''} –{' '}
                  {current.rosterEnd ? formatBanglaDate(current.rosterEnd) : ''}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Week strip */}
      <Card>
        <CardHeader
          title="Weekly roster"
          subtitle={`${formatBanglaDate(weekStart)} – ${formatBanglaDate(addDays(weekStart, 6))}`}
          icon={<CalendarDays className="h-4 w-4" />}
          action={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setWeekStart((w) => addDays(w, -7))}
                aria-label="Previous week"
                className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setWeekStart(startOfWeek(today));
                  setSelected(today);
                }}
                className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-brand-600 transition-colors hover:bg-brand-50"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setWeekStart((w) => addDays(w, 7))}
                aria-label="Next week"
                className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          }
        />
        <CardBody>
          {isLoading ? (
            <div className="grid gap-2.5 sm:grid-cols-7">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="skeleton h-24 rounded-xl" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <EmptyState
              title="No published roster for this week"
              description="Your roster appears here once HR publishes it. You will be notified if anything changes."
              icon={<CalendarDays className="h-5 w-5" />}
            />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
              {weekDays.map((date) => {
                const cell = byDate.get(date);
                const colors = shiftColor(cell?.shiftCode);
                const isToday = date === today;
                const isSelected = date === selected;
                return (
                  <motion.button
                    key={date}
                    type="button"
                    onClick={() => setSelected(date)}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      'relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-200',
                      isSelected
                        ? 'border-brand-300 bg-brand-50 shadow-sm'
                        : 'border-line bg-white hover:border-brand-200 hover:bg-brand-50/40',
                      isToday && !isSelected && 'border-brand-200',
                    )}
                  >
                    {isToday ? (
                      <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand-500" />
                    ) : null}
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                      {shortBanglaDay(date)}
                    </p>
                    <p className="mt-0.5 text-[12.5px] font-semibold text-ink">
                      {formatBanglaDate(date, { withYear: false }).split(' ')[0]}
                    </p>
                    <div className="mt-2.5">
                      {cell?.isOff ? (
                        <span className="chip bg-slate-100 text-slate-600">Off</span>
                      ) : cell ? (
                        <span className={cn('chip ring-1', colors.bg, colors.text, colors.ring)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', colors.dot)} />
                          {cell.shiftShortName ?? cell.shiftName}
                        </span>
                      ) : (
                        <span className="chip bg-line text-ink-muted">Not scheduled</span>
                      )}
                    </div>
                    {cell?.shiftName && !cell.isOff ? (
                      <p className="mt-1.5 text-[11px] tabular-nums text-ink-muted">
                        {cell.shiftCode === 'SS' ? '09:20–01:00' : ''}
                      </p>
                    ) : null}
                  </motion.button>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Team + history */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Team on this day"
            subtitle={formatBanglaDate(selected, { withDay: true })}
            icon={<Users className="h-4 w-4" />}
          />
          <CardBody>
            {teamLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-11 w-full" />
                ))}
              </div>
            ) : !team?.items.length ? (
              <EmptyState
                title="No roster published for this day"
                description="Team shifts will appear once HR publishes the roster."
                icon={<Users className="h-5 w-5" />}
              />
            ) : (
              <ul className="divide-y divide-line/70">
                {team.items.map((member) => {
                  const colors = shiftColor(member.shiftCode);
                  return (
                    <li key={member.employeeId} className="flex items-center gap-3 py-2.5">
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                          member.isMe ? 'bg-brand-600 text-white' : 'bg-canvas text-ink-soft',
                        )}
                      >
                        {member.employeeName.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                        {member.employeeName}
                        {member.isMe ? (
                          <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-brand-600">
                            You
                          </span>
                        ) : null}
                      </span>
                      {member.isOff ? (
                        <Badge tone="neutral">Off</Badge>
                      ) : (
                        <span className={cn('chip ring-1', colors.bg, colors.text, colors.ring)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', colors.dot)} />
                          {member.shiftShortName ?? member.shiftName}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Roster changes"
            subtitle="Your published shift history"
            icon={<History className="h-4 w-4" />}
          />
          <CardBody>
            {!history?.items.length ? (
              <EmptyState
                title="No changes yet"
                description="Whenever HR changes your shift or off day, it is recorded here."
                icon={<History className="h-5 w-5" />}
              />
            ) : (
              <ul className="space-y-3">
                {history.items.slice(0, 12).map((change) => (
                  <li key={change.id} className="rounded-xl border border-line bg-canvas/50 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-ink">
                        {change.previousShift} → {change.newShift}
                      </span>
                      {change.notified ? (
                        <Badge tone="brand">Notified</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11.5px] text-ink-muted">
                      {formatBanglaDate(change.changedAt.slice(0, 10))} · {change.changeType.replace('_', ' ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function startOfWeek(dateKey: string): string {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  // The roster week starts on Saturday, matching the BRONEE working week.
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(dateKey, offset);
}

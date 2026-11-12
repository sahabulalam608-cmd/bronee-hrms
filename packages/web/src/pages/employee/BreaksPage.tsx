import { useState } from 'react';
import { motion } from 'framer-motion';
import { Coffee, History, Timer, TimerOff } from 'lucide-react';
import { formatDhakaDateTime, formatDuration, humanDuration } from '@bronee/shared';
import { useBreaks } from '@/lib/queries';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Segmented,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { cn } from '@/lib/utils';

export default function BreaksPage() {
  const { data, isLoading } = useBreaks(100);
  const [view, setView] = useState<'today' | 'all'>('today');

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BreakStat
          icon={<Timer className="h-4 w-4" />}
          label="Break time today"
          value={formatDuration(data?.today.seconds ?? 0)}
          tone="warning"
        />
        <BreakStat
          icon={<Coffee className="h-4 w-4" />}
          label="Sessions today"
          value={String(data?.today.count ?? 0)}
          tone="brand"
        />
        <BreakStat
          icon={<Timer className="h-4 w-4" />}
          label="Break time this month"
          value={humanDuration(data?.month.seconds ?? 0)}
          tone="success"
        />
        <BreakStat
          icon={<History className="h-4 w-4" />}
          label="Sessions this month"
          value={String(data?.month.count ?? 0)}
          tone="neutral"
        />
      </div>

      <Card>
        <CardHeader
          title="Break history"
          subtitle="Every break is recorded with its start, end and duration"
          icon={<Coffee className="h-4 w-4" />}
          action={
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'today', label: 'Today' },
                { value: 'all', label: 'All' },
              ]}
            />
          }
        />
        <CardBody className="px-0 pb-0 sm:px-0">
          {isLoading ? (
            <div className="space-y-2 px-5 pb-5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : !items.length ? (
            <EmptyState
              title="No breaks recorded"
              description="Start a break from the dashboard and it will be logged here."
              icon={<Coffee className="h-5 w-5" />}
            />
          ) : (
            <Table>
              <THead>
                <TH>Started</TH>
                <TH>Ended</TH>
                <TH align="right">Duration</TH>
                <TH>Closed by</TH>
              </THead>
              <TBody>
                {items
                  .filter((item) => {
                    if (view === 'all') return true;
                    return formatDhakaDateTime(item.startedAt).startsWith(formatDhakaDateTime(items[0]?.startedAt ?? '').slice(0, 10));
                  })
                  .map((item) => (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="table-row"
                    >
                      <TD className="font-semibold text-ink">
                        {formatDhakaDateTime(item.startedAt)}
                      </TD>
                      <TD>{item.endedAt ? formatDhakaDateTime(item.endedAt) : 'In progress'}</TD>
                      <TD align="right" className="font-semibold text-ink tabular-nums">
                        {formatDuration(item.durationSeconds)}
                      </TD>
                      <TD>
                        <span
                          className={cn(
                            'chip',
                            item.closedBy === 'system'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-brand-50 text-brand-700',
                          )}
                        >
                          {item.closedBy === 'system' ? 'Closed automatically' : 'Closed by you'}
                        </span>
                      </TD>
                    </motion.tr>
                  ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function BreakStat({
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
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', tones[tone])}>{icon}</span>
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{label}</p>
      </div>
      <p className="mt-3 text-[22px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">
        {value}
      </p>
    </div>
  );
}

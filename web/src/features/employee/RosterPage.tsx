import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Users } from 'lucide-react';
import { NumberingBar } from '@/components/ui/list-numbering';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDate, formatWeekday } from '@/lib/time';
import { cn } from '@/lib/cn';
import { shiftAccent, shiftLabel } from '@/lib/status';
import { Badge, PageHeader, SectionCard } from '@/components/ui/primitives';
import type { RosterEntry } from '@shared/types';

export function RosterPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { data, loading } = useAsync(() => api.employeeRoster(), []);

  const week = useMemo(() => {
    const entries = data?.entries ?? [];
    if (!entries.length) return [];
    const dates = [...new Set(entries.map((e) => e.date))].sort();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
    const start = dates.find((d) => d >= today) ?? dates[0];
    const index = dates.indexOf(start);
    return dates.slice(index, index + 7);
  }, [data]);

  const entryFor = (date: string): RosterEntry | undefined =>
    data?.entries.find((e) => e.date === date);

  const team = selectedDate ? (data?.teamByDate[selectedDate] ?? []) : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roster"
        subtitle="Your published schedule and the team view for each day"
        actions={
          <Link to="/employee/leave" className="btn-secondary btn-sm">
            <CalendarDays size={15} />
            Request a roster change
          </Link>
        }
      />

      <SectionCard
        title="7-day roster overview"
        subtitle="Your assigned shift for each day of the current roster"
        padded={false}
      >
        {loading ? (
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="skeleton h-28 rounded-xl" />
            ))}
          </div>
        ) : week.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-ink-faint">
            No published roster is available for you yet.
          </p>
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {week.map((date) => {
              const entry = entryFor(date);
              const off = entry?.offDay ?? true;
              const accent = shiftAccent(entry?.shiftCode ?? 'OFF');
              const isSelected = selectedDate === date;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(isSelected ? null : date)}
                  className={cn(
                    'group relative overflow-hidden rounded-xl border p-3.5 text-left transition-all duration-150',
                    isSelected
                      ? 'border-brand-400 bg-brand-50/60 shadow-lift'
                      : 'border-line bg-surface hover:border-line-strong hover:shadow-card',
                  )}
                >
                  <span
                    className="absolute inset-x-0 top-0 h-[3px]"
                    style={{ background: off ? '#cbd5e1' : accent }}
                  />
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                    {formatWeekday(`${date}T12:00:00Z`)}
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold text-ink">{formatDate(date)}</p>
                  <p
                    className="mt-2 truncate text-[12.5px] font-medium"
                    style={{ color: off ? '#94a3b8' : accent }}
                  >
                    {off ? 'Off' : shiftLabel(entry?.shiftCode ?? 'OFF')}
                  </p>
                  {entry?.offDay ? (
                    <Badge tone="neutral" className="mt-2">
                      Off day
                    </Badge>
                  ) : (
                    <Badge tone="brand" className="mt-2">
                      Assigned
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>

      {selectedDate && (
        <SectionCard
          title={`Team shift overview — ${formatDate(selectedDate)}`}
          subtitle="Shifts only. Personal details of other employees are never shown."
          action={
            <button type="button" className="btn-ghost btn-sm" onClick={() => setSelectedDate(null)}>
              Close
            </button>
          }
          padded={false}
        >
                    <div>
            <NumberingBar className="mb-2" />
            <ul className="serial-list divide-y divide-line">
            {team.map((member) => (
            <li key={member.employeeName} className="flex items-center gap-3 px-5 py-2.5">
            <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: shiftAccent(member.shiftCode) }}
            />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
            {member.employeeName}
            </span>
            <span className="hidden text-[12px] text-ink-faint sm:block">{member.departmentName}</span>
            <span
            className="shrink-0 text-[12.5px] font-medium"
            style={{ color: shiftAccent(member.shiftCode) }}
            >
            {member.shiftCode === 'OFF' ? 'Off' : shiftLabel(member.shiftCode)}
            </span>
            </li>
            ))}
            </ul>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Published rosters" padded={false}>
                <div>
          <NumberingBar className="mb-2" />
          <ul className="serial-list divide-y divide-line">
          {(data?.versions ?? []).map((version) => (
          <li key={version.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <Badge tone="brand">v{version.version}</Badge>
          <span className="text-[13px] text-ink-soft">
          {formatDate(version.startDate)} — {formatDate(version.endDate)}
          </span>
          <Badge tone="ok" className="ml-auto">
          Published
          </Badge>
          {version.publishedAt && (
          <span className="text-[12px] text-ink-faint">
          Published {formatDate(version.publishedAt)}
          </span>
          )}
          </li>
          ))}
          {!data?.versions.length && (
          <li className="px-5 py-10 text-center text-[13px] text-ink-faint">
          No published rosters yet.
          </li>
          )}
          </ul>
        </div>
      </SectionCard>

      <div className="flex items-center gap-2 text-[12px] text-ink-faint">
        <Users size={13} />
        Team shift data is visible for coordination only — no private employee information is
        exposed.
      </div>
    </div>
  );
}

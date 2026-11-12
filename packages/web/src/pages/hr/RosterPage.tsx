import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  History,
  Layers,
  Plus,
  Rocket,
  Save,
  Send,
  Wand2,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Segmented,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
  type BadgeTone,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import {
  useHrRoster,
  useHrRosterEmployees,
  useHrRosterHistory,
  useHrRosters,
  useHrShifts,
  useInvalidate,
} from '@/lib/queries';
import { addDays, daysInclusive, formatBanglaDate, toDhaka, type StaffingWarning } from '@bronee/shared';
import { cn, relativeTime, shiftColor } from '@/lib/utils';

const OFF = 'OFF';

type View = 'list' | 'builder' | 'preview';
type Duration = '7' | '14' | '21' | '28' | 'custom';
type CellMap = Record<string, Record<string, string>>;

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  scheduled: 'info',
  published: 'success',
  archived: 'warning',
};

const DURATION_OPTIONS: Array<{ value: Duration; label: string }> = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '21', label: '21 days' },
  { value: '28', label: '28 days' },
  { value: 'custom', label: 'Custom' },
];

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

function readConflicts(details: unknown): StaffingWarning[] {
  if (Array.isArray(details)) {
    return details.filter(
      (item): item is StaffingWarning =>
        typeof item === 'object' && item !== null && 'message' in item,
    );
  }
  return [];
}

export default function HrRosterPage() {
  const toast = useToast();
  const invalidate = useInvalidate();

  const [view, setView] = useState<View>('list');
  const [activeRosterId, setActiveRosterId] = useState<string | undefined>(undefined);
  const [builderMode, setBuilderMode] = useState<'create' | 'edit'>('create');
  const [builderSeed, setBuilderSeed] = useState(0);

  const rostersQuery = useHrRosters();
  const rosterQuery = useHrRoster(activeRosterId);
  const employeesQuery = useHrRosterEmployees();
  const shiftsQuery = useHrShifts();
  const historyQuery = useHrRosterHistory(activeRosterId);

  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [duration, setDuration] = useState<Duration>('7');
  const [customEnd, setCustomEnd] = useState('');
  const [rosterName, setRosterName] = useState('');
  const [cells, setCells] = useState<CellMap>({});
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<StaffingWarning[]>([]);
  const [previewTab, setPreviewTab] = useState<'grid' | 'history'>('grid');
  const [scheduledFor, setScheduledFor] = useState('');
  const [publishResult, setPublishResult] = useState<string | null>(null);

  const rosters = rostersQuery.data?.items ?? [];
  const employees = employeesQuery.data?.items ?? [];
  const shifts = shiftsQuery.data?.items ?? [];

  const shiftOptions = useMemo(
    () => [
      ...shifts.map((shift) => ({ value: shift.id, label: shift.shortName })),
      { value: OFF, label: 'Off' },
    ],
    [shifts],
  );

  const dates = useMemo(() => {
    if (!startDate) return [];
    if (duration === 'custom') {
      if (!customEnd) return [];
      const count = daysInclusive(startDate, customEnd);
      if (count <= 0 || count > 62) return [];
      return Array.from({ length: count }, (_, index) => addDays(startDate, index));
    }
    const count = Number(duration);
    return Array.from({ length: count }, (_, index) => addDays(startDate, index));
  }, [startDate, duration, customEnd]);

  const endDate = dates.length ? dates[dates.length - 1] : customEnd;

  /* Seed the builder when a roster is opened for editing. */
  const seededKey = useRef<string | null>(null);
  useEffect(() => {
    if (view !== 'builder') return;
    if (builderMode === 'edit' && !rosterQuery.data) return;

    const key = `${builderMode}:${activeRosterId ?? 'new'}:${builderSeed}`;
    if (seededKey.current === key) return;
    seededKey.current = key;

    if (builderMode === 'edit' && rosterQuery.data) {
      const roster = rosterQuery.data.roster;
      setStartDate(roster.startDate);
      setCustomEnd(roster.endDate);
      setDuration('custom');
      setRosterName(roster.name);
      const next: CellMap = {};
      for (const item of rosterQuery.data.items) {
        next[item.employeeId] = next[item.employeeId] ?? {};
        next[item.employeeId][item.date] = item.isOff ? OFF : (item.shiftId ?? OFF);
      }
      setCells(next);
      setConflicts(rosterQuery.data.conflicts ?? []);
      return;
    }
    setStartDate(new Date().toISOString().slice(0, 10));
    setDuration('7');
    setCustomEnd('');
    setRosterName('');
    setCells({});
    setConflicts([]);
  }, [builderSeed, view, builderMode, activeRosterId, rosterQuery.data]);

  function getCell(employeeId: string, date: string): string {
    return cells[employeeId]?.[date] ?? OFF;
  }

  function setCell(employeeId: string, date: string, value: string) {
    setCells((current) => ({
      ...current,
      [employeeId]: { ...(current[employeeId] ?? {}), [date]: value },
    }));
  }

  function applyToWholeRow(employeeId: string, value: string) {
    setCells((current) => {
      const row = { ...(current[employeeId] ?? {}) };
      for (const date of dates) row[date] = value;
      return { ...current, [employeeId]: row };
    });
  }

  function openCreateBuilder() {
    setBuilderMode('create');
    setActiveRosterId(undefined);
    setView('builder');
    setBuilderSeed((seed) => seed + 1);
  }

  function openEditBuilder(rosterId: string) {
    setBuilderMode('edit');
    setActiveRosterId(rosterId);
    setView('builder');
    setBuilderSeed((seed) => seed + 1);
  }

  function openPreview(rosterId: string) {
    setActiveRosterId(rosterId);
    setView('preview');
    setPreviewTab('grid');
    setPublishResult(null);
    setScheduledFor(toDhakaInput(new Date(Date.now() + 86_400_000).toISOString()));
  }

  async function saveRoster() {
    if (!dates.length) {
      toast.error('Roster window is empty', 'Pick a start date and a valid number of days.');
      return;
    }
    if (!employees.length) {
      toast.error('No employees to schedule', 'Roster employees could not be loaded.');
      return;
    }

    const name =
      rosterName.trim() ||
      `Roster ${formatBanglaDate(startDate)} – ${formatBanglaDate(endDate)}`;

    setBusy(true);
    setConflicts([]);
    try {
      if (builderMode === 'edit' && activeRosterId) {
        const updates = employees.flatMap((employee) =>
          dates.map((date) => {
            const value = getCell(employee.id, date);
            return {
              employeeId: employee.id,
              date,
              shiftId: value === OFF ? null : value,
              isOff: value === OFF,
            };
          }),
        );
        await api.patch(`/hr/roster/${activeRosterId}/entries`, { updates });
        toast.success('Roster updated', `${updates.length} roster cells were saved.`);
        invalidate([['hr', 'roster'], ['hr', 'rosters']]);
        setView('preview');
        return;
      }

      const entries = employees.flatMap((employee) =>
        dates.map((date) => {
          const value = getCell(employee.id, date);
          return {
            employeeId: employee.id,
            date,
            shiftId: value === OFF ? null : value,
            isOff: value === OFF,
          };
        }),
      );

      const response = await api.post<{ roster: { id: string }; conflicts: StaffingWarning[] }>(
        '/hr/roster',
        { name, startDate, endDate, entries },
      );

      const returned = response.conflicts ?? [];
      setConflicts(returned);
      toast.success(
        'Draft roster saved',
        returned.length
          ? `${entries.length} cells saved with ${returned.length} operational warning${
              returned.length === 1 ? '' : 's'
            }.`
          : `${entries.length} roster cells saved.`,
      );
      invalidate([['hr', 'roster'], ['hr', 'rosters']]);
      setActiveRosterId(response.roster.id);
      setView('preview');
    } catch (caught) {
      if (caught instanceof ApiError) {
        const details = readConflicts(caught.details);
        if (details.length) setConflicts(details);
        toast.error(
          'Roster not saved',
          caught.status === 400
            ? 'The API rejected the roster payload — every employee and shift reference must point at a valid record.'
            : caught.message,
        );
      } else {
        toast.error('Roster not saved', 'The roster could not be saved. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function publishRoster(mode: 'now' | 'schedule') {
    if (!activeRosterId) return;
    if (mode === 'schedule') {
      const iso = fromDhakaInput(scheduledFor);
      if (!iso) {
        toast.error('Pick a publish time', 'Choose the date and time for the scheduled publish.');
        return;
      }
    }

    setBusy(true);
    try {
      const body =
        mode === 'schedule'
          ? { publishMode: 'schedule' as const, scheduledFor: fromDhakaInput(scheduledFor) }
          : { publishMode: 'now' as const };

      const response = await api.post<{
        status: string;
        changedEmployees?: number;
        changedEntries?: number;
        notified?: number;
      }>(`/hr/roster/${activeRosterId}/publish`, body);

      if (mode === 'schedule') {
        setPublishResult('The roster is scheduled and will publish automatically.');
        toast.success('Publish scheduled', 'The roster will go live at the chosen time.');
      } else {
        const notified = response.notified ?? response.changedEmployees ?? 0;
        setPublishResult(
          `${notified} employee${notified === 1 ? '' : 's'} notified · ${
            response.changedEntries ?? 0
          } changed roster day${(response.changedEntries ?? 0) === 1 ? '' : 's'}.`,
        );
        toast.success(
          'Roster published',
          `${notified} employee${notified === 1 ? ' was' : 's were'} notified about the change.`,
        );
      }
      invalidate([['hr', 'roster'], ['hr', 'rosters'], ['hr', 'roster', 'history']]);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The roster could not be published.';
      toast.error('Publish failed', message);
    } finally {
      setBusy(false);
    }
  }

  const previewItems = rosterQuery.data?.items ?? [];
  const previewRoster = rosterQuery.data?.roster;
  const previewConflicts = rosterQuery.data?.conflicts ?? [];

  const previewRows = useMemo(() => {
    const grouped = new Map<string, { employeeName: string; employeeCode: string; department: string | null; cells: Map<string, string> }>();
    for (const item of previewItems) {
      const row =
        grouped.get(item.employeeId) ??
        {
          employeeName: item.employeeName,
          employeeCode: item.employeeCode,
          department: item.department,
          cells: new Map<string, string>(),
        };
      row.cells.set(item.date, item.isOff ? OFF : (item.shiftCode ?? OFF));
      grouped.set(item.employeeId, row);
    }
    return [...grouped.entries()].map(([employeeId, row]) => ({ employeeId, ...row }));
  }, [previewItems]);

  const previewDates = useMemo(() => {
    const keys = new Set(previewItems.map((item) => item.date));
    return [...keys].sort();
  }, [previewItems]);

  return (
    <div>
      <PageHeader
        title="Roster Management"
        description="Build shift rosters, resolve operational conflicts and publish schedules to the workforce."
        action={
          view === 'list' ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={openCreateBuilder}>
              New roster
            </Button>
          ) : (
            <Button
              variant="outline"
              icon={<ChevronLeft className="h-4 w-4" />}
              onClick={() => {
                setView('list');
                setActiveRosterId(undefined);
              }}
            >
              All rosters
            </Button>
          )
        }
      />

      {/* ------------------------------------------------------------- list view */}
      {view === 'list' ? (
        <Card>
          {rostersQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12" />
              ))}
            </div>
          ) : rosters.length === 0 ? (
            <EmptyState
              title="No rosters built yet"
              description="Create the first roster to schedule shifts across the workforce."
              icon={<CalendarDays className="h-5 w-5" />}
              action={
                <Button icon={<Plus className="h-4 w-4" />} onClick={openCreateBuilder}>
                  Build a roster
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TH>Roster</TH>
                <TH>Date range</TH>
                <TH align="right">Version</TH>
                <TH align="right">Entries</TH>
                <TH>Status</TH>
                <TH align="right">Actions</TH>
              </THead>
              <TBody>
                {rosters.map((roster) => (
                  <TR key={roster.id}>
                    <TD>
                      <p className="font-semibold text-ink">{roster.name}</p>
                      <p className="text-[11.5px] text-ink-muted">
                        Created {relativeTime(roster.createdAt)}
                      </p>
                    </TD>
                    <TD>
                      <span className="whitespace-nowrap">
                        {formatBanglaDate(roster.startDate)} – {formatBanglaDate(roster.endDate)}
                      </span>
                    </TD>
                    <TD align="right">v{roster.version}</TD>
                    <TD align="right">{roster.entryCount}</TD>
                    <TD>
                      <Badge tone={STATUS_TONE[roster.status] ?? 'neutral'} dot>
                        {roster.status}
                      </Badge>
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-2">
                        <Button size="xs" variant="outline" onClick={() => openPreview(roster.id)}>
                          Preview
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => openEditBuilder(roster.id)}>
                          Edit cells
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}

      {/* ---------------------------------------------------------- builder view */}
      {view === 'builder' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title={builderMode === 'edit' ? 'Edit roster cells' : 'Roster builder'}
              subtitle="Choose the window, then assign a shift to every employee and day."
              icon={<Wand2 className="h-4 w-4" />}
            />
            <CardBody>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  label="Roster name"
                  value={rosterName}
                  onChange={(event) => setRosterName(event.target.value)}
                  placeholder={`Roster ${startDate} → ${endDate || '…'}`}
                />
                <Input
                  label="Start date"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
                <div>
                  <span className="field-label">Duration</span>
                  <Segmented<Duration>
                    value={duration}
                    onChange={setDuration}
                    options={DURATION_OPTIONS}
                    size="sm"
                    className="flex-wrap"
                  />
                </div>
                <Input
                  label="End date"
                  type="date"
                  value={duration === 'custom' ? customEnd : endDate}
                  disabled={duration !== 'custom'}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  hint={duration === 'custom' ? undefined : 'Derived from the duration'}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" loading={busy} icon={<Save className="h-4 w-4" />} onClick={saveRoster}>
                  {builderMode === 'edit' ? 'Save roster cells' : 'Save draft roster'}
                </Button>
                <span className="text-[12.5px] text-ink-muted">
                  {dates.length} day{dates.length === 1 ? '' : 's'} · {employees.length} employee
                  {employees.length === 1 ? '' : 's'} · {dates.length * employees.length} cells
                </span>
              </div>
            </CardBody>
          </Card>

          {conflicts.length ? (
            <Card className="border-warning/40 bg-warning-soft/40 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-deep" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-warning-deep">
                    {conflicts.length} operational warning
                    {conflicts.length === 1 ? '' : 's'} from the API
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {conflicts.map((conflict, index) => (
                      <li key={`${conflict.code}-${index}`} className="text-[12.5px] text-ink-soft">
                        <span className="font-semibold text-ink">{conflict.code}</span>
                        {conflict.date ? ` · ${formatBanglaDate(conflict.date)}` : ''} —{' '}
                        {conflict.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Shift grid"
              subtitle="Every cell defaults to Off. Use the row control to apply one shift across the whole week."
              icon={<Layers className="h-4 w-4" />}
            />
            <CardBody className="px-0 pb-0">
              {employeesQuery.isLoading ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-10" />
                  ))}
                </div>
              ) : !dates.length ? (
                <EmptyState
                  title="Choose a roster window"
                  description="Pick a start date and a duration so the day columns can be built."
                  icon={<CalendarDays className="h-5 w-5" />}
                />
              ) : !employees.length ? (
                <EmptyState
                  title="No employees to schedule"
                  description="Active and approved employees appear here in department order."
                  icon={<Layers className="h-5 w-5" />}
                />
              ) : (
                <div className="max-h-[70vh] overflow-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="border-b border-line">
                        <th className="table-head whitespace-nowrap px-3 py-2.5">Employee</th>
                        <th className="table-head whitespace-nowrap px-3 py-2.5">Whole row</th>
                        {dates.map((date) => (
                          <th key={date} className="table-head whitespace-nowrap px-3 py-2.5">
                            {formatBanglaDate(date, { withDay: true })}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((employee) => (
                        <tr key={employee.id} className="table-row">
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <p className="text-[13px] font-semibold text-ink">{employee.fullName}</p>
                            <p className="text-[11.5px] text-ink-muted">
                              {employee.employeeCode}
                              {employee.departmentName ? ` · ${employee.departmentName}` : ''}
                            </p>
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              aria-label={`Apply a shift to all of ${employee.fullName}`}
                              defaultValue=""
                              onChange={(event) => {
                                if (!event.target.value) return;
                                applyToWholeRow(employee.id, event.target.value);
                                event.target.value = '';
                              }}
                              className="select-field h-8 py-1 text-[12px]"
                            >
                              <option value="">Apply…</option>
                              {shiftOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          {dates.map((date) => {
                            const value = getCell(employee.id, date);
                            return (
                              <td key={date} className="px-2 py-2">
                                <Select
                                  aria-label={`Shift for ${employee.fullName} on ${date}`}
                                  value={value}
                                  onChange={(event) => setCell(employee.id, date, event.target.value)}
                                  options={shiftOptions}
                                  className="h-8 py-1 text-[12px]"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {/* --------------------------------------------------------- preview view */}
      {view === 'preview' ? (
        <div className="space-y-4">
          {rosterQuery.isLoading || !previewRoster ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <Card>
                <CardHeader
                  title={previewRoster.name}
                  subtitle={`${formatBanglaDate(previewRoster.startDate)} – ${formatBanglaDate(
                    previewRoster.endDate,
                  )} · version ${previewRoster.version}`}
                  icon={<CalendarClock className="h-4 w-4" />}
                  action={
                    <div className="flex gap-2">
                      <Badge tone={STATUS_TONE[previewRoster.status] ?? 'neutral'} dot>
                        {previewRoster.status}
                      </Badge>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => openEditBuilder(previewRoster.id)}
                      >
                        Edit cells
                      </Button>
                    </div>
                  }
                />
                <CardBody>
                  {previewConflicts.length ? (
                    <div className="rounded-2xl border border-warning/40 bg-warning-soft/40 p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-deep" />
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-bold text-warning-deep">
                            {previewConflicts.length} operational warning
                            {previewConflicts.length === 1 ? '' : 's'}
                          </p>
                          <ul className="mt-2 space-y-1.5">
                            {previewConflicts.map((conflict, index) => (
                              <li
                                key={`${conflict.code}-${index}`}
                                className="text-[12.5px] text-ink-soft"
                              >
                                <span className="font-semibold text-ink">{conflict.code}</span>
                                {conflict.date ? ` · ${formatBanglaDate(conflict.date)}` : ''} —{' '}
                                {conflict.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 rounded-2xl bg-success-soft/50 px-3.5 py-3 text-[12.5px] font-medium text-success-deep">
                      <CheckCircle2 className="h-4 w-4" />
                      No staffing or scheduling conflicts detected for this roster.
                    </p>
                  )}

                  {publishResult ? (
                    <p className="mt-3 flex items-center gap-2 rounded-2xl bg-brand-50 px-3.5 py-3 text-[12.5px] font-semibold text-brand-700">
                      <Send className="h-4 w-4" />
                      {publishResult}
                    </p>
                  ) : null}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Publish roster"
                  subtitle="Only employees whose shift or off day actually changed are notified."
                  icon={<Rocket className="h-4 w-4" />}
                />
                <CardBody>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        icon={<Rocket className="h-4 w-4" />}
                        loading={busy}
                        disabled={previewRoster.status === 'archived'}
                        onClick={() => publishRoster('now')}
                      >
                        Publish now
                      </Button>
                    </div>
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                      <Input
                        label="Schedule publish (Dhaka time)"
                        type="datetime-local"
                        value={scheduledFor}
                        onChange={(event) => setScheduledFor(event.target.value)}
                        containerClassName="sm:max-w-xs"
                      />
                      <Button
                        variant="outline"
                        icon={<CalendarClock className="h-4 w-4" />}
                        loading={busy}
                        disabled={previewRoster.status === 'archived'}
                        onClick={() => publishRoster('schedule')}
                      >
                        Schedule publish
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <div className="px-5 pt-5">
                  <Segmented<'grid' | 'history'>
                    value={previewTab}
                    onChange={setPreviewTab}
                    options={[
                      { value: 'grid', label: 'Roster grid' },
                      { value: 'history', label: 'Change history' },
                    ]}
                    size="sm"
                  />
                </div>
                <CardBody className="px-0 pb-0 pt-4">
                  {previewTab === 'grid' ? (
                    previewRows.length ? (
                      <div className="max-h-[65vh] overflow-auto">
                        <table className="w-full border-collapse text-left">
                          <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-line">
                              <th className="table-head whitespace-nowrap px-3 py-2.5">Employee</th>
                              {previewDates.map((date) => (
                                <th key={date} className="table-head whitespace-nowrap px-3 py-2.5">
                                  {formatBanglaDate(date, { withDay: true })}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.map((row) => (
                              <tr key={row.employeeId} className="table-row">
                                <td className="whitespace-nowrap px-3 py-2.5">
                                  <p className="text-[13px] font-semibold text-ink">
                                    {row.employeeName}
                                  </p>
                                  <p className="text-[11.5px] text-ink-muted">
                                    {row.employeeCode}
                                    {row.department ? ` · ${row.department}` : ''}
                                  </p>
                                </td>
                                {previewDates.map((date) => {
                                  const value = row.cells.get(date) ?? OFF;
                                  if (value === OFF) {
                                    return (
                                      <td key={date} className="px-3 py-2.5">
                                        <span className="chip bg-slate-100 text-slate-500">Off</span>
                                      </td>
                                    );
                                  }
                                  const colors = shiftColor(value);
                                  return (
                                    <td key={date} className="px-3 py-2.5">
                                      <span className={cn('chip', colors.bg, colors.text)}>
                                        {value}
                                      </span>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyState
                        title="This roster has no entries"
                        description="Edit the cells to assign shifts before publishing."
                        icon={<Layers className="h-5 w-5" />}
                      />
                    )
                  ) : historyQuery.isLoading ? (
                    <div className="space-y-3 p-5">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-10" />
                      ))}
                    </div>
                  ) : (historyQuery.data?.items ?? []).length === 0 ? (
                    <EmptyState
                      title="No roster changes recorded"
                      description="Every published change will be listed here with who made it."
                      icon={<History className="h-5 w-5" />}
                    />
                  ) : (
                    <Table>
                      <THead>
                        <TH>Employee</TH>
                        <TH>Previous shift</TH>
                        <TH>New shift</TH>
                        <TH>Change type</TH>
                        <TH>Notified</TH>
                        <TH align="right">When</TH>
                      </THead>
                      <TBody>
                        {(historyQuery.data?.items ?? []).map((change) => (
                          <TR key={change.id}>
                            <TD>
                              <p className="font-semibold text-ink">{change.employeeName}</p>
                              <p className="text-[11.5px] text-ink-muted">{change.employeeCode}</p>
                            </TD>
                            <TD>{change.previousShift}</TD>
                            <TD>{change.newShift}</TD>
                            <TD>{change.changeType}</TD>
                            <TD>
                              <Badge tone={change.notified ? 'success' : 'neutral'}>
                                {change.notified ? 'Notified' : 'Silent'}
                              </Badge>
                            </TD>
                            <TD align="right" className="whitespace-nowrap">
                              {relativeTime(change.createdAt)}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  )}
                </CardBody>
              </Card>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

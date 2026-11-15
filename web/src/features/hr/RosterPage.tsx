import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarRange,
  Filter,
  History,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
} from 'lucide-react';
import { NumberingBar } from '@/components/ui/list-numbering';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { addDays, formatDate, formatDateTime, formatWeekday, todayBD } from '@/lib/time';
import { formatNumber } from '@/lib/format';
import { approvalTone, publishTone, shiftAccent } from '@/lib/status';
import { cn } from '@/lib/cn';
import { Alert, Input, Textarea } from '@/components/ui/forms';
import { Avatar, Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, Tabs } from '@/components/ui/data';
import { ConfirmDialog, Modal, useToast } from '@/components/ui/overlay';
import { SHIFT_CELL_LABELS, SHIFT_OPTION_LABELS, type ShiftCode } from '@shared/constants';
import type {
  Department,
  Employee,
  RosterChangeLog,
  RosterChangeRequest,
  RosterEntry,
  RosterSummary,
} from '@shared/types';

type Row<T> = { [K in keyof T]: T[K] };
type VersionRow = Row<RosterSummary>;
type EntryRow = Row<RosterEntry>;
type RequestRow = Row<RosterChangeRequest>;
type ChangeRow = Row<RosterChangeLog>;

/**
 * The four shift options every roster cell offers (§6.1).
 * The time window is always part of the label.
 */
const SHIFT_OPTIONS: { value: ShiftCode; label: string }[] = (
  ['MORNING', 'EVENING_E1', 'LATE_EVENING', 'OFF'] as ShiftCode[]
).map((code) => ({ value: code, label: SHIFT_OPTION_LABELS[code] }));

const OFF_LABEL = SHIFT_OPTION_LABELS.OFF;

export function RosterPage() {
  const toast = useToast();
  const [tab, setTab] = useState('grid');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayBD());
  const [endDate, setEndDate] = useState(addDays(todayBD(), 6));
  const [assignments, setAssignments] = useState<Record<string, Record<string, string>>>({});
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now');
  const [publishAt, setPublishAt] = useState(`${todayBD()}T09:00`);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [sendEmployee, setSendEmployee] = useState<{ id: string; name: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState<RequestRow | null>(null);
  const [decision, setDecision] = useState<'approve' | 'decline'>('approve');
  const [updateMode, setUpdateMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  /** Edit mode for an already published roster. */
  const [editing, setEditing] = useState(false);
  /** The cells that were changed but not pushed yet. */
  const [pendingEdits, setPendingEdits] = useState<Record<string, Record<string, string>>>({});
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const [decidingBusy, setDecidingBusy] = useState(false);

  const { data: versions, loading, error, reload } = useAsync<RosterSummary[]>(
    () => api.hrRosterVersions(),
    [],
  );
  const { data: employees } = useAsync<Employee[]>(() => api.hrEmployees(), []);
  const { data: departments } = useAsync<Department[]>(() => api.hrDepartments(), []);

  useEffect(() => {
    if (!selectedId && versions?.length) setSelectedId(versions[0].id);
  }, [versions, selectedId]);

  const {
    data: entries,
    reload: reloadEntries,
  } = useAsync<RosterEntry[]>(
    () => (selectedId ? api.hrRosterEntries(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  const { data: conflicts, reload: reloadConflicts } = useAsync(
    () => (selectedId ? api.rosterConflicts(selectedId) : Promise.resolve([])),
    [selectedId],
  );
  const { data: changeLog, reload: reloadLog } = useAsync<RosterChangeLog[]>(
    () => api.rosterChangeLog(),
    [],
  );
  const { data: changeRequests, reload: reloadRequests } = useAsync<RosterChangeRequest[]>(
    () => api.hrRosterChangeRequests(),
    [],
  );

  const selected = useMemo(
    () => (versions ?? []).find((version) => version.id === selectedId) ?? null,
    [versions, selectedId],
  );

  const dates = useMemo(() => {
    if (!selected) return [] as string[];
    const list: string[] = [];
    let cursor = selected.startDate;
    let guard = 0;
    while (cursor <= selected.endDate && guard < 62) {
      list.push(cursor);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
    return list;
  }, [selected]);

  const sortedEmployees = useMemo(() => {
    const order = new Map<string, number>();
    for (const dept of departments ?? []) order.set(dept.id, dept.displayOrder);
    return [...(employees ?? [])].sort((a, b) => {
      const deptDiff = (order.get(a.departmentId) ?? 99) - (order.get(b.departmentId) ?? 99);
      if (deptDiff !== 0) return deptDiff;
      if (a.joiningDate !== b.joiningDate) return a.joiningDate.localeCompare(b.joiningDate);
      return a.fullName.localeCompare(b.fullName);
    });
  }, [employees, departments]);

  const visibleEmployees = useMemo(() => {
    if (departmentFilter === 'all') return sortedEmployees;
    return sortedEmployees.filter((employee) => employee.departmentId === departmentFilter);
  }, [sortedEmployees, departmentFilter]);

  /** shift code per employee per day, taken from the selected roster version. */
  const shiftMatrix = useMemo(() => {
    const matrix = new Map<string, Map<string, string>>();
    for (const entry of (entries ?? []) as EntryRow[]) {
      if (!matrix.has(entry.employeeId)) matrix.set(entry.employeeId, new Map());
      matrix.get(entry.employeeId)!.set(entry.date, entry.shiftCode);
    }
    return matrix;
  }, [entries]);

  /** The editable copy of the matrix — what a draft currently holds. */
  const editableMatrix = useMemo(() => {
    const next = new Map<string, Map<string, string>>();
    for (const employee of sortedEmployees) {
      const row = new Map<string, string>();
      for (const date of dates) {
        const current = shiftMatrix.get(employee.id)?.get(date);
        row.set(date, current ?? employee.shiftCode);
      }
      next.set(employee.id, row);
    }
    return next;
  }, [sortedEmployees, dates, shiftMatrix]);

  const stats = useMemo(() => {
    const all = versions ?? [];
    return {
      total: all.length,
      published: all.filter((version) => version.status === 'Published').length,
      draft: all.filter((version) => version.status === 'Draft').length,
      scheduled: all.filter((version) => version.status === 'Scheduled').length,
      pendingRequests: (changeRequests ?? []).filter((request) => request.status === 'Pending').length,
    };
  }, [versions, changeRequests]);

  const rosterEmployees = useMemo(() => {
    const map = new Map<string, EntryRow>();
    for (const entry of (entries ?? []) as EntryRow[]) {
      if (!map.has(entry.employeeId)) map.set(entry.employeeId, entry);
    }
    return Array.from(map.values());
  }, [entries]);

  /** A published roster stays read-only until HR switches on the edit mode. */
  const editable = selected?.status !== 'Published' || editing;
  const pendingEditCount = Object.values(pendingEdits).reduce(
    (sum, row) => sum + Object.keys(row).length,
    0,
  );

  function setAssignment(employeeId: string, date: string, shiftCode: string) {
    setAssignments((prev) => ({
      ...prev,
      [employeeId]: { ...(prev[employeeId] ?? {}), [date]: shiftCode },
    }));
  }

  async function saveCell(employeeId: string, date: string, shiftCode: string) {
    if (!selected) return;
    if (selected.status === 'Published') {
      // A published roster is never rewritten in place — the change waits for
      // the explicit roster update.
      setPendingEdits((prev) => ({
        ...prev,
        [employeeId]: { ...(prev[employeeId] ?? {}), [date]: shiftCode },
      }));
      return;
    }
    const next: Record<string, Record<string, string>> = {};
    for (const employee of sortedEmployees) {
      next[employee.id] = {};
      for (const day of dates) {
        const value =
          employee.id === employeeId && day === date
            ? shiftCode
            : (editableMatrix.get(employee.id)?.get(day) ?? employee.shiftCode);
        next[employee.id][day] = value;
      }
    }
    setSaving(true);
    try {
      await api.updateRoster(selected.id, next);
      setAssignments(next);
      reloadEntries();
      reloadConflicts();
    } catch (err) {
      toast.error('Could not save the shift', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  function fillDefaults() {
    const next: Record<string, Record<string, string>> = {};
    for (const employee of sortedEmployees) {
      next[employee.id] = {};
      for (const date of dates) next[employee.id][date] = employee.shiftCode;
    }
    setAssignments(next);
  }

  /** A new draft starts as a copy of the version currently on screen. */
  async function createDraftFromCurrent() {
    if (!selected) return;
    const next: Record<string, Record<string, string>> = {};
    for (const employee of sortedEmployees) {
      next[employee.id] = {};
      for (const date of dates) {
        next[employee.id][date] = editableMatrix.get(employee.id)?.get(date) ?? employee.shiftCode;
      }
    }
    setSaving(true);
    try {
      const created = await api.createRoster({
        startDate: selected.startDate,
        endDate: selected.endDate,
        assignments: next,
      });
      toast.success('Roster draft created', `Version ${created.version} is ready to edit.`);
      setCreateOpen(false);
      reload();
      setSelectedId(created.id);
    } catch (err) {
      toast.error('Could not create the roster', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function createRoster() {
    if (!startDate || !endDate || startDate > endDate) {
      toast.error('Choose a valid date range');
      return;
    }
    if (assignments && Object.keys(assignments).length > 0) {
      const created = await api.createRoster({ startDate, endDate, assignments });
      toast.success('Roster created', `Version ${created.version} saved as a draft.`);
      setCreateOpen(false);
      setAssignments({});
      reload();
      setSelectedId(created.id);
      return;
    }
    const next: Record<string, Record<string, string>> = {};
    for (const employee of sortedEmployees) {
      next[employee.id] = {};
      for (const date of dates) next[employee.id][date] = employee.shiftCode;
    }
    setSaving(true);
    try {
      const created = await api.createRoster({ startDate, endDate, assignments: next });
      toast.success('Roster created', `Version ${created.version} saved as a draft.`);
      setCreateOpen(false);
      setAssignments({});
      reload();
      setSelectedId(created.id);
    } catch (err) {
      toast.error('Could not create the roster', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!selected) return;
    setPublishing(true);
    try {
      const result = await api.publishRoster(
        selected.id,
        publishMode,
        publishMode === 'schedule' ? new Date(publishAt).toISOString() : undefined,
      );
      toast.success(
        publishMode === 'now' ? 'Roster published' : 'Roster scheduled',
        publishMode === 'now'
          ? `${result.notified.length} employees were notified about their new shift.`
          : `The roster will publish automatically on ${formatDateTime(result.version.publishAt)}.`,
      );
      setPublishConfirm(false);
      setPublishOpen(false);
      reload();
      reloadEntries();
      reloadConflicts();
    } catch (err) {
      toast.error('Publish failed', err instanceof Error ? err.message : undefined);
    } finally {
      setPublishing(false);
    }
  }

  /** Pushes the pending edits of a published roster and notifies the employees. */
  async function applyUpdate() {
    if (!selected) return;
    setUpdating(true);
    try {
      const next: Record<string, Record<string, string>> = {};
      for (const employee of sortedEmployees) {
        next[employee.id] = {};
        for (const day of dates) {
          next[employee.id][day] =
            pendingEdits[employee.id]?.[day] ??
            editableMatrix.get(employee.id)?.get(day) ??
            employee.shiftCode;
        }
      }
      const result = await api.updatePublishedRoster(selected.id, next);
      toast.success(
        'Roster updated',
        `${result.notified.length} employees were notified about their new shift.`,
      );
      setPendingEdits({});
      setEditing(false);
      setUpdateOpen(false);
      reload();
      reloadEntries();
      reloadLog();
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : undefined);
    } finally {
      setUpdating(false);
    }
  }

  async function sendUpdate() {
    if (!selected || !sendEmployee) return;
    setSending(true);
    try {
      await api.sendRosterUpdate(selected.id, sendEmployee.id);
      toast.success('Roster update sent', `${sendEmployee.name} has been notified.`);
      setSendEmployee(null);
    } catch (err) {
      toast.error('Could not send the update', err instanceof Error ? err.message : undefined);
    } finally {
      setSending(false);
    }
  }

  async function decideChange() {
    if (!deciding) return;
    setDecidingBusy(true);
    try {
      await api.decideRosterChange(deciding.id, {
        decision,
        updateMode: decision === 'approve' ? updateMode : undefined,
        note: decisionNote.trim() || undefined,
      });
      toast.success(
        decision === 'approve' ? 'Change request approved' : 'Change request declined',
        decision === 'approve' && updateMode === 'AUTO'
          ? 'The roster was updated automatically and the employee was notified.'
          : decision === 'approve'
            ? 'Approval recorded — apply the change manually in the roster.'
            : 'The employee has been notified about the decision.',
      );
      setDeciding(null);
      setDecisionNote('');
      reloadRequests();
      reloadLog();
      reloadEntries();
    } catch (err) {
      toast.error('Decision failed', err instanceof Error ? err.message : undefined);
    } finally {
      setDecidingBusy(false);
    }
  }

  const versionColumns = [
    {
      key: 'version',
      header: 'Version',
      render: (version: VersionRow) => (
        <span className="text-[13.5px] font-semibold text-ink">v{version.version}</span>
      ),
    },
    {
      key: 'range',
      header: 'Date range',
      render: (version: VersionRow) => (
        <span className="text-[13px] text-ink-soft">
          {formatDate(version.startDate)} – {formatDate(version.endDate)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (version: VersionRow) => (
        <Badge tone={publishTone(version.status)}>{version.status}</Badge>
      ),
    },
    {
      key: 'publishAt',
      header: 'Scheduled publish',
      render: (version: VersionRow) => (
        <span className="text-[13px] text-ink-muted">
          {version.publishAt ? formatDateTime(version.publishAt) : '—'}
        </span>
      ),
    },
    {
      key: 'publishedAt',
      header: 'Published',
      render: (version: VersionRow) => (
        <span className="text-[13px] text-ink-muted">
          {version.publishedAt ? `${formatDateTime(version.publishedAt)} · ${version.publishedBy ?? ''}` : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (version: VersionRow) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setSelectedId(version.id)}
          >
            Preview
          </button>
          {version.status !== 'Published' && (
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => {
                setSelectedId(version.id);
                setPublishOpen(true);
              }}
            >
              Publish
            </button>
          )}
        </div>
      ),
    },
  ];

  const requestColumns = [
    {
      key: 'employeeName',
      header: 'Employee',
      render: (request: RequestRow) => (
        <span className="text-[13.5px] font-medium text-ink">{request.employeeName}</span>
      ),
    },
    { key: 'type', header: 'Request type' },
    {
      key: 'current',
      header: 'Current',
      render: (request: RequestRow) => (
        <span className="text-[13px] text-ink-soft">
          {formatDate(request.currentDate)} · {request.currentShiftName}
        </span>
      ),
    },
    {
      key: 'requested',
      header: 'Requested',
      render: (request: RequestRow) => (
        <span className="text-[13px] text-ink-soft">
          {formatDate(request.requestedDate)} · {request.requestedShiftName ?? 'Off'}
        </span>
      ),
    },
    { key: 'reason', header: 'Reason' },
    {
      key: 'updateMode',
      header: 'Update mode',
      render: (request: RequestRow) => (
        <Badge tone={request.updateMode === 'AUTO' ? 'ok' : request.updateMode === 'MANUAL' ? 'warn' : 'neutral'}>
          {request.updateMode ?? 'Not set'}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (request: RequestRow) => (
        <Badge tone={approvalTone(request.status)}>{request.status}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (request: RequestRow) => (
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={request.status !== 'Pending'}
          onClick={() => {
            setDeciding(request);
            setDecision('approve');
            setUpdateMode('AUTO');
            setDecisionNote('');
          }}
        >
          Review
        </button>
      ),
    },
  ];

  const logColumns = [
    { key: 'rosterId', header: 'Roster ID' },
    {
      key: 'rosterVersion',
      header: 'Version',
      render: (row: ChangeRow) => <span className="text-[13px] text-ink-soft">v{row.rosterVersion}</span>,
    },
    {
      key: 'employeeName',
      header: 'Employee',
      render: (row: ChangeRow) => (
        <span className="text-[13.5px] font-medium text-ink">{row.employeeName}</span>
      ),
    },
    { key: 'previousShift', header: 'Previous shift' },
    { key: 'updatedShift', header: 'Updated shift' },
    { key: 'changedBy', header: 'Changed by' },
    {
      key: 'changedAt',
      header: 'Changed at',
      render: (row: ChangeRow) => (
        <span className="text-[13px] text-ink-muted">{formatDateTime(row.changedAt)}</span>
      ),
    },
    { key: 'publishStatus', header: 'Publish' },
    { key: 'notificationStatus', header: 'Notification' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roster Management"
        subtitle="Create, review, publish and track shift rosters with staffing checks and change history."
        actions={
          <button type="button" className="btn-secondary btn-sm" onClick={() => setCreateOpen(true)}>
            <Upload size={15} />
            New roster
          </button>
        }
      />

      {/* ---------------- engine header ---------------- */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                <Sparkles size={12} />
                Roster Engine v3
              </span>
              {selected && (
                <span className="rounded-lg bg-surface-sunken px-2.5 py-1 font-mono text-[11.5px] text-ink-soft">
                  {formatDate(selected.startDate)} to {formatDate(selected.endDate)} ({dates.length}{' '}
                  {dates.length === 1 ? 'Day' : 'Days'})
                </span>
              )}
              {selected && <Badge tone={publishTone(selected.status)}>{selected.status}</Badge>}
            </div>

            <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.02em] text-ink">
              Enterprise Roster Management &amp; Publishing
            </h2>
            <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
              Auto-sorted by Department Display Order and Joining Date. Intelligent diffing alerts only
              affected staff.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {versions?.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => setSelectedId(version.id)}
                  className={`rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    version.id === selectedId
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : 'border-line bg-surface text-ink-soft hover:bg-surface-sunken'
                  }`}
                >
                  v{version.version} · {version.status}
                </button>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            <button
              type="button"
              className="btn-secondary whitespace-nowrap"
              onClick={() => (selected ? createDraftFromCurrent() : setCreateOpen(true))}
              disabled={saving}
            >
              <Upload size={15} />
              Create New Roster Draft
            </button>
            {selected?.status === 'Published' && !editing && (
              <button
                type="button"
                className="btn-secondary whitespace-nowrap"
                onClick={() => {
                  setEditing(true);
                  setPendingEdits({});
                }}
                disabled={saving}
              >
                <Pencil size={15} />
                Edit published roster
              </button>
            )}
            {editing && (
              <button
                type="button"
                className="btn-secondary whitespace-nowrap"
                onClick={() => {
                  setEditing(false);
                  setPendingEdits({});
                }}
                disabled={updating}
              >
                Cancel edit
              </button>
            )}
            {editing && (
              <button
                type="button"
                className="btn-primary whitespace-nowrap"
                onClick={() => setUpdateOpen(true)}
                disabled={pendingEditCount === 0 || updating}
              >
                <RefreshCw size={15} />
                Update roster ({pendingEditCount})
              </button>
            )}
            <button
              type="button"
              className="btn-primary whitespace-nowrap"
              onClick={() => setPublishOpen(true)}
              disabled={!selected || selected.status === 'Published' || saving}
            >
              <Send size={15} />
              Publish All (Smart Diff Alerts)
            </button>
          </div>
        </div>

        <div className="grid gap-4 border-t border-line bg-surface-sunken px-6 py-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Roster versions" value={formatNumber(stats.total)} icon={<CalendarRange size={17} />} />
          <StatCard label="Published" value={formatNumber(stats.published)} tone="ok" />
          <StatCard label="Draft" value={formatNumber(stats.draft)} tone="neutral" />
          <StatCard label="Scheduled" value={formatNumber(stats.scheduled)} tone="info" />
          <StatCard
            label="Pending change requests"
            value={formatNumber(stats.pendingRequests)}
            tone="warn"
          />
        </div>
      </section>

      {error && (
        <Alert tone="bad" title="Could not load rosters">
          {error}
        </Alert>
      )}

      {/* ---------------- department filter ---------------- */}
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Filter size={17} className="text-brand-600" />
          <span className="text-[13.5px] font-medium text-ink">Department View Filter:</span>
        </div>
        <select
          aria-label="Department view filter"
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-[13px] text-ink focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10 sm:w-80"
        >
          <option value="all">All Departments (Sorted by Display Order)</option>
          {(departments ?? [])
            .filter((dept) => dept.kind !== 'SUB_DEPARTMENT')
            .map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name} (Display Order {dept.displayOrder})
              </option>
            ))}
        </select>
      </section>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'grid', label: 'Roster grid' },
          { key: 'versions', label: 'Roster versions', count: stats.total },
          { key: 'requests', label: 'Change requests', count: stats.pendingRequests },
          { key: 'history', label: 'Change history' },
        ]}
      />

      {tab === 'grid' && (
        <div className="space-y-4">
          <SectionCard
            title="Roster grid"
            subtitle={
              selected
                ? `${formatDate(selected.startDate)} to ${formatDate(selected.endDate)} · ${selected.status}${
                    editable ? ' · click a cell to change the shift' : ' · published rosters are read-only'
                  }`
                : 'No roster version selected'
            }
            padded={false}
          >
            {!selected ? (
              <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
                Create a roster draft to assign shifts to employees.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr className="table-head">
                      <th className="sticky left-0 z-10 min-w-[220px] bg-surface-raised px-4 py-2.5 text-left uppercase tracking-[0.08em]">
                        Employee &amp; Dept
                      </th>
                      {dates.map((date) => (
                        <th key={date} className="min-w-[168px] px-2 py-2.5 text-center whitespace-nowrap">
                          <span className="block uppercase tracking-[0.08em] text-ink-soft">
                            {formatWeekday(date)}
                          </span>
                          <span className="block font-mono text-[11.5px] font-normal text-ink-muted">
                            {date.slice(5)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEmployees.map((employee) => {
                      return (
                        <tr key={employee.id} className="table-row">
                          <td className="sticky left-0 z-10 bg-surface px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={employee.fullName} size={32} />
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium text-ink">
                                  {employee.fullName}
                                </p>
                                <p className="truncate text-[11.5px] text-brand-600">
                                  {employee.subDepartmentName ?? employee.departmentName}
                                </p>
                                <p className="text-[11px] text-ink-muted">
                                  Joined: {employee.joiningDate}
                                </p>
                              </div>
                            </div>
                          </td>
                          {dates.map((date) => {
                            const code =
                              pendingEdits[employee.id]?.[date] ??
                              editableMatrix.get(employee.id)?.get(date) ??
                              employee.shiftCode;
                            const label = SHIFT_CELL_LABELS[code as ShiftCode] ?? code;
                            const accent = code === 'OFF' ? '#94a3b8' : shiftAccent(code);
                            const edited = pendingEdits[employee.id]?.[date] != null;
                            return (
                              <td key={date} className="px-1.5 py-1.5 text-center">
                                {editable ? (
                                  <select
                                    aria-label={`Shift for ${employee.fullName} on ${date}`}
                                    value={code}
                                    onChange={(e) => {
                                      setAssignment(employee.id, date, e.target.value);
                                      void saveCell(employee.id, date, e.target.value);
                                    }}
                                    className={cn(
                                      'w-full cursor-pointer rounded-xl border bg-surface px-2 py-1.5 text-[11.5px] font-medium leading-tight focus:outline-none focus:ring-4 focus:ring-brand-500/10',
                                      edited && 'ring-2 ring-brand-400',
                                    )}
                                    style={{
                                      color: code === 'OFF' ? '#64748b' : accent,
                                      borderColor: code === 'OFF' ? '#e7e9f2' : `${accent}33`,
                                      backgroundColor: code === 'OFF' ? '#f8fafc' : `${accent}0d`,
                                    }}
                                  >
                                    {SHIFT_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span
                                    className="inline-flex w-full items-center justify-center rounded-xl border px-2 py-1.5 text-[11.5px] font-medium leading-tight"
                                    style={{
                                      color: code === 'OFF' ? '#64748b' : accent,
                                      borderColor: code === 'OFF' ? '#e7e9f2' : `${accent}33`,
                                      backgroundColor: code === 'OFF' ? '#f8fafc' : `${accent}0d`,
                                    }}
                                  >
                                    {label}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {visibleEmployees.length === 0 && (
                  <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
                    No employee matches this department filter.
                  </p>
                )}
              </div>
            )}
          </SectionCard>

          {selected && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
              <SectionCard
                title="Staffing check"
                subtitle="Minimum staffing rules evaluated against this roster version"
                padded={false}
              >
                {(conflicts ?? []).length === 0 ? (
                  <p className="px-5 py-8 text-center text-[13px] text-ink-muted">
                    No staffing rules are configured for this roster.
                  </p>
                ) : (
                                    <div>
                    <NumberingBar className="mb-2" />
                    <ul className="serial-list divide-y divide-line">
                    {(conflicts ?? [])
                    .filter((row) => row.date === dates[0])
                    .map((row) => (
                    <li
                    key={`${row.departmentName}-${row.shiftCode}`}
                    className="flex items-center gap-3 px-5 py-3"
                    >
                    <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-ink">
                    {row.departmentName}
                    </span>
                    <span className="block text-[12px] text-ink-muted">{row.shiftCode}</span>
                    </span>
                    <span className="shrink-0 text-[12.5px] text-ink-muted">
                    {row.assigned}/{row.required} assigned
                    </span>
                    <Badge tone={row.shortfall > 0 ? 'bad' : 'ok'}>
                    {row.shortfall > 0 ? `Short by ${row.shortfall}` : 'Covered'}
                    </Badge>
                    </li>
                    ))}
                    </ul>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Notify employees"
                subtitle="Send an individual roster update to a single employee"
                padded={false}
              >
                {rosterEmployees.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[13px] text-ink-muted">
                    No employees in this roster.
                  </p>
                ) : (
                                    <div>
                    <NumberingBar className="mb-2" />
                    <ul className="serial-list divide-y divide-line">
                    {rosterEmployees.map((entry) => (
                    <li key={entry.employeeId} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">
                    {entry.employeeName}
                    </span>
                    <span className="block truncate text-[12px] text-ink-muted">
                    {entry.departmentName} · {entry.employeeCode}
                    </span>
                    </span>
                    <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setSendEmployee({ id: entry.employeeId, name: entry.employeeName })}
                    >
                    <Send size={14} />
                    Send update
                    </button>
                    </li>
                    ))}
                    </ul>
                  </div>
                )}
              </SectionCard>
            </div>
          )}
        </div>
      )}

      {tab === 'versions' && (
        <SectionCard
          title="Roster versions"
          subtitle="Every roster version is kept — published versions are never deleted."
          padded={false}
        >
          <DataTable<VersionRow>
            columns={versionColumns}
            rows={(versions ?? []) as VersionRow[]}
            rowKey={(row) => row.id}
            loading={loading}
            emptyTitle="No roster version yet"
            emptyDescription="Create the first roster to assign shifts to employees."
            emptyIcon={<CalendarRange size={22} />}
            onRowClick={(row) => setSelectedId(row.id)}
          />
        </SectionCard>
      )}

      {tab === 'requests' && (
        <SectionCard
          title="Roster change requests"
          subtitle="Off day or shift changes requested by employees"
          padded={false}
        >
          <DataTable<RequestRow>
            columns={requestColumns}
            rows={(changeRequests ?? []) as RequestRow[]}
            rowKey={(row) => row.id}
            emptyTitle="No change requests"
            emptyDescription="Requests raised from the Employee Portal appear here."
            emptyIcon={<CalendarDays size={22} />}
          />
        </SectionCard>
      )}

      {tab === 'history' && (
        <SectionCard
          title="Change history"
          subtitle="Every roster edit with the person who made it"
          padded={false}
        >
          <DataTable<ChangeRow>
            columns={logColumns}
            rows={(changeLog ?? []) as ChangeRow[]}
            rowKey={(row) => `${row.rosterId}-${row.employeeId}-${row.changedAt}`}
            emptyTitle="No changes recorded"
            emptyDescription="Every roster change is written here."
            emptyIcon={<History size={22} />}
          />
        </SectionCard>
      )}

      {/* ---------------- create modal ---------------- */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create roster"
        description="Choose the roster window, then set the shift for every employee and day."
        size="xl"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => void createRoster()} disabled={saving}>
              {saving ? 'Creating…' : 'Create draft roster'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Start date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              label="End date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-ink-muted">Quick range:</span>
            {[7, 14, 21, 28].map((days) => (
              <button
                key={days}
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  setStartDate(todayBD());
                  setEndDate(addDays(todayBD(), days - 1));
                }}
              >
                {days} days
              </button>
            ))}
            <button type="button" className="btn-secondary btn-sm" onClick={fillDefaults}>
              Fill with assigned shifts
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="table-head">
                  <th className="sticky left-0 z-10 bg-surface-raised px-3 py-2.5 text-left">Employee</th>
                  {dates.map((date) => (
                    <th key={date} className="px-2 py-2.5 text-center whitespace-nowrap">
                      {formatDate(date)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.map((employee) => (
                  <tr key={employee.id} className="table-row">
                    <td className="sticky left-0 z-10 bg-surface px-3 py-2 whitespace-nowrap">
                      <span className="block text-[13px] font-medium text-ink">{employee.fullName}</span>
                      <span className="block text-[11.5px] text-ink-muted">
                        {employee.departmentName} · {employee.employeeId}
                      </span>
                    </td>
                    {dates.map((date) => (
                      <td key={date} className="px-1.5 py-1.5">
                        <select
                          aria-label={`Shift for ${employee.fullName} on ${date}`}
                          className="w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[12px] text-ink-soft focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                          value={assignments[employee.id]?.[date] ?? employee.shiftCode}
                          onChange={(e) => setAssignment(employee.id, date, e.target.value)}
                        >
                          {SHIFT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.value === 'OFF' ? OFF_LABEL : option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-ink-muted">
            {dates.length} day{dates.length === 1 ? '' : 's'} × {sortedEmployees.length} employees · employees are
            sorted by department display order and joining date.
          </p>
        </div>
      </Modal>

      {/* ---------------- publish modal ---------------- */}
      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish roster"
        description="Only employees whose shift or off day changed are notified."
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setPublishOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => setPublishConfirm(true)}>
              Continue
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2.5 text-[13px] text-ink">
              <input
                type="radio"
                name="publish-mode"
                checked={publishMode === 'now'}
                onChange={() => setPublishMode('now')}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Publish now
            </label>
            <label className="flex items-center gap-2.5 text-[13px] text-ink">
              <input
                type="radio"
                name="publish-mode"
                checked={publishMode === 'schedule'}
                onChange={() => setPublishMode('schedule')}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Schedule
            </label>
          </div>

          {publishMode === 'schedule' && (
            <Input
              label="Publish date and time"
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
            />
          )}

        </div>
      </Modal>

      <ConfirmDialog
        open={publishConfirm}
        onClose={() => setPublishConfirm(false)}
        onConfirm={publish}
        title="Publish this roster?"
        confirmLabel={publishMode === 'now' ? 'Publish now' : 'Schedule publish'}
        loading={publishing}
        message={
          publishMode === 'now'
            ? 'The roster becomes visible to every employee in the date range. Only employees with a changed shift or off day receive a notification.'
            : `The roster will be published automatically on ${formatDateTime(new Date(publishAt).toISOString())}.`
        }
      />

      <ConfirmDialog
        open={updateOpen}
        onClose={() => setUpdateOpen(false)}
        onConfirm={applyUpdate}
        title="Update this published roster?"
        confirmLabel="Update roster"
        loading={updating}
        message={`${pendingEditCount} shift change(s) are applied to version ${selected?.version ?? ''}. Only the employees whose shift or off day changed receive a notification.`}
      />

      <ConfirmDialog
        open={sendEmployee !== null}
        onClose={() => setSendEmployee(null)}
        onConfirm={sendUpdate}
        title="Send this roster update?"
        confirmLabel="Send update"
        loading={sending}
        message={`${sendEmployee?.name ?? ''} will receive the roster update for this version.`}
      />

      {/* ---------------- change request review ---------------- */}
      <Modal
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title="Review roster change request"
        description={deciding ? `${deciding.employeeName} · ${deciding.type}` : undefined}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDeciding(null)} disabled={decidingBusy}>
              Cancel
            </button>
            <button
              type="button"
              className={decision === 'approve' ? 'btn-primary' : 'btn-danger'}
              onClick={() => void decideChange()}
              disabled={decidingBusy}
            >
              {decidingBusy ? 'Saving…' : decision === 'approve' ? 'Approve' : 'Decline'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2.5 text-[13px] text-ink">
              <input
                type="radio"
                name="decision"
                checked={decision === 'approve'}
                onChange={() => setDecision('approve')}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Approve
            </label>
            <label className="flex items-center gap-2.5 text-[13px] text-ink">
              <input
                type="radio"
                name="decision"
                checked={decision === 'decline'}
                onChange={() => setDecision('decline')}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Decline
            </label>
          </div>

          {decision === 'approve' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2.5 text-[13px] text-ink">
                <input
                  type="radio"
                  name="update-mode"
                  checked={updateMode === 'AUTO'}
                  onChange={() => setUpdateMode('AUTO')}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                Update the roster automatically
              </label>
              <label className="flex items-center gap-2.5 text-[13px] text-ink">
                <input
                  type="radio"
                  name="update-mode"
                  checked={updateMode === 'MANUAL'}
                  onChange={() => setUpdateMode('MANUAL')}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                Manual update required
              </label>
            </div>
          )}

          <Textarea
            label="Review note"
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder="Why is this decision being made?"
          />
        </div>
      </Modal>
    </div>
  );
}

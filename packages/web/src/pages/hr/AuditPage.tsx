import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileClock,
  Filter,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { useHrAudit } from '@/lib/queries';
import { formatDhakaDateTime } from '@bronee/shared';
import { cn, relativeTime } from '@/lib/utils';

type AuditRow = NonNullable<ReturnType<typeof useHrAudit>['data']>['items'][number];

const ENTITY_TYPES = [
  { value: '', label: 'All entity types' },
  { value: 'user', label: 'Employee record' },
  { value: 'signup_request', label: 'Signup request' },
  { value: 'department', label: 'Department' },
  { value: 'shift', label: 'Shift' },
  { value: 'roster', label: 'Roster' },
  { value: 'leave_request', label: 'Leave request' },
  { value: 'overtime_request', label: 'Overtime request' },
  { value: 'attendance_session', label: 'Attendance session' },
  { value: 'payroll_record', label: 'Payroll record' },
  { value: 'payroll_run', label: 'Payroll run' },
  { value: 'attendance_bonus', label: 'Attendance bonus' },
  { value: 'task', label: 'Task' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'company_settings', label: 'Company settings' },
  { value: 'sync_log', label: 'Sheets sync' },
];

const ENTITY_LABELS: Record<string, string> = {
  user: 'Employee',
  signup_request: 'Signup',
  department: 'Department',
  shift: 'Shift',
  roster: 'Roster',
  leave_request: 'Leave',
  overtime_request: 'Overtime',
  attendance_session: 'Attendance',
  payroll_record: 'Payroll record',
  payroll_run: 'Payroll run',
  attendance_bonus: 'Bonus',
  task: 'Task',
  announcement: 'Announcement',
  company_settings: 'Settings',
  sync_log: 'Sync',
};

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text =
    value === null || value === undefined
      ? '—'
      : typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2);
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-muted">{label}</p>
      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-canvas px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-ink-soft">
        {text}
      </pre>
    </div>
  );
}

export default function HrAuditPage() {
  const [entityType, setEntityType] = useState('');
  const auditQuery = useHrAudit(entityType || undefined);
  const [expanded, setExpanded] = useState<string | null>(null);

  const items = auditQuery.data?.items ?? [];

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of items) {
      map.set(row.entityType, (map.get(row.entityType) ?? 0) + 1);
    }
    return map;
  }, [items]);

  function toggle(id: string) {
    setExpanded((current) => (current === id ? null : id));
  }

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Every privileged action taken in BRONEE HRMS, with the exact before and after values."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-soft ring-1 ring-line">
            <ShieldCheck className="h-4 w-4 text-brand-600" />
            {items.length} entries
          </span>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="sm:w-64">
              <Select
                label="Entity type"
                value={entityType}
                onChange={(event) => setEntityType(event.target.value)}
                options={ENTITY_TYPES}
                hint="Filter the trail to a single record type."
              />
            </div>
            <p className="flex items-center gap-1.5 pb-2 text-[12.5px] text-ink-muted">
              <Filter className="h-3.5 w-3.5" />
              {entityType
                ? `${ENTITY_LABELS[entityType] ?? entityType} entries only`
                : 'Showing every entity type'}
            </p>
          </div>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Audit trail"
          subtitle="Newest first. Expand a row to see the recorded before and after state."
          icon={<ScrollText className="h-4 w-4" />}
        />
        {auditQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No audit entries"
            description="Privileged actions taken in HRMS will be recorded here automatically."
            icon={<FileClock className="h-5 w-5" />}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TH>Time</TH>
                <TH>Actor</TH>
                <TH>Action</TH>
                <TH>Entity type</TH>
                <TH>Entity ID</TH>
                <TH align="right">Details</TH>
              </THead>
              <TBody>
                {items.map((row: AuditRow) => {
                  const isOpen = expanded === row.id;
                  return (
                    <TR key={row.id} onClick={() => toggle(row.id)}>
                      <TD className="whitespace-nowrap">
                        <p className="text-[12.5px] font-semibold text-ink">
                          {formatDhakaDateTime(row.createdAt)}
                        </p>
                        <p className="text-[11px] text-ink-muted">{relativeTime(row.createdAt)}</p>
                      </TD>
                      <TD>
                        <p className="font-semibold text-ink">{row.actorName ?? 'System'}</p>
                        {row.ip ? <p className="text-[11px] text-ink-muted">{row.ip}</p> : null}
                      </TD>
                      <TD>
                        <Badge tone="brand">{row.action}</Badge>
                      </TD>
                      <TD>
                        <span className="whitespace-nowrap">
                          {ENTITY_LABELS[row.entityType] ?? row.entityType}
                        </span>
                        {counts.has(row.entityType) ? (
                          <span className="ml-1.5 text-[11px] text-ink-muted">
                            ({counts.get(row.entityType)})
                          </span>
                        ) : null}
                      </TD>
                      <TD>
                        <span className="block max-w-[160px] truncate font-mono text-[11.5px] text-ink-muted">
                          {row.entityId ?? '—'}
                        </span>
                      </TD>
                      <TD align="right">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700',
                          )}
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          {isOpen ? 'Hide' : 'Show'}
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            {expanded ? (
              <div className="border-t border-line p-4">
                {(() => {
                  const row = items.find((entry) => entry.id === expanded);
                  if (!row) return null;
                  return (
                    <div>
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge tone="brand">{row.action}</Badge>
                        <span className="text-[12.5px] text-ink-soft">
                          {row.actorName ?? 'System'} · {formatDhakaDateTime(row.createdAt)}
                        </span>
                        {row.userAgent ? (
                          <span className="max-w-[420px] truncate text-[11px] text-ink-muted">
                            {row.userAgent}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-3 lg:flex-row">
                        <JsonBlock label="Before" value={row.before} />
                        <JsonBlock label="After" value={row.after} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

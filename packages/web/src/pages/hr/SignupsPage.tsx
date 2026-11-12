import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  CalendarDays,
  Mail,
  Phone,
  ShieldQuestion,
  UserRoundCheck,
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
  Input,
  Segmented,
  Select,
  Skeleton,
  Textarea,
  useToast,
  type BadgeTone,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import {
  useHrDepartments,
  useHrEmployees,
  useHrSignups,
  useInvalidate,
} from '@/lib/queries';
import { formatBanglaDate } from '@bronee/shared';
import { relativeTime } from '@/lib/utils';

type SignupStatus = 'pending' | 'approved' | 'declined';

type SignupItem = NonNullable<ReturnType<typeof useHrSignups>['data']>['items'][number];

type Correction = {
  fullName: string;
  mobile: string;
  employeeCode: string;
  designation: string;
  departmentId: string;
  subDepartmentId: string;
  reportingManagerId: string;
  joiningDate: string;
};

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  declined: 'danger',
};

function toCorrection(item: SignupItem): Correction {
  return {
    fullName: item.employee.fullName,
    mobile: item.employee.mobile,
    employeeCode: item.employee.employeeCode,
    designation: item.employee.designation,
    departmentId: item.employee.departmentId ?? '',
    subDepartmentId: item.employee.subDepartmentId ?? '',
    reportingManagerId: item.employee.reportingManagerId ?? '',
    joiningDate: item.employee.joiningDate,
  };
}

export default function HrSignupsPage() {
  const toast = useToast();
  const invalidate = useInvalidate();

  const [status, setStatus] = useState<SignupStatus>('pending');
  const signupsQuery = useHrSignups(status);
  const departmentsQuery = useHrDepartments();
  const employeesQuery = useHrEmployees();

  const [selected, setSelected] = useState<SignupItem | null>(null);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [salary, setSalary] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);

  const items = signupsQuery.data?.items ?? [];

  const departments = departmentsQuery.data?.items ?? [];
  const subDepartments = useMemo(
    () => departments.filter((department) => department.parentId === (correction?.departmentId ?? '')),
    [departments, correction?.departmentId],
  );

  const departmentOptions = useMemo(
    () => departments.map((department) => ({ value: department.id, label: department.name })),
    [departments],
  );

  const subDepartmentOptions = useMemo(
    () => subDepartments.map((department) => ({ value: department.id, label: department.name })),
    [subDepartments],
  );

  const managerOptions = useMemo(() => {
    const people = employeesQuery.data?.items ?? [];
    return [
      { value: '', label: 'No reporting manager' },
      ...people.map((person) => ({ value: person.id, label: `${person.fullName} · ${person.employeeCode}` })),
    ];
  }, [employeesQuery.data]);

  function openDrawer(item: SignupItem) {
    setSelected(item);
    setCorrection(toCorrection(item));
    setSalary(item.proposedSalary != null ? String(item.proposedSalary) : '');
    setNote('');
  }

  function closeDrawer() {
    setSelected(null);
    setCorrection(null);
    setSalary('');
    setNote('');
  }

  async function review(decision: 'approve' | 'decline') {
    if (!selected || !correction) return;

    if (decision === 'approve' && !correction.fullName.trim()) {
      toast.error('Full name is required', 'Correct the applicant name before approving.');
      return;
    }

    setBusy(decision);
    try {
      const body: Record<string, unknown> = {
        decision,
        note: note.trim() ? note.trim() : undefined,
      };

      if (decision === 'approve') {
        const parsedSalary = salary.trim() ? Number(salary) : undefined;
        if (parsedSalary !== undefined && Number.isFinite(parsedSalary)) {
          body.salary = parsedSalary;
        }
        body.correction = {
          fullName: correction.fullName.trim(),
          mobile: correction.mobile.trim(),
          employeeCode: correction.employeeCode.trim(),
          designation: correction.designation.trim(),
          departmentId: correction.departmentId || undefined,
          subDepartmentId: correction.subDepartmentId ? correction.subDepartmentId : null,
          reportingManagerId: correction.reportingManagerId ? correction.reportingManagerId : null,
          joiningDate: correction.joiningDate,
        };
      }

      await api.post(`/hr/signups/${selected.requestId}/review`, body);

      toast.success(
        decision === 'approve' ? 'Signup approved' : 'Signup declined',
        decision === 'approve'
          ? `${correction.fullName.trim()} can now sign in to the employee portal.`
          : `${selected.employee.fullName} was declined${note.trim() ? ` — ${note.trim()}` : ''}.`,
      );
      invalidate([['hr', 'signups'], ['hr', 'employees'], ['hr', 'dashboard']]);
      closeDrawer();
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'The review could not be saved.';
      toast.error('Review failed', message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Signup Approval"
        description="Review new employee registrations, correct the submitted details and approve access."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-soft ring-1 ring-line">
            <ShieldQuestion className="h-4 w-4 text-brand-600" />
            {items.length} in queue
          </span>
        }
      />

      <div className="mb-4">
        <Segmented<SignupStatus>
          value={status}
          onChange={setStatus}
          options={[
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'declined', label: 'Declined' },
          ]}
        />
      </div>

      {signupsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title={status === 'pending' ? 'The approval queue is clear' : 'No records in this state'}
            description={
              status === 'pending'
                ? 'Every registration has been reviewed. New applications will land here automatically.'
                : 'Switch to another tab to see the rest of the history.'
            }
            icon={<UserRoundCheck className="h-5 w-5" />}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <Card key={item.requestId} className="p-4">
              <div className="flex items-start gap-3">
                <Avatar name={item.employee.fullName} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[14.5px] font-bold text-ink">{item.employee.fullName}</p>
                    <Badge tone={STATUS_TONE[item.status] ?? 'neutral'} dot>
                      {item.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[12px] font-semibold text-ink-muted">
                    {item.employee.employeeCode}
                  </p>

                  <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                      <span className="truncate">{item.employee.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                      <span>{item.employee.mobile || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                      <span className="truncate">{item.employee.designation || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                      <span>{formatBanglaDate(item.employee.joiningDate)}</span>
                    </div>
                  </dl>

                  <p className="mt-3 text-[11.5px] text-ink-muted">
                    Department: {item.employee.department || 'Unassigned'} · Applied{' '}
                    {relativeTime(item.createdAt)}
                    {item.proposedSalary != null
                      ? ` · Proposed salary ৳${item.proposedSalary.toLocaleString('en-IN')}`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => openDrawer(item)}>
                  Review application
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={closeDrawer}
        title={selected ? `Review ${selected.employee.fullName}` : 'Signup review'}
        width="max-w-xl"
      >
        {selected && correction ? (
          <div className="space-y-5">
            <div className="rounded-2xl bg-canvas p-4 text-[12.5px] leading-relaxed text-ink-soft">
              <p className="font-semibold text-ink">Submitted details</p>
              <p className="mt-1">
                {selected.employee.email} · {selected.employee.mobile}
              </p>
              <p className="mt-1">
                Department {selected.employee.department || 'Unassigned'} · Joining{' '}
                {formatBanglaDate(selected.employee.joiningDate)}
              </p>
            </div>

            <div>
              <h3 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                Correct the record
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Full name"
                  value={correction.fullName}
                  onChange={(event) => setCorrection({ ...correction, fullName: event.target.value })}
                  required
                />
                <Input
                  label="Employee ID"
                  value={correction.employeeCode}
                  onChange={(event) =>
                    setCorrection({ ...correction, employeeCode: event.target.value })
                  }
                />
                <Input
                  label="Designation"
                  value={correction.designation}
                  onChange={(event) =>
                    setCorrection({ ...correction, designation: event.target.value })
                  }
                />
                <Input
                  label="Mobile"
                  value={correction.mobile}
                  onChange={(event) => setCorrection({ ...correction, mobile: event.target.value })}
                />
                <Select
                  label="Department"
                  value={correction.departmentId}
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      departmentId: event.target.value,
                      subDepartmentId: '',
                    })
                  }
                  options={[{ value: '', label: 'Unassigned' }, ...departmentOptions]}
                />
                <Select
                  label="Sub-department"
                  value={correction.subDepartmentId}
                  onChange={(event) =>
                    setCorrection({ ...correction, subDepartmentId: event.target.value })
                  }
                  options={[{ value: '', label: 'None' }, ...subDepartmentOptions]}
                />
                <Input
                  label="Joining date"
                  type="date"
                  value={correction.joiningDate}
                  onChange={(event) =>
                    setCorrection({ ...correction, joiningDate: event.target.value })
                  }
                />
                <Select
                  label="Reporting manager"
                  value={correction.reportingManagerId}
                  onChange={(event) =>
                    setCorrection({ ...correction, reportingManagerId: event.target.value })
                  }
                  options={managerOptions}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Salary (optional)"
                type="number"
                min={0}
                step={100}
                placeholder="e.g. 25000"
                value={salary}
                onChange={(event) => setSalary(event.target.value)}
                hint="Stored on the approved signup record."
              />
            </div>

            <Textarea
              label="Internal note (optional)"
              placeholder="Why this decision was taken — visible to the audit trail only."
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />

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
                icon={<BadgeCheck className="h-4 w-4" />}
                loading={busy === 'approve'}
                disabled={busy !== null}
                onClick={() => review('approve')}
              >
                Approve signup
              </Button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

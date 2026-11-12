import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Input,
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
  useHrDepartments,
  useHrEmployees,
  useInvalidate,
  type HrEmployee,
} from '@/lib/queries';
import { formatBanglaDate } from '@bronee/shared';

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'approved', label: 'Approved' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'declined', label: 'Declined' },
  { value: 'pending', label: 'Pending' },
];

const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'success',
  approved: 'brand',
  suspended: 'danger',
  declined: 'danger',
  pending: 'warning',
};

type EmployeeForm = {
  fullName: string;
  mobile: string;
  employeeCode: string;
  designationLabel: string;
  departmentId: string;
  subDepartmentId: string;
  joiningDate: string;
};

function toForm(employee: HrEmployee): EmployeeForm {
  return {
    fullName: employee.fullName,
    mobile: employee.mobile,
    employeeCode: employee.employeeCode,
    designationLabel: employee.designationLabel,
    departmentId: employee.departmentId ?? '',
    subDepartmentId: employee.subDepartmentId ?? '',
    joiningDate: employee.joiningDate,
  };
}

export default function HrEmployeesPage() {
  const toast = useToast();
  const invalidate = useInvalidate();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const employeesQuery = useHrEmployees(search);
  const departmentsQuery = useHrDepartments();

  const [selected, setSelected] = useState<HrEmployee | null>(null);
  const [form, setForm] = useState<EmployeeForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ employee: HrEmployee; next: string } | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const items = useMemo(() => employeesQuery.data?.items ?? [], [employeesQuery.data]);

  const filtered = useMemo(
    () => (status === 'all' ? items : items.filter((item) => item.status === status)),
    [items, status],
  );

  const departments = departmentsQuery.data?.items ?? [];
  const subDepartments = useMemo(() => {
    const parentId = form?.departmentId ?? '';
    return departments.filter((department) => department.parentId === parentId);
  }, [departments, form?.departmentId]);

  function openDrawer(employee: HrEmployee) {
    setSelected(employee);
    setForm(toForm(employee));
  }

  async function saveEmployee() {
    if (!selected || !form) return;
    if (!form.fullName.trim()) {
      toast.error('Full name is required', 'An employee record must always carry a name.');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        fullName: form.fullName.trim(),
        mobile: form.mobile.trim(),
        employeeCode: form.employeeCode.trim(),
        designationLabel: form.designationLabel.trim(),
        subDepartmentId: form.subDepartmentId || null,
        joiningDate: form.joiningDate,
      };
      if (form.departmentId) body.departmentId = form.departmentId;
      await api.patch(`/hr/employees/${selected.id}`, body);
      toast.success('Employee updated', `${form.fullName.trim()} now has the updated record.`);
      invalidate([['hr', 'employees'], ['hr', 'dashboard']]);
      setSelected(null);
      setForm(null);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The employee record could not be saved.';
      toast.error('Update failed', message);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus() {
    if (!statusTarget) return;
    setStatusBusy(true);
    try {
      await api.post(`/hr/employees/${statusTarget.employee.id}/status`, {
        status: statusTarget.next,
      });
      const suspended = statusTarget.next === 'suspended';
      toast.success(
        suspended ? 'Employee suspended' : 'Employee reinstated',
        `${statusTarget.employee.fullName} is now ${statusTarget.next}.`,
      );
      invalidate([['hr', 'employees'], ['hr', 'dashboard']]);
      setStatusTarget(null);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The account status could not be changed.';
      toast.error('Status change failed', message);
    } finally {
      setStatusBusy(false);
    }
  }

  const departmentOptions = useMemo(
    () => departments.map((department) => ({ value: department.id, label: department.name })),
    [departments],
  );

  const subDepartmentOptions = useMemo(
    () => subDepartments.map((department) => ({ value: department.id, label: department.name })),
    [subDepartments],
  );

  return (
    <div>
      <PageHeader
        title="Employee Management"
        description="Every BRONEE employee record — search, edit and control account access."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-soft ring-1 ring-line">
            <Users className="h-4 w-4 text-brand-600" />
            {filtered.length} shown
          </span>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input
              label="Search employees"
              placeholder="Name, Employee ID, designation or department"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              leading={<Search className="h-4 w-4" />}
              containerClassName="flex-1"
            />
            <div className="sm:w-56">
              <Select
                label="Status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                options={STATUS_FILTERS}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="mt-4">
        {employeesQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No employees match this view"
            description={
              search
                ? 'Try a different search term, or clear the status filter.'
                : 'Once employees are approved their records appear here.'
            }
            icon={<UserRound className="h-5 w-5" />}
            action={
              search || status !== 'all' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchInput('');
                    setStatus('all');
                  }}
                >
                  Clear filters
                </Button>
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TH>Employee</TH>
              <TH>Employee ID</TH>
              <TH>Designation</TH>
              <TH>Department</TH>
              <TH>Joining date</TH>
              <TH>Status</TH>
            </THead>
            <TBody>
              {filtered.map((employee) => (
                <TR key={employee.id} onClick={() => openDrawer(employee)}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={employee.fullName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{employee.fullName}</p>
                        <p className="truncate text-[12px] text-ink-muted">{employee.email}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <span className="font-mono text-[12.5px] font-semibold text-ink-soft">
                      {employee.employeeCode}
                    </span>
                  </TD>
                  <TD>{employee.designationLabel || '—'}</TD>
                  <TD>{employee.departmentName || 'Unassigned'}</TD>
                  <TD>
                    <span className="whitespace-nowrap">
                      {employee.joiningDate ? formatBanglaDate(employee.joiningDate) : '—'}
                    </span>
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[employee.status] ?? 'neutral'} dot>
                      {employee.status}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* -------------------------------------------------------- employee drawer */}
      <Drawer
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setForm(null);
        }}
        title={selected?.fullName ?? 'Employee'}
        width="max-w-xl"
      >
        {selected && form ? (
          <div className="space-y-5">
            <div className="rounded-2xl bg-canvas p-4">
              <div className="flex items-center gap-3">
                <Avatar name={selected.fullName} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-ink">{selected.fullName}</p>
                  <p className="truncate text-[12.5px] text-ink-muted">
                    {selected.employeeCode} · {selected.role}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                  <span className="truncate">{selected.email}</span>
                </div>
                <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                  <span>{selected.mobile || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                  <span>
                    {selected.departmentName || 'Unassigned'}
                    {selected.subDepartmentId ? ' · Sub-department' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                  <span>Joined {formatBanglaDate(selected.joiningDate)}</span>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                Edit record
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Full name"
                  value={form.fullName}
                  onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                  required
                />
                <Input
                  label="Employee ID"
                  value={form.employeeCode}
                  onChange={(event) => setForm({ ...form, employeeCode: event.target.value })}
                />
                <Input
                  label="Designation"
                  value={form.designationLabel}
                  onChange={(event) => setForm({ ...form, designationLabel: event.target.value })}
                />
                <Input
                  label="Mobile"
                  value={form.mobile}
                  onChange={(event) => setForm({ ...form, mobile: event.target.value })}
                />
                <Select
                  label="Department"
                  value={form.departmentId}
                  onChange={(event) =>
                    setForm({ ...form, departmentId: event.target.value, subDepartmentId: '' })
                  }
                  options={[{ value: '', label: 'Unassigned' }, ...departmentOptions]}
                />
                <Select
                  label="Sub-department"
                  value={form.subDepartmentId}
                  onChange={(event) => setForm({ ...form, subDepartmentId: event.target.value })}
                  options={[{ value: '', label: 'None' }, ...subDepartmentOptions]}
                  hint={form.departmentId ? undefined : 'Pick a parent department first'}
                />
                <Input
                  label="Joining date"
                  type="date"
                  value={form.joiningDate}
                  onChange={(event) => setForm({ ...form, joiningDate: event.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant={selected.status === 'suspended' ? 'soft' : 'danger'}
                size="sm"
                icon={selected.status === 'suspended' ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                onClick={() =>
                  setStatusTarget({
                    employee: selected,
                    next: selected.status === 'suspended' ? 'active' : 'suspended',
                  })
                }
              >
                {selected.status === 'suspended' ? 'Reinstate employee' : 'Suspend employee'}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelected(null);
                    setForm(null);
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" loading={saving} onClick={saveEmployee}>
                  Save changes
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        onConfirm={changeStatus}
        loading={statusBusy}
        tone={statusTarget?.next === 'suspended' ? 'danger' : 'primary'}
        title={statusTarget?.next === 'suspended' ? 'Suspend this employee?' : 'Reinstate this employee?'}
        confirmLabel={statusTarget?.next === 'suspended' ? 'Suspend' : 'Reinstate'}
        message={
          statusTarget ? (
            <span className="block">
              {statusTarget.next === 'suspended'
                ? `${statusTarget.employee.fullName} will lose portal access immediately. Attendance, payroll and roster history stay intact.`
                : `${statusTarget.employee.fullName} will regain access to the employee portal.`}
            </span>
          ) : null
        }
      />
    </div>
  );
}

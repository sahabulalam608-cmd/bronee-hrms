import { useMemo, useState } from 'react';
import { Pencil, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDate } from '@/lib/time';
import { formatNumber } from '@/lib/format';
import { approvalTone } from '@/lib/status';
import { Alert, Input, Select } from '@/components/ui/forms';
import { Avatar, Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, FilterBar, SearchInput } from '@/components/ui/data';
import { Modal, useToast } from '@/components/ui/overlay';
import { ACCOUNT_STATUS, SHIFTS } from '@shared/constants';
import type { Department, Employee } from '@shared/types';

type Row<T> = { [K in keyof T]: T[K] };
type EmployeeRow = Row<Employee>;

interface Draft {
  fullName: string;
  mobile: string;
  email: string;
  designation: string;
  departmentId: string;
  departmentName: string;
  subDepartmentId: string;
  subDepartmentName: string;
  shiftCode: string;
  shiftName: string;
  status: string;
  reportingManager: string;
  joiningDate: string;
}

export function EmployeesPage() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [shift, setShift] = useState('');
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: employees, loading, error, reload } = useAsync<Employee[]>(() => api.hrEmployees(), []);
  const { data: departments } = useAsync<Department[]>(() => api.hrDepartments(), []);

  const departmentOptions = useMemo(() => {
    if (departments?.length) {
      return departments
        .filter((dept) => !dept.parentId)
        .map((dept) => ({ value: dept.id, label: dept.name }));
    }
    const seen = new Map<string, string>();
    for (const employee of employees ?? []) {
      seen.set(employee.departmentId, employee.departmentName);
    }
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [departments, employees]);

  const subDepartmentOptions = useMemo(() => {
    if (!draft) return [];
    if (departments?.length) {
      return departments
        .filter((dept) => dept.parentId === draft.departmentId)
        .map((dept) => ({ value: dept.id, label: dept.name }));
    }
    const seen = new Map<string, string>();
    for (const employee of employees ?? []) {
      if (employee.departmentId !== draft.departmentId || !employee.subDepartmentId) continue;
      seen.set(employee.subDepartmentId, employee.subDepartmentName ?? '');
    }
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [departments, employees, draft]);

  const rows = useMemo<EmployeeRow[]>(() => {
    const all = (employees ?? []) as EmployeeRow[];
    const needle = query.trim().toLowerCase();
    return all.filter((employee) => {
      if (department && employee.departmentId !== department) return false;
      if (status && employee.status !== status) return false;
      if (shift && employee.shiftCode !== shift) return false;
      if (!needle) return true;
      return [employee.fullName, employee.employeeId, employee.email, employee.designation]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [employees, query, department, status, shift]);

  const stats = useMemo(() => {
    const all = employees ?? [];
    return {
      total: all.length,
      active: all.filter((employee) => employee.status === 'Active').length,
      departments: new Set(all.map((employee) => employee.departmentName)).size,
      shifts: new Set(all.map((employee) => employee.shiftCode)).size,
    };
  }, [employees]);

  function openEdit(employee: EmployeeRow) {
    setEditing(employee);
    setDraft({
      fullName: employee.fullName,
      mobile: employee.mobile,
      email: employee.email,
      designation: employee.designation,
      departmentId: employee.departmentId,
      departmentName: employee.departmentName,
      subDepartmentId: employee.subDepartmentId ?? '',
      subDepartmentName: employee.subDepartmentName ?? '',
      shiftCode: employee.shiftCode,
      shiftName: employee.shiftName,
      status: employee.status,
      reportingManager: employee.reportingManager ?? '',
      joiningDate: employee.joiningDate,
    });
  }

  async function save() {
    if (!editing || !draft) return;
    if (!draft.fullName.trim() || !draft.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    const departmentEntry = departmentOptions.find((option) => option.value === draft.departmentId);
    const subEntry = subDepartmentOptions.find((option) => option.value === draft.subDepartmentId);
    const shiftEntry = SHIFTS.find((item) => item.code === draft.shiftCode);

    setSaving(true);
    try {
      await api.updateEmployee(editing.id, {
        fullName: draft.fullName.trim(),
        mobile: draft.mobile.trim(),
        email: draft.email.trim(),
        designation: draft.designation.trim(),
        departmentId: draft.departmentId,
        departmentName: departmentEntry?.label ?? draft.departmentName,
        subDepartmentId: subEntry?.value ?? null,
        subDepartmentName: subEntry?.label ?? null,
        shiftCode: shiftEntry?.code ?? editing.shiftCode,
        shiftName: shiftEntry?.name ?? editing.shiftName,
        status: draft.status as Employee['status'],
        reportingManager: draft.reportingManager.trim() || null,
        joiningDate: draft.joiningDate,
      });
      toast.success('Employee updated', `${draft.fullName}'s record has been saved.`);
      setEditing(null);
      setDraft(null);
      reload();
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      key: 'fullName',
      header: 'Employee',
      render: (employee: EmployeeRow) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={employee.fullName} size={30} />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-ink">{employee.fullName}</p>
            <p className="truncate text-[11.5px] text-ink-faint">{employee.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'employeeId', header: 'Employee ID' },
    { key: 'departmentName', header: 'Department' },
    { key: 'subDepartmentName', header: 'Sub-department' },
    { key: 'designation', header: 'Designation' },
    {
      key: 'shiftName',
      header: 'Shift',
      render: (employee: EmployeeRow) => (
        <span className="text-[13px] text-ink-soft">{employee.shiftName.split(' (')[0]}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (employee: EmployeeRow) => (
        <Badge tone={approvalTone(employee.status)}>{employee.status}</Badge>
      ),
    },
    {
      key: 'joiningDate',
      header: 'Joined',
      render: (employee: EmployeeRow) => <span className="text-[13px] text-ink-muted">{formatDate(employee.joiningDate)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (employee: EmployeeRow) => (
        <button
          type="button"
          className="btn-icon h-8 w-8"
          onClick={() => openEdit(employee)}
          aria-label={`Edit ${employee.fullName}`}
        >
          <Pencil size={15} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employee Management"
        subtitle="Employee records, department placement, shift assignment and account status."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total employees" value={formatNumber(stats.total)} icon={<Users size={17} />} />
        <StatCard
          label="Active accounts"
          value={formatNumber(stats.active)}
          tone="ok"
          hint="Can sign in to the portal"
        />
        <StatCard label="Departments covered" value={formatNumber(stats.departments)} tone="info" />
        <StatCard label="Shifts in use" value={formatNumber(stats.shifts)} tone="warn" />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load employees">
          {error}
        </Alert>
      )}

      <SectionCard
        title="Employee directory"
        subtitle={`${rows.length} of ${stats.total} employees shown`}
        padded={false}
      >
        <div className="border-b border-line p-4">
          <FilterBar>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search by name, ID, email or designation"
              className="min-w-[240px] flex-1"
            />
            <div className="w-[190px]">
              <Select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="All departments"
                options={departmentOptions}
                aria-label="Filter by department"
              />
            </div>
            <div className="w-[160px]">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="All statuses"
                options={ACCOUNT_STATUS.map((value) => ({ value, label: value }))}
                aria-label="Filter by status"
              />
            </div>
            <div className="w-[170px]">
              <Select
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                placeholder="All shifts"
                options={SHIFTS.filter((item) => item.code !== 'OFF').map((item) => ({ value: item.code, label: item.shortName }))}
                aria-label="Filter by shift"
              />
            </div>
          </FilterBar>
        </div>

        <DataTable<EmployeeRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No employees match this filter"
          emptyDescription="Adjust the search or filter values to see more employees."
          emptyIcon={<Users size={22} />}
        />
      </SectionCard>

      <Modal
        open={Boolean(editing && draft)}
        onClose={() => {
          setEditing(null);
          setDraft(null);
        }}
        title="Edit employee"
        description={editing ? `${editing.fullName} · ${editing.employeeId}` : undefined}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setEditing(null);
                setDraft(null);
              }}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full name"
              value={draft.fullName}
              required
              onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
            />
            <Input
              label="Employee ID"
              value={editing?.employeeId ?? ''}
              readOnly
              hint="Employee IDs cannot be changed."
            />
            <Input
              label="Mobile"
              value={draft.mobile}
              onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
            />
            <Input
              label="Official email"
              type="email"
              value={draft.email}
              required
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
            <Input
              label="Designation"
              value={draft.designation}
              onChange={(e) => setDraft({ ...draft, designation: e.target.value })}
            />
            <Select
              label="Department"
              value={draft.departmentId}
              options={departmentOptions}
              onChange={(e) => {
                const next = e.target.value;
                const entry = departmentOptions.find((option) => option.value === next);
                setDraft({
                  ...draft,
                  departmentId: next,
                  departmentName: entry?.label ?? '',
                  subDepartmentId: '',
                  subDepartmentName: '',
                });
              }}
            />
            <Select
              label="Sub-department"
              value={draft.subDepartmentId}
              placeholder="Not applicable"
              options={subDepartmentOptions}
              onChange={(e) => {
                const next = e.target.value;
                const entry = subDepartmentOptions.find((option) => option.value === next);
                setDraft({
                  ...draft,
                  subDepartmentId: next,
                  subDepartmentName: entry?.label ?? '',
                });
              }}
            />
            <Select
              label="Shift"
              value={draft.shiftCode}
              options={SHIFTS.filter((item) => item.code !== 'OFF').map((item) => ({
                value: item.code,
                label: item.name,
              }))}
              onChange={(e) => {
                const next = e.target.value;
                const entry = SHIFTS.find((item) => item.code === next);
                setDraft({ ...draft, shiftCode: next, shiftName: entry?.name ?? '' });
              }}
            />
            <Select
              label="Account status"
              value={draft.status}
              options={ACCOUNT_STATUS.map((value) => ({ value, label: value }))}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            />
            <Input
              label="Reporting manager"
              value={draft.reportingManager}
              onChange={(e) => setDraft({ ...draft, reportingManager: e.target.value })}
            />
            <Input
              label="Joining date"
              type="date"
              value={draft.joiningDate}
              onChange={(e) => setDraft({ ...draft, joiningDate: e.target.value })}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

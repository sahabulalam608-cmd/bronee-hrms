import { useMemo, useState } from 'react';
import { BadgeCheck, Coins, Lock, Send, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { currentMonthKey, formatMonthKey } from '@/lib/time';
import { formatMoney, formatNumber } from '@/lib/format';
import { Alert, Select } from '@/components/ui/forms';
import { Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, FilterBar } from '@/components/ui/data';
import { ConfirmDialog, useToast } from '@/components/ui/overlay';
import type { Employee, SalaryRecord } from '@shared/types';

type Row<T> = { [K in keyof T]: T[K] };
type PayrollRow = Row<SalaryRecord> & {
  employeeName: string;
  employeeCode: string;
  departmentName: string;
};

export function PayrollPage() {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonthKey());
  const [confirm, setConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const { data, loading, error, reload } = useAsync(() => api.hrPayroll(month), [month]);
  const { data: employees } = useAsync<Employee[]>(() => api.hrEmployees(), []);

  const months = useMemo(() => {
    const list: string[] = [];
    const base = new Date();
    for (let i = 0; i < 12; i += 1) {
      const date = new Date(base.getFullYear(), base.getMonth() - i, 1);
      list.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    return list;
  }, []);

  const rows = useMemo<PayrollRow[]>(() => {
    const employeesById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
    return ((data ?? []) as SalaryRecord[]).map((record) => {
      const employee = employeesById.get(record.employeeId);
      return {
        ...record,
        employeeName: employee?.fullName ?? 'Unknown employee',
        employeeCode: employee?.employeeId ?? '—',
        departmentName: employee?.departmentName ?? '—',
      };
    });
  }, [data, employees]);

  const totals = useMemo(
    () => ({
      basic: rows.reduce((sum, row) => sum + row.basicSalary, 0),
      allowances: rows.reduce((sum, row) => sum + row.allowances, 0),
      overtime: rows.reduce((sum, row) => sum + row.overtimePayment, 0),
      bonus: rows.reduce((sum, row) => sum + (row.bonusAmount ?? 0), 0),
      deductions: rows.reduce((sum, row) => sum + row.deductions, 0),
      net: rows.reduce((sum, row) => sum + row.netPayable, 0),
      published: rows.filter((row) => row.published).length,
    }),
    [rows],
  );

  async function publish() {
    setPublishing(true);
    try {
      const result = await api.publishPayroll(month);
      toast.success(
        'Payroll published',
        `${result.published} payslip(s) for ${formatMonthKey(month)} are now visible to the employees.`,
      );
      setConfirm(false);
      reload();
    } catch (err) {
      toast.error('Publish failed', err instanceof Error ? err.message : undefined);
    } finally {
      setPublishing(false);
    }
  }

  const columns = [
    {
      key: 'employeeName',
      header: 'Employee',
      render: (row: PayrollRow) => (
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium text-ink">{row.employeeName}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{row.employeeCode}</p>
        </div>
      ),
    },
    { key: 'departmentName', header: 'Department' },
    {
      key: 'basicSalary',
      header: 'Basic',
      align: 'right' as const,
      render: (row: PayrollRow) => (
        <span className="font-mono text-[13px] tabular-nums text-ink-soft">{formatMoney(row.basicSalary)}</span>
      ),
    },
    {
      key: 'allowances',
      header: 'Allowances',
      align: 'right' as const,
      render: (row: PayrollRow) => (
        <span className="font-mono text-[13px] tabular-nums text-ink-soft">{formatMoney(row.allowances)}</span>
      ),
    },
    {
      key: 'overtimePayment',
      header: 'Overtime',
      align: 'right' as const,
      render: (row: PayrollRow) => (
        <span className="font-mono text-[13px] tabular-nums text-ink-soft">{formatMoney(row.overtimePayment)}</span>
      ),
    },
    {
      key: 'bonusAmount',
      header: 'Bonus',
      align: 'right' as const,
      render: (row: PayrollRow) => (
        <span className="font-mono text-[13px] tabular-nums text-ink-soft">{formatMoney(row.bonusAmount ?? 0)}</span>
      ),
    },
    {
      key: 'deductions',
      header: 'Deductions',
      align: 'right' as const,
      render: (row: PayrollRow) => (
        <span className="font-mono text-[13px] tabular-nums text-ink-soft">{formatMoney(row.deductions)}</span>
      ),
    },
    {
      key: 'netPayable',
      header: 'Net payable',
      align: 'right' as const,
      render: (row: PayrollRow) => (
        <span className="font-mono text-[13.5px] font-semibold tabular-nums text-ink">
          {formatMoney(row.netPayable)}
        </span>
      ),
    },
    {
      key: 'published',
      header: 'Status',
      render: (row: PayrollRow) => (
        <Badge tone={row.published ? 'ok' : 'warn'}>{row.published ? 'Published' : 'Draft'}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payroll Management"
        subtitle="Monthly payroll with overtime payment, attendance bonus, deductions and net payable."
        actions={
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => setConfirm(true)}
            disabled={loading || rows.length === 0 || totals.published === rows.length}
          >
            <Send size={15} />
            {totals.published === rows.length && rows.length > 0
              ? 'Fully published'
              : `Publish payroll`}
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total net payable"
          value={formatMoney(totals.net)}
          tone="brand"
          icon={<Wallet size={17} />}
          hint={`${formatMonthKey(month)} · ${rows.length} employees`}
        />
        <StatCard
          label="Basic salary"
          value={formatMoney(totals.basic)}
          tone="info"
          icon={<Coins size={17} />}
        />
        <StatCard
          label="Overtime payment"
          value={formatMoney(totals.overtime)}
          tone="warn"
          hint="Verified overtime only"
        />
        <StatCard
          label="Attendance bonus"
          value={formatMoney(totals.bonus)}
          tone="ok"
          icon={<BadgeCheck size={17} />}
          hint={`${formatNumber(totals.published)} of ${rows.length} published`}
        />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load payroll">
          {error}
        </Alert>
      )}

      <SectionCard
        title="Payroll sheet"
        subtitle={`${formatMonthKey(month)} · ${rows.length} payslips`}
        padded={false}
      >
        <div className="border-b border-line p-4">
          <FilterBar>
            <div className="w-[175px]">
              <Select
                label="Month"
                value={month}
                options={months.map((value) => ({ value, label: formatMonthKey(value) }))}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <p className="flex items-center gap-1.5 pb-2 text-[12px] text-ink-faint">
              <Lock size={13} />
              Total deductions {formatMoney(totals.deductions)} · Total allowances {formatMoney(totals.allowances)}
            </p>
          </FilterBar>
        </div>
        <DataTable<PayrollRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No payroll records for this month"
          emptyDescription="Payroll is generated from the approved attendance, overtime and bonus data."
          emptyIcon={<Wallet size={22} />}
        />
      </SectionCard>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={publish}
        title="Publish this payroll?"
        confirmLabel="Publish payroll"
        loading={publishing}
        message={
          <>
            {rows.length - totals.published} payslip(s) for {formatMonthKey(month)} will be published. Each
            employee receives a Salary Published notification, and the figures stay in this portal.
          </>
        }
      />
    </div>
  );
}

import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  Banknote,
  Calculator,
  FileText,
  Pencil,
  Send,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  useToast,
  type BadgeTone,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useHrPayroll, useInvalidate } from '@/lib/queries';
import { banglaMonthLabel, dhakaDateKey } from '@bronee/shared';
import { formatBDT, formatNumber } from '@/lib/utils';

type PayrollRow = NonNullable<ReturnType<typeof useHrPayroll>['data']>['items'][number];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'warning',
  published: 'success',
};

type EditForm = {
  basicSalary: string;
  allowances: string;
  overtimeAmount: string;
  deductions: string;
  notes: string;
};

export default function HrPayrollPage() {
  const toast = useToast();
  const invalidate = useInvalidate();

  const todayKey = dhakaDateKey(new Date());
  const [year, setYear] = useState(Number(todayKey.slice(0, 4)));
  const [month, setMonth] = useState(Number(todayKey.slice(5, 7)));

  const payrollQuery = useHrPayroll(year, month);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [editing, setEditing] = useState<PayrollRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [busy, setBusy] = useState(false);

  const items = payrollQuery.data?.items ?? [];
  const totals = payrollQuery.data?.totals;
  const allPublished = items.length > 0 && items.every((item) => item.status === 'published');

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const list: number[] = [];
    for (let offset = -3; offset <= 1; offset += 1) list.push(current + offset);
    return list;
  }, []);

  const monthOptions = useMemo(
    () => MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label })),
    [],
  );

  async function generatePayroll() {
    setBusy(true);
    try {
      const response = await api.post<{ records: number }>('/hr/compensation/payroll/generate', {
        year,
        month,
      });
      toast.success(
        'Payroll generated',
        `${response.records ?? 0} draft record${(response.records ?? 0) === 1 ? '' : 's'} ready for review.`,
      );
      invalidate([['hr', 'payroll'], ['hr', 'dashboard']]);
      setGenerateOpen(false);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'Payroll could not be generated.';
      toast.error('Generation failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function publishPayroll() {
    setBusy(true);
    try {
      const response = await api.post<{ published: number }>('/hr/compensation/payroll/publish', {
        year,
        month,
      });
      toast.success(
        'Payslips published',
        `${response.published ?? 0} employee${
          (response.published ?? 0) === 1 ? '' : 's'
        } notified of their payslip.`,
      );
      invalidate([['hr', 'payroll'], ['hr', 'dashboard']]);
      setPublishOpen(false);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'The payroll run could not be published.';
      toast.error('Publish failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function saveRecord() {
    if (!editing || !editForm) return;
    setBusy(true);
    try {
      await api.patch(`/hr/compensation/payroll/${editing.id}`, {
        basicSalary: Number(editForm.basicSalary) || 0,
        allowances: Number(editForm.allowances) || 0,
        overtimeAmount: Number(editForm.overtimeAmount) || 0,
        deductions: Number(editForm.deductions) || 0,
        notes: editForm.notes.trim() || undefined,
      });
      toast.success('Payroll record updated', `${editing.employeeName}'s record was saved.`);
      invalidate([['hr', 'payroll'], ['hr', 'dashboard']]);
      setEditing(null);
      setEditForm(null);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The payroll record could not be saved.';
      toast.error('Update failed', message);
    } finally {
      setBusy(false);
    }
  }

  function openEdit(row: PayrollRow) {
    setEditing(row);
    setEditForm({
      basicSalary: String(row.basicSalary),
      allowances: String(row.allowances),
      overtimeAmount: String(row.overtimeAmount),
      deductions: String(row.deductions),
      notes: row.notes ?? '',
    });
  }

  return (
    <div>
      <PageHeader
        title="Payroll Management"
        description="Generate monthly payroll, fine-tune individual records and publish payslips to employees."
        action={
          <div className="flex flex-wrap gap-2">
            <Button icon={<Calculator className="h-4 w-4" />} onClick={() => setGenerateOpen(true)}>
              Generate payroll
            </Button>
            <Button
              variant="outline"
              icon={<Send className="h-4 w-4" />}
              onClick={() => setPublishOpen(true)}
              disabled={items.length === 0}
            >
              Publish payslips
            </Button>
          </div>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-48">
              <Select
                label="Month"
                value={String(month)}
                onChange={(event) => setMonth(Number(event.target.value))}
                options={monthOptions}
              />
            </div>
            <div className="sm:w-32">
              <Select
                label="Year"
                value={String(year)}
                onChange={(event) => setYear(Number(event.target.value))}
                options={yearOptions.map((value) => ({ value: String(value), label: String(value) }))}
              />
            </div>
            <p className="pb-2.5 text-[13px] font-semibold text-ink-soft">
              {banglaMonthLabel(year, month)}
            </p>
          </div>
        </CardBody>
      </Card>

      {/* --------------------------------------------------------- totals strip */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: 'Basic salary', value: totals?.basicSalary ?? 0, icon: Wallet },
          { label: 'Allowances + overtime', value: (totals?.overtime ?? 0), icon: Banknote },
          { label: 'Bonus', value: totals?.bonus ?? 0, icon: BadgeCheck },
          { label: 'Deductions', value: totals?.deductions ?? 0, icon: FileText },
          { label: 'Net payable', value: totals?.netPayable ?? 0, icon: Calculator },
        ].map((tile) => {
          const Icon = tile.icon;
          return (
            <Card key={tile.label} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                    {tile.label}
                  </p>
                  <p className="mt-1.5 text-[17px] font-extrabold tracking-[-0.02em] text-ink">
                    {formatBDT(tile.value)}
                  </p>
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4">
        <CardHeader
          title={`Payroll run · ${banglaMonthLabel(year, month)}`}
          subtitle={
            allPublished
              ? 'This run is published. Records are locked until the next run is generated.'
              : 'Draft records can be adjusted before publishing.'
          }
          icon={<Calculator className="h-4 w-4" />}
        />
        {payrollQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No payroll run for this month"
            description="Generate a draft payroll run to bring in attendance, overtime and bonus figures."
            icon={<Calculator className="h-5 w-5" />}
            action={
              <Button icon={<Calculator className="h-4 w-4" />} onClick={() => setGenerateOpen(true)}>
                Generate payroll
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <TH>Employee</TH>
              <TH align="right">Basic</TH>
              <TH align="right">Allowances</TH>
              <TH align="right">Overtime</TH>
              <TH align="right">Bonus</TH>
              <TH align="right">Deductions</TH>
              <TH align="right">Net payable</TH>
              <TH align="right">Late days</TH>
              <TH>Status</TH>
              <TH align="right">Edit</TH>
            </THead>
            <TBody>
              {items.map((record) => (
                <TR key={record.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={record.employeeName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{record.employeeName}</p>
                        <p className="truncate text-[11.5px] text-ink-muted">
                          {record.employeeCode}
                          {record.department ? ` · ${record.department}` : ''}
                        </p>
                      </div>
                    </div>
                  </TD>
                  <TD align="right" className="whitespace-nowrap">
                    {formatBDT(record.basicSalary)}
                  </TD>
                  <TD align="right" className="whitespace-nowrap">
                    {formatBDT(record.allowances)}
                  </TD>
                  <TD align="right" className="whitespace-nowrap">
                    {formatBDT(record.overtimeAmount)}
                  </TD>
                  <TD align="right" className="whitespace-nowrap">
                    {formatBDT(record.bonusAmount)}
                  </TD>
                  <TD align="right" className="whitespace-nowrap">
                    {formatBDT(record.deductions)}
                  </TD>
                  <TD align="right" className="whitespace-nowrap font-semibold text-ink">
                    {formatBDT(record.netPayable)}
                  </TD>
                  <TD align="right">{formatNumber(record.lateDays)}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[record.status] ?? 'neutral'} dot>
                      {record.status}
                    </Badge>
                  </TD>
                  <TD align="right">
                    <Button
                      size="xs"
                      variant={record.status === 'published' ? 'ghost' : 'outline'}
                      disabled={record.status === 'published'}
                      icon={<Pencil className="h-3.5 w-3.5" />}
                      onClick={() => openEdit(record)}
                    >
                      Adjust
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* -------------------------------------------------------- generate modal */}
      <Modal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title="Generate payroll"
        description={`Create a draft run for ${banglaMonthLabel(year, month)}.`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setGenerateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={generatePayroll}>
              Generate run
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-soft">
          The run pulls attendance, approved overtime and the attendance bonus snapshot for every
          employee. Basic salary and allowances are carried over from the previous run so you can
          adjust them afterwards. Existing records for the month are updated, never duplicated.
        </p>
      </Modal>

      {/* ---------------------------------------------------------- publish modal */}
      <ConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={publishPayroll}
        loading={busy}
        title="Publish payslips?"
        confirmLabel="Publish payslips"
        message={
          <span className="block">
            Every employee in this run will be notified that their {banglaMonthLabel(year, month)}{' '}
            payslip is available in the portal. Published records can no longer be edited.
          </span>
        }
      />

      {/* ------------------------------------------------------------ edit modal */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Adjust payroll record"
        description={editing ? `${editing.employeeName} · ${banglaMonthLabel(year, month)}` : undefined}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={saveRecord}>
              Save record
            </Button>
          </>
        }
      >
        {editForm ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Basic salary"
              type="number"
              min={0}
              step={100}
              value={editForm.basicSalary}
              onChange={(event) => setEditForm({ ...editForm, basicSalary: event.target.value })}
            />
            <Input
              label="Allowances"
              type="number"
              min={0}
              step={100}
              value={editForm.allowances}
              onChange={(event) => setEditForm({ ...editForm, allowances: event.target.value })}
            />
            <Input
              label="Overtime amount"
              type="number"
              min={0}
              step={50}
              value={editForm.overtimeAmount}
              onChange={(event) => setEditForm({ ...editForm, overtimeAmount: event.target.value })}
            />
            <Input
              label="Deductions"
              type="number"
              min={0}
              step={50}
              value={editForm.deductions}
              onChange={(event) => setEditForm({ ...editForm, deductions: event.target.value })}
            />
            <div className="sm:col-span-2">
              <Textarea
                label="Notes"
                placeholder="Reason for the adjustment — shown on the payroll record."
                value={editForm.notes}
                onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

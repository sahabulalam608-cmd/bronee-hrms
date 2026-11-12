import { useMemo, useState } from 'react';
import { CalendarRange, Download, FileSpreadsheet, Info } from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Select,
  useToast,
} from '@/components/ui';
import { ApiError, downloadFile } from '@/lib/api';
import { banglaMonthLabel } from '@bronee/shared';
import { cn } from '@/lib/utils';

type ReportKind = 'attendance' | 'leave' | 'tasks' | 'payroll' | 'roster';

type ReportDefinition = {
  kind: ReportKind;
  title: string;
  description: string;
  columns: string[];
  scope: 'Monthly' | 'All time';
};

const REPORTS: ReportDefinition[] = [
  {
    kind: 'attendance',
    title: 'Attendance report',
    description:
      'Daily punch records for the selected month with working and break minutes, late status and the verification outcome for every session.',
    columns: [
      'Date',
      'Employee ID',
      'Employee name',
      'Department',
      'Punch in',
      'Clock out',
      'Working minutes',
      'Break minutes',
      'Late status',
      'Attendance',
      'Verification',
    ],
    scope: 'Monthly',
  },
  {
    kind: 'leave',
    title: 'Leave report',
    description:
      'Every leave request raised in the selected month with its type, duration, approval status and the employee reason.',
    columns: [
      'Employee ID',
      'Employee name',
      'Leave type',
      'From',
      'To',
      'Days',
      'Status',
      'Reason',
    ],
    scope: 'Monthly',
  },
  {
    kind: 'tasks',
    title: 'Task report',
    description:
      'The full task register with priority, dates, completion state, pending days, overdue flag, notes and reference links.',
    columns: [
      'Task ID',
      'Task name',
      'Department',
      'Assigned employee',
      'Priority',
      'Start date',
      'Due date',
      'Status',
      'Complete date',
      'Pending days',
      'Overdue',
      'Notes',
      'Reference link',
    ],
    scope: 'All time',
  },
  {
    kind: 'payroll',
    title: 'Payroll report',
    description:
      'The payroll run for the selected month with basic pay, allowances, overtime, bonus, deductions and the net payable amount.',
    columns: [
      'Employee ID',
      'Employee name',
      'Department',
      'Basic',
      'Allowances',
      'Overtime',
      'Bonus',
      'Deductions',
      'Net payable',
      'Late days',
      'Status',
    ],
    scope: 'Monthly',
  },
  {
    kind: 'roster',
    title: 'Roster report',
    description:
      'Every published roster entry across all versions with the roster version, shift assignment and off-day mapping.',
    columns: [
      'Roster ID',
      'Version',
      'Employee ID',
      'Employee name',
      'Date',
      'Off day',
      'Publish status',
    ],
    scope: 'All time',
  },
];

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

export default function HrReportsPage() {
  const toast = useToast();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [busy, setBusy] = useState<ReportKind | null>(null);

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

  async function download(kind: ReportKind) {
    setBusy(kind);
    try {
      const filename = `${kind}-${year}-${String(month).padStart(2, '0')}.csv`;
      await downloadFile(`/hr/system/reports/${kind}`, filename, { year, month });
      toast.success('Report downloaded', `${filename} is on the way.`);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The report could not be downloaded.';
      toast.error('Download failed', message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reports & Export"
        description="Download the workforce data you need as CSV for finance, audit and management reporting."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[12.5px] font-semibold text-ink-soft ring-1 ring-line">
            <FileSpreadsheet className="h-4 w-4 text-brand-600" />
            {REPORTS.length} reports
          </span>
        }
      />

      <Card>
        <CardHeader
          title="Reporting period"
          subtitle="Monthly reports respect the selected period. All-time reports always export everything."
          icon={<CalendarRange className="h-4 w-4" />}
        />
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

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {REPORTS.map((report) => (
          <Card key={report.kind} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-ink">{report.title}</p>
                <Badge tone={report.scope === 'Monthly' ? 'brand' : 'neutral'} className="mt-1.5">
                  {report.scope}
                </Badge>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <FileSpreadsheet className="h-4 w-4" />
              </span>
            </div>

            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">{report.description}</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {report.columns.map((column) => (
                <span
                  key={column}
                  className="rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-ink-muted"
                >
                  {column}
                </span>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
              <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-muted">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                Exported as UTF-8 CSV with a Bangla-friendly BOM.
              </p>
              <Button
                size="sm"
                variant="outline"
                icon={<Download className="h-4 w-4" />}
                loading={busy === report.kind}
                disabled={busy !== null}
                onClick={() => download(report.kind)}
                className={cn('shrink-0')}
              >
                Download CSV
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

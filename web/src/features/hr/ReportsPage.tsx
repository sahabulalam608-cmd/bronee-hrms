import { useMemo, useState } from 'react';
import { Download, FileBarChart, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatNumber } from '@/lib/format';
import { Alert } from '@/components/ui/forms';
import { PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, FilterBar, SearchInput } from '@/components/ui/data';
import { useToast } from '@/components/ui/overlay';

type ReportKind = 'attendance' | 'leave' | 'payroll' | 'roster' | 'task';

const KINDS: { value: ReportKind; label: string; description: string }[] = [
  {
    value: 'attendance',
    label: 'Attendance',
    description: 'Punch times, working hours, attendance status and late status per employee and day.',
  },
  {
    value: 'leave',
    label: 'Leave',
    description: 'Leave applications with type, period, days, status and the final review reason.',
  },
  {
    value: 'payroll',
    label: 'Payroll',
    description: 'Basic salary, allowances, overtime, bonus, deductions and net payable per employee.',
  },
  {
    value: 'roster',
    label: 'Roster',
    description: 'Roster ID, version, employee, date, assigned shift and off day.',
  },
  {
    value: 'task',
    label: 'Task',
    description: 'Task ID, name, department, employee, priority, dates, status, pending days and reference link.',
  },
];

export function ReportsPage() {
  const toast = useToast();
  const [kind, setKind] = useState<ReportKind>('attendance');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data, loading, error, reload } = useAsync(() => api.report(kind), [kind]);

  const active = KINDS.find((item) => item.value === kind)!;

  const rows = useMemo(() => {
    const source = data?.rows ?? [];
    const objects = source.map((row) => {
      const record: Record<string, string | number> = {};
      (data?.columns ?? []).forEach((column, index) => {
        record[column] = row[index] ?? '';
      });
      return record;
    });
    const needle = query.trim().toLowerCase();
    if (!needle) return objects;
    return objects.filter((record) =>
      Object.values(record).join(' ').toLowerCase().includes(needle),
    );
  }, [data, query]);

  const columns = useMemo(
    () =>
      (data?.columns ?? []).map((column) => ({
        key: column,
        header: column,
        render: (row: Record<string, string | number>) => {
          const value = row[column];
          return typeof value === 'number' ? (
            <span className="font-mono text-[13px] tabular-nums text-ink-soft">{value}</span>
          ) : (
            <span className="text-[13px] text-ink-soft">{String(value)}</span>
          );
        },
      })),
    [data],
  );

  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await api.exportReport(kind);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bronee-${kind}-report.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Report exported', `${active.label} report downloaded as CSV.`);
    } catch (err) {
      toast.error('Export failed', err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports & Export"
        subtitle="Preview and export attendance, leave, payroll, roster and task reports as CSV."
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={reload}>
              <RefreshCw size={15} />
              Refresh
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={exportCsv}
              disabled={exporting || (data?.rows.length ?? 0) === 0}
            >
              <Download size={15} />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Report type"
          value={active.label}
          tone="brand"
          icon={<FileBarChart size={17} />}
          hint="Preview and export the same dataset"
        />
        <StatCard label="Rows" value={formatNumber(data?.rows.length ?? 0)} icon={<FileSpreadsheet size={17} />} />
        <StatCard
          label="Columns"
          value={formatNumber(data?.columns.length ?? 0)}
          tone="info"
          hint={`${rows.length} row(s) shown after the search filter`}
        />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load the report">
          {error}
        </Alert>
      )}

      <SectionCard title="Report" subtitle={active.description}>
        <FilterBar className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            {KINDS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`btn-secondary btn-sm ${kind === item.value ? 'ring-2 ring-brand-500' : ''}`}
                onClick={() => setKind(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Filter rows"
            className="min-w-[220px] flex-1"
          />
        </FilterBar>

        <DataTable<Record<string, string | number>>
          columns={columns}
          rows={rows}
          rowKey={(_row, index) => String(index)}
          loading={loading}
          emptyTitle="No report data"
          emptyDescription="This report has no rows for the current period."
          emptyIcon={<FileBarChart size={22} />}
        />
      </SectionCard>

      <p className="text-[12px] text-ink-faint">
        Exported files contain the same columns as the preview. Reports are generated by the backend, so the
        values always match the audited records.
      </p>
    </div>
  );
}

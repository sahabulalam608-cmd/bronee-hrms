import { useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  RefreshCw,
  ShieldCheck,
  Table2,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
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
import { useHrSheetsStatus, useHrSyncHistory, useInvalidate } from '@/lib/queries';
import { formatDhakaDateTime } from '@bronee/shared';
import { cn, relativeTime } from '@/lib/utils';

type SheetKey = 'task' | 'roster' | 'main';

const SYNC_TONE: Record<string, BadgeTone> = {
  success: 'success',
  failed: 'danger',
  running: 'warning',
};

export default function HrSheetsPage() {
  const toast = useToast();
  const invalidate = useInvalidate();

  const statusQuery = useHrSheetsStatus();
  const historyQuery = useHrSyncHistory();
  const [busySheet, setBusySheet] = useState<SheetKey | null>(null);

  const status = statusQuery.data;

  async function sync(sheet: SheetKey) {
    setBusySheet(sheet);
    try {
      const response = await api.post<{ synced: boolean; rows: number; warning: string | null }>(
        '/hr/sheets/sync',
        { sheet },
      );
      if (response.warning) {
        toast.warning('Sync completed with a warning', response.warning);
      } else {
        toast.success('Sync complete', `${response.rows ?? 0} row(s) pushed to Google Sheets.`);
      }
      invalidate([['hr', 'sheets']]);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'The sync could not be completed.';
      toast.error('Sync failed', message);
    } finally {
      setBusySheet(null);
    }
  }

  const sheets: Array<{
    key: SheetKey;
    title: string;
    description: string;
    url: string | undefined;
    tabs: string[];
    id: string | undefined;
  }> = [
    {
      key: 'task',
      title: 'Task management sheet',
      description: 'Task register, priorities, deadlines and assignment.',
      url: status?.sheets.taskManagement.url,
      tabs: status?.sheets.taskManagement.tabs ?? [],
      id: status?.sheets.taskManagement.id,
    },
    {
      key: 'roster',
      title: 'Roster sheet (main HRMS)',
      description: 'Published roster entries with shift and off-day mapping.',
      url: status?.sheets.mainHrms.url,
      tabs: (status?.sheets.mainHrms.tabs ?? []).filter(
        (tab) => tab.toLowerCase() === 'roster',
      ),
      id: status?.sheets.mainHrms.id,
    },
    {
      key: 'main',
      title: 'Main HRMS sheet',
      description: 'Employee register used for HR reporting and reconciliation.',
      url: status?.sheets.mainHrms.url,
      tabs: status?.sheets.mainHrms.tabs ?? [],
      id: status?.sheets.mainHrms.id,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Google Sheets Integration"
        description="A controlled export layer for the BRONEE workforce — D1 stays the system of record."
        action={
          <Badge tone={status?.connected ? ('success' as BadgeTone) : ('warning' as BadgeTone)} dot>
            {status?.connected ? 'Connected' : 'Not configured'}
          </Badge>
        }
      />

      {/* ------------------------------------------------------- primary data note */}
      <Card className="border-brand-200 bg-brand-50/50 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
          <div className="min-w-0">
            <p className="text-[13.5px] font-bold text-brand-800">
              D1 is the primary database — Google Sheets is an integration layer only
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
              Every attendance record, roster entry and payroll figure is written to D1 first and
              remains authoritative. Sheets receive a read-only, sanitised export for reporting.
              Service-account credentials are stored as platform secrets and are{' '}
              <span className="font-semibold text-ink">never</span> written into a spreadsheet.
            </p>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------- connection status */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {statusQuery.isLoading ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : (
          <>
            <Card className="p-4">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.07em] text-ink-muted">
                Connection
              </p>
              <p className="mt-1.5 text-[17px] font-extrabold text-ink">
                {status?.connected ? 'Google Sheets' : 'Not configured'}
              </p>
              <p className="mt-1 text-[12px] text-ink-muted">
                Provider: {status?.provider ?? 'unknown'} · Auto sync{' '}
                {status?.autoSync ? 'on' : 'off'}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.07em] text-ink-muted">
                Last sync
              </p>
              {status?.lastSync ? (
                <>
                  <p className="mt-1.5 text-[17px] font-extrabold text-ink">
                    {status.lastSync.rowsProcessed} row(s)
                  </p>
                  <p className="mt-1 text-[12px] text-ink-muted">
                    {status.lastSync.direction} · {status.lastSync.tab ?? 'all tabs'} ·{' '}
                    {relativeTime(status.lastSync.startedAt)}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1.5 text-[17px] font-extrabold text-ink">Never synced</p>
                  <p className="mt-1 text-[12px] text-ink-muted">
                    Run a sync to push the current data to Sheets.
                  </p>
                </>
              )}
            </Card>
            <Card className="p-4">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.07em] text-ink-muted">
                Sync policy
              </p>
              <p className="mt-1.5 text-[13px] font-semibold text-ink">Manual, HR-triggered</p>
              <p className="mt-1 text-[12px] text-ink-muted">
                Each run is logged in the sync history and the audit trail.
              </p>
            </Card>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------ spreadsheets */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {sheets.map((sheet) => (
          <Card key={sheet.key} className="flex flex-col p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <FileSpreadsheet className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-ink">{sheet.title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
                  {sheet.description}
                </p>
              </div>
            </div>

            {sheet.tabs.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {sheet.tabs.map((tab) => (
                  <span
                    key={tab}
                    className="inline-flex items-center gap-1 rounded-lg bg-canvas px-2 py-1 text-[11.5px] font-semibold text-ink-soft"
                  >
                    <Table2 className="h-3 w-3 text-ink-muted" />
                    {tab}
                  </span>
                ))}
              </div>
            ) : null}

            <p className="mt-3 truncate text-[11.5px] text-ink-muted">
              Spreadsheet ID: {sheet.id || 'not configured'}
            </p>

            <div className="mt-4 flex flex-wrap gap-2 pt-1">
              {sheet.url ? (
                <a
                  href={sheet.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-white px-3.5 text-[13px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-50/60"
                >
                  <Link2 className="h-4 w-4" />
                  Open sheet
                  <ExternalLink className="h-3 w-3 text-ink-muted" />
                </a>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                icon={<RefreshCw className="h-4 w-4" />}
                loading={busySheet === sheet.key}
                disabled={busySheet !== null}
                onClick={() => sync(sheet.key)}
              >
                Sync now
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* ---------------------------------------------------------- sync history */}
      <Card className="mt-4">
        <CardHeader
          title="Sync history"
          subtitle="Every Sheets export with its row count and outcome."
          icon={<RefreshCw className="h-4 w-4" />}
        />
        {historyQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : (historyQuery.data?.items ?? []).length === 0 ? (
          <EmptyState
            title="No syncs recorded"
            description="Run a sync to push BRONEE data into Google Sheets."
            icon={<RefreshCw className="h-5 w-5" />}
          />
        ) : (
          <Table>
            <THead>
              <TH>Started</TH>
              <TH>Direction</TH>
              <TH>Tab</TH>
              <TH align="right">Rows</TH>
              <TH>Status</TH>
              <TH>Finished</TH>
            </THead>
            <TBody>
              {(historyQuery.data?.items ?? []).map((log) => (
                <TR key={log.id}>
                  <TD className="whitespace-nowrap">{formatDhakaDateTime(log.startedAt)}</TD>
                  <TD>
                    <Badge tone="neutral">{log.direction}</Badge>
                  </TD>
                  <TD>{log.tab ?? '—'}</TD>
                  <TD align="right">{log.rowsProcessed}</TD>
                  <TD>
                    <Badge tone={SYNC_TONE[log.status] ?? 'neutral'} dot>
                      {log.status}
                    </Badge>
                    {log.error ? (
                      <p
                        className={cn(
                          'mt-1 flex items-start gap-1 text-[11.5px] text-danger-deep',
                        )}
                      >
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {log.error}
                      </p>
                    ) : null}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {log.finishedAt ? formatDhakaDateTime(log.finishedAt) : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

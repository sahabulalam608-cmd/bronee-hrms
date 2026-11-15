import { useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  FileSpreadsheet,
  History,
  Link2,
  ShieldAlert,
  Table2,
  TriangleAlert,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDateTime } from '@/lib/time';
import { formatNumber } from '@/lib/format';
import { Alert } from '@/components/ui/forms';
import { Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/overlay';
import { SHEETS } from '@shared/constants';
import type { SignupSheetRow, SyncLogEntry } from '@/lib/api/db-types';
import { DataTable } from '@/components/ui/data';

const SHEET_META = [
  {
    key: 'task',
    name: 'Task Management Spreadsheet',
    id: SHEETS.TASK_SPREADSHEET_ID,
    url: `https://docs.google.com/spreadsheets/d/${SHEETS.TASK_SPREADSHEET_ID}/edit?gid=804686369#gid=804686369`,
    tabs: [SHEETS.TASK_TAB, SHEETS.TASK_DASHBOARD_TAB, SHEETS.TASK_SUPPORT_TAB, SHEETS.ROSTER_TAB],
    content:
      'Task assignments, task dashboard, support references and the roster tab with the approved shift dropdown.',
  },
  {
    key: 'main',
    name: 'Main HRMS Spreadsheet',
    id: SHEETS.MAIN_SPREADSHEET_ID,
    url: `https://docs.google.com/spreadsheets/d/${SHEETS.MAIN_SPREADSHEET_ID}/edit?usp=sharing`,
    tabs: [SHEETS.LEAVE_TAB, SHEETS.SIGNUP_TAB, SHEETS.HR_USERS_TAB],
    content:
      'Employee, attendance, leave, overtime, payroll, HR operations, the employee signup register and roster reporting tables.',
  },
];

export function SheetsPage() {
  const toast = useToast();
  const [busy, setBusy] = useState<'PUSH' | 'PULL' | null>(null);
  const [history, setHistory] = useState<SyncLogEntry[]>([]);

  const { data, loading, error, reload } = useAsync(() => api.hrSheetsStatus(), []);
  const { data: signupRows } = useAsync(() => api.hrSignupSheetRows(), []);

  const stats = useMemo(
    () => ({
      sheets: data?.sheets.length ?? 0,
      tabs: (data?.sheets ?? []).reduce((sum, sheet) => sum + sheet.tabs.length, 0),
      pending: data?.pendingSync ?? 0,
      errors: data?.errors.length ?? 0,
    }),
    [data],
  );

  async function runSync(direction: 'PUSH' | 'PULL') {
    setBusy(direction);
    try {
      const result = await api.runSheetsSync(direction);
      setHistory((prev) => [result.log, ...prev]);
      toast.success(
        direction === 'PUSH' ? 'Sync to Sheets completed' : 'Sync from Sheets completed',
        `${result.synced} record(s) processed — ${result.log.message}`,
      );
      reload();
    } catch (err) {
      toast.error('Sync failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Google Sheets Integration"
        subtitle="Connection status, manual synchronisation and error history for the BRONEE spreadsheets."
        actions={
          <>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => runSync('PULL')}
              disabled={busy !== null}
            >
              <ArrowDownToLine size={15} />
              {busy === 'PULL' ? 'Pulling…' : 'Pull from Sheets'}
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => runSync('PUSH')}
              disabled={busy !== null}
            >
              <ArrowUpFromLine size={15} />
              {busy === 'PUSH' ? 'Pushing…' : 'Push to Sheets'}
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Connection"
          value={loading ? 'Checking' : data?.connected ? 'Connected' : 'Offline'}
          tone={data?.connected ? 'ok' : 'bad'}
          icon={<Link2 size={17} />}
        />
        <StatCard label="Spreadsheets" value={formatNumber(stats.sheets)} icon={<FileSpreadsheet size={17} />} />
        <StatCard label="Synced tabs" value={formatNumber(stats.tabs)} tone="info" icon={<Table2 size={17} />} />
        <StatCard
          label="Pending changes"
          value={formatNumber(stats.pending)}
          tone={stats.pending > 0 ? 'warn' : 'neutral'}
          hint="Rows waiting for the next sync"
        />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load the Sheets status">
          {error}
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {SHEET_META.map((sheet) => {
          const live = data?.sheets.find((item) => item.id === sheet.id);
          return (
            <SectionCard
              key={sheet.key}
              title={sheet.name}
              subtitle={live ? 'Connected' : 'Configured'}
              action={
                <a
                  href={sheet.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary btn-sm"
                >
                  <ExternalLink size={14} />
                  Open sheet
                </a>
              }
            >
              <p className="text-[13px] leading-relaxed text-ink-muted">{sheet.content}</p>
              <div className="mt-4 space-y-2">
                <p className="text-[11.5px] text-ink-faint">
                  Spreadsheet ID
                  <span className="ml-1.5 font-mono text-[11.5px] text-ink-muted">{sheet.id}</span>
                </p>
                <div>
                  <p className="mb-1.5 text-[11.5px] text-ink-faint">Tabs</p>
                  <div className="flex flex-wrap gap-2">
                    {(live?.tabs ?? sheet.tabs).map((tab) => (
                      <span
                        key={tab}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-2.5 py-1 text-[12px] font-medium text-ink-soft"
                      >
                        <Table2 size={12} />
                        {tab}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>
          );
        })}
      </div>

      <SectionCard
        title="Employee Signups sheet"
        subtitle="Every registration written to the Employee Signups tab — serial and mobile number both start with 0"
        padded={false}
      >
        {!signupRows || signupRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-faint">
            No registration has been written to the sheet yet.
          </p>
        ) : (
          <DataTable<SignupSheetRow & Record<string, unknown>>
            columns={[
              {
                key: 'sl',
                header: 'Sheet SL',
                width: '86px',
                render: (row) => (
                  <span className="font-mono text-[12.5px] font-medium tabular-nums text-ink">{row.sl}</span>
                ),
              },
              {
                key: 'fullName',
                header: 'Name',
                render: (row) => (
                  <div>
                    <span className="block text-[13px] font-medium text-ink">{row.fullName}</span>
                    <span className="block text-[11.5px] text-ink-faint">{row.employeeId}</span>
                  </div>
                ),
              },
              {
                key: 'mobile',
                header: 'Mobile',
                render: (row) => (
                  <span className="font-mono text-[12.5px] tabular-nums text-ink-soft">{row.mobile}</span>
                ),
              },
              {
                key: 'departmentName',
                header: 'Department',
                render: (row) => (
                  <span className="text-[12.5px] text-ink-soft">
                    {row.departmentName}
                    {row.subDepartmentName ? ` · ${row.subDepartmentName}` : ''}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => (
                  <Badge tone={row.status === 'Approved' ? 'ok' : row.status === 'Declined' ? 'bad' : 'warn'}>
                    {row.status}
                  </Badge>
                ),
              },
              {
                key: 'reviewNote',
                header: 'Review Note',
                render: (row) => (
                  <span className="text-[12.5px] text-ink-soft">
                    {row.reviewNote || <span className="text-ink-faint">—</span>}
                  </span>
                ),
              },
              {
                key: 'decidedBy',
                header: 'Decided By',
                render: (row) => (
                  <div>
                    <span className="block text-[12.5px] font-medium text-ink">
                      {row.decidedBy || <span className="text-ink-faint">Pending</span>}
                    </span>
                    <span className="block text-[11.5px] text-ink-faint">
                      {row.decidedAt ? formatDateTime(row.decidedAt) : '—'}
                    </span>
                  </div>
                ),
              },
            ]}
            rows={signupRows as (SignupSheetRow & Record<string, unknown>)[]}
            rowKey={(row) => row.applicationId}
            emptyTitle="No registrations yet"
          />
        )}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Sync history"
          subtitle="Manual synchronisation runs recorded in this session"
          padded={false}
        >
          {history.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-ink-faint">
              No manual sync has been run yet. Use pull or push to start a synchronisation.
            </p>
          ) : (
            <ul className="serial-list divide-y divide-line">
              {history.map((log) => (
                <li key={log.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={log.direction === 'PUSH' ? 'brand' : 'info'}>{log.direction}</Badge>
                    <span className="text-[13px] font-medium text-ink">{log.sheet}</span>
                    <Badge tone={log.status === 'Success' ? 'ok' : 'bad'}>{log.status}</Badge>
                    <span className="ml-auto text-[12px] text-ink-faint">{formatDateTime(log.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-ink-muted">
                    {log.records} record(s) — {log.message}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-line px-5 py-3 text-[12px] text-ink-faint">
            Last sync: {data?.lastSyncAt ? formatDateTime(data.lastSyncAt) : 'not recorded yet'}
          </p>
        </SectionCard>

        <SectionCard
          title="Sync error log"
          subtitle="Failed or partial synchronisation runs"
          padded={false}
        >
          {(data?.errors.length ?? 0) === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-ink-faint">
              No synchronisation errors recorded.
            </p>
          ) : (
            <ul className="serial-list divide-y divide-line">
              {(data?.errors ?? []).map((message, index) => (
                <li key={`${index}-${message}`} className="flex items-start gap-2.5 px-5 py-3">
                  <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warn" />
                  <span className="text-[13px] leading-relaxed text-ink-soft">{message}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-line bg-warn-soft px-5 py-4">
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warn">
              <ShieldAlert size={14} />
              Security warning — {SHEETS.HR_USERS_TAB} tab
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
              The {SHEETS.HR_USERS_TAB} tab of the Main HRMS spreadsheet contains a plaintext password column.
              Plaintext passwords must never be written to a spreadsheet, and an existing password column has
              to be removed and the affected accounts reset before this tab is used for anything else.
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Data flow" subtitle="How the sheets integration behaves">
        <ul className="serial-list space-y-2.5">
          {[
            'D1 is the primary database — the sheets are never treated as the source of truth.',
            'Push writes validated rows from D1 into the matching sheet tab.',
            'Pull imports authorised rows from the sheet after duplicate detection.',
            'Every sheet change is validated by the backend before it reaches D1.',
            'Sync failures create an error log entry and can be retried without losing history.',
            'Passwords, OTPs, tokens and API secrets are never pushed to a spreadsheet.',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-soft">
              <History size={14} className="mt-0.5 shrink-0 text-brand-600" />
              {item}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

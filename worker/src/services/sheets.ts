/**
 * BRONEE HRMS — Google Sheets integration layer.
 *
 * D1 stays the primary database. Sheets is a controlled integration surface:
 *  • reads are imported into D1 after validation and duplicate checks;
 *  • writes are pushed from D1 after the same validation;
 *  • credential columns are never read, written or synced.
 *
 * Auth uses a Google service account (JWT bearer flow) so no user session
 * token ever has to be stored.
 */

import { eq } from 'drizzle-orm';
import {
  LEAVE_SHEET_COLUMNS,
  SHEETS,
  SIGNUP_SHEET_COLUMNS,
  TASK_SHEET_COLUMNS,
} from '../../../shared/constants';
import type { Database } from '../db';
import { employees, leaveApplications, syncLogs, tasks } from '../db/schema';
import type { Env } from '../env';

/** Columns that must never leave the platform. */
const FORBIDDEN_COLUMNS = [
  'password',
  'password hash',
  'otp',
  'otp code',
  'token',
  'auth token',
  'secret',
  'api secret',
  'credential',
  'pin',
];

export function assertNoCredentialColumns(columns: string[]): void {
  const lowered = columns.map((c) => c.trim().toLowerCase());
  for (const forbidden of FORBIDDEN_COLUMNS) {
    if (lowered.includes(forbidden)) {
      throw new Error(
        `Refusing to sync: the sheet contains a "${forbidden}" column. Credentials must stay in D1.`,
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * Service account auth
 * ------------------------------------------------------------------ */

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(env: Env): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  if (!env.GOOGLE_SERVICE_ACCOUNT) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT is not configured. Sheets sync is disabled.');
  }

  const account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT) as ServiceAccount;
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = base64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: account.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: account.token_uri ?? 'https://oauth2.googleapis.com/token',
        iat: issuedAt,
        exp: issuedAt + 3600,
      }),
    ),
  );

  const pkcs8 = base64ToBytes(account.private_key);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );

  const response = await fetch(account.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${base64Url(new Uint8Array(signature))}`,
    }),
  });
  if (!response.ok) throw new Error(`Google token request failed: ${response.status}`);
  const json = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/\n/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ------------------------------------------------------------------ *
 * Sheet access
 * ------------------------------------------------------------------ */

export async function readSheet(
  env: Env,
  spreadsheetId: string,
  tab: string,
): Promise<string[][]> {
  const token = await getAccessToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tab)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`Could not read "${tab}": ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as { values?: string[][] };
  return json.values ?? [];
}

export async function appendRows(
  env: Env,
  spreadsheetId: string,
  tab: string,
  rows: string[][],
): Promise<number> {
  if (!rows.length) return 0;
  const token = await getAccessToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tab)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  if (!response.ok) throw new Error(`Could not append to "${tab}": ${response.status}`);
  const json = (await response.json()) as { updates?: { updatedRows?: number } };
  return json.updates?.updatedRows ?? rows.length;
}

export async function listTabs(env: Env, spreadsheetId: string): Promise<string[]> {
  const token = await getAccessToken(env);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`Could not list tabs: ${response.status}`);
  const json = (await response.json()) as { sheets?: { properties: { title: string } }[] };
  return (json.sheets ?? []).map((sheet) => sheet.properties.title);
}

/* ------------------------------------------------------------------ *
 * Sync routines
 * ------------------------------------------------------------------ */

/** Pull LeaveApplications into D1, skipping duplicates and invalid rows. */
export async function syncLeaveApplications(env: Env, database: Database) {
  const spreadsheetId = env.MAIN_SPREADSHEET_ID ?? SHEETS.MAIN_SPREADSHEET_ID;
  const rows = await readSheet(env, spreadsheetId, SHEETS.LEAVE_TAB);
  if (!rows.length) return { imported: 0, skipped: 0, errors: [] as string[] };

  const header = rows[0].map((h) => h.trim());
  assertNoCredentialColumns(header);

  const index = (name: string) => header.indexOf(name);
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const applicationId = row[index('Application ID')]?.trim();
    const employeeId = row[index('Employee ID')]?.trim();
    const email = row[index('Email')]?.trim();
    const fromDate = row[index('From Date')]?.trim();
    const toDate = row[index('To Date')]?.trim();
    if (!applicationId || !employeeId || !fromDate || !toDate) {
      skipped += 1;
      continue;
    }

    const existing = await database.query.leaveApplications.findFirst({
      where: eq(leaveApplications.applicationId, applicationId),
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const employee = await database.query.employees.findFirst({
      where: eq(employees.employeeId, employeeId),
    });
    if (!employee) {
      errors.push(`${applicationId}: employee ID ${employeeId} is not registered.`);
      skipped += 1;
      continue;
    }
    if (email && email.toLowerCase() !== employee.email.toLowerCase()) {
      errors.push(`${applicationId}: email does not match the registered employee.`);
      skipped += 1;
      continue;
    }

    await database.insert(leaveApplications).values({
      id: `lv-${applicationId}`,
      applicationId,
      employeeId: employee.id,
      leaveType: row[index('Leave Type')]?.trim() || 'Casual Leave',
      fromDate,
      toDate,
      totalDays: Number(row[index('Total Days')]) || 1,
      reason: row[index('Reason')]?.trim() || '',
      attachmentName: row[index('Attachment Link')]?.trim() || null,
      submittedAt: row[index('Submission Date')]?.trim() || new Date().toISOString(),
      status: normaliseApproval(row[index('Approval Status')]),
      reviewReason: row[index('Review Reason')]?.trim() || null,
      emailStatus: row[index('Email Status')]?.trim() || 'Not Sent',
      approvedAt: row[index('Approved Date')]?.trim() || null,
    });
    imported += 1;
  }

  return { imported, skipped, errors };
}

/** Pull the Task Management sheet into D1. */
export async function syncTaskManagement(env: Env, database: Database) {
  const spreadsheetId = env.TASK_SPREADSHEET_ID ?? SHEETS.TASK_SPREADSHEET_ID;
  const rows = await readSheet(env, spreadsheetId, SHEETS.TASK_TAB);
  if (!rows.length) return { imported: 0, skipped: 0, errors: [] as string[] };

  const header = rows[0].map((h) => h.trim());
  assertNoCredentialColumns(header);

  const index = (name: string) => Math.max(0, header.indexOf(name));
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const name = row[index('Task Name')]?.trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    const employeeCode = row[index('Employee ID')]?.trim();
    const employee = employeeCode
      ? await database.query.employees.findFirst({ where: eq(employees.employeeId, employeeCode) })
      : null;

    const id = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await database.insert(tasks).values({
      id,
      taskId: row[index('Task ID')]?.trim() || id.toUpperCase(),
      name,
      description: row[index('Description')]?.trim() || '',
      departmentName: row[index('Department')]?.trim() || 'General',
      employeeId: employee?.id ?? '',
      priority: row[index('Priority')]?.trim() || 'Medium',
      assignedDate: row[index('Assigned Date')]?.trim() || todayISO(),
      startDate: row[index('Start Date')]?.trim() || todayISO(),
      dueDate: row[index('Due Date')]?.trim() || todayISO(),
      status: row[index('Task Status')]?.trim() || 'Yet to Start',
      referenceLink: row[index('Reference Link')]?.trim() || null,
      notes: row[index('Notes')]?.trim() || null,
      completeDate: row[index('Complete Date')]?.trim() || null,
      createdAt: new Date().toISOString(),
    });
    imported += 1;
  }

  return { imported, skipped, errors };
}

/** Push the Roster tab from D1. Newest roster first, history preserved. */
export async function pushRoster(env: Env, database: Database): Promise<number> {
  const spreadsheetId = env.TASK_SPREADSHEET_ID ?? SHEETS.TASK_SPREADSHEET_ID;
  const all = await database.query.rosterEntries.findMany();
  if (!all.length) return 0;

  const rows = all.map((entry) => [
    entry.rosterId,
    String(entry.rosterVersion),
    entry.employeeId,
    entry.date,
    entry.shiftCode,
    entry.changed ? 'Yes' : 'No',
    new Date().toISOString(),
  ]);
  return appendRows(env, spreadsheetId, SHEETS.ROSTER_TAB, [ROSTER_HEADER, ...rows]);
}

/** Writes a single row back to a tab, addressed by its 1-based row number. */
async function writeSheetRow(
  env: Env,
  spreadsheetId: string,
  tab: string,
  rowNumber: number,
  row: string[],
): Promise<void> {
  const token = await getAccessToken(env);
  const lastColumn = columnLetter(row.length);
  const range = `${tab}!A${rowNumber}:${lastColumn}${rowNumber}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row], valueInputOption: 'USER_ENTERED' }),
  });
  if (!response.ok) {
    throw new Error(`Could not update "${tab}" row ${rowNumber}: ${response.status}`);
  }
}

function columnLetter(count: number): string {
  let value = '';
  let remaining = count;
  while (remaining > 0) {
    const mod = (remaining - 1) % 26;
    value = String.fromCharCode(65 + mod) + value;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return value;
}

/**
 * Record an HR decision on the signup row in the Employee Signups sheet.
 *
 * The row is located by its Application ID, so the approval status, the review
 * note and the decision timestamp stay on the same line as the registration.
 */
export async function updateSignupDecision(
  env: Env,
  applicationId: string,
  decision: { status: string; note?: string | null; decidedAt: string; decidedBy: string },
): Promise<boolean> {
  const spreadsheetId = env.MAIN_SPREADSHEET_ID ?? SHEETS.MAIN_SPREADSHEET_ID;
  const rows = await readSheet(env, spreadsheetId, SHEETS.SIGNUP_TAB);
  if (rows.length < 2) return false;

  const header = rows[0].map((h) => h.trim());
  const idIndex = header.indexOf('Application ID');
  if (idIndex < 0) return false;

  const rowIndex = rows.findIndex(
    (row, index) => index > 0 && row[idIndex]?.trim() === applicationId,
  );
  if (rowIndex < 0) return false;

  const row = [...(rows[rowIndex] ?? [])];
  while (row.length < header.length) row.push('');

  const set = (column: string, value: string) => {
    const index = header.indexOf(column);
    if (index >= 0) row[index] = value;
  };
  set('Status', decision.status);
  set('Review Note', decision.note ?? '');
  set('Decided At', decision.decidedAt);
  set('Decided By', decision.decidedBy);

  await writeSheetRow(env, spreadsheetId, SHEETS.SIGNUP_TAB, rowIndex + 1, row);
  return true;
}

/**
 * Push one signup application to the Employee Signups sheet.
 *
 * The serial is zero-prefixed (001, 002, …) and the mobile number is stored
 * in the local Bangladesh format, so every number in the sheet begins with 0.
 * The row never carries a password, OTP or token.
 */
export async function pushSignupApplication(
  env: Env,
  row: {
    applicationId: string;
    fullName: string;
    mobile: string;
    employeeId: string;
    designation: string;
    email: string;
    departmentName: string;
    subDepartmentName: string | null;
    reportingManager: string | null;
    joiningDate: string;
    submittedAt: string;
    status: string;
  },
  serial: number,
): Promise<number> {
  assertNoCredentialColumns([...SIGNUP_SHEET_COLUMNS]);
  const spreadsheetId = env.MAIN_SPREADSHEET_ID ?? SHEETS.MAIN_SPREADSHEET_ID;
  return appendRows(env, spreadsheetId, SHEETS.SIGNUP_TAB, [
    [
      String(serial).padStart(3, '0'),
      row.applicationId,
      row.fullName,
      row.mobile,
      row.employeeId,
      row.designation,
      row.email,
      row.departmentName,
      row.subDepartmentName ?? '',
      row.reportingManager ?? '',
      row.joiningDate,
      row.submittedAt,
      row.status,
      '',
      '',
      '',
    ],
  ]);
}

const ROSTER_HEADER = [
  'Roster ID',
  'Roster Version',
  'Employee ID',
  'Roster Date',
  'Shift',
  'Changed',
  'Updated At',
];

/** Record a sync attempt. */
export async function logSync(
  database: Database,
  entry: {
    sheet: string;
    direction: 'PUSH' | 'PULL';
    status: 'Success' | 'Failed' | 'Partial';
    records: number;
    message: string;
  },
) {
  await database.insert(syncLogs).values({
    id: `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sheet: entry.sheet,
    direction: entry.direction,
    status: entry.status,
    records: entry.records,
    message: entry.message,
    createdAt: new Date().toISOString(),
  });
}

function normaliseApproval(value?: string): 'Pending' | 'Approved' | 'Declined' {
  const raw = (value ?? '').trim().toLowerCase();
  if (raw.startsWith('approved')) return 'Approved';
  if (raw.startsWith('not approved') || raw.startsWith('declined') || raw.startsWith('rejected')) {
    return 'Declined';
  }
  return 'Pending';
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export { LEAVE_SHEET_COLUMNS, SIGNUP_SHEET_COLUMNS, TASK_SHEET_COLUMNS };

import { Hono } from 'hono';
import { and, asc, desc, eq } from 'drizzle-orm';
import { PERMISSIONS, SHEET_LINKS, SHEET_TABS } from '@bronee/shared';
import { auditLogs, rosterEntries, rosters, syncLogs, tasks, users } from '../../db/schema.js';
import { badRequest, notFound, ok } from '../../lib/http.js';
import { randomId } from '../../lib/crypto.js';
import { requirePermission } from '../../middleware/auth.js';
import { requestMeta, writeAudit } from '../../lib/audit.js';
import type { AppEnv } from '../../types.js';
export const hrSheetsRoutes = new Hono<AppEnv>();

/**
 * Google Sheets integration status.
 *
 * Google Sheets is a controlled integration layer only — never the primary
 * database. Credentials are stored as Worker secrets, never in a spreadsheet.
 */
hrSheetsRoutes.get('/status', requirePermission([PERMISSIONS.HR_SHEETS_INTEGRATION]), async (c) => {
  const db = c.get('db');
  const env = c.get('env');

  const lastSync = await db.select().from(syncLogs).orderBy(desc(syncLogs.startedAt)).limit(1);

  const configured = Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY);

  return ok(c, {
    connected: configured,
    provider: 'google_sheets',
    sheets: {
      taskManagement: {
        id: env.TASK_SHEET_ID || SHEET_TABS.taskManagement.length ? env.TASK_SHEET_ID : '',
        url: SHEET_LINKS.taskManagement,
        tabs: SHEET_TABS.taskManagement,
      },
      mainHrms: {
        id: env.HRMS_SHEET_ID,
        url: SHEET_LINKS.mainHrms,
        tabs: SHEET_TABS.mainHrms,
      },
    },
    autoSync: false,
    lastSync: lastSync[0]
      ? {
          id: lastSync[0].id,
          direction: lastSync[0].direction,
          tab: lastSync[0].tab,
          status: lastSync[0].status,
          rowsProcessed: lastSync[0].rowsProcessed,
          error: lastSync[0].error,
          startedAt: lastSync[0].startedAt,
          finishedAt: lastSync[0].finishedAt,
        }
      : null,
  });
});

/** Sync history. */
hrSheetsRoutes.get('/history', requirePermission([PERMISSIONS.HR_SHEETS_INTEGRATION]), async (c) => {
  const db = c.get('db');
  const rows = await db.select().from(syncLogs).orderBy(desc(syncLogs.startedAt)).limit(50);
  return ok(c, { items: rows });
});

/** Error log (failed syncs). */
hrSheetsRoutes.get('/errors', requirePermission([PERMISSIONS.HR_SHEETS_INTEGRATION]), async (c) => {
  const db = c.get('db');
  const rows = await db
    .select()
    .from(syncLogs)
    .where(eq(syncLogs.status, 'failed'))
    .orderBy(desc(syncLogs.startedAt))
    .limit(50);
  return ok(c, { items: rows });
});

/**
 * Export a sheet's data to Google Sheets.
 *
 * The payload is assembled from D1 and pushed through the Google Sheets API.
 * Only structured, non-sensitive business data is ever exported.
 */
hrSheetsRoutes.post(
  '/sync',
  requirePermission([PERMISSIONS.HR_SHEETS_INTEGRATION]),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const session = c.get('session');
    const body = (await c.req.json()) as { sheet: 'task' | 'roster' | 'main'; tab?: string };

    const sheetId =
      body.sheet === 'task'
        ? env.TASK_SHEET_ID
        : body.sheet === 'roster'
          ? env.HRMS_SHEET_ID
          : env.HRMS_SHEET_ID;

    if (!sheetId) throw badRequest('The spreadsheet id is not configured.');

    const logId = randomId();
    const startedAt = new Date().toISOString();
    await db.insert(syncLogs).values({
      id: logId,
      direction: 'export',
      sheetId,
      tab: body.tab ?? null,
      status: 'running',
      rowsProcessed: 0,
      error: null,
      startedAt,
      finishedAt: null,
      triggeredBy: session.id,
    });

    try {
      const rows = await buildExportRows(db, body.sheet);
      const result = await pushToSheet(env, sheetId, body.tab ?? defaultTab(body.sheet), rows);

      await db
        .update(syncLogs)
        .set({
          status: 'success',
          rowsProcessed: result.rows,
          error: result.error ?? null,
          finishedAt: new Date().toISOString(),
        })
        .where(eq(syncLogs.id, logId));

      await writeAudit(db, {
        actorId: session.id,
        actorName: session.fullName,
        action: 'sheets.exported',
        entityType: 'sync_log',
        entityId: logId,
        after: { sheet: body.sheet, rows: result.rows },
      });

      return ok(c, { synced: true, rows: result.rows, warning: result.error ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(syncLogs)
        .set({ status: 'failed', error: message.slice(0, 500), finishedAt: new Date().toISOString() })
        .where(eq(syncLogs.id, logId));
      throw badRequest(`Sync failed: ${message}`);
    }
  },
);

function defaultTab(sheet: string): string {
  if (sheet === 'task') return 'Management System';
  if (sheet === 'roster') return 'Roster';
  return 'Employee';
}

/** Assemble the export rows from D1. */
async function buildExportRows(db: any, sheet: string): Promise<string[][]> {
  if (sheet === 'task') {
    const rows = await db
      .select({
        taskCode: tasks.taskCode,
        name: tasks.name,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        assignedDate: tasks.assignedDate,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        referenceLink: tasks.referenceLink,
        employeeName: users.fullName,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assignedEmployeeId, users.id))
      .orderBy(asc(tasks.dueDate));

    return [
      ['Task ID', 'Task Name', 'Description', 'Status', 'Priority', 'Assigned Date', 'Start Date', 'Due Date', 'Complete Date', 'Assigned To', 'Reference Link'],
      ...rows.map((r: Record<string, any>) => [
        r.taskCode,
        r.name,
        r.description ?? '',
        r.status,
        r.priority,
        r.assignedDate ?? '',
        r.startDate ?? '',
        r.dueDate ?? '',
        r.completedAt ?? '',
        r.employeeName ?? '',
        r.referenceLink ?? '',
      ]),
    ];
  }

  if (sheet === 'roster') {
    const rows = await db
      .select({
        rosterId: rosters.id,
        version: rosters.version,
        employeeId: rosterEntries.employeeId,
        date: rosterEntries.date,
        isOff: rosterEntries.isOff,
        employeeName: users.fullName,
        employeeCode: users.employeeCode,
      })
      .from(rosterEntries)
      .innerJoin(rosters, eq(rosterEntries.rosterId, rosters.id))
      .innerJoin(users, eq(rosterEntries.employeeId, users.id))
      .orderBy(desc(rosters.version), asc(users.fullName), asc(rosterEntries.date));

    return [
      ['Roster ID', 'Roster Version', 'Employee ID', 'Employee Name', 'Employee Code', 'Roster Date', 'Shift', 'Off Day'],
      ...rows.map((r: Record<string, any>) => [
        r.rosterId,
        String(r.version),
        r.employeeId,
        r.employeeName,
        r.employeeCode,
        r.date,
        r.isOff ? '' : '',
        r.isOff ? 'Yes' : 'No',
      ]),
    ];
  }

  const rows = await db
    .select({
      employeeCode: users.employeeCode,
      fullName: users.fullName,
      email: users.email,
      mobile: users.mobile,
      designation: users.designationLabel,
      joiningDate: users.joiningDate,
      status: users.status,
    })
    .from(users)
    .orderBy(asc(users.joiningDate));

  return [
    ['Employee ID', 'Full Name', 'Official Email', 'Mobile', 'Designation', 'Joining Date', 'Status'],
    ...rows.map((r: Record<string, any>) => [
      r.employeeCode,
      r.fullName,
      r.email,
      r.mobile,
      r.designation,
      r.joiningDate,
      r.status,
    ]),
  ];
}

/**
 * Push rows to a Google Sheet using the Sheets REST API with a
 * service-account bearer token.
 */
async function pushToSheet(
  env: any,
  sheetId: string,
  tab: string,
  rows: string[][],
): Promise<{ rows: number; error: string | null }> {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_PRIVATE_KEY;
  if (!email || !privateKey) {
    return {
      rows: rows.length,
      error: 'Google service account credentials are not configured — payload prepared but not uploaded.',
    };
  }

  const token = await getGoogleAccessToken(email, privateKey);
  if (!token) {
    return {
      rows: rows.length,
      error: 'Could not obtain a Google access token — payload prepared but not uploaded.',
    };
  }

  const range = encodeURIComponent(`${tab}!A1`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    return { rows: rows.length, error: `Sheets API error: ${detail.slice(0, 300)}` };
  }

  return { rows: rows.length, error: null };
}

/** Exchange a service-account key for an OAuth access token. */
async function getGoogleAccessToken(email: string, privateKey: string): Promise<string | null> {
  try {
    const key = await importPrivateKey(privateKey);
    if (!key) return null;

    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64Url(
      JSON.stringify({
        iss: email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    );
    const signature = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      new TextEncoder().encode(`${header}.${claims}`),
    );
    const assertion = `${header}.${claims}.${base64UrlBytes(new Uint8Array(signature))}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

/** Import a PEM-encoded PKCS#8 RSA private key using WebCrypto. */
async function importPrivateKey(pem: string): Promise<CryptoKey | null> {
  try {
    const normalized = pem.replace(/\\n/g, '\n');
    const match = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]+?)-----END (?:RSA )?PRIVATE KEY-----/);
    if (!match) return null;
    const der = Uint8Array.from(atob(match[1].replace(/\s+/g, '')), (c) => c.charCodeAt(0));
    return await crypto.subtle.importKey(
      'pkcs8',
      der,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    return null;
  }
}

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

import { Hono } from 'hono';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { dhakaDateKey, overtimeApplySchema, secondsBetween } from '@bronee/shared';
import { overtimeRequests } from '../db/schema.js';
import { badRequest, notFound, ok } from '../lib/http.js';
import { randomId } from '../lib/crypto.js';
import { requireAuth } from '../middleware/auth.js';
import { toOvertimeRequest } from '../lib/mappers.js';
import { requestMeta, writeAudit } from '../lib/audit.js';
import type { AppEnv } from '../types.js';
export const overtimeRoutes = new Hono<AppEnv>();

overtimeRoutes.use('*', requireAuth);

/** Employee: own overtime requests. */
overtimeRoutes.get('/my', async (c) => {
  const db = c.get('db');
  const session = c.get('session');

  const rows = await db
    .select()
    .from(overtimeRequests)
    .where(eq(overtimeRequests.employeeId, session.id))
    .orderBy(desc(overtimeRequests.createdAt));

  const monthKey = dhakaDateKey(new Date()).slice(0, 7);
  const approvedThisMonth = rows.filter(
    (r) => r.status === 'approved' && r.approvedStart?.startsWith(monthKey),
  );

  return ok(c, {
    items: rows.map((r) => toOvertimeRequest(r)),
    summary: {
      pending: rows.filter((r) => r.status === 'pending').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      approvedHoursThisMonth: approvedThisMonth.reduce((s, r) => s + (r.approvedHours ?? 0), 0),
      actualHoursThisMonth: rows
        .filter((r) => r.actualStart?.startsWith(monthKey))
        .reduce((s, r) => s + (r.actualHours ?? 0), 0),
    },
  });
});

/** Employee: request overtime. */
overtimeRoutes.post('/', zValidator('json', overtimeApplySchema), async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const body = c.req.valid('json');
  const now = new Date();

  const start = new Date(body.requestedStart);
  const end = new Date(body.requestedEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw badRequest('Enter a valid start and end time.');
  }
  if (end <= start) throw badRequest('The end time must be after the start time.');

  const requestedHours = Math.round((end.getTime() - start.getTime()) / 3600000 * 100) / 100;
  if (requestedHours > 12) throw badRequest('Overtime requests cannot exceed 12 hours.');

  const overlapping = await db
    .select()
    .from(overtimeRequests)
    .where(
      and(
        eq(overtimeRequests.employeeId, session.id),
        eq(overtimeRequests.status, 'pending'),
        lte(overtimeRequests.requestedStart, body.requestedEnd),
        gte(overtimeRequests.requestedEnd, body.requestedStart),
      ),
    );

  if (overlapping.length) {
    throw badRequest('You already have a pending overtime request in this time range.');
  }

  const record = {
    id: randomId(),
    employeeId: session.id,
    requestedStart: body.requestedStart,
    requestedEnd: body.requestedEnd,
    requestedHours,
    approvedStart: null,
    approvedEnd: null,
    approvedHours: null,
    actualStart: null,
    actualEnd: null,
    actualHours: null,
    status: 'pending' as const,
    reviewedBy: null,
    reviewNote: body.reason ?? null,
    reviewedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await db.insert(overtimeRequests).values(record);

  const meta = requestMeta(c);
  await writeAudit(db, {
    actorId: session.id,
    actorName: session.fullName,
    action: 'overtime.requested',
    entityType: 'overtime_request',
    entityId: record.id,
    after: { requestedStart: record.requestedStart, requestedEnd: record.requestedEnd, hours: requestedHours },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return ok(c, { request: toOvertimeRequest(record), message: 'Overtime request submitted for HR approval.' });
});

/** Employee: close their own approved overtime session. */
overtimeRoutes.post('/:id/clock-out', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const id = c.req.param('id');
  const now = new Date();

  const rows = await db.select().from(overtimeRequests).where(eq(overtimeRequests.id, id)).limit(1);
  const record = rows[0];
  if (!record) throw notFound('Overtime request not found.');
  if (record.employeeId !== session.id) throw notFound('Overtime request not found.');
  if (record.status !== 'approved') throw badRequest('This overtime request is not active.');

  const actualStart = record.actualStart ?? now.toISOString();
  const actualHours = Math.round((secondsBetween(actualStart, now.toISOString()) / 3600) * 100) / 100;

  await db
    .update(overtimeRequests)
    .set({ actualStart, actualEnd: now.toISOString(), actualHours, status: 'completed', updatedAt: now.toISOString() })
    .where(eq(overtimeRequests.id, id));

  return ok(c, { request: toOvertimeRequest({ ...record, actualStart, actualEnd: now.toISOString(), actualHours, status: 'completed' }) });
});

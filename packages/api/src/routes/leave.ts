import { Hono } from 'hono';
import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import {
  daysInclusive,
  dhakaDateKey,
  leaveApplySchema,
  LEAVE_TYPE_CODES,
} from '@bronee/shared';
import { leaveBalances, leaveRequests, rosterEntries, rosters } from '../db/schema.js';
import { badRequest, conflict, notFound, ok } from '../lib/http.js';
import { randomId } from '../lib/crypto.js';
import { requireAuth } from '../middleware/auth.js';
import { toLeaveRequest } from '../lib/mappers.js';
import { createNotifications } from '../lib/notifications.js';
import { requestMeta, writeAudit } from '../lib/audit.js';
import { getShiftById } from '../lib/attendance.js';
import type { AppEnv } from '../types.js';
export const leaveRoutes = new Hono<AppEnv>();

leaveRoutes.use('*', requireAuth);

const CURRENT_YEAR = () => new Date().getUTCFullYear();

/** Employee: balances + history. */
leaveRoutes.get('/my', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const year = Number(c.req.query('year') ?? CURRENT_YEAR());

  const balances = await db
    .select()
    .from(leaveBalances)
    .where(and(eq(leaveBalances.employeeId, session.id), eq(leaveBalances.year, year)));

  const requests = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.employeeId, session.id))
    .orderBy(desc(leaveRequests.createdAt));

  const balance = LEAVE_TYPE_CODES.map((code) => {
    const row = balances.find((b) => b.leaveType === code);
    const entitled = row?.entitled ?? 0;
    const used = row?.used ?? 0;
    return { leaveType: code, entitled, used, remaining: Math.max(0, entitled - used), year };
  });

  return ok(c, {
    year,
    balances: balance,
    pending: requests.filter((r) => r.status === 'pending'),
    approved: requests.filter((r) => r.status === 'approved'),
    declined: requests.filter((r) => r.status === 'declined'),
    items: requests.map((r) => toLeaveRequest(r)),
  });
});

/** Employee: submit a leave application (or a roster-change request). */
leaveRoutes.post('/', zValidator('json', leaveApplySchema), async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const body = c.req.valid('json');
  const now = new Date();
  const today = dhakaDateKey(now);

  if (body.toDate < body.fromDate) {
    throw badRequest('The to date cannot be earlier than the from date.');
  }
  if (body.fromDate < today) {
    throw badRequest('Leave applications cannot start in the past.');
  }

  const totalDays = daysInclusive(body.fromDate, body.toDate);

  // Duplicate detection — same employee, same type, overlapping dates.
  const existing = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, session.id),
        eq(leaveRequests.status, 'pending'),
        eq(leaveRequests.leaveType, body.leaveType as never),
      ),
    );

  const overlap = existing.find((r) => !(r.toDate < body.fromDate || r.fromDate > body.toDate));
  if (overlap) {
    throw conflict('You already have a pending leave application covering these dates.');
  }

  // Roster change requests must target a real published off day.
  let rosterChangeId: string | null = null;
  if (body.isRosterChange && body.rosterChange) {
    const entryRows = await db
      .select({ entry: rosterEntries, rosterStatus: rosters.status })
      .from(rosterEntries)
      .innerJoin(rosters, eq(rosterEntries.rosterId, rosters.id))
      .where(
        and(
          eq(rosterEntries.employeeId, session.id),
          eq(rosterEntries.date, body.rosterChange.currentOffDate),
          eq(rosters.status, 'published'),
        ),
      )
      .limit(1);
    if (!entryRows[0]) {
      throw badRequest('The selected date is not a published off day on your roster.');
    }
    if (!entryRows[0].entry.isOff) {
      throw badRequest('The selected date is a working day on your roster, not an off day.');
    }
    rosterChangeId = entryRows[0].entry.id;
  }

  const record = {
    id: randomId(),
    employeeId: session.id,
    leaveType: body.leaveType as never,
    fromDate: body.fromDate,
    toDate: body.toDate,
    totalDays,
    reason: body.reason,
    attachmentKey: body.attachmentKey ?? null,
    attachmentName: null,
    status: 'pending' as const,
    isRosterChange: body.isRosterChange,
    rosterChangeId,
    rosterUpdateMode: null,
    rosterUpdateStatus: (body.isRosterChange ? 'pending' : 'none') as never,
    reviewedBy: null,
    reviewNote: null,
    reviewedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await db.insert(leaveRequests).values(record);

  const meta = requestMeta(c);
  await writeAudit(db, {
    actorId: session.id,
    actorName: session.fullName,
    action: 'leave.applied',
    entityType: 'leave_request',
    entityId: record.id,
    after: { from: record.fromDate, to: record.toDate, type: record.leaveType, isRosterChange: record.isRosterChange },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return ok(c, { request: toLeaveRequest(record), message: 'Leave application submitted for HR review.' });
});

/** Employee: cancel a pending application. */
leaveRoutes.post('/:id/cancel', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const id = c.req.param('id');

  const rows = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  const record = rows[0];
  if (!record) throw notFound('Leave application not found.');
  if (record.employeeId !== session.id) throw notFound('Leave application not found.');
  if (record.status !== 'pending') throw badRequest('Only pending applications can be cancelled.');

  await db
    .update(leaveRequests)
    .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
    .where(eq(leaveRequests.id, id));

  return ok(c, { cancelled: true });
});

/** Employee: available off days (for roster-change requests). */
leaveRoutes.get('/off-days', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const today = dhakaDateKey(new Date());

  const rows = await db
    .select({ entry: rosterEntries })
    .from(rosterEntries)
    .innerJoin(rosters, eq(rosterEntries.rosterId, rosters.id))
    .where(
      and(
        eq(rosterEntries.employeeId, session.id),
        eq(rosterEntries.isOff, true),
        eq(rosters.status, 'published'),
        gte(rosterEntries.date, today),
      ),
    )
    .orderBy(asc(rosterEntries.date));

  return ok(c, {
    items: rows.map((r) => ({ date: r.entry.date, rosterId: r.entry.rosterId })),
  });
});

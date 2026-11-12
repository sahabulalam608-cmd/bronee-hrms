import { Hono } from 'hono';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { PERMISSIONS, leaveReviewSchema, overtimeReviewSchema } from '@bronee/shared';
import { leaveBalances, leaveRequests, overtimeRequests, rosterChanges, rosterEntries, rosters, users } from '../../db/schema.js';
import { badRequest, notFound, ok } from '../../lib/http.js';
import { requirePermission } from '../../middleware/auth.js';
import { toLeaveRequest, toOvertimeRequest } from '../../lib/mappers.js';
import { requestMeta, writeAudit } from '../../lib/audit.js';
import { createNotifications } from '../../lib/notifications.js';
import { recordRosterChange } from '../../lib/roster.js';
import { randomId } from '../../lib/crypto.js';
import type { AppEnv } from '../../types.js';
export const hrRequestRoutes = new Hono<AppEnv>();

/* ================================================================= leave */

hrRequestRoutes.get('/leave', requirePermission([PERMISSIONS.HR_LEAVE_VIEW]), async (c) => {
  const db = c.get('db');
  const status = c.req.query('status');
  const leaveType = c.req.query('leaveType');

  const rows = await db
    .select({ request: leaveRequests, employeeName: users.fullName, employeeCode: users.employeeCode })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.employeeId, users.id))
    .where(
      and(
        status ? eq(leaveRequests.status, status as never) : undefined,
        leaveType ? eq(leaveRequests.leaveType, leaveType as never) : undefined,
      ),
    )
    .orderBy(desc(leaveRequests.createdAt));

  return ok(c, {
    items: rows.map((r) => ({
      ...toLeaveRequest(r.request),
      employeeName: r.employeeName,
      employeeCode: r.employeeCode,
    })),
  });
});

hrRequestRoutes.post(
  '/leave/:id/review',
  requirePermission([PERMISSIONS.HR_LEAVE_REVIEW]),
  zValidator('json', leaveReviewSchema),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const rows = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
    const request = rows[0];
    if (!request) throw notFound('Leave request not found.');
    if (request.status !== 'pending') throw badRequest('This request has already been reviewed.');

    const now = new Date().toISOString();

    if (body.decision === 'approve') {
      await db
        .update(leaveRequests)
        .set({
          status: 'approved',
          reviewedBy: session.id,
          reviewNote: body.note ?? null,
          reviewedAt: now,
          updatedAt: now,
          rosterUpdateMode: request.isRosterChange ? (body.rosterUpdateMode ?? 'manual') : null,
          rosterUpdateStatus: request.isRosterChange ? (body.rosterUpdateMode === 'auto' ? 'completed' : 'manual_required') : 'none',
        })
        .where(eq(leaveRequests.id, id));

      // Update the leave balance for the approved request.
      const year = Number(request.fromDate.slice(0, 4));
      const existing = await db
        .select()
        .from(leaveBalances)
        .where(
          and(
            eq(leaveBalances.employeeId, request.employeeId),
            eq(leaveBalances.year, year),
            eq(leaveBalances.leaveType, request.leaveType),
          ),
        )
        .limit(1);

      if (existing[0]) {
        await db
          .update(leaveBalances)
          .set({ used: existing[0].used + request.totalDays, updatedAt: now })
          .where(eq(leaveBalances.id, existing[0].id));
      }

      await createNotifications(db, env, [
        {
          employeeId: request.employeeId,
          type: 'leave_approved',
          title: 'Your leave application has been approved',
          body: `${request.totalDays} day(s) from ${request.fromDate} to ${request.toDate} approved.`,
          link: '/app/leave',
          createdBy: session.id,
          emailSubject: 'BRONEE HRMS — Your leave has been approved',
        },
      ]);

      // Auto-update the roster when requested.
      if (request.isRosterChange && body.rosterUpdateMode === 'auto' && request.rosterChangeId) {
        await applyRosterChangeFromLeave(db, request.id, session.id);
      }
    } else {
      await db
        .update(leaveRequests)
        .set({
          status: 'declined',
          reviewedBy: session.id,
          reviewNote: body.note ?? null,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(leaveRequests.id, id));

      await createNotifications(db, env, [
        {
          employeeId: request.employeeId,
          type: 'leave_declined',
          title: 'Your leave application has been declined',
          body: body.note ? `Reason: ${body.note}` : 'Please contact HR for more information.',
          link: '/app/leave',
          createdBy: session.id,
        },
      ]);
    }

    const meta = requestMeta(c);
    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: `leave.${body.decision}`,
      entityType: 'leave_request',
      entityId: id,
      before: { status: request.status },
      after: { status: body.decision, note: body.note ?? null, rosterUpdateMode: body.rosterUpdateMode ?? null },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const after = (await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1))[0];
    return ok(c, { request: toLeaveRequest(after) });
  },
);

/**
 * Apply the requested roster swap for an approved leave request.
 * The off day moves to the requested date and the original date picks up the
 * shift that was planned for the new date.
 */
async function applyRosterChangeFromLeave(db: any, leaveRequestId: string, actorId: string) {
  const rows = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.id, leaveRequestId))
    .limit(1);
  const request = rows[0];
  if (!request?.rosterChangeId) return;

  const entryRows = await db
    .select()
    .from(rosterEntries)
    .where(eq(rosterEntries.id, request.rosterChangeId))
    .limit(1);
  const original = entryRows[0];
  if (!original) return;

  const roster = (await db.select().from(rosters).where(eq(rosters.id, original.rosterId)).limit(1))[0];
  if (!roster) return;

  const requestedDate = request.toDate;

  // Find the entry the employee holds on the requested date.
  const targetRows = await db
    .select()
    .from(rosterEntries)
    .where(
      and(
        eq(rosterEntries.rosterId, original.rosterId),
        eq(rosterEntries.employeeId, original.employeeId),
        eq(rosterEntries.date, requestedDate),
      ),
    )
    .limit(1);
  const target = targetRows[0];

  const swapShiftId = target?.shiftId ?? null;
  const swapIsOff = target?.isOff ?? true;

  await db
    .update(rosterEntries)
    .set({
      shiftId: swapIsOff ? null : swapShiftId,
      isOff: swapIsOff,
      updatedBy: actorId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(rosterEntries.id, original.id));

  if (target) {
    await db
      .update(rosterEntries)
      .set({
        shiftId: null,
        isOff: true,
        updatedBy: actorId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(rosterEntries.id, target.id));
  }

  await recordRosterChange(db, {
    rosterId: original.rosterId,
    employeeId: original.employeeId,
    previousShiftId: original.shiftId,
    newShiftId: swapIsOff ? null : swapShiftId,
    previousIsOff: original.isOff,
    newIsOff: swapIsOff,
    changeType: 'leave_request',
    changedBy: actorId,
  });

  await db
    .update(leaveRequests)
    .set({ rosterUpdateStatus: 'completed', updatedAt: new Date().toISOString() })
    .where(eq(leaveRequests.id, leaveRequestId));
}

/** Manually complete a roster update that was flagged "manual required". */
hrRequestRoutes.post(
  '/leave/:id/complete-roster-update',
  requirePermission([PERMISSIONS.HR_ROSTER_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const session = c.get('session');
    const id = c.req.param('id');

    await applyRosterChangeFromLeave(db, id, session.id);
    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'leave.roster_update_completed',
      entityType: 'leave_request',
      entityId: id,
    });

    return ok(c, { completed: true });
  },
);

/* ============================================================== overtime */

hrRequestRoutes.get('/overtime', requirePermission([PERMISSIONS.HR_OVERTIME_VIEW]), async (c) => {
  const db = c.get('db');
  const status = c.req.query('status');

  const rows = await db
    .select({ request: overtimeRequests, employeeName: users.fullName, employeeCode: users.employeeCode })
    .from(overtimeRequests)
    .innerJoin(users, eq(overtimeRequests.employeeId, users.id))
    .where(status ? eq(overtimeRequests.status, status as never) : undefined)
    .orderBy(desc(overtimeRequests.createdAt));

  return ok(c, {
    items: rows.map((r) => ({
      ...toOvertimeRequest(r.request),
      employeeName: r.employeeName,
      employeeCode: r.employeeCode,
    })),
  });
});

hrRequestRoutes.post(
  '/overtime/:id/review',
  requirePermission([PERMISSIONS.HR_OVERTIME_REVIEW]),
  zValidator('json', overtimeReviewSchema),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const rows = await db.select().from(overtimeRequests).where(eq(overtimeRequests.id, id)).limit(1);
    const request = rows[0];
    if (!request) throw notFound('Overtime request not found.');
    if (request.status !== 'pending') throw badRequest('This request has already been reviewed.');

    const now = new Date().toISOString();

    if (body.decision === 'approve') {
      const approvedStart = body.approvedStart ?? request.requestedStart ?? null;
      const approvedEnd = body.approvedEnd ?? request.requestedEnd ?? null;
      const hours =
        approvedStart && approvedEnd
          ? Math.round(((new Date(approvedEnd).getTime() - new Date(approvedStart).getTime()) / 3600000) * 100) / 100
          : 0;

      if (!approvedStart || !approvedEnd) {
        throw badRequest('An approved overtime request needs both a start and an end time.');
      }

      await db
        .update(overtimeRequests)
        .set({
          status: 'approved',
          approvedStart,
          approvedEnd,
          approvedHours: hours,
          reviewedBy: session.id,
          reviewNote: body.note ?? null,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(overtimeRequests.id, id));

      await createNotifications(db, env, [
        {
          employeeId: request.employeeId,
          type: 'overtime_approved',
          title: 'Your overtime request has been approved',
          body: `Approved overtime: ${approvedStart} to ${approvedEnd} (${hours}h).`,
          link: '/app/overtime',
          createdBy: session.id,
          emailSubject: 'BRONEE HRMS — Your overtime request has been approved',
        },
      ]);
    } else {
      await db
        .update(overtimeRequests)
        .set({
          status: 'declined',
          reviewedBy: session.id,
          reviewNote: body.note ?? null,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(overtimeRequests.id, id));

      await createNotifications(db, env, [
        {
          employeeId: request.employeeId,
          type: 'overtime_declined',
          title: 'Your overtime request has been declined',
          body: body.note ? `Reason: ${body.note}` : 'Please contact HR for more information.',
          link: '/app/overtime',
          createdBy: session.id,
        },
      ]);
    }

    const meta = requestMeta(c);
    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: `overtime.${body.decision}`,
      entityType: 'overtime_request',
      entityId: id,
      before: { status: request.status },
      after: { status: body.decision, note: body.note ?? null },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const after = (await db.select().from(overtimeRequests).where(eq(overtimeRequests.id, id)).limit(1))[0];
    return ok(c, { request: toOvertimeRequest(after) });
  },
);

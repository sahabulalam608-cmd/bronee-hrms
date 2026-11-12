import { Hono } from 'hono';
import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import {
  clockInSchema,
  dhakaDateKey,
  secondsBetween,
  type AttendanceSession,
} from '@bronee/shared';
import { attendanceSessions, breaks, overtimeRequests, shifts as shiftsRef, users } from '../db/schema.js';
import { badRequest, conflict, notFound, ok } from '../lib/http.js';
import { randomId } from '../lib/crypto.js';
import { requireAuth } from '../middleware/auth.js';
import { toAttendanceSession, toBreak, toOvertimeRequest } from '../lib/mappers.js';
import {
  computeBreakTotals,
  decideWorkingStart,
  getShiftById,
  runVerification,
  segmentWindows,
  shiftWindow,
} from '../lib/attendance.js';
import { findRosterEntry, findUserById } from '../lib/queries.js';
import { requestMeta, writeAudit } from '../lib/audit.js';
import type { AppEnv } from '../types.js';
export const attendanceRoutes = new Hono<AppEnv>();

attendanceRoutes.use('*', requireAuth);

/** Live status used by the dashboard: today’s session, break state, timers. */
attendanceRoutes.get('/status', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const now = new Date();
  const today = dhakaDateKey(now);

  const rows = await db
    .select({
      session: attendanceSessions,
      employeeName: users.fullName,
      employeeCode: users.employeeCode,
      shiftCode: shiftsRef.code,
      shiftName: shiftsRef.name,
    })
    .from(attendanceSessions)
    .innerJoin(users, eq(attendanceSessions.employeeId, users.id))
    .leftJoin(shiftsRef, eq(attendanceSessions.shiftId, shiftsRef.id))
    .where(and(eq(attendanceSessions.employeeId, session.id), eq(attendanceSessions.date, today)))
    .orderBy(desc(attendanceSessions.createdAt))
    .limit(1);

  const record = rows[0] ?? null;
  const activeBreakRows = record
    ? await db
        .select()
        .from(breaks)
        .where(and(eq(breaks.sessionId, record.session.id), isNull(breaks.endedAt)))
        .limit(1)
    : [];

  const activeBreak = activeBreakRows[0] ?? null;
  const rosterEntry = await findRosterEntry(db, session.id, today);
  const scheduledShift = record?.session.shiftId ? await getShiftById(db, record.session.shiftId) : null;
  const rosterShift = rosterEntry?.entry.shiftId ? await getShiftById(db, rosterEntry.entry.shiftId) : null;

  const workingSeconds = record?.session.actualWorkingStart
    ? secondsBetween(record.session.actualWorkingStart, record.session.clockOutAt ?? now.toISOString())
    : 0;
  const liveBreakSeconds = activeBreak ? secondsBetween(activeBreak.startedAt, now.toISOString()) : 0;

  const approvedOvertime = await db
    .select()
    .from(overtimeRequests)
    .where(
      and(
        eq(overtimeRequests.employeeId, session.id),
        eq(overtimeRequests.status, 'approved'),
        lte(overtimeRequests.approvedStart, now.toISOString()),
        gte(overtimeRequests.approvedEnd, now.toISOString()),
      ),
    )
    .limit(1);

  return ok(c, {
    date: today,
    session: record ? toAttendanceSession({ ...record.session, employeeName: record.employeeName, employeeCode: record.employeeCode, shiftCode: record.shiftCode, shiftName: record.shiftName }) : null,
    activeBreak: activeBreak ? toBreak(activeBreak) : null,
    liveWorkingSeconds: workingSeconds,
    liveBreakSeconds,
    scheduledShift,
    rosterShift,
    isOffDay: rosterEntry?.entry.isOff ?? false,
    approvedOvertime: approvedOvertime[0] ? toOvertimeRequest(approvedOvertime[0]) : null,
  });
});

/** Clock in (with office verification). */
attendanceRoutes.post('/clock-in', zValidator('json', clockInSchema), async (c) => {
  const db = c.get('db');
  const env = c.get('env');
  const session = c.get('session');
  const body = c.req.valid('json');
  const now = new Date();
  const today = dhakaDateKey(now);

  const openRows = await db
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.employeeId, session.id),
        eq(attendanceSessions.status, 'open'),
      ),
    )
    .limit(1);
  if (openRows[0]) {
    throw conflict('You already have an open attendance session. Clock out before clocking in again.');
  }

  const rosterEntry = await findRosterEntry(db, session.id, today);
  if (rosterEntry?.entry.isOff) {
    throw badRequest('You are marked as off today according to your published roster.');
  }

  const shiftId = rosterEntry?.entry.shiftId ?? null;
  const shift = shiftId ? await getShiftById(db, shiftId) : null;
  if (!shift) {
    throw badRequest('No shift is assigned to you for today. Please contact HR.');
  }

  const window = shiftWindow(shift, today);
  const requiresOffice = shift.requiresOfficeVerification && shift.locationPolicy !== 'wfh';
  const meta = requestMeta(c);

  const verification = await runVerification(
    db,
    env,
    {
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      accuracyMeters: body.accuracyMeters ?? null,
    },
    meta.ip,
    requiresOffice,
  );

  const decision = decideWorkingStart(env, window.scheduledStart, now.toISOString(), verification.result);
  const segment: 'office' | 'home' | null = shift.locationPolicy === 'split' ? 'office' : null;

  const record = {
    id: randomId(),
    employeeId: session.id,
    date: today,
    shiftId: shift.id,
    segment,
    scheduledStart: window.scheduledStart,
    scheduledEnd: window.scheduledEnd,
    punchInAt: now.toISOString(),
    actualWorkingStart: decision.actualWorkingStart,
    verificationCompletedAt: now.toISOString(),
    verificationMethod: verification.method,
    verificationResult: verification.result,
    latitude: verification.latitude,
    longitude: verification.longitude,
    accuracyMeters: verification.accuracyMeters,
    officeIpMatched: verification.officeIpMatched,
    officeIp: verification.officeIp,
    clockOutAt: null,
    workingSeconds: 0,
    breakSeconds: 0,
    breakCount: 0,
    status: 'open' as const,
    lateStatus: decision.lateStatus,
    attendanceStatus: 'present' as const,
    autoAction: decision.autoAction,
    reviewStatus: decision.reviewStatus,
    reviewNote: verification.reason,
    reviewedBy: null,
    reviewedAt: null,
    exceptionHistory: [] as Array<Record<string, unknown>>,
    isOvertime: false,
    overtimeRequestId: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await db.insert(attendanceSessions).values(record);

  await writeAudit(db, {
    actorId: session.id,
    actorName: session.fullName,
    action: 'attendance.clock_in',
    entityType: 'attendance_session',
    entityId: record.id,
    after: {
      date: today,
      shift: shift.code,
      verification: verification.result,
      method: verification.method,
      lateStatus: decision.lateStatus,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return ok(c, {
    session: toAttendanceSession(record as never),
    verification,
    message: decision.message,
    workingStarted: Boolean(decision.actualWorkingStart),
  });
});

/** Clock out. */
attendanceRoutes.post('/clock-out', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const now = new Date();
  const today = dhakaDateKey(now);

  const openRows = await db
    .select()
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.employeeId, session.id), eq(attendanceSessions.status, 'open')))
    .orderBy(desc(attendanceSessions.createdAt))
    .limit(1);
  const record = openRows[0];
  if (!record) throw badRequest('There is no active working session to close.');

  // Close any break that is still running.
  const activeBreaks = await db
    .select()
    .from(breaks)
    .where(and(eq(breaks.sessionId, record.id), isNull(breaks.endedAt)));

  for (const brk of activeBreaks) {
    const duration = secondsBetween(brk.startedAt, now.toISOString());
    await db
      .update(breaks)
      .set({ endedAt: now.toISOString(), durationSeconds: duration, closedBy: 'system' })
      .where(eq(breaks.id, brk.id));
  }

  const totals = await computeBreakTotals(db, record.id);
  const gross = secondsBetween(record.actualWorkingStart, now.toISOString());
  const workingSeconds = Math.max(0, gross - totals.seconds);

  await db
    .update(attendanceSessions)
    .set({
      clockOutAt: now.toISOString(),
      workingSeconds,
      breakSeconds: totals.seconds,
      breakCount: totals.count,
      status: 'closed',
      updatedAt: now.toISOString(),
    })
    .where(eq(attendanceSessions.id, record.id));

  // If the employee has approved overtime starting now, roll over into OT.
  const ot = await db
    .select()
    .from(overtimeRequests)
    .where(
      and(
        eq(overtimeRequests.employeeId, session.id),
        eq(overtimeRequests.status, 'approved'),
        lte(overtimeRequests.approvedStart, now.toISOString()),
        gte(overtimeRequests.approvedEnd, now.toISOString()),
      ),
    )
    .limit(1);

  if (ot[0]) {
    await db
      .update(overtimeRequests)
      .set({ actualStart: now.toISOString(), status: 'completed' })
      .where(eq(overtimeRequests.id, ot[0].id));
  }

  return ok(c, {
    sessionId: record.id,
    workingSeconds,
    breakSeconds: totals.seconds,
    breakCount: totals.count,
    overtimeStarted: Boolean(ot[0]),
    message: ot[0] ? 'Clocked out. Your approved overtime session has started.' : 'Clocked out successfully.',
  });
});

/** Start a break. */
attendanceRoutes.post('/break/start', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const now = new Date();

  const openRows = await db
    .select()
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.employeeId, session.id), eq(attendanceSessions.status, 'open')))
    .orderBy(desc(attendanceSessions.createdAt))
    .limit(1);
  const record = openRows[0];
  if (!record) throw badRequest('Clock in before taking a break.');
  if (!record.actualWorkingStart) {
    throw badRequest('Your working timer has not started yet, so a break cannot be recorded.');
  }

  const active = await db
    .select()
    .from(breaks)
    .where(and(eq(breaks.sessionId, record.id), isNull(breaks.endedAt)))
    .limit(1);
  if (active[0]) throw conflict('A break is already in progress.');

  const brk = {
    id: randomId(),
    employeeId: session.id,
    sessionId: record.id,
    startedAt: now.toISOString(),
    endedAt: null,
    durationSeconds: 0,
    closedBy: 'employee' as const,
    createdAt: now.toISOString(),
  };
  await db.insert(breaks).values(brk);
  return ok(c, { break: toBreak(brk), message: 'Break started.' });
});

/** End a break and resume working. */
attendanceRoutes.post('/break/end', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const now = new Date();

  const active = await db
    .select()
    .from(breaks)
    .where(
      and(
        eq(breaks.employeeId, session.id),
        isNull(breaks.endedAt),
      ),
    )
    .orderBy(desc(breaks.startedAt))
    .limit(1);
  const brk = active[0];
  if (!brk) throw badRequest('There is no break in progress.');

  const duration = secondsBetween(brk.startedAt, now.toISOString());
  await db
    .update(breaks)
    .set({ endedAt: now.toISOString(), durationSeconds: duration, closedBy: 'employee' })
    .where(eq(breaks.id, brk.id));

  const totals = await computeBreakTotals(db, brk.sessionId ?? '');
  const record = brk.sessionId
    ? (await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, brk.sessionId)).limit(1))[0]
    : null;
  if (record) {
    await db
      .update(attendanceSessions)
      .set({ breakSeconds: totals.seconds, breakCount: totals.count, updatedAt: now.toISOString() })
      .where(eq(attendanceSessions.id, record.id));
  }

  return ok(c, {
    break: toBreak({ ...brk, endedAt: now.toISOString(), durationSeconds: duration }),
    totalBreakSeconds: totals.seconds,
    message: 'Break ended. Welcome back.',
  });
});

/** Break history for the signed-in employee. */
attendanceRoutes.get('/breaks', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const limit = Math.min(200, Number(c.req.query('limit') ?? '50') || 50);

  const rows = await db
    .select()
    .from(breaks)
    .where(eq(breaks.employeeId, session.id))
    .orderBy(desc(breaks.startedAt))
    .limit(limit);

  const today = dhakaDateKey(new Date());
  const todayRows = rows.filter((r) => dhakaDateKey(r.startedAt) === today);
  const monthKey = today.slice(0, 7);
  const monthRows = rows.filter((r) => dhakaDateKey(r.startedAt).startsWith(monthKey));

  return ok(c, {
    items: rows.map(toBreak),
    today: {
      seconds: todayRows.reduce((s, r) => s + r.durationSeconds, 0),
      count: todayRows.length,
    },
    month: {
      seconds: monthRows.reduce((s, r) => s + r.durationSeconds, 0),
      count: monthRows.length,
    },
  });
});

/** Historical attendance list for the signed-in employee. */
attendanceRoutes.get('/history', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const limit = Math.min(200, Number(c.req.query('limit') ?? '60') || 60);

  const rows = await db
    .select({
      session: attendanceSessions,
      shiftCode: shiftsRef.code,
      shiftName: shiftsRef.name,
    })
    .from(attendanceSessions)
    .leftJoin(shiftsRef, eq(attendanceSessions.shiftId, shiftsRef.id))
    .where(eq(attendanceSessions.employeeId, session.id))
    .orderBy(desc(attendanceSessions.date))
    .limit(limit);

  return ok(c, {
    items: rows.map((r) =>
      toAttendanceSession({
        ...r.session,
        employeeName: session.fullName,
        employeeCode: session.employeeCode,
        shiftCode: r.shiftCode,
        shiftName: r.shiftName,
      }),
    ),
  });
});

/** Split-shift segment boundaries for a shift (used by the dashboard UI). */
attendanceRoutes.get('/shift/:code/segments', async (c) => {
  const db = c.get('db');
  const code = c.req.param('code');
  const rows = await db.select().from(shiftsRef).where(eq(shiftsRef.code, code)).limit(1);
  if (!rows[0]) throw notFound('Shift not found.');
  const today = dhakaDateKey(new Date());
  return ok(c, {
    shift: rows[0],
    segments: segmentWindows(
      {
        id: rows[0].id,
        code: rows[0].code,
        name: rows[0].name,
        shortName: rows[0].shortName,
        startTime: rows[0].startTime,
        endTime: rows[0].endTime,
        endsNextDay: rows[0].endsNextDay,
        locationPolicy: rows[0].locationPolicy,
        requiresOfficeVerification: rows[0].requiresOfficeVerification,
        segments: rows[0].segments ?? null,
        displayOrder: rows[0].displayOrder,
        isActive: rows[0].isActive,
      },
      today,
    ),
  });
});

/** Monthly summary used by the dashboard. */
attendanceRoutes.get('/monthly-summary', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const now = new Date();
  const monthKey = dhakaDateKey(now).slice(0, 7);

  const rows = await db
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.employeeId, session.id),
        gte(attendanceSessions.date, `${monthKey}-01`),
        lte(attendanceSessions.date, `${monthKey}-31`),
      ),
    );

  const lateDays = rows.filter(
    (r) => r.lateStatus === 'late' || r.lateStatus === 'pending_review',
  ).length;

  return ok(c, {
    month: monthKey,
    totalWorkingSeconds: rows.reduce((s, r) => s + r.workingSeconds, 0),
    totalBreakSeconds: rows.reduce((s, r) => s + r.breakSeconds, 0),
    presentDays: rows.length,
    lateDays,
    overtimeSeconds: 0,
  });
});

/** Employees currently working / on break (HR dashboard widget). */
attendanceRoutes.get('/live', async (c) => {
  const db = c.get('db');
  const today = dhakaDateKey(new Date());

  const open = await db
    .select({
      session: attendanceSessions,
      fullName: users.fullName,
      employeeCode: users.employeeCode,
    })
    .from(attendanceSessions)
    .innerJoin(users, eq(attendanceSessions.employeeId, users.id))
    .where(and(eq(attendanceSessions.date, today), eq(attendanceSessions.status, 'open')));

  const ids = open.map((o) => o.session.id);
  const activeBreaks = ids.length
    ? await db
        .select()
        .from(breaks)
        .where(and(inArray(breaks.sessionId, ids), isNull(breaks.endedAt)))
    : [];

  const onBreakIds = new Set(activeBreaks.map((b) => b.sessionId));

  return ok(c, {
    working: open.filter((o) => !onBreakIds.has(o.session.id)).length,
    onBreak: onBreakIds.size,
    items: open.map((o) => ({
      employeeId: o.session.employeeId,
      fullName: o.fullName,
      employeeCode: o.employeeCode,
      status: onBreakIds.has(o.session.id) ? 'on_break' : 'working',
      shiftId: o.session.shiftId,
      verificationResult: o.session.verificationResult,
      lateStatus: o.session.lateStatus,
    })),
  });
});

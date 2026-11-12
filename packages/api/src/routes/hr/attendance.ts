import { Hono } from 'hono';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { PERMISSIONS, dhakaDateKey } from '@bronee/shared';
import { attendanceSessions, breaks, departments, shifts, users } from '../../db/schema.js';
import { badRequest, notFound, ok } from '../../lib/http.js';
import { requirePermission } from '../../middleware/auth.js';
import { toAttendanceSession, toBreak } from '../../lib/mappers.js';
import { requestMeta, writeAudit } from '../../lib/audit.js';
import { getOfficeIpAllowlist, setOfficeIpAllowlist } from '../../lib/attendance.js';
import type { AppEnv } from '../../types.js';
export const hrAttendanceRoutes = new Hono<AppEnv>();

/* ------------------------------------------------------------- listings */

hrAttendanceRoutes.get('/', requirePermission([PERMISSIONS.HR_ATTENDANCE_VIEW]), async (c) => {
  const db = c.get('db');
  const date = c.req.query('date') ?? dhakaDateKey(new Date());
  const status = c.req.query('status');
  const departmentId = c.req.query('departmentId');

  const rows = await db
    .select({
      session: attendanceSessions,
      employeeName: users.fullName,
      employeeCode: users.employeeCode,
      departmentName: departments.name,
      shiftCode: shifts.code,
      shiftName: shifts.name,
    })
    .from(attendanceSessions)
    .innerJoin(users, eq(attendanceSessions.employeeId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .leftJoin(shifts, eq(attendanceSessions.shiftId, shifts.id))
    .where(
      and(
        eq(attendanceSessions.date, date),
        departmentId ? eq(users.departmentId, departmentId) : undefined,
        status ? eq(attendanceSessions.attendanceStatus, status as never) : undefined,
      ),
    )
    .orderBy(asc(departments.displayOrder), asc(users.fullName));

  return ok(c, {
    date,
    items: rows.map((r) =>
      toAttendanceSession({
        ...r.session,
        employeeName: r.employeeName,
        employeeCode: r.employeeCode,
        shiftCode: r.shiftCode,
        shiftName: r.shiftName,
      }),
    ),
    summary: {
      present: rows.filter((r) => r.session.attendanceStatus === 'present').length,
      late: rows.filter((r) => r.session.lateStatus === 'late' || r.session.lateStatus === 'pending_review').length,
      verificationFailed: rows.filter((r) => r.session.verificationResult === 'failed').length,
      pendingReview: rows.filter((r) => r.session.reviewStatus === 'pending').length,
      total: rows.length,
    },
  });
});

/** Break records for a date — visible to HR only. */
hrAttendanceRoutes.get('/breaks/records', requirePermission([PERMISSIONS.HR_BREAK_VIEW]), async (c) => {
  const db = c.get('db');
  const date = c.req.query('date') ?? dhakaDateKey(new Date());

  const rows = await db
    .select({
      brk: breaks,
      employeeName: users.fullName,
      employeeCode: users.employeeCode,
    })
    .from(breaks)
    .innerJoin(users, eq(breaks.employeeId, users.id))
    .where(gte(breaks.startedAt, `${date}T00:00:00.000Z`))
    .orderBy(desc(breaks.startedAt));

  return ok(c, {
    date,
    items: rows
      .filter((r) => r.brk.startedAt.startsWith(date) || new Date(r.brk.startedAt).toISOString().slice(0, 10) === date)
      .map((r) => ({ ...toBreak(r.brk), employeeName: r.employeeName, employeeCode: r.employeeCode })),
  });
});

/** Office IP allowlist management (verification #1). */
hrAttendanceRoutes.get('/office-network', requirePermission([PERMISSIONS.HR_SETTINGS_MANAGE, PERMISSIONS.HR_EMPLOYEE_MANAGE]), async (c) => {
  const db = c.get('db');
  const env = c.get('env');
  const allowlist = await getOfficeIpAllowlist(db);
  return ok(c, {
    allowlist,
    geofenceMeters: Number(env.OFFICE_GEOFENCE_METERS ?? '50'),
    latitude: Number(env.OFFICE_LATITUDE ?? '0'),
    longitude: Number(env.OFFICE_LONGITUDE ?? '0'),
    maxAccuracyMeters: Number(env.MAX_GPS_ACCURACY_METERS ?? '100'),
    verificationWindowMinutes: Number(env.VERIFICATION_WINDOW_MINUTES ?? '1'),
  });
});

hrAttendanceRoutes.post('/office-network', requirePermission([PERMISSIONS.HR_SETTINGS_MANAGE, PERMISSIONS.HR_EMPLOYEE_MANAGE]), async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const body = (await c.req.json()) as { allowlist: string[] };

  const cleaned = body.allowlist.map((ip) => ip.trim()).filter(Boolean);
  await setOfficeIpAllowlist(db, cleaned, session.id);

  await writeAudit(db, {
    actorId: session.id,
    actorName: session.fullName,
    action: 'settings.office_network_updated',
    entityType: 'company_settings',
    entityId: 'office.ip.allowlist',
    after: { allowlist: cleaned },
  });

  return ok(c, { allowlist: cleaned });
});

/** A single attendance record with the employee's previous history. */
hrAttendanceRoutes.get('/:id', requirePermission([PERMISSIONS.HR_ATTENDANCE_VIEW]), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const rows = await db
    .select({
      session: attendanceSessions,
      employeeName: users.fullName,
      employeeCode: users.employeeCode,
      departmentName: departments.name,
      shiftCode: shifts.code,
      shiftName: shifts.name,
    })
    .from(attendanceSessions)
    .innerJoin(users, eq(attendanceSessions.employeeId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .leftJoin(shifts, eq(attendanceSessions.shiftId, shifts.id))
    .where(eq(attendanceSessions.id, id))
    .limit(1);

  if (!rows[0]) throw notFound('Attendance record not found.');
  const record = rows[0];

  const history = await db
    .select({
      session: attendanceSessions,
      shiftCode: shifts.code,
    })
    .from(attendanceSessions)
    .leftJoin(shifts, eq(attendanceSessions.shiftId, shifts.id))
    .where(eq(attendanceSessions.employeeId, record.session.employeeId))
    .orderBy(desc(attendanceSessions.date))
    .limit(15);

  const breakRows = await db
    .select()
    .from(breaks)
    .where(eq(breaks.sessionId, id))
    .orderBy(asc(breaks.startedAt));

  return ok(c, {
    record: toAttendanceSession({
      ...record.session,
      employeeName: record.employeeName,
      employeeCode: record.employeeCode,
      shiftCode: record.shiftCode,
      shiftName: record.shiftName,
    }),
    history: history.map((h) =>
      toAttendanceSession({
        ...h.session,
        employeeName: record.employeeName,
        employeeCode: record.employeeCode,
        shiftCode: h.shiftCode,
      }),
    ),
    breaks: breakRows.map(toBreak),
  });
});

/* -------------------------------------------------------------- reviews */

/**
 * Finalise an attendance record. HR decisions are the only way a late status
 * or an attendance record can change, and every decision is audited.
 */
hrAttendanceRoutes.post(
  '/:id/review',
  requirePermission([PERMISSIONS.HR_ATTENDANCE_REVIEW]),
  async (c) => {
    const db = c.get('db');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = (await c.req.json()) as {
      action:
        | 'verify'
        | 'approve_late'
        | 'excuse_late'
        | 'reject'
        | 'correct'
        | 'clear_issue'
        | 'manual_attendance';
      note?: string;
      attendanceStatus?: 'present' | 'absent' | 'leave' | 'holiday' | 'off' | 'partial';
      actualWorkingStart?: string;
      clockOutAt?: string;
      workingSeconds?: number;
    };

    const rows = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, id)).limit(1);
    const record = rows[0];
    if (!record) throw notFound('Attendance record not found.');

    const now = new Date().toISOString();
    const patch: Partial<typeof attendanceSessions.$inferInsert> = {
      updatedAt: now,
      reviewedBy: session.id,
      reviewedAt: now,
      reviewNote: body.note ?? record.reviewNote,
      reviewStatus: 'reviewed',
    };

    let action = body.action;
    switch (body.action) {
      case 'verify':
      case 'approve_late':
        patch.lateStatus = 'late';
        patch.verificationResult = 'verified';
        patch.verificationMethod = 'manual';
        patch.attendanceStatus = body.attendanceStatus ?? 'present';
        break;
      case 'excuse_late':
        patch.lateStatus = 'excused';
        patch.attendanceStatus = body.attendanceStatus ?? 'present';
        break;
      case 'reject':
        patch.lateStatus = 'rejected';
        patch.verificationResult = 'failed';
        break;
      case 'correct':
        patch.actualWorkingStart = body.actualWorkingStart ?? record.actualWorkingStart;
        patch.clockOutAt = body.clockOutAt ?? record.clockOutAt;
        patch.workingSeconds = body.workingSeconds ?? record.workingSeconds;
        patch.attendanceStatus = body.attendanceStatus ?? record.attendanceStatus;
        break;
      case 'clear_issue':
        patch.autoAction = null;
        patch.lateStatus = 'on_time';
        patch.verificationResult = 'verified';
        patch.verificationMethod = 'manual';
        patch.attendanceStatus = body.attendanceStatus ?? 'present';
        break;
      case 'manual_attendance':
        patch.attendanceStatus = body.attendanceStatus ?? 'present';
        patch.lateStatus = body.attendanceStatus === 'absent' ? 'excused' : record.lateStatus;
        patch.verificationMethod = 'manual';
        patch.verificationResult = 'verified';
        patch.actualWorkingStart = body.actualWorkingStart ?? record.actualWorkingStart;
        patch.clockOutAt = body.clockOutAt ?? record.clockOutAt;
        patch.workingSeconds = body.workingSeconds ?? record.workingSeconds;
        break;
      default:
        throw badRequest('Unknown attendance review action.');
    }

    const exceptionHistory = [
      ...((record.exceptionHistory ?? []) as Array<Record<string, unknown>>),
      {
        action,
        note: body.note ?? null,
        by: session.id,
        byName: session.fullName,
        at: now,
        previous: {
          lateStatus: record.lateStatus,
          verificationResult: record.verificationResult,
          attendanceStatus: record.attendanceStatus,
          workingSeconds: record.workingSeconds,
        },
      },
    ];
    patch.exceptionHistory = exceptionHistory;

    await db.update(attendanceSessions).set(patch).where(eq(attendanceSessions.id, id));

    const meta = requestMeta(c);
    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: `attendance.${action}`,
      entityType: 'attendance_session',
      entityId: id,
      before: {
        lateStatus: record.lateStatus,
        verificationResult: record.verificationResult,
        attendanceStatus: record.attendanceStatus,
        workingSeconds: record.workingSeconds,
      },
      after: patch,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const after = (await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, id)).limit(1))[0];
    return ok(c, { record: toAttendanceSession(after) });
  },
);


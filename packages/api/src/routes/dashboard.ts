import { Hono } from 'hono';
import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import {
  dhakaDateKey,
  dhakaMonthKey,
  secondsBetween,
  type EmployeeDashboard,
} from '@bronee/shared';
import {
  attendanceSessions,
  breaks,
  leaveBalances,
  leaveRequests,
  notifications,
  overtimeRequests,
  taskSubmissions,
  tasks,
} from '../db/schema.js';
import { ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { toAttendanceSession, toBreak, toPublicUser } from '../lib/mappers.js';
import { findUserById } from '../lib/queries.js';
import { getShiftById } from '../lib/attendance.js';
import { findRosterEntry } from '../lib/queries.js';
import { unreadCount, unreadRosterCount } from '../lib/notifications.js';
import { LEAVE_TYPE_CODES } from '@bronee/shared';
import type { AppEnv } from '../types.js';
export const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.use('*', requireAuth);

dashboardRoutes.get('/employee', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const now = new Date();
  const today = dhakaDateKey(now);
  const monthKey = dhakaMonthKey(now);
  const year = now.getUTCFullYear();

  const user = await findUserById(db, session.id);

  /* ------------------------------------------------------------- today */

  const sessionRows = await db
    .select()
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.employeeId, session.id), eq(attendanceSessions.date, today)))
    .orderBy(desc(attendanceSessions.createdAt))
    .limit(1);
  const todaySession = sessionRows[0] ?? null;

  const activeBreakRows = todaySession
    ? await db
        .select()
        .from(breaks)
        .where(and(eq(breaks.sessionId, todaySession.id), isNull(breaks.endedAt)))
        .limit(1)
    : [];
  const activeBreak = activeBreakRows[0] ?? null;

  const rosterEntry = await findRosterEntry(db, session.id, today);
  const rosterShift = rosterEntry?.entry.shiftId ? await getShiftById(db, rosterEntry.entry.shiftId) : null;
  const scheduledShift = todaySession?.shiftId ? await getShiftById(db, todaySession.shiftId) : null;

  const workingSeconds = todaySession?.actualWorkingStart
    ? secondsBetween(todaySession.actualWorkingStart, todaySession.clockOutAt ?? now.toISOString())
    : 0;
  const liveBreakSeconds = activeBreak ? secondsBetween(activeBreak.startedAt, now.toISOString()) : 0;

  const status: EmployeeDashboard['today']['status'] = !todaySession
    ? 'not_started'
    : todaySession.clockOutAt
      ? 'closed'
      : activeBreak
        ? 'on_break'
        : 'working';

  /* ------------------------------------------------------------- month */

  const monthRows = await db
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.employeeId, session.id),
        gte(attendanceSessions.date, `${monthKey}-01`),
        lte(attendanceSessions.date, `${monthKey}-31`),
      ),
    );

  const otRows = await db
    .select()
    .from(overtimeRequests)
    .where(
      and(
        eq(overtimeRequests.employeeId, session.id),
        gte(overtimeRequests.createdAt, `${monthKey}-01T00:00:00.000Z`),
      ),
    );

  const approvedOt = await db
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

  const taskRows = await db
    .select({ task: tasks })
    .from(tasks)
    .where(eq(tasks.assignedEmployeeId, session.id));

  const upcomingDeadlines = taskRows.filter(
    (t) => t.task.status !== 'complete' && t.task.dueDate != null && t.task.dueDate >= today,
  ).length;

  /* ------------------------------------------------------------ recent */

  const recentRows = await db
    .select()
    .from(attendanceSessions)
    .where(eq(attendanceSessions.employeeId, session.id))
    .orderBy(desc(attendanceSessions.punchInAt))
    .limit(1);
  const recent = recentRows[0] ?? null;

  const recentBreakRows = await db
    .select()
    .from(breaks)
    .where(eq(breaks.employeeId, session.id))
    .orderBy(desc(breaks.startedAt))
    .limit(1);
  const recentBreak = recentBreakRows[0] ?? null;

  /* ------------------------------------------------------------- leave */

  const balances = await db
    .select()
    .from(leaveBalances)
    .where(and(eq(leaveBalances.employeeId, session.id), eq(leaveBalances.year, year)));

  const pendingLeave = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.employeeId, session.id), eq(leaveRequests.status, 'pending')));

  const payload: EmployeeDashboard = {
    profile: user
      ? toPublicUser(user)
      : ({
          id: session.id,
          email: session.email,
          fullName: session.fullName,
          mobile: '',
          employeeCode: session.employeeCode,
          designation: null,
          designationId: null,
          department: null,
          departmentId: null,
          subDepartment: null,
          subDepartmentId: null,
          reportingManagerId: null,
          reportingManagerName: null,
          joiningDate: today,
          role: session.role,
          status: session.status,
          avatarKey: null,
          avatarUrl: null,
          mustChangePassword: false,
        } satisfies EmployeeDashboard['profile']),
    assignedShift: rosterShift ?? scheduledShift ?? null,
    today: {
      date: today,
      session: todaySession ? toAttendanceSession(todaySession) : null,
      liveWorkingSeconds: workingSeconds,
      liveBreakSeconds,
      activeBreak: activeBreak ? toBreak(activeBreak) : null,
      workingSeconds,
      breakSeconds: todaySession?.breakSeconds ?? 0,
      breakCount: todaySession?.breakCount ?? 0,
      status,
      scheduledShift,
      rosterShift,
      isOffDay: rosterEntry?.entry.isOff ?? false,
      approvedOvertime: approvedOt[0]
        ? {
            id: approvedOt[0].id,
            employeeId: approvedOt[0].employeeId,
            requestedStart: approvedOt[0].requestedStart,
            requestedEnd: approvedOt[0].requestedEnd,
            requestedHours: approvedOt[0].requestedHours,
            approvedStart: approvedOt[0].approvedStart,
            approvedEnd: approvedOt[0].approvedEnd,
            approvedHours: approvedOt[0].approvedHours,
            actualStart: approvedOt[0].actualStart,
            actualEnd: approvedOt[0].actualEnd,
            actualHours: approvedOt[0].actualHours,
            status: approvedOt[0].status,
            reviewedBy: approvedOt[0].reviewedBy,
            reviewNote: approvedOt[0].reviewNote,
            createdAt: approvedOt[0].createdAt,
          }
        : null,
    },
    month: {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      totalWorkingSeconds: monthRows.reduce((s, r) => s + r.workingSeconds, 0),
      totalBreakSeconds: monthRows.reduce((s, r) => s + r.breakSeconds, 0),
      totalOvertimeSeconds: otRows.reduce((s, r) => s + (r.actualHours ?? 0) * 3600, 0),
      lateDays: monthRows.filter(
        (r) => r.lateStatus === 'late' || r.lateStatus === 'pending_review',
      ).length,
      presentDays: monthRows.length,
      tasksCompleted: taskRows.filter((t) => t.task.status === 'complete').length,
      tasksPending: taskRows.filter((t) => t.task.status !== 'complete').length,
    },
    recent: {
      lastDutyDate: recent?.date ?? null,
      lastClockIn: recent?.punchInAt ?? null,
      lastClockOut: recent?.clockOutAt ?? null,
      lastBreakStart: recentBreak?.startedAt ?? null,
      lastBreakEnd: recentBreak?.endedAt ?? null,
    },
    quick: {
      pendingTasks: taskRows.filter((t) => t.task.status !== 'complete').length,
      upcomingDeadlines,
      unreadNotifications: await unreadCount(db, session.id),
      unreadRosterUpdates: await unreadRosterCount(db, session.id),
      leaveBalance: LEAVE_TYPE_CODES.map((code) => {
        const row = balances.find((b) => b.leaveType === code);
        const entitled = row?.entitled ?? 0;
        const used = row?.used ?? 0;
        return { leaveType: code, entitled, used, remaining: Math.max(0, entitled - used), year };
      }),
    },
  };

  return ok(c, payload);
});

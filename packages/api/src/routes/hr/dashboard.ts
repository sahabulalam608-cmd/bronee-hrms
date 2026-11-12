import { Hono } from 'hono';
import { and, asc, count, desc, eq, gte } from 'drizzle-orm';
import { PERMISSIONS, dhakaDateKey, dhakaMonthKey } from '@bronee/shared';
import {
  attendanceSessions,
  departments,
  leaveRequests,
  overtimeRequests,
  payrollRecords,
  signupRequests,
  users,
} from '../../db/schema.js';
import { ok } from '../../lib/http.js';
import { requirePermission } from '../../middleware/auth.js';
import type { AppEnv } from '../../types.js';
export const hrDashboardRoutes = new Hono<AppEnv>();

hrDashboardRoutes.get('/', requirePermission([PERMISSIONS.HR_EMPLOYEE_VIEW]), async (c) => {
  const db = c.get('db');
  const today = dhakaDateKey(new Date());
  const monthKey = dhakaMonthKey(new Date());
  const year = new Date().getUTCFullYear();
  const month = new Date().getUTCMonth() + 1;

  const totalEmployees = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.role, 'employee'));

  const pendingSignups = await db
    .select({ value: count() })
    .from(signupRequests)
    .where(eq(signupRequests.status, 'pending'));

  const approvedThisMonth = await db
    .select({ value: count() })
    .from(signupRequests)
    .where(and(eq(signupRequests.status, 'approved'), gte(signupRequests.reviewedAt, `${monthKey}-01`)));

  const totalApplications = await db.select({ value: count() }).from(signupRequests);

  const todayApplications = await db
    .select({ value: count() })
    .from(signupRequests)
    .where(gte(signupRequests.createdAt, `${today}T00:00:00.000Z`));

  const todaySessions = await db
    .select({ session: attendanceSessions, fullName: users.fullName })
    .from(attendanceSessions)
    .innerJoin(users, eq(attendanceSessions.employeeId, users.id))
    .where(eq(attendanceSessions.date, today));

  const leaveRows = await db.select({ leaveType: leaveRequests.leaveType }).from(leaveRequests);
  const leaveDistribution = [...new Set(leaveRows.map((l) => l.leaveType))].map((type) => ({
    leaveType: type,
    count: leaveRows.filter((l) => l.leaveType === type).length,
  }));

  const applicationsByMonth: Array<{ month: string; count: number }> = [];
  for (let m = 0; m < 6; m += 1) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - (5 - m));
    const key = dhakaMonthKey(d);
    const countRows = await db
      .select({ value: count() })
      .from(signupRequests)
      .where(gte(signupRequests.createdAt, `${key}-01`));
    applicationsByMonth.push({ month: key, count: countRows[0]?.value ?? 0 });
  }

  const otRows = await db.select().from(overtimeRequests);
  const payrollRows = await db
    .select()
    .from(payrollRecords)
    .where(and(eq(payrollRecords.year, year), eq(payrollRecords.month, month)));

  const deptRows = await db
    .select({ department: departments.name, value: count() })
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(users.role, 'employee'))
    .groupBy(departments.name);

  const attendanceStatusToday = ['present', 'absent', 'leave', 'off', 'partial'].map((status) => ({
    status,
    count: todaySessions.filter((s) => s.session.attendanceStatus === status).length,
  }));

  const pendingLeave = await db
    .select({ value: count() })
    .from(leaveRequests)
    .where(eq(leaveRequests.status, 'pending'));

  const activeToday = todaySessions.filter((s) => s.session.status === 'open').length;

  return ok(c, {
    kpi: {
      totalEmployees: totalEmployees[0]?.value ?? 0,
      pendingApplications: (pendingSignups[0]?.value ?? 0) + (pendingLeave[0]?.value ?? 0),
      approvedThisMonth: approvedThisMonth[0]?.value ?? 0,
      totalApplications: totalApplications[0]?.value ?? 0,
      todayApplications: todayApplications[0]?.value ?? 0,
      activeToday,
      onBreak: 0,
      lateToday: todaySessions.filter(
        (s) => s.session.lateStatus === 'late' || s.session.lateStatus === 'pending_review',
      ).length,
      absentToday: todaySessions.filter((s) => s.session.attendanceStatus === 'absent').length,
    },
    leaveTypeDistribution: leaveDistribution,
    applicationsByMonth,
    overtimeSummary: {
      pending: otRows.filter((o) => o.status === 'pending').length,
      approved: otRows.filter((o) => o.status === 'approved').length,
      hoursThisMonth: otRows.reduce((s, o) => s + (o.actualHours ?? 0), 0),
    },
    payrollSummary: {
      month,
      year,
      totalNet: payrollRows.reduce((s, r) => s + r.netPayable, 0),
      employees: payrollRows.length,
      published: payrollRows.filter((r) => r.status === 'published').length,
    },
    attendanceStatusToday,
    departmentHeadcount: deptRows.map((d) => ({
      department: d.department ?? 'Unassigned',
      count: d.value,
    })),
  });
});

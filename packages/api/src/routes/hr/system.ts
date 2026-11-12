import { Hono } from 'hono';
import { and, asc, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { PERMISSIONS, dhakaDateKey, dhakaMonthKey } from '@bronee/shared';
import {
  announcementRecipients,
  announcements,
  attendanceSessions,
  auditLogs,
  companySettings,
  departments,
  leaveRequests,
  notifications,
  overtimeRequests,
  payrollRecords,
  profileUpdateRequests,
  rosterEntries,
  rosters,
  signupRequests,
  staffingRules,
  taskSubmissions,
  tasks,
  users,
} from '../../db/schema.js';
import { badRequest, notFound, ok } from '../../lib/http.js';
import { randomId } from '../../lib/crypto.js';
import { requirePermission } from '../../middleware/auth.js';
import { requestMeta, writeAudit } from '../../lib/audit.js';
import { createNotifications } from '../../lib/notifications.js';
import type { AppEnv } from '../../types.js';
export const hrSystemRoutes = new Hono<AppEnv>();

/* ============================================================ dashboard */

hrSystemRoutes.get('/dashboard', requirePermission([PERMISSIONS.HR_EMPLOYEE_VIEW]), async (c) => {
  const db = c.get('db');
  const today = dhakaDateKey(new Date());
  const monthKey = dhakaMonthKey(new Date());
  const year = new Date().getUTCFullYear();
  const month = new Date().getUTCMonth() + 1;

  const totalEmployees = await db.select({ value: count() }).from(users).where(eq(users.role, 'employee'));
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
    .select({
      session: attendanceSessions,
      fullName: users.fullName,
    })
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

  return ok(c, {
    kpi: {
      totalEmployees: totalEmployees[0]?.value ?? 0,
      pendingApplications: (pendingSignups[0]?.value ?? 0) + (pendingLeave[0]?.value ?? 0),
      approvedThisMonth: approvedThisMonth[0]?.value ?? 0,
      totalApplications: totalApplications[0]?.value ?? 0,
      todayApplications: todayApplications[0]?.value ?? 0,
      activeToday: todaySessions.filter((s) => s.session.status === 'open').length,
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
    departmentHeadcount: deptRows.map((d) => ({ department: d.department ?? 'Unassigned', count: d.value })),
  });
});

/* ================================================================ audit */

hrSystemRoutes.get('/audit', requirePermission([PERMISSIONS.HR_AUDIT_VIEW]), async (c) => {
  const db = c.get('db');
  const limit = Math.min(300, Number(c.req.query('limit') ?? '100') || 100);
  const entityType = c.req.query('entityType');

  const rows = await db
    .select()
    .from(auditLogs)
    .where(entityType ? eq(auditLogs.entityType, entityType) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return ok(c, { items: rows });
});

/* ============================================================= settings */

hrSystemRoutes.get('/settings', requirePermission([PERMISSIONS.HR_SETTINGS_MANAGE, PERMISSIONS.HR_EMPLOYEE_MANAGE]), async (c) => {
  const db = c.get('db');
  const rows = await db.select().from(companySettings);
  return ok(c, { items: rows });
});

hrSystemRoutes.post('/settings', requirePermission([PERMISSIONS.HR_SETTINGS_MANAGE, PERMISSIONS.HR_EMPLOYEE_MANAGE]), async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const body = (await c.req.json()) as { key: string; value: unknown };

  if (!body.key) throw badRequest('A settings key is required.');

  await db
    .insert(companySettings)
    .values({
      key: body.key,
      value: body.value as never,
      updatedBy: session.id,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: companySettings.key,
      set: { value: body.value as never, updatedBy: session.id, updatedAt: new Date().toISOString() },
    });

  await writeAudit(db, {
    actorId: session.id,
    actorName: session.fullName,
    action: 'settings.updated',
    entityType: 'company_settings',
    entityId: body.key,
    after: { value: body.value },
  });

  return ok(c, { key: body.key, value: body.value });
});

/* ======================================================= staffing rules */

hrSystemRoutes.get('/staffing-rules', requirePermission([PERMISSIONS.HR_ROSTER_MANAGE]), async (c) => {
  const db = c.get('db');
  const rows = await db.select().from(staffingRules).orderBy(asc(staffingRules.departmentId));
  return ok(c, { items: rows });
});

hrSystemRoutes.post('/staffing-rules', requirePermission([PERMISSIONS.HR_ROSTER_MANAGE]), async (c) => {
  const db = c.get('db');
  const body = (await c.req.json()) as {
    departmentId: string;
    shiftId?: string | null;
    minStaff: number;
    dayOfWeek?: number | null;
    isActive?: boolean;
  };
  const record = {
    id: randomId(),
    departmentId: body.departmentId,
    shiftId: body.shiftId ?? null,
    minStaff: body.minStaff,
    dayOfWeek: body.dayOfWeek ?? null,
    isActive: body.isActive ?? true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.insert(staffingRules).values(record);
  return ok(c, { rule: record });
});

hrSystemRoutes.delete('/staffing-rules/:id', requirePermission([PERMISSIONS.HR_ROSTER_MANAGE]), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  await db.delete(staffingRules).where(eq(staffingRules.id, id));
  return ok(c, { deleted: true });
});

/* ============================================================== reports */

/** CSV export helper. */
function toCsv(rows: Array<Array<string | number | null>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? '' : String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\n');
}

hrSystemRoutes.get('/reports/:kind', requirePermission([PERMISSIONS.HR_REPORT_EXPORT]), async (c) => {
  const db = c.get('db');
  const kind = c.req.param('kind');
  const year = Number(c.req.query('year') ?? new Date().getUTCFullYear());
  const month = Number(c.req.query('month') ?? new Date().getUTCMonth() + 1);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-31`;

  if (kind === 'attendance') {
    const rows = await db
      .select({
        date: attendanceSessions.date,
        employeeCode: users.employeeCode,
        employeeName: users.fullName,
        department: departments.name,
        punchIn: attendanceSessions.punchInAt,
        clockOut: attendanceSessions.clockOutAt,
        workingSeconds: attendanceSessions.workingSeconds,
        breakSeconds: attendanceSessions.breakSeconds,
        lateStatus: attendanceSessions.lateStatus,
        attendanceStatus: attendanceSessions.attendanceStatus,
        verificationResult: attendanceSessions.verificationResult,
      })
      .from(attendanceSessions)
      .innerJoin(users, eq(attendanceSessions.employeeId, users.id))
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(and(gte(attendanceSessions.date, start), lte(attendanceSessions.date, end)))
      .orderBy(asc(attendanceSessions.date), asc(users.fullName));

    const csv = toCsv([
      ['Date', 'Employee ID', 'Employee Name', 'Department', 'Punch In', 'Clock Out', 'Working (min)', 'Break (min)', 'Late Status', 'Attendance', 'Verification'],
      ...rows.map((r) => [
        r.date,
        r.employeeCode,
        r.employeeName,
        r.department ?? '',
        r.punchIn ?? '',
        r.clockOut ?? '',
        Math.round(r.workingSeconds / 60),
        Math.round(r.breakSeconds / 60),
        r.lateStatus,
        r.attendanceStatus,
        r.verificationResult,
      ]),
    ]);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="attendance-${year}-${String(month).padStart(2, '0')}.csv"`,
      },
    });
  }

  if (kind === 'leave') {
    const rows = await db
      .select({
        leaveType: leaveRequests.leaveType,
        fromDate: leaveRequests.fromDate,
        toDate: leaveRequests.toDate,
        totalDays: leaveRequests.totalDays,
        status: leaveRequests.status,
        reason: leaveRequests.reason,
        employeeCode: users.employeeCode,
        employeeName: users.fullName,
      })
      .from(leaveRequests)
      .innerJoin(users, eq(leaveRequests.employeeId, users.id))
      .where(and(gte(leaveRequests.fromDate, start), lte(leaveRequests.fromDate, end)))
      .orderBy(asc(leaveRequests.fromDate));

    const csv = toCsv([
      ['Employee ID', 'Employee Name', 'Leave Type', 'From', 'To', 'Days', 'Status', 'Reason'],
      ...rows.map((r) => [
        r.employeeCode,
        r.employeeName,
        r.leaveType,
        r.fromDate,
        r.toDate,
        r.totalDays,
        r.status,
        r.reason,
      ]),
    ]);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leave-${year}-${String(month).padStart(2, '0')}.csv"`,
      },
    });
  }

  if (kind === 'tasks') {
    const rows = await db
      .select({
        taskCode: tasks.taskCode,
        name: tasks.name,
        department: departments.name,
        employeeName: users.fullName,
        priority: tasks.priority,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        status: tasks.status,
        completedAt: tasks.completedAt,
        referenceLink: tasks.referenceLink,
        notes: tasks.notes,
      })
      .from(tasks)
      .leftJoin(departments, eq(tasks.departmentId, departments.id))
      .leftJoin(users, eq(tasks.assignedEmployeeId, users.id))
      .orderBy(asc(tasks.dueDate));

    const today = dhakaDateKey(new Date());
    const csv = toCsv([
      ['Task ID', 'Task Name', 'Department', 'Assigned Employee', 'Priority', 'Start Date', 'Due Date', 'Status', 'Complete Date', 'Pending Days', 'Overdue', 'Notes', 'Reference Link'],
      ...rows.map((r) => {
        const pendingDays =
          r.status !== 'complete' && r.dueDate
            ? Math.round((Date.parse(`${r.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
            : 0;
        return [
          r.taskCode,
          r.name,
          r.department ?? '',
          r.employeeName ?? '',
          r.priority,
          r.startDate ?? '',
          r.dueDate ?? '',
          r.status,
          r.completedAt ?? '',
          pendingDays,
          r.status !== 'complete' && r.dueDate && r.dueDate < today ? 'Yes' : 'No',
          r.notes ?? '',
          r.referenceLink ?? '',
        ];
      }),
    ]);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tasks-${today}.csv"`,
      },
    });
  }

  if (kind === 'payroll') {
    const rows = await db
      .select({
        employeeCode: users.employeeCode,
        employeeName: users.fullName,
        department: departments.name,
        basicSalary: payrollRecords.basicSalary,
        allowances: payrollRecords.allowances,
        overtimeAmount: payrollRecords.overtimeAmount,
        bonusAmount: payrollRecords.bonusAmount,
        deductions: payrollRecords.deductions,
        netPayable: payrollRecords.netPayable,
        lateDays: payrollRecords.lateDays,
        status: payrollRecords.status,
      })
      .from(payrollRecords)
      .innerJoin(users, eq(payrollRecords.employeeId, users.id))
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(and(eq(payrollRecords.year, year), eq(payrollRecords.month, month)))
      .orderBy(asc(users.fullName));

    const csv = toCsv([
      ['Employee ID', 'Employee Name', 'Department', 'Basic', 'Allowances', 'Overtime', 'Bonus', 'Deductions', 'Net Payable', 'Late Days', 'Status'],
      ...rows.map((r) => [
        r.employeeCode,
        r.employeeName,
        r.department ?? '',
        r.basicSalary,
        r.allowances,
        r.overtimeAmount,
        r.bonusAmount,
        r.deductions,
        r.netPayable,
        r.lateDays,
        r.status,
      ]),
    ]);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="payroll-${year}-${String(month).padStart(2, '0')}.csv"`,
      },
    });
  }

  if (kind === 'roster') {
    const today = dhakaDateKey(new Date());
    const rows = await db
      .select({
        rosterId: rosters.id,
        version: rosters.version,
        employeeCode: users.employeeCode,
        employeeName: users.fullName,
        date: rosterEntries.date,
        isOff: rosterEntries.isOff,
        status: rosters.status,
      })
      .from(rosterEntries)
      .innerJoin(rosters, eq(rosterEntries.rosterId, rosters.id))
      .innerJoin(users, eq(rosterEntries.employeeId, users.id))
      .orderBy(desc(rosters.version), asc(users.fullName), asc(rosterEntries.date));

    const csv = toCsv([
      ['Roster ID', 'Version', 'Employee ID', 'Employee Name', 'Date', 'Off Day', 'Publish Status'],
      ...rows.map((r) => [r.rosterId, r.version, r.employeeCode, r.employeeName, r.date, r.isOff ? 'Yes' : 'No', r.status]),
    ]);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="roster-${today}.csv"`,
      },
    });
  }

  throw notFound('Unknown report type.');
});

/* ================================================== notification digest */

/** Broadcast an important attendance notice to every active employee. */
hrSystemRoutes.post(
  '/broadcast-attendance-notice',
  requirePermission([PERMISSIONS.HR_ANNOUNCEMENT_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const session = c.get('session');
    const body = (await c.req.json()) as { title: string; body: string };

    const employees = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'employee'), eq(users.status, 'active')));

    await createNotifications(
      db,
      env,
      employees.map((e) => ({
        employeeId: e.id,
        type: 'attendance_notice',
        title: body.title,
        body: body.body,
        link: '/app/notifications',
        createdBy: session.id,
      })),
    );

    const meta = requestMeta(c);
    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'attendance.broadcast_notice',
      entityType: 'notification',
      entityId: null,
      after: { recipients: employees.length, title: body.title },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok(c, { sent: employees.length });
  },
);

/** Task deadline reminders — run daily by the platform scheduler. */
hrSystemRoutes.post('/task-reminders', requirePermission([PERMISSIONS.HR_TASK_MANAGE]), async (c) => {
  const db = c.get('db');
  const env = c.get('env');
  const session = c.get('session');
  const today = dhakaDateKey(new Date());
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + 2);
  const horizonKey = dhakaDateKey(horizon);

  const due = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, 'in_progress'), gte(tasks.dueDate, today), lte(tasks.dueDate, horizonKey)))
    .limit(100);

  const targets = due.filter((t) => t.assignedEmployeeId);
  if (targets.length) {
    await createNotifications(
      db,
      env,
      targets.map((t) => ({
        employeeId: t.assignedEmployeeId!,
        type: 'task_deadline_reminder',
        title: `Task due soon: ${t.name}`,
        body: `This task is due on ${t.dueDate}.`,
        link: '/app/tasks',
        createdBy: session.id,
      })),
    );
  }

  return ok(c, { reminders: targets.length });
});

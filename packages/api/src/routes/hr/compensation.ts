import { Hono } from 'hono';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import {
  ATTENDANCE_BONUS_LADDER,
  PERMISSIONS,
  dhakaDateKey,
  payrollGenerateSchema,
  payrollUpdateSchema,
} from '@bronee/shared';
import {
  attendanceBonusSnapshots,
  attendanceSessions,
  departments,
  overtimeRequests,
  payrollRecords,
  users,
} from '../../db/schema.js';
import { badRequest, notFound, ok } from '../../lib/http.js';
import { randomId } from '../../lib/crypto.js';
import { requirePermission } from '../../middleware/auth.js';
import { toBonusSnapshot, toPayrollRecord } from '../../lib/mappers.js';
import { requestMeta, writeAudit } from '../../lib/audit.js';
import { createNotifications } from '../../lib/notifications.js';
import type { AppEnv } from '../../types.js';
export const hrCompensationRoutes = new Hono<AppEnv>();

/** Bonus amount for a given number of late days. */
export function bonusForLateDays(lateDays: number): number {
  for (const tier of ATTENDANCE_BONUS_LADDER) {
    if (lateDays <= tier.maxLateDays) return tier.amount;
  }
  return 0;
}

/* ======================================================== bonus snapshots */

/** Recalculate the attendance bonus snapshot for a month. */
hrCompensationRoutes.post(
  '/bonus/calculate',
  requirePermission([PERMISSIONS.HR_BONUS_VIEW]),
  zValidator('json', payrollGenerateSchema),
  async (c) => {
    const db = c.get('db');
    const session = c.get('session');
    const { year, month } = c.req.valid('json');
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-31`;

    const employees = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(eq(users.role, 'employee'));

    const sessions = await db
      .select({
        employeeId: attendanceSessions.employeeId,
        lateStatus: attendanceSessions.lateStatus,
        attendanceStatus: attendanceSessions.attendanceStatus,
      })
      .from(attendanceSessions)
      .where(and(gte(attendanceSessions.date, start), lte(attendanceSessions.date, end)));

    const byEmployee = new Map<string, number>();
    for (const s of sessions) {
      const late = s.lateStatus === 'late' || s.lateStatus === 'pending_review';
      byEmployee.set(s.employeeId, (byEmployee.get(s.employeeId) ?? 0) + (late ? 1 : 0));
    }

    const rows = employees.map((e) => {
      const lateDays = byEmployee.get(e.id) ?? 0;
      const bonusAmount = bonusForLateDays(lateDays);
      return {
        id: randomId(),
        employeeId: e.id,
        year,
        month,
        lateDays,
        bonusAmount,
        eligible: bonusAmount > 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    for (const row of rows) {
      await db
        .insert(attendanceBonusSnapshots)
        .values(row)
        .onConflictDoUpdate({
          target: [attendanceBonusSnapshots.employeeId, attendanceBonusSnapshots.year, attendanceBonusSnapshots.month],
          set: {
            lateDays: row.lateDays,
            bonusAmount: row.bonusAmount,
            eligible: row.eligible,
            updatedAt: row.updatedAt,
          },
        });
    }

    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'bonus.calculated',
      entityType: 'attendance_bonus',
      entityId: `${year}-${month}`,
      after: { employees: rows.length },
    });

    return ok(c, { year, month, calculated: rows.length, items: rows.map(toBonusSnapshot) });
  },
);

/** Bonus snapshot listing for HR. */
hrCompensationRoutes.get('/bonus', requirePermission([PERMISSIONS.HR_BONUS_VIEW]), async (c) => {
  const db = c.get('db');
  const year = Number(c.req.query('year') ?? new Date().getUTCFullYear());
  const month = Number(c.req.query('month') ?? new Date().getUTCMonth() + 1);

  const rows = await db
    .select({
      snapshot: attendanceBonusSnapshots,
      employeeName: users.fullName,
      employeeCode: users.employeeCode,
    })
    .from(attendanceBonusSnapshots)
    .innerJoin(users, eq(attendanceBonusSnapshots.employeeId, users.id))
    .where(
      and(
        eq(attendanceBonusSnapshots.year, year),
        eq(attendanceBonusSnapshots.month, month),
      ),
    )
    .orderBy(asc(users.fullName));

  return ok(c, {
    year,
    month,
    policy: ATTENDANCE_BONUS_LADDER,
    items: rows.map((r) => ({ ...toBonusSnapshot(r.snapshot), employeeName: r.employeeName, employeeCode: r.employeeCode })),
    totalAmount: rows.reduce((s, r) => s + r.snapshot.bonusAmount, 0),
  });
});

/* ================================================================ payroll */

/** Generate a draft payroll run for a month. */
hrCompensationRoutes.post(
  '/payroll/generate',
  requirePermission([PERMISSIONS.HR_PAYROLL_MANAGE]),
  zValidator('json', payrollGenerateSchema),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const session = c.get('session');
    const { year, month } = c.req.valid('json');
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-31`;

    const employees = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        employeeCode: users.employeeCode,
      })
      .from(users)
      .where(eq(users.role, 'employee'));

    const attendance = await db
      .select({
        employeeId: attendanceSessions.employeeId,
        lateStatus: attendanceSessions.lateStatus,
        workingSeconds: attendanceSessions.workingSeconds,
        attendanceStatus: attendanceSessions.attendanceStatus,
      })
      .from(attendanceSessions)
      .where(and(gte(attendanceSessions.date, start), lte(attendanceSessions.date, end)));

    const bonuses = await db
      .select()
      .from(attendanceBonusSnapshots)
      .where(
        and(
          eq(attendanceBonusSnapshots.year, year),
          eq(attendanceBonusSnapshots.month, month),
        ),
      );

    const overtime = await db
      .select()
      .from(overtimeRequests)
      .where(eq(overtimeRequests.status, 'completed'));

    const existing = await db
      .select()
      .from(payrollRecords)
      .where(and(eq(payrollRecords.year, year), eq(payrollRecords.month, month)));

    const created: typeof payrollRecords.$inferSelect[] = [];

    for (const employee of employees) {
      const empAttendance = attendance.filter((a) => a.employeeId === employee.id);
      const lateDays = empAttendance.filter(
        (a) => a.lateStatus === 'late' || a.lateStatus === 'pending_review',
      ).length;
      const presentDays = empAttendance.filter((a) => a.attendanceStatus === 'present').length;
      const bonus = bonuses.find((b) => b.employeeId === employee.id);
      const ot = overtime.filter((o) => o.employeeId === employee.id);
      const otHours = ot.reduce((s, o) => s + (o.actualHours ?? 0), 0);

      const base = existing.find((e) => e.employeeId === employee.id);
      const basicSalary = base?.basicSalary ?? 0;
      const allowances = base?.allowances ?? 0;
      const deductions = base?.deductions ?? 0;
      const bonusAmount = bonus?.bonusAmount ?? 0;

      // Overtime is paid at the hourly rate derived from the monthly basic
      // salary (8 standard hours per working day of the month).
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const hourlyRate = basicSalary > 0 ? basicSalary / (daysInMonth * 8) : 0;
      const overtimeAmount = Math.round(otHours * hourlyRate);

      const record = {
        id: base?.id ?? randomId(),
        employeeId: employee.id,
        year,
        month,
        basicSalary,
        allowances,
        overtimeAmount,
        bonusAmount,
        deductions,
        netPayable: basicSalary + allowances + overtimeAmount + bonusAmount - deductions,
        workingDays: empAttendance.length,
        presentDays,
        lateDays,
        status: 'draft' as const,
        publishedAt: null,
        notes: base?.notes ?? null,
        createdBy: session.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db
        .insert(payrollRecords)
        .values(record)
        .onConflictDoUpdate({
          target: [payrollRecords.employeeId, payrollRecords.year, payrollRecords.month],
          set: {
            basicSalary: record.basicSalary,
            allowances: record.allowances,
            bonusAmount: record.bonusAmount,
            deductions: record.deductions,
            netPayable: record.netPayable,
            workingDays: record.workingDays,
            presentDays: record.presentDays,
            lateDays: record.lateDays,
            updatedAt: record.updatedAt,
          },
        });

      created.push(record);
    }

    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'payroll.generated',
      entityType: 'payroll_run',
      entityId: `${year}-${month}`,
      after: { records: created.length },
    });

    void env;
    return ok(c, { year, month, records: created.length, items: created.map(toPayrollRecord) });
  },
);

/** Payroll listing for a month. */
hrCompensationRoutes.get('/payroll', requirePermission([PERMISSIONS.HR_PAYROLL_VIEW]), async (c) => {
  const db = c.get('db');
  const year = Number(c.req.query('year') ?? new Date().getUTCFullYear());
  const month = Number(c.req.query('month') ?? new Date().getUTCMonth() + 1);

  const rows = await db
    .select({
      record: payrollRecords,
      employeeName: users.fullName,
      employeeCode: users.employeeCode,
      departmentName: departments.name,
    })
    .from(payrollRecords)
    .innerJoin(users, eq(payrollRecords.employeeId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(and(eq(payrollRecords.year, year), eq(payrollRecords.month, month)))
    .orderBy(asc(users.fullName));

  return ok(c, {
    year,
    month,
    items: rows.map((r) => ({
      ...toPayrollRecord(r.record),
      employeeName: r.employeeName,
      employeeCode: r.employeeCode,
      department: r.departmentName,
    })),
    totals: {
      netPayable: rows.reduce((s, r) => s + r.record.netPayable, 0),
      basicSalary: rows.reduce((s, r) => s + r.record.basicSalary, 0),
      bonus: rows.reduce((s, r) => s + r.record.bonusAmount, 0),
      overtime: rows.reduce((s, r) => s + r.record.overtimeAmount, 0),
      deductions: rows.reduce((s, r) => s + r.record.deductions, 0),
    },
  });
});

/** Adjust a payroll record. */
hrCompensationRoutes.patch(
  '/payroll/:id',
  requirePermission([PERMISSIONS.HR_PAYROLL_MANAGE]),
  zValidator('json', payrollUpdateSchema),
  async (c) => {
    const db = c.get('db');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const rows = await db.select().from(payrollRecords).where(eq(payrollRecords.id, id)).limit(1);
    const record = rows[0];
    if (!record) throw notFound('Payroll record not found.');
    if (record.status === 'published') {
      throw badRequest('Published payroll records cannot be edited. Reopen the run first.');
    }

    const basicSalary = body.basicSalary ?? record.basicSalary;
    const allowances = body.allowances ?? record.allowances;
    const overtimeAmount = body.overtimeAmount ?? record.overtimeAmount;
    const deductions = body.deductions ?? record.deductions;
    const netPayable = basicSalary + allowances + overtimeAmount + record.bonusAmount - deductions;

    await db
      .update(payrollRecords)
      .set({
        basicSalary,
        allowances,
        overtimeAmount,
        deductions,
        netPayable,
        notes: body.notes ?? record.notes,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(payrollRecords.id, id));

    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'payroll.updated',
      entityType: 'payroll_record',
      entityId: id,
      before: { netPayable: record.netPayable, basicSalary: record.basicSalary },
      after: { netPayable, basicSalary },
    });

    const after = (await db.select().from(payrollRecords).where(eq(payrollRecords.id, id)).limit(1))[0];
    return ok(c, { record: toPayrollRecord(after) });
  },
);

/** Publish the payroll run — employees then see their payslips. */
hrCompensationRoutes.post(
  '/payroll/publish',
  requirePermission([PERMISSIONS.HR_PAYROLL_PUBLISH]),
  zValidator('json', payrollGenerateSchema),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const session = c.get('session');
    const { year, month } = c.req.valid('json');
    const now = new Date().toISOString();

    const rows = await db
      .select()
      .from(payrollRecords)
      .where(and(eq(payrollRecords.year, year), eq(payrollRecords.month, month)));

    if (rows.length === 0) throw badRequest('Generate the payroll run before publishing it.');

    await db
      .update(payrollRecords)
      .set({ status: 'published', publishedAt: now, updatedAt: now })
      .where(and(eq(payrollRecords.year, year), eq(payrollRecords.month, month)));

    const employeeRows = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(eq(users.role, 'employee'));

    const nameById = new Map(employeeRows.map((e) => [e.id, e.fullName]));

    await createNotifications(
      db,
      env,
      rows.map((r) => ({
        employeeId: r.employeeId,
        type: 'salary_published',
        title: `Your ${monthName(month)} salary has been published`,
        body: `Your ${monthName(month)} ${year} payslip is now available in the portal.`,
        link: '/app/salary',
        createdBy: session.id,
      })),
    );

    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'payroll.published',
      entityType: 'payroll_run',
      entityId: `${year}-${month}`,
      after: { records: rows.length, employees: nameById.size },
    });

    return ok(c, { published: rows.length });
  },
);

function monthName(month: number): string {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1] ?? '';
}

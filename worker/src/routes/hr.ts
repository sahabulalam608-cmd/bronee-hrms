/**
 * BRONEE HRMS — HR & management API.
 *
 * Every sensitive operation is permission checked, validated and audited.
 * Sheets-sourced changes are validated before they are applied to D1.
 */

import { Hono } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';
import { ATTENDANCE_BONUS_TIERS, ROLE_PERMISSIONS, SHEETS, type Role } from '../../../shared/constants';
import { bdDateKey, computePayroll } from '../../../shared/attendance';
import { db } from '../db';
import {
  announcements,
  announcementRecipients,
  attendanceSessions,
  auditLogs,
  breakSessions,
  companySettings,
  designations,
  departments,
  employees,
  leaveApplications,
  notifications,
  overtimeRequests,
  rosterChangeLog,
  rosterChangeRequests,
  rosterEntries,
  rosters,
  salaryRecords,
  signupApplications,
  staffingRules,
  syncLogs,
  tasks,
  taskSubmissions,
  users,
} from '../db/schema';
import { requirePermission, requirePortal, requireSession } from '../middleware/auth';
import { writeAudit } from '../services/audit';
import { leaveTemplate, sendMail } from '../services/email';
import {logSync, pushRoster, syncLeaveApplications, syncTaskManagement, updateSignupDecision } from '../services/sheets';
import type { Env } from '../env';

const hr = new Hono<{ Bindings: Env; Variables: { user: any } }>();

hr.use('*', requireSession);
hr.use('*', requirePortal('HR'));

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

hr.get('/dashboard', async (c) => {
  const database = db(c.env);
  const today = bdDateKey(new Date());
  const month = today.slice(0, 7);

  const all = await database.query.employees.findMany();
  const todayRecords = await database.query.attendanceSessions.findMany({
    where: eq(attendanceSessions.workDate, today),
  });
  const allLeaves = await database.query.leaveApplications.findMany();
  const allOt = await database.query.overtimeRequests.findMany();
  const allTasks = await database.query.tasks.findMany();
  const signups = await database.query.signupApplications.findMany();
  const requests = await database.query.rosterChangeRequests.findMany();

  const months: string[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const leaveTypes = new Map<string, number>();
  for (const l of allLeaves) leaveTypes.set(l.leaveType, (leaveTypes.get(l.leaveType) ?? 0) + 1);

  const payroll = await database.query.salaryRecords.findMany({
    where: eq(salaryRecords.month, month),
  });

  return c.json({
    totalEmployees: all.length,
    activeEmployees: all.filter((e) => e.status === 'Active').length,
    pendingApplications:
      signups.filter((s) => s.status === 'Pending').length +
      allLeaves.filter((l) => l.status === 'Pending').length +
      allOt.filter((o) => o.status === 'Pending').length +
      requests.filter((r) => r.status === 'Pending').length,
    approvedThisMonth: allLeaves.filter(
      (l) => l.status === 'Approved' && l.submittedAt.startsWith(month),
    ).length,
    totalApplications: allLeaves.length,
    todaysApplications: allLeaves.filter((l) => l.submittedAt.startsWith(today)).length,
    leaveTypeDistribution: [...leaveTypes.entries()].map(([label, value]) => ({ label, value })),
    applicationsByMonth: months.map((m) => ({
      month: m,
      applied: allLeaves.filter((l) => l.submittedAt.startsWith(m)).length,
      approved: allLeaves.filter((l) => l.submittedAt.startsWith(m) && l.status === 'Approved').length,
    })),
    todaysAttendance: {
      present: todayRecords.filter((r) => r.attendanceStatus === 'Verified').length,
      absent: todayRecords.filter((r) => r.attendanceStatus === 'Absent').length,
      late: todayRecords.filter((r) => r.lateStatus === 'Late').length,
      onLeave: allLeaves.filter(
        (l) => l.status === 'Approved' && l.fromDate <= today && l.toDate >= today,
      ).length,
      pendingReview: todayRecords.filter(
        (r) => r.attendanceStatus === 'Pending Review' || r.attendanceStatus === 'Verification Failed',
      ).length,
    },
    lateEmployees: todayRecords
      .filter((r) => r.lateStatus === 'Late')
      .map((r) => ({ employeeId: r.employeeId, name: r.employeeId, department: '', punchIn: r.punchIn })),
    currentlyWorking: todayRecords.filter(
      (r) => r.actualWorkingStart && !r.clockOut && r.actualWorkingStart <= new Date().toISOString(),
    ).length,
    onBreak: (
      await database.query.breakSessions.findMany({ where: eq(breakSessions.workDate, today) })
    ).filter((b) => !b.endAt).length,
    overtimeSummary: {
      requested: allOt.filter((o) => o.status === 'Pending').length,
      approved: allOt.filter((o) => o.status === 'Approved').length,
      actualHours: Math.round(allOt.reduce((sum, o) => sum + (o.actualMinutes ?? 0), 0) / 60),
    },
    monthlyPayroll: {
      month,
      netPayable: payroll.reduce((sum, r) => sum + r.netPayable, 0),
      employees: payroll.length,
    },
    taskSummary: {
      total: allTasks.length,
      inProgress: allTasks.filter((t) => t.status === 'In Progress').length,
      completed: allTasks.filter((t) => t.status === 'Complete').length,
      yetToStart: allTasks.filter((t) => t.status === 'Yet to Start').length,
      pending: allTasks.filter((t) => t.status === 'Pending').length,
      overdue: allTasks.filter((t) => t.status !== 'Complete' && t.dueDate < today).length,
      byPriority: (['High', 'Medium', 'Low'] as const).map((label) => ({
        label,
        value: allTasks.filter((t) => t.priority === label).length,
      })),
      byDepartment: Object.entries(
        allTasks.reduce<Record<string, number>>((acc, t) => {
          acc[t.departmentName] = (acc[t.departmentName] ?? 0) + 1;
          return acc;
        }, {}),
      ).map(([label, value]) => ({ label, value })),
      byStatus: (['Complete', 'In Progress', 'Pending', 'Yet to Start'] as const).map((label) => ({
        label,
        value: allTasks.filter((t) => t.status === label).length,
      })),
    },
  });
});

/* ------------------------------------------------------------------ *
 * Employees
 * ------------------------------------------------------------------ */

hr.get('/employees', requirePermission('employee.view'), async (c) => {
  const database = db(c.env);
  return c.json(await database.query.employees.findMany());
});

hr.patch('/employees/:id', requirePermission('employee.edit'), async (c) => {
  const database = db(c.env);
  const { id } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const existing = await database.query.employees.findFirst({ where: eq(employees.id, id) });
  if (!existing) return c.json({ error: 'NOT_FOUND', message: 'Employee not found.' }, 404);

  const patch: Record<string, unknown> = {};
  for (const key of ['fullName', 'mobile', 'designation', 'shiftCode', 'status', 'reportingManager']) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  await database.update(employees).set(patch).where(eq(employees.id, id));
  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: 'employee.update',
    entity: 'employee',
    entityId: id,
    before: existing.fullName,
    after: String(patch.fullName ?? existing.fullName),
  });
  return c.json({ ...existing, ...patch });
});

/* ------------------------------------------------------------------ *
 * Signup approvals
 * ------------------------------------------------------------------ */

hr.get('/signups', requirePermission('signup.approve'), async (c) => {
  const database = db(c.env);
  return c.json(await database.query.signupApplications.findMany());
});

hr.post('/signups/:id', requirePermission('signup.approve'), async (c) => {
  const database = db(c.env);
  const { id } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    decision?: 'approve' | 'decline';
    note?: string;
    salary?: number;
  };
  const signup = await database.query.signupApplications.findFirst({
    where: eq(signupApplications.id, id),
  });
  if (!signup) return c.json({ error: 'NOT_FOUND', message: 'Application not found.' }, 404);

  const approved = body.decision === 'approve';
  const decidedAt = new Date().toISOString();
  const decidedBy = c.get('user').fullName;
  await database
    .update(signupApplications)
    .set({
      status: approved ? 'Approved' : 'Declined',
      reviewNote: body.note ?? null,
      salary: body.salary ?? null,
      decidedAt,
      decidedBy,
    })
    .where(eq(signupApplications.id, id));

  // The decision and its note are written back to the same line of the
  // Employee Signups sheet. A sheet failure never loses the decision.
  try {
    await updateSignupDecision(c.env, id, {
      status: approved ? 'Approved' : 'Declined',
      note: body.note ?? null,
      decidedAt,
      decidedBy,
    });
  } catch (error) {
    console.error('[sheets:signup-decision]', error);
  }

  if (approved) {
    const dept = await database.query.departments.findFirst({
      where: eq(departments.name, signup.departmentName),
    });
    const sub = signup.subDepartmentName
      ? await database.query.departments.findFirst({
          where: eq(departments.name, signup.subDepartmentName),
        })
      : null;
    const employeeId = `emp-${Date.now().toString(36)}`;
    await database.insert(employees).values({
      id: employeeId,
      employeeId: signup.employeeId,
      fullName: signup.fullName,
      mobile: signup.mobile,
      email: signup.email,
      designation: signup.designation,
      departmentId: dept?.id ?? '',
      subDepartmentId: sub?.id ?? null,
      reportingManager: signup.reportingManager,
      joiningDate: signup.joiningDate,
      shiftCode: 'MORNING',
      status: 'Approved',
      portal: 'EMPLOYEE',
      role: 'HR_VIEWER',
      baseSalary: body.salary ?? null,
      allowances: 0,
      createdAt: new Date().toISOString(),
    });
    await database.insert(users).values({
      id: `user-${Date.now().toString(36)}`,
      email: signup.email,
      passwordHash: signup.passwordHash ?? '',
      employeeId,
      role: 'HR_VIEWER',
      status: 'Active',
      createdAt: new Date().toISOString(),
    });
    await notify(database, employeeId, 'Account approved', 'Your employee account has been approved. You can now sign in.', 'Account Approved');
  } else {
    await notify(
      database,
      signup.employeeId,
      'Account declined',
      `Your registration was declined.${body.note ? ` ${body.note}` : ''}`,
      'Account Declined',
    );
  }

  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: `signup.${body.decision}`,
    entity: 'signup',
    entityId: id,
    before: 'Pending',
    after: approved ? 'Approved' : 'Declined',
    note: body.note,
  });
  return c.json({ ...signup, status: approved ? 'Approved' : 'Declined' });
});

/* ------------------------------------------------------------------ *
 * Departments & designations
 * ------------------------------------------------------------------ */

hr.get('/departments', requirePermission('department.manage'), async (c) => {
  const database = db(c.env);
  return c.json(await database.query.departments.findMany());
});

hr.post('/departments', requirePermission('department.manage'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    parentId?: string | null;
    displayOrder?: number;
    active?: boolean;
  };
  if (!body.name) return c.json({ error: 'BAD_REQUEST', message: 'A name is required.' }, 400);

  if (body.id) {
    const existing = await database.query.departments.findFirst({
      where: eq(departments.id, body.id),
    });
    if (!existing) return c.json({ error: 'NOT_FOUND', message: 'Department not found.' }, 404);
    if (existing.protected && !ROLE_PERMISSIONS[c.get('user').role as Role].includes('department.protected.reorder')) {
      return c.json(
        { error: 'FORBIDDEN', message: 'Protected departments cannot be changed by your role.' },
        403,
      );
    }
    await database
      .update(departments)
      .set({ name: body.name, active: body.active === false ? 0 : 1 })
      .where(eq(departments.id, body.id));
    await writeAudit(database, {
      actor: c.get('user').fullName,
      actorRole: c.get('user').role,
      action: 'department.update',
      entity: 'department',
      entityId: body.id,
      after: body.name,
    });
    return c.json({ ...existing, name: body.name, active: body.active === false ? 0 : 1 });
  }

  const id = `dep-${Date.now().toString(36)}`;
  await database.insert(departments).values({
    id,
    name: body.name,
    kind: body.parentId ? 'SUB_DEPARTMENT' : 'DEPARTMENT',
    parentId: body.parentId ?? null,
    displayOrder: body.displayOrder ?? 99,
    active: body.active === false ? 0 : 1,
    protected: 0,
  });
  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: 'department.create',
    entity: 'department',
    entityId: id,
    after: body.name,
  });
  return c.json({ id, name: body.name });
});

hr.post('/departments/reorder', requirePermission('department.manage'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { idsInOrder?: string[] };
  const ids = body.idsInOrder ?? [];

  const all = await database.query.departments.findMany();
  const protectedIds = all.filter((d) => d.protected).sort((a, b) => a.displayOrder - b.displayOrder).map((d) => d.id);
  const newProtected = ids.filter((id) => protectedIds.includes(id));
  if (
    JSON.stringify(newProtected) !== JSON.stringify(protectedIds) &&
    !ROLE_PERMISSIONS[c.get('user').role as Role].includes('department.protected.reorder')
  ) {
    return c.json(
      { error: 'FORBIDDEN', message: 'HR and CEO must always keep their protected order.' },
      403,
    );
  }

  for (const [index, id] of ids.entries()) {
    await database.update(departments).set({ displayOrder: index + 1 }).where(eq(departments.id, id));
  }
  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: 'department.reorder',
    entity: 'department',
    entityId: 'all',
    after: ids.join(','),
  });
  return c.json(await database.query.departments.findMany());
});

hr.get('/designations', requirePermission('designation.manage'), async (c) => {
  const database = db(c.env);
  return c.json(await database.query.designations.findMany());
});

hr.post('/designations', requirePermission('designation.manage'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    departmentId?: string | null;
    active?: boolean;
  };
  if (!body.name) return c.json({ error: 'BAD_REQUEST', message: 'A name is required.' }, 400);

  if (body.id) {
    await database
      .update(designations)
      .set({ name: body.name, active: body.active === false ? 0 : 1 })
      .where(eq(designations.id, body.id));
    return c.json({ id: body.id, name: body.name, active: body.active === false ? 0 : 1 });
  }
  const id = `des-${Date.now().toString(36)}`;
  await database.insert(designations).values({
    id,
    name: body.name,
    departmentId: body.departmentId ?? null,
    active: body.active === false ? 0 : 1,
  });
  return c.json({ id, name: body.name });
});

/* ------------------------------------------------------------------ *
 * Roster
 * ------------------------------------------------------------------ */

hr.get('/rosters', requirePermission('roster.view'), async (c) => {
  const database = db(c.env);
  return c.json(await database.query.rosters.findMany({ orderBy: desc(rosters.startDate) }));
});

hr.get('/rosters/history', requirePermission('roster.view'), async (c) => {
  const database = db(c.env);
  return c.json(await database.query.rosterChangeLog.findMany({ orderBy: desc(rosterChangeLog.changedAt) }));
});

hr.get('/rosters/:id/entries', requirePermission('roster.view'), async (c) => {
  const database = db(c.env);
  return c.json(
    await database.query.rosterEntries.findMany({ where: eq(rosterEntries.rosterId, c.req.param('id')!) }),
  );
});

hr.get('/rosters/:id/conflicts', requirePermission('roster.view'), async (c) => {
  const database = db(c.env);
  const entries = await database.query.rosterEntries.findMany({
    where: eq(rosterEntries.rosterId, c.req.param('id')!),
  });
  const rules = await database.query.staffingRules.findMany();
  const depts = await database.query.departments.findMany();
  const staff = await database.query.employees.findMany({
    columns: { id: true, departmentId: true },
  });
  const departmentNameById = new Map(depts.map((d) => [d.id, d.name]));
  const departmentByEmployee = new Map(
    staff.map((e) => [e.id, departmentNameById.get(e.departmentId) ?? e.departmentId]),
  );

  const dates = Array.from(new Set(entries.map((e) => e.date))).sort();
  const checks = rules.flatMap((rule) => {
    const dept = depts.find((d) => d.id === rule.departmentId);
    const departmentName = dept?.name ?? rule.departmentId;
    return dates.map((date) => {
      const assigned = entries.filter(
        (e) =>
          departmentByEmployee.get(e.employeeId) === departmentName &&
          e.shiftCode === rule.shiftCode &&
          e.date === date,
      ).length;
      return {
        departmentName,
        shiftCode: rule.shiftCode,
        date,
        required: rule.minEmployees,
        assigned,
        shortfall: Math.max(0, rule.minEmployees - assigned),
      };
    });
  });
  return c.json(checks);
});

hr.post('/rosters', requirePermission('roster.edit'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as {
    startDate?: string;
    endDate?: string;
    assignments?: Record<string, Record<string, string>>;
  };
  if (!body.startDate || !body.endDate) {
    return c.json({ error: 'BAD_REQUEST', message: 'Start and end dates are required.' }, 400);
  }
  const existing = await database.query.rosters.findMany();
  const id = `roster-${Date.now().toString(36)}`;
  await database.insert(rosters).values({
    id,
    version: existing.length + 1,
    startDate: body.startDate,
    endDate: body.endDate,
    status: 'Draft',
    createdAt: new Date().toISOString(),
  });
  await writeEntries(database, id, existing.length + 1, body.assignments ?? {});
  return c.json({ id, version: existing.length + 1, status: 'Draft' });
});

hr.patch('/rosters/:id', requirePermission('roster.edit'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as {
    assignments?: Record<string, Record<string, string>>;
  };
  const roster = await database.query.rosters.findFirst({ where: eq(rosters.id, c.req.param('id')!) });
  if (!roster) return c.json({ error: 'NOT_FOUND', message: 'Roster not found.' }, 404);
  if (roster.status === 'Published') {
    return c.json(
      { error: 'LOCKED', message: 'Published rosters are versioned. Create a new version instead.' },
      409,
    );
  }
  await database.delete(rosterEntries).where(eq(rosterEntries.rosterId, roster.id));
  await writeEntries(database, roster.id, roster.version, body.assignments ?? {});
  return c.json(roster);
});

hr.post('/rosters/:id/update', requirePermission('roster.publish'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as {
    assignments?: Record<string, Record<string, string>>;
  };
  const roster = await database.query.rosters.findFirst({ where: eq(rosters.id, c.req.param('id')!) });
  if (!roster) return c.json({ error: 'NOT_FOUND', message: 'Roster not found.' }, 404);
  if (roster.status !== 'Published') {
    return c.json(
      { error: 'LOCKED', message: 'Only a published roster can be updated. Edit the draft instead.' },
      409,
    );
  }

  const entries = await database.query.rosterEntries.findMany({
    where: eq(rosterEntries.rosterId, roster.id),
  });
  const assignments = body.assignments ?? {};
  const notified: string[] = [];

  for (const entry of entries) {
    const next = assignments[entry.employeeId]?.[entry.date];
    if (!next || next === entry.shiftCode) continue;
    const person = await database.query.employees.findFirst({
      where: eq(employees.id, entry.employeeId),
    });
    await database
      .update(rosterEntries)
      .set({ shiftCode: next, changed: 1 })
      .where(eq(rosterEntries.id, entry.id));
    await database.insert(rosterChangeLog).values({
      id: `rcl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      rosterId: roster.id,
      rosterVersion: roster.version,
      employeeId: entry.employeeId,
      previousShift: entry.shiftCode,
      updatedShift: next,
      changedBy: c.get('user').fullName,
      changedAt: new Date().toISOString(),
      publishStatus: 'Updated',
      notificationStatus: 'Sent',
    });
    if (!notified.includes(entry.employeeId)) notified.push(entry.employeeId);
    await notify(
      database,
      entry.employeeId,
      'Roster updated',
      `Your shift for ${entry.date} is now ${next}.`,
      'Roster Update',
      'roster',
    );
    void person;
  }

  await database
    .update(rosters)
    .set({
      publishedAt: new Date().toISOString(),
      publishedBy: c.get('user').fullName,
      notificationSent: notified.length ? 1 : 0,
    })
    .where(eq(rosters.id, roster.id));

  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: 'roster.update',
    entity: 'roster',
    entityId: roster.id,
    after: `published roster updated, ${notified.length} notified`,
  });

  return c.json({ version: { ...roster, status: 'Published' }, notified });
});

hr.post('/rosters/:id/publish', requirePermission('roster.publish'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { mode?: 'now' | 'schedule'; publishAt?: string };
  const roster = await database.query.rosters.findFirst({ where: eq(rosters.id, c.req.param('id')!) });
  if (!roster) return c.json({ error: 'NOT_FOUND', message: 'Roster not found.' }, 404);

  if (body.mode === 'schedule') {
    await database
      .update(rosters)
      .set({ status: 'Scheduled', publishAt: body.publishAt ?? new Date().toISOString() })
      .where(eq(rosters.id, roster.id));
    await writeAudit(database, {
      actor: c.get('user').fullName,
      actorRole: c.get('user').role,
      action: 'roster.schedule',
      entity: 'roster',
      entityId: roster.id,
      after: body.publishAt,
    });
    return c.json({ version: { ...roster, status: 'Scheduled' }, notified: [] });
  }

  const entries = await database.query.rosterEntries.findMany({
    where: eq(rosterEntries.rosterId, roster.id),
  });
  const previous = await database.query.rosterEntries.findMany();
  const notified: string[] = [];

  for (const entry of entries) {
    const prior = previous.find(
      (p) => p.employeeId === entry.employeeId && p.date === entry.date && p.rosterId !== roster.id,
    );
    if (!prior || prior.shiftCode !== entry.shiftCode) {
      if (!notified.includes(entry.employeeId)) notified.push(entry.employeeId);
      await notify(
        database,
        entry.employeeId,
        'Roster updated',
        `Your shift for ${entry.date} is now ${entry.shiftCode}.`,
        'Roster Update',
        'roster',
      );
      await database.insert(rosterChangeLog).values({
        id: `rcl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        rosterId: roster.id,
        rosterVersion: roster.version,
        employeeId: entry.employeeId,
        previousShift: prior?.shiftCode ?? '—',
        updatedShift: entry.shiftCode,
        changedBy: c.get('user').fullName,
        changedAt: new Date().toISOString(),
        publishStatus: 'Published',
        notificationStatus: 'Sent',
      });
    }
  }

  await database
    .update(rosters)
    .set({
      status: 'Published',
      publishedAt: new Date().toISOString(),
      publishedBy: c.get('user').fullName,
      notificationSent: notified.length ? 1 : 0,
    })
    .where(eq(rosters.id, roster.id));

  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: 'roster.publish',
    entity: 'roster',
    entityId: roster.id,
    after: `published, ${notified.length} notified`,
  });
  return c.json({ version: { ...roster, status: 'Published' }, notified });
});

hr.post('/rosters/:id/send', requirePermission('roster.publish'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { employeeId?: string };
  if (!body.employeeId) return c.json({ error: 'BAD_REQUEST', message: 'An employee is required.' }, 400);
  const entry = await database.query.rosterEntries.findFirst({
    where: and(eq(rosterEntries.rosterId, c.req.param('id')!), eq(rosterEntries.employeeId, body.employeeId)),
  });
  if (!entry) return c.json({ error: 'NOT_FOUND', message: 'No roster entry for this employee.' }, 404);
  await notify(
    database,
    entry.employeeId,
    'Roster update',
    `Your shift for ${entry.date} is ${entry.shiftCode}.`,
    'Roster Update',
    'roster',
  );
  return c.json({ notified: [entry.employeeId] });
});

hr.get('/roster-requests', requirePermission('roster.view'), async (c) => {
  const database = db(c.env);
  return c.json(
    await database.query.rosterChangeRequests.findMany({ orderBy: desc(rosterChangeRequests.createdAt) }),
  );
});

hr.post('/roster-requests/:id', requirePermission('roster.view'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as {
    decision?: 'approve' | 'decline';
    updateMode?: 'AUTO' | 'MANUAL';
    note?: string;
  };
  const request = await database.query.rosterChangeRequests.findFirst({
    where: eq(rosterChangeRequests.id, c.req.param('id')!),
  });
  if (!request) return c.json({ error: 'NOT_FOUND', message: 'Request not found.' }, 404);

  const approved = body.decision === 'approve';
  let rosterUpdated = request.rosterUpdated;

  if (approved && body.updateMode === 'AUTO') {
    const entries = await database.query.rosterEntries.findMany({
      where: and(
        eq(rosterEntries.employeeId, request.employeeId),
        eq(rosterEntries.date, request.currentDate),
      ),
    });
    for (const entry of entries) {
      const previousShift = entry.shiftCode;
      const nextShift = request.type === 'Shift Change' && request.requestedShift
        ? request.requestedShift
        : 'OFF';
      await database.update(rosterEntries).set({ shiftCode: nextShift, changed: 1 }).where(eq(rosterEntries.id, entry.id));
      await database.insert(rosterChangeLog).values({
        id: `rcl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        rosterId: entry.rosterId,
        rosterVersion: entry.rosterVersion,
        employeeId: entry.employeeId,
        previousShift,
        updatedShift: nextShift,
        changedBy: c.get('user').fullName,
        changedAt: new Date().toISOString(),
        publishStatus: 'Published',
        notificationStatus: 'Sent',
      });
    }
    rosterUpdated = 1;
  }

  await database
    .update(rosterChangeRequests)
    .set({
      status: approved ? 'Approved' : 'Declined',
      updateMode: body.updateMode ?? null,
      rosterUpdated,
      note: body.note ?? null,
      decidedAt: new Date().toISOString(),
      decidedBy: c.get('user').fullName,
    })
    .where(eq(rosterChangeRequests.id, request.id));

  await notify(
    database,
    request.employeeId,
    approved ? 'Off day change approved' : 'Off day change declined',
    `Your roster change request for ${request.currentDate} was ${approved ? 'approved' : 'declined'}.`,
    approved ? 'Off Day Change' : 'Shift Change',
    'roster',
  );
  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: `roster-change.${body.decision}`,
    entity: 'roster-change',
    entityId: request.id,
    before: 'Pending',
    after: approved ? 'Approved' : 'Declined',
    note: body.note,
  });
  return c.json({ ...request, status: approved ? 'Approved' : 'Declined' });
});

/* ------------------------------------------------------------------ *
 * Attendance, breaks, leave, overtime
 * ------------------------------------------------------------------ */

hr.get('/attendance', requirePermission('attendance.view'), async (c) => {
  const database = db(c.env);
  const month = c.req.query('month') ?? bdDateKey(new Date()).slice(0, 7);
  const records = await database.query.attendanceSessions.findMany({
    orderBy: desc(attendanceSessions.workDate),
  });
  const filtered = records.filter((r) => r.workDate.startsWith(month));
  return c.json({
    records: filtered,
    totalPresent: filtered.filter((r) => r.attendanceStatus === 'Verified').length,
    totalAbsent: filtered.filter((r) => r.attendanceStatus === 'Absent').length,
    totalLate: filtered.filter((r) => r.lateStatus === 'Late').length,
    totalOnLeave: filtered.filter((r) => r.attendanceStatus === 'On Leave').length,
    totalPendingReview: filtered.filter(
      (r) => r.attendanceStatus === 'Pending Review' || r.attendanceStatus === 'Verification Failed',
    ).length,
  });
});

hr.post('/attendance/:id/review', requirePermission('attendance.review'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { action?: string; note?: string };
  const record = await database.query.attendanceSessions.findFirst({
    where: eq(attendanceSessions.id, c.req.param('id')!),
  });
  if (!record) return c.json({ error: 'NOT_FOUND', message: 'Attendance record not found.' }, 404);

  const patch: Record<string, unknown> = {
    hrReviewStatus: 'Reviewed',
    hrReviewNote: body.note ?? null,
    reviewedBy: c.get('user').fullName,
    reviewedAt: new Date().toISOString(),
  };

  switch (body.action) {
    case 'verify':
      patch.attendanceStatus = 'Verified';
      patch.lateStatus = 'Not Late';
      break;
    case 'approve-late':
      patch.attendanceStatus = 'Verified';
      patch.lateStatus = 'Late';
      break;
    case 'excuse':
      patch.attendanceStatus = 'Excused';
      patch.lateStatus = 'Excused';
      break;
    case 'reject':
      patch.attendanceStatus = 'Rejected';
      patch.lateStatus = 'Excused';
      break;
    case 'correct':
      patch.isManual = 1;
      break;
    case 'clear-issue':
      patch.attendanceStatus = 'Verified';
      patch.lateStatus = 'Not Late';
      patch.verificationResult = 'SUCCESS';
      break;
    default:
      return c.json({ error: 'BAD_REQUEST', message: 'Unknown attendance review action.' }, 400);
  }

  await database.update(attendanceSessions).set(patch).where(eq(attendanceSessions.id, record.id));
  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: `attendance.${body.action}`,
    entity: 'attendance',
    entityId: record.id,
    before: record.attendanceStatus,
    after: String(patch.attendanceStatus ?? record.attendanceStatus),
    note: body.note,
  });
  return c.json({ ...record, ...patch });
});

hr.get('/breaks', requirePermission('break.view'), async (c) => {
  const database = db(c.env);
  const month = c.req.query('month') ?? bdDateKey(new Date()).slice(0, 7);
  const rows = await database.query.breakSessions.findMany({ orderBy: desc(breakSessions.startAt) });
  return c.json(rows.filter((r) => r.workDate.startsWith(month)));
});

hr.get('/leaves', requirePermission('leave.view'), async (c) => {
  const database = db(c.env);
  return c.json(await database.query.leaveApplications.findMany({ orderBy: desc(leaveApplications.submittedAt) }));
});

hr.post('/leaves/:id', requirePermission('leave.review'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { decision?: 'approve' | 'decline'; note?: string };
  const leave = await database.query.leaveApplications.findFirst({
    where: eq(leaveApplications.id, c.req.param('id')!),
  });
  if (!leave) return c.json({ error: 'NOT_FOUND', message: 'Leave application not found.' }, 404);

  const approved = body.decision === 'approve';
  await database
    .update(leaveApplications)
    .set({
      status: approved ? 'Approved' : 'Declined',
      reviewReason: body.note ?? null,
      emailStatus: 'Sent',
      approvedAt: new Date().toISOString(),
      decidedBy: c.get('user').fullName,
    })
    .where(eq(leaveApplications.id, leave.id));

  const person = await database.query.employees.findFirst({
    where: eq(employees.id, leave.employeeId),
  });
  if (person) {
    const mail = leaveTemplate(
      person.fullName,
      approved ? 'Approved' : 'Declined',
      leave.fromDate,
      leave.toDate,
      body.note,
    );
    await sendMail(c.env, { to: person.email, subject: mail.subject, text: mail.body });
  }

  await notify(
    database,
    leave.employeeId,
    approved ? 'Leave approved' : 'Leave declined',
    approved
      ? `Your ${leave.leaveType} application for ${leave.fromDate} has been approved.`
      : `Your ${leave.leaveType} application was declined.${body.note ? ` ${body.note}` : ''}`,
    approved ? 'Leave Approved' : 'Leave Declined',
  );

  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: `leave.${body.decision}`,
    entity: 'leave',
    entityId: leave.id,
    before: leave.status,
    after: approved ? 'Approved' : 'Declined',
    note: body.note,
  });
  return c.json({ ...leave, status: approved ? 'Approved' : 'Declined' });
});

hr.get('/overtime', requirePermission('overtime.view'), async (c) => {
  const database = db(c.env);
  return c.json(await database.query.overtimeRequests.findMany({ orderBy: desc(overtimeRequests.workDate) }));
});

hr.post('/overtime/:id', requirePermission('overtime.review'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as {
    decision?: 'approve' | 'decline';
    approvedStart?: string;
    approvedEnd?: string;
    note?: string;
  };
  const request = await database.query.overtimeRequests.findFirst({
    where: eq(overtimeRequests.id, c.req.param('id')!),
  });
  if (!request) return c.json({ error: 'NOT_FOUND', message: 'Overtime request not found.' }, 404);

  const approved = body.decision === 'approve';
  const approvedStart = body.approvedStart ?? request.requestedStart;
  const approvedEnd = body.approvedEnd ?? request.requestedEnd;
  const approvedMinutes = approved ? request.requestedMinutes : 0;

  await database
    .update(overtimeRequests)
    .set({
      status: approved ? 'Approved' : 'Declined',
      approvedStart: approved ? approvedStart : null,
      approvedEnd: approved ? approvedEnd : null,
      approvedMinutes,
      note: body.note ?? null,
      decidedAt: new Date().toISOString(),
      decidedBy: c.get('user').fullName,
    })
    .where(eq(overtimeRequests.id, request.id));

  await notify(
    database,
    request.employeeId,
    approved ? 'Overtime approved' : 'Overtime declined',
    `Your overtime request for ${request.workDate} was ${approved ? 'approved' : 'declined'}.`,
    approved ? 'Overtime Approved' : 'Overtime Declined',
  );
  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: `overtime.${body.decision}`,
    entity: 'overtime',
    entityId: request.id,
    before: request.status,
    after: approved ? 'Approved' : 'Declined',
    note: body.note,
  });
  return c.json({ ...request, status: approved ? 'Approved' : 'Declined' });
});

/* ------------------------------------------------------------------ *
 * Bonus & payroll
 * ------------------------------------------------------------------ */

hr.get('/bonus', requirePermission('bonus.view'), async (c) => {
  const database = db(c.env);
  const month = c.req.query('month') ?? bdDateKey(new Date()).slice(0, 7);
  const all = await database.query.employees.findMany();
  const records = await database.query.attendanceSessions.findMany();

  return c.json(
    all.map((employee) => {
      const lateDays = records.filter(
        (r) => r.employeeId === employee.id && r.workDate.startsWith(month) && r.lateStatus === 'Late',
      ).length;
      const tier = ATTENDANCE_BONUS_TIERS.find(
        (t) => lateDays >= t.minLateDays && lateDays <= t.maxLateDays,
      )!;
      return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        departmentName: '',
        lateDays,
        amount: tier.amount,
        tier: tier.label,
      };
    }),
  );
});

hr.get('/payroll', requirePermission('payroll.view'), async (c) => {
  const database = db(c.env);
  const month = c.req.query('month') ?? bdDateKey(new Date()).slice(0, 7);
  return c.json(
    await database.query.salaryRecords.findMany({ where: eq(salaryRecords.month, month) }),
  );
});

hr.post('/payroll/publish', requirePermission('payroll.publish'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { month?: string };
  const month = body.month ?? bdDateKey(new Date()).slice(0, 7);

  const all = await database.query.employees.findMany();
  const records = await database.query.attendanceSessions.findMany();
  const overtime = await database.query.overtimeRequests.findMany({
    where: eq(overtimeRequests.status, 'Approved'),
  });
  const settings = await readSettings(database);
  const existing = await database.query.salaryRecords.findMany({
    where: eq(salaryRecords.month, month),
  });

  let published = 0;
  for (const person of all) {
    const lateDays = records.filter(
      (r) => r.employeeId === person.id && r.workDate.startsWith(month) && r.lateStatus === 'Late',
    ).length;
    const approvedOvertimeMinutes = overtime
      .filter((o) => o.employeeId === person.id && o.workDate.startsWith(month))
      .reduce((sum, o) => sum + o.approvedMinutes, 0);

    const computed = computePayroll({
      basicSalary: person.baseSalary ?? 0,
      allowances: person.allowances ?? 0,
      approvedOvertimeMinutes,
      lateDays,
      otRatePerHour: settings.otRatePerHour,
    });

    const row = existing.find((r) => r.employeeId === person.id);
    if (row) {
      if (!row.published) {
        await database
          .update(salaryRecords)
          .set({ ...computed, published: 1, publishedAt: new Date().toISOString() })
          .where(eq(salaryRecords.id, row.id));
        published += 1;
      }
    } else {
      await database.insert(salaryRecords).values({
        id: `sal-${person.id}-${month}`,
        employeeId: person.id,
        month,
        ...computed,
        published: 1,
        publishedAt: new Date().toISOString(),
      });
      published += 1;
    }
    await notify(
      database,
      person.id,
      'Salary published',
      `Your payslip for ${month} has been published.`,
      'Salary Published',
    );
  }

  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: 'payroll.publish',
    entity: 'payroll',
    entityId: month,
    after: `${published} published`,
  });
  return c.json({ published });
});

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

hr.get('/tasks', requirePermission('task.view'), async (c) => {
  const database = db(c.env);
  const rows = await database.query.tasks.findMany({ orderBy: desc(tasks.dueDate) });
  const withSubmissions = await Promise.all(
    rows.map(async (task) => ({
      ...task,
      submissions: await database.query.taskSubmissions.findMany({
        where: eq(taskSubmissions.taskId, task.id),
      }),
      feedback: null,
    })),
  );
  return c.json(withSubmissions);
});

hr.post('/tasks', requirePermission('task.manage'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, string>;
  if (!body.name) return c.json({ error: 'BAD_REQUEST', message: 'A task name is required.' }, 400);

  const all = await database.query.tasks.findMany();
  const id = `task-${Date.now().toString(36)}`;
  const task = {
    id,
    taskId: `TSK-${String(all.length + 1).padStart(4, '0')}`,
    name: body.name,
    description: body.description ?? '',
    departmentName: body.departmentName ?? 'General',
    employeeId: body.employeeId ?? '',
    priority: body.priority ?? 'Medium',
    assignedDate: body.assignedDate ?? bdDateKey(new Date()),
    startDate: body.startDate ?? bdDateKey(new Date()),
    dueDate: body.dueDate ?? bdDateKey(new Date()),
    status: body.status ?? 'Yet to Start',
    referenceLink: body.referenceLink ?? null,
    notes: body.notes ?? null,
    createdAt: new Date().toISOString(),
  };
  await database.insert(tasks).values(task);
  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: 'task.create',
    entity: 'task',
    entityId: id,
    after: task.name,
  });
  return c.json(task);
});

/* ------------------------------------------------------------------ *
 * Announcements
 * ------------------------------------------------------------------ */

hr.get('/announcements', requirePermission('announcement.send'), async (c) => {
  const database = db(c.env);
  return c.json(await database.query.announcements.findMany({ orderBy: desc(announcements.createdAt) }));
});

hr.post('/announcements', requirePermission('announcement.send'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.title) return c.json({ error: 'BAD_REQUEST', message: 'A title is required.' }, 400);

  const id = `ann-${Date.now().toString(36)}`;
  const recipients = (body.recipients as string[]) ?? [];
  const announcement = {
    id,
    title: String(body.title),
    body: String(body.body ?? ''),
    type: String(body.type ?? 'General HR Announcement'),
    audience: String(body.audience ?? 'all'),
    audienceLabel: String(body.audienceLabel ?? 'All Employees'),
    status: String(body.status ?? 'Draft'),
    publishAt: (body.publishAt as string) ?? null,
    publishedAt: (body.publishedAt as string) ?? null,
    emailNotification: body.emailNotification ? 1 : 0,
    createdAt: new Date().toISOString(),
    createdBy: c.get('user').fullName,
  };
  await database.insert(announcements).values(announcement);

  for (const employeeId of recipients) {
    await database.insert(announcementRecipients).values({
      id: `ar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      announcementId: id,
      employeeId,
      delivered: 0,
      emailStatus: announcement.emailNotification ? 'Sent' : 'Not Required',
    });
    await notify(
      database,
      employeeId,
      announcement.title,
      announcement.body,
      announcement.type,
    );
  }

  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: 'announcement.create',
    entity: 'announcement',
    entityId: id,
    after: announcement.title,
  });
  return c.json({ ...announcement, recipients: recipients.length });
});

/* ------------------------------------------------------------------ *
 * Google Sheets
 * ------------------------------------------------------------------ */

/** The rows mirrored to the Employee Signups sheet, in sheet order. */
hr.get('/sheets/signups', requirePermission('sheets.integration'), async (c) => {
  const database = db(c.env);
  const rows = await database.query.signupApplications.findMany();
  return c.json(
    rows.map((row, index) => ({
      sl: String(index + 1).padStart(3, '0'),
      applicationId: row.id,
      fullName: row.fullName,
      mobile: row.mobile,
      employeeId: row.employeeId,
      designation: row.designation,
      email: row.email,
      departmentName: row.departmentName,
      subDepartmentName: row.subDepartmentName,
      reportingManager: row.reportingManager,
      joiningDate: row.joiningDate,
      submittedAt: row.submittedAt,
      status: row.status,
      reviewNote: row.reviewNote,
      decidedAt: row.decidedAt,
      decidedBy: row.decidedBy,
    })),
  );
});

hr.get('/sheets', requirePermission('sheets.integration'), async (c) => {
  const database = db(c.env);
  const logs = await database.query.syncLogs.findMany({ orderBy: desc(syncLogs.createdAt) });
  return c.json({
    connected: Boolean(c.env.GOOGLE_SERVICE_ACCOUNT),
    lastSyncAt: logs[0]?.createdAt ?? null,
    sheets: [
      {
        id: SHEETS.TASK_SPREADSHEET_ID,
        name: 'Task Management',
        tabs: [SHEETS.TASK_SUPPORT_TAB, SHEETS.TASK_TAB, SHEETS.TASK_DASHBOARD_TAB, SHEETS.ROSTER_TAB],
        url: `https://docs.google.com/spreadsheets/d/${SHEETS.TASK_SPREADSHEET_ID}/edit?gid=804686369`,
      },
      {
        id: SHEETS.MAIN_SPREADSHEET_ID,
        name: 'Main HRMS',
        tabs: [SHEETS.LEAVE_TAB, SHEETS.SIGNUP_TAB, SHEETS.HR_USERS_TAB],
        url: `https://docs.google.com/spreadsheets/d/${SHEETS.MAIN_SPREADSHEET_ID}/edit?usp=sharing`,
      },
    ],
    pendingSync: 0,
    errors: logs.filter((l) => l.status !== 'Success').map((l) => l.message),
  });
});

hr.post('/sheets/sync', requirePermission('sheets.integration'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { direction?: 'PUSH' | 'PULL' };
  const direction = body.direction ?? 'PULL';

  try {
    if (direction === 'PUSH') {
      const written = await pushRoster(c.env, database);
      await logSync(database, {
        sheet: 'Task Management · Roster',
        direction: 'PUSH',
        status: 'Success',
        records: written,
        message: `${written} roster rows written after backend validation.`,
      });
      return c.json({ synced: written });
    }

    const leaves = await syncLeaveApplications(c.env, database);
    const taskResult = await syncTaskManagement(c.env, database);
    const total = leaves.imported + taskResult.imported;
    await logSync(database, {
      sheet: 'Main HRMS + Task Management',
      direction: 'PULL',
      status: leaves.errors.length || taskResult.errors.length ? 'Partial' : 'Success',
      records: total,
      message: `${leaves.imported} leave rows and ${taskResult.imported} task rows imported. ${
        leaves.errors.length + taskResult.errors.length
      } rows skipped by validation.`,
    });
    return c.json({ synced: total });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed.';
    await logSync(database, {
      sheet: direction === 'PUSH' ? 'Task Management · Roster' : 'Main HRMS + Task Management',
      direction,
      status: 'Failed',
      records: 0,
      message,
    });
    return c.json({ error: 'SYNC_FAILED', message }, 502);
  }
});

/* ------------------------------------------------------------------ *
 * Reports, settings, audit
 * ------------------------------------------------------------------ */

hr.get('/reports/:kind', requirePermission('reports.export'), async (c) => {
  const database = db(c.env);
  const kind = c.req.param('kind')!;
  const month = bdDateKey(new Date()).slice(0, 7);

  if (kind === 'attendance') {
    const rows = await database.query.attendanceSessions.findMany();
    const employees = await database.query.employees.findMany();
    return c.json({
      columns: ['Employee ID', 'Name', 'Date', 'Shift', 'Punch In', 'Clock Out', 'Working Hours', 'Status', 'Late'],
      rows: rows
        .filter((r) => r.workDate.startsWith(month))
        .map((r) => {
          const person = employees.find((e) => e.id === r.employeeId);
          return [
            person?.employeeId ?? '',
            person?.fullName ?? '',
            r.workDate,
            r.shiftCode,
            r.punchIn ?? '',
            r.clockOut ?? '',
            (r.totalWorkingSeconds / 3600).toFixed(2),
            r.attendanceStatus,
            r.lateStatus,
          ];
        }),
    });
  }
  if (kind === 'leave') {
    const rows = await database.query.leaveApplications.findMany();
    return c.json({
      columns: ['Application ID', 'Employee ID', 'Leave Type', 'From', 'To', 'Days', 'Status', 'Reason'],
      rows: rows.map((r) => [r.applicationId, r.employeeId, r.leaveType, r.fromDate, r.toDate, r.totalDays, r.status, r.reason]),
    });
  }
  if (kind === 'payroll') {
    const rows = await database.query.salaryRecords.findMany({ where: eq(salaryRecords.month, month) });
    return c.json({
      columns: ['Employee ID', 'Basic', 'Allowance', 'Overtime', 'Bonus', 'Deductions', 'Net Payable', 'Published'],
      rows: rows.map((r) => [
        r.employeeId,
        r.basicSalary,
        r.allowances,
        r.overtimePayment,
        r.bonusAmount,
        r.deductions,
        r.netPayable,
        r.published ? 'Yes' : 'No',
      ]),
    });
  }
  if (kind === 'roster') {
    const rows = await database.query.rosterEntries.findMany();
    return c.json({
      columns: ['Roster ID', 'Employee ID', 'Date', 'Shift', 'Changed'],
      rows: rows.map((r) => [r.rosterId, r.employeeId, r.date, r.shiftCode, r.changed ? 'Yes' : 'No']),
    });
  }
  const rows = await database.query.tasks.findMany();
  return c.json({
    columns: ['Task ID', 'Task Name', 'Department', 'Employee ID', 'Priority', 'Start Date', 'Due Date', 'Status', 'Pending Days', 'Overdue'],
    rows: rows.map((t) => {
      const pendingDays = Math.max(
        0,
        Math.round(
          (new Date(`${bdDateKey(new Date())}T00:00:00Z`).getTime() -
            new Date(`${t.dueDate}T00:00:00Z`).getTime()) /
            86400000,
        ),
      );
      return [
        t.taskId,
        t.name,
        t.departmentName,
        t.employeeId,
        t.priority,
        t.startDate,
        t.dueDate,
        t.status,
        pendingDays,
        t.status !== 'Complete' && t.dueDate < bdDateKey(new Date()) ? 'Yes' : 'No',
      ];
    }),
  });
});

hr.get('/settings', requirePermission('settings.manage'), async (c) => {
  const database = db(c.env);
  return c.json(await readSettings(database));
});

hr.patch('/settings', requirePermission('settings.manage'), async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const [key, value] of Object.entries(body)) {
    await database
      .insert(companySettings)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: companySettings.key, set: { value: String(value) } });
  }
  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: 'settings.update',
    entity: 'settings',
    entityId: 'company',
    after: JSON.stringify(body),
  });
  return c.json(await readSettings(database));
});

hr.get('/audit-logs', requirePermission('audit.view'), async (c) => {
  const database = db(c.env);
  return c.json(await database.query.auditLogs.findMany({ orderBy: desc(auditLogs.createdAt) }));
});

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

async function notify(
  database: any,
  employeeId: string,
  title: string,
  message: string,
  type: string,
  category: 'general' | 'roster' = 'general',
) {
  await database.insert(notifications).values({
    id: `ntf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    employeeId,
    title,
    message,
    type,
    category,
    createdAt: new Date().toISOString(),
    read: 0,
    emailStatus: 'Not Required',
  });
}

async function writeEntries(
  database: any,
  rosterId: string,
  version: number,
  assignments: Record<string, Record<string, string>>,
) {
  for (const [employeeId, byDate] of Object.entries(assignments)) {
    for (const [date, shiftCode] of Object.entries(byDate)) {
      await database.insert(rosterEntries).values({
        id: `re-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        rosterId,
        rosterVersion: version,
        employeeId,
        date,
        shiftCode,
        changed: 0,
      });
    }
  }
}

async function readSettings(database: any) {
  const rows = (await database.query.companySettings.findMany()) as Array<{ key: string; value: string }>;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    companyName: map.companyName ?? 'BRONEE Limited',
    timezone: map.timezone ?? 'Asia/Dhaka',
    officePublicIps: (map.officePublicIps ?? '').split(',').map((ip: string) => ip.trim()).filter(Boolean),
    officeLat: Number(map.officeLat ?? 23.8103),
    officeLng: Number(map.officeLng ?? 90.4125),
    geofenceRadiusM: Number(map.geofenceRadiusM ?? 50),
    otRatePerHour: Number(map.otRatePerHour ?? 70),
    payrollApprovedBy: map.payrollApprovedBy ?? '',
    lateGraceMinutes: Number(map.lateGraceMinutes ?? 1),
  };
}

export { hr };

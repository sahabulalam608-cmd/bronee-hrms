/**
 * BRONEE HRMS — employee portal API.
 *
 * Every attendance and payroll figure is computed on the server from the
 * stored records. The client never submits working hours.
 */

import { Hono } from 'hono';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import {
  LEAVE_ENTITLEMENT,
  SHIFT_BY_CODE,
  type ShiftCode,
} from '../../../shared/constants';
import {
  addMinutesIso,
  bdDateKey,
  bdInstant,
  evaluatePreClockIn,
  evaluateVerification,
  isTooEarlyForPunchIn,
  scheduleFor,
  secondsBetween,
  type VerificationOutcome,
} from '../../../shared/attendance';
import {
  applyVerification,
  closeOvertimeSession,
  officeIpCheck,
  readOfficeConfig,
  runAutoAttendance,
  type GpsFix,
} from '../services/attendance';
import { db } from '../db';
import {
  attendanceSessions,
  breakSessions,
  employees,
  leaveApplications,
  notifications,
  overtimeRequests,
  rosterChangeRequests,
  rosterEntries,
  rosters,
  salaryRecords,
  taskSubmissions,
  tasks,
} from '../db/schema';
import { requirePortal, requireSession } from '../middleware/auth';
import { writeAudit } from '../services/audit';
import { deleteDriveFile, readDriveFile, uploadProfilePhoto } from '../services/drive';
import { sendMail } from '../services/email';
import type { Env } from '../env';

const employee = new Hono<{ Bindings: Env; Variables: { user: any } }>();

employee.use('*', requireSession);
employee.use('*', requirePortal('EMPLOYEE'));

const ACTIVE_EMPLOYEE = { portal: 'EMPLOYEE' as const };

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

employee.get('/dashboard', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const today = bdDateKey(new Date());
  const month = today.slice(0, 7);

  const person = await database.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!person) return c.json({ error: 'NOT_FOUND', message: 'Employee not found.' }, 404);

  const todayRecords = await database.query.attendanceSessions.findMany({
    where: eq(attendanceSessions.employeeId, employeeId),
    orderBy: desc(attendanceSessions.workDate),
  });
  const todayRecord = todayRecords.find((r) => r.workDate === today) ?? null;

  const breaks = await database.query.breakSessions.findMany({
    where: eq(breakSessions.employeeId, employeeId),
  });
  const todayBreaks = breaks.filter((b) => b.workDate === today);
  const activeBreak = todayBreaks.find((b) => !b.endAt) ?? null;

  const monthRecords = todayRecords.filter((r) => r.workDate.startsWith(month));
  const monthBreaks = breaks.filter((b) => b.workDate.startsWith(month));

  const myTasks = await database.query.tasks.findMany({ where: eq(tasks.employeeId, employeeId) });
  const myNotices = await database.query.notifications.findMany({
    where: eq(notifications.employeeId, employeeId),
    orderBy: desc(notifications.createdAt),
  });

  const rosterRows = await database.query.rosterEntries.findMany({
    where: eq(rosterEntries.employeeId, employeeId),
  });
  const currentRoster = rosterRows.find((r) => r.date === today) ?? null;

  const approvedOt = await database.query.overtimeRequests.findMany({
    where: and(eq(overtimeRequests.employeeId, employeeId), eq(overtimeRequests.workDate, today)),
  });

  const lastRecord = todayRecords[0] ?? null;
  const lastBreak = [...breaks].sort((a, b) => b.startAt.localeCompare(a.startAt))[0] ?? null;

  const approvedLeaves = await database.query.leaveApplications.findMany({
    where: and(
      eq(leaveApplications.employeeId, employeeId),
      eq(leaveApplications.status, 'Approved'),
    ),
  });
  const balance = Object.entries(LEAVE_ENTITLEMENT)
    .map(([type, entitlement]) => {
      const used = approvedLeaves
        .filter((l) => l.leaveType === type)
        .reduce((sum, l) => sum + l.totalDays, 0);
      return { type, entitlement, used, remaining: Math.max(0, entitlement - used) };
    })
    .filter((b) => b.entitlement > 0);

  return c.json({
    user: {
      id: person.id,
      employeeId: person.employeeId,
      fullName: person.fullName,
      email: person.email,
      designation: person.designation,
      departmentId: person.departmentId,
      departmentName: '',
      subDepartmentId: person.subDepartmentId,
      subDepartmentName: null,
      reportingManager: person.reportingManager,
      joiningDate: person.joiningDate,
      shiftCode: person.shiftCode,
      shiftName: SHIFT_BY_CODE[person.shiftCode as ShiftCode]?.name ?? person.shiftCode,
      status: person.status,
      portal: person.portal,
      role: person.role,
      permissions: [],
    },
    today: {
      workDate: today,
      shiftCode: person.shiftCode,
      shiftName: SHIFT_BY_CODE[person.shiftCode as ShiftCode]?.name ?? person.shiftCode,
      scheduledStart: todayRecord?.scheduledStart ?? null,
      scheduledEnd: null,
      punchIn: todayRecord?.punchIn ?? null,
      clockOut: todayRecord?.clockOut ?? null,
      workingStart: todayRecord?.actualWorkingStart ?? null,
      working: Boolean(todayRecord?.actualWorkingStart && !todayRecord.clockOut),
      onBreak: Boolean(activeBreak),
      breakStartedAt: activeBreak?.startAt ?? null,
      totalWorkingSeconds: todayRecord?.totalWorkingSeconds ?? 0,
      totalBreakSeconds: todayBreaks.reduce((sum, b) => sum + b.durationSeconds, 0),
      breakSessions: todayBreaks.length,
      attendanceStatus: todayRecord?.attendanceStatus ?? 'Absent',
      lateStatus: todayRecord?.lateStatus ?? 'Not Late',
      verificationResult: todayRecord?.verificationResult ?? 'PENDING',
      verificationMethod: todayRecord?.verificationMethod ?? 'NONE',
      overtimeApproved: approvedOt.find((o) => o.status === 'Approved') ?? null,
      overtimeActive: false,
      segments: [],
    },
    month: {
      label: month,
      totalWorkingSeconds: monthRecords.reduce((sum, r) => sum + r.totalWorkingSeconds, 0),
      totalBreakSeconds: monthBreaks.reduce((sum, b) => sum + b.durationSeconds, 0),
      totalOvertimeSeconds: 0,
      lateDays: monthRecords.filter((r) => r.lateStatus === 'Late').length,
      completedTasks: myTasks.filter((t) => t.status === 'Complete').length,
      pendingTasks: myTasks.filter((t) => t.status !== 'Complete').length,
    },
    recentActivity: {
      lastDutyDate: lastRecord?.workDate ?? null,
      lastClockIn: lastRecord?.punchIn ?? null,
      lastClockOut: lastRecord?.clockOut ?? null,
      lastBreakStart: lastBreak?.startAt ?? null,
      lastBreakEnd: lastBreak?.endAt ?? null,
    },
    quickAccess: {
      pendingTasks: myTasks.filter((t) => t.status !== 'Complete').length,
      leaveBalance: balance.reduce((sum, b) => sum + b.remaining, 0),
      upcomingDeadlines: myTasks
        .filter((t) => t.status !== 'Complete')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 4)
        .map((t) => ({ taskId: t.taskId, name: t.name, dueDate: t.dueDate })),
      unreadNotifications: myNotices.filter((n) => !n.read).length,
      unreadRosterUpdates: myNotices.filter((n) => n.category === 'roster' && !n.read).length,
      currentRoster: currentRoster
        ? { date: currentRoster.date, shiftCode: currentRoster.shiftCode, shiftName: currentRoster.shiftCode }
        : null,
    },
  });
});

/* ------------------------------------------------------------------ *
 * Attendance
 * ------------------------------------------------------------------ */

employee.get('/attendance', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const month = c.req.query('month') ?? bdDateKey(new Date()).slice(0, 7);
  const records = await database.query.attendanceSessions.findMany({
    where: and(eq(attendanceSessions.employeeId, employeeId), gte(attendanceSessions.workDate, `${month}-01`)),
    orderBy: desc(attendanceSessions.workDate),
  });
  const filtered = records.filter((r) => r.workDate.startsWith(month));
  return c.json(summarise(filtered));
});

employee.post('/attendance/clock-in', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    latitude?: number | null;
    longitude?: number | null;
    accuracy?: number | null;
  };
  const gps: GpsFix = {
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    accuracy: body.accuracy ?? null,
  };

  const person = await database.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!person) return c.json({ error: 'NOT_FOUND', message: 'Employee not found.' }, 404);

  const today = bdDateKey(new Date());
  const schedule = scheduleFor(person.shiftCode as ShiftCode, today);
  const punchIn = new Date().toISOString();

  const existing = await database.query.attendanceSessions.findFirst({
    where: and(eq(attendanceSessions.employeeId, employeeId), eq(attendanceSessions.workDate, today)),
  });
  if (existing?.actualWorkingStart) {
    return c.json(
      { error: 'ALREADY_CLOCKED_IN', message: 'You have already clocked in today.' },
      409,
    );
  }
  if (existing?.punchIn) {
    // A punch already exists. Before the shift starts that is the recorded
    // pre-clock-in; once the shift has started the punch triggers the office
    // verification straight away.
    if (Date.parse(punchIn) < Date.parse(schedule.start)) {
      return c.json(
        {
          error: 'PENDING',
          message:
            'Your pre-clock-in is already recorded. The system verifies you automatically when the shift starts.',
        },
        409,
      );
    }
    const office = await readOfficeConfig(database);
    const officeIpMatched = officeIpCheck(c.req.raw, office.officePublicIps);
    const outcome = await applyVerification(
      database,
      existing,
      schedule,
      punchIn,
      gps,
      office,
      officeIpMatched,
    );
    await writeAudit(database, {
      actor: person.fullName,
      actorRole: person.role as any,
      action: 'attendance.clock-in',
      entity: 'attendance',
      entityId: existing.id,
      after: outcome.result,
      note: outcome.message,
    });
    return c.json({
      record: existing,
      verification: outcome.result,
      method: outcome.method,
      message: outcome.message,
    });
  }
  if (isTooEarlyForPunchIn(schedule, punchIn)) {
    return c.json(
      {
        error: 'TOO_EARLY',
        message: 'You can punch in only 15 minutes before your scheduled shift starts.',
      },
      400,
    );
  }

  const preClockIn = Date.parse(punchIn) < Date.parse(schedule.start);

  const record = {
    id: existing?.id ?? `att-${employeeId}-${today}`,
    employeeId,
    workDate: today,
    shiftCode: person.shiftCode,
    scheduledStart: schedule.start,
    punchIn,
    actualWorkingStart: null,
    verificationCompletedAt: null,
    verificationMethod: 'NONE',
    verificationResult: 'PENDING',
    gpsLat: gps.latitude,
    gpsLng: gps.longitude,
    gpsAccuracy: gps.accuracy,
    officeIpMatch: null,
    clockOut: null,
    overtimeStartedAt: null,
    totalWorkingSeconds: 0,
    attendanceStatus: 'Pre-Clocked In',
    lateStatus: 'Not Late',
    isManual: 0,
    hrReviewStatus: 'Not Reviewed',
    hrReviewNote: null,
    createdAt: new Date().toISOString(),
  };

  if (existing) {
    await database.update(attendanceSessions).set(record).where(eq(attendanceSessions.id, existing.id));
  } else {
    await database.insert(attendanceSessions).values(record);
  }

  let outcome: VerificationOutcome;
  if (preClockIn) {
    // §6.2 — the punch timestamp is stored, no verification runs yet and the
    // working timer does not start.
    outcome = evaluatePreClockIn(schedule, punchIn);
  } else {
    const office = await readOfficeConfig(database);
    const officeIpMatched = officeIpCheck(c.req.raw, office.officePublicIps);
    outcome = await applyVerification(
      database,
      record as any,
      schedule,
      punchIn,
      gps,
      office,
      officeIpMatched,
    );
  }

  await writeAudit(database, {
    actor: person.fullName,
    actorRole: person.role as any,
    action: 'attendance.clock-in',
    entity: 'attendance',
    entityId: record.id,
    after: outcome.result,
    note: outcome.message,
  });

  return c.json({
    record,
    verification: outcome.result,
    method: outcome.method,
    message: outcome.message,
  });
});

/**
 * The automatic attendance step (§6.2 – §6.8).
 *
 * The client calls this every few seconds while the employee portal is open.
 * It performs the automatic clock in at the scheduled shift start and the
 * automatic clock out at the scheduled shift end.
 */
employee.post('/attendance/tick', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    latitude?: number | null;
    longitude?: number | null;
    accuracy?: number | null;
  };
  const gps: GpsFix = {
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    accuracy: body.accuracy ?? null,
  };

  const person = await database.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!person) return c.json({ error: 'NOT_FOUND', message: 'Employee not found.' }, 404);

  const today = bdDateKey(new Date());
  const schedule = scheduleFor(person.shiftCode as ShiftCode, today);
  const record = await database.query.attendanceSessions.findFirst({
    where: and(eq(attendanceSessions.employeeId, employeeId), eq(attendanceSessions.workDate, today)),
  });

  const office = await readOfficeConfig(database);
  const officeIpMatched = officeIpCheck(c.req.raw, office.officePublicIps);
  const at = new Date().toISOString();
  const result = record
    ? await runAutoAttendance(database, record, schedule, at, gps, office, officeIpMatched)
    : { changed: null, message: 'No attendance change.', outcome: null };

  return c.json({
    record: record ?? null,
    verification: record?.verificationResult ?? null,
    method: record?.verificationMethod ?? null,
    message: result.message,
    changed: result.changed,
  });
});

employee.post('/attendance/clock-out', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const today = bdDateKey(new Date());
  const record = await database.query.attendanceSessions.findFirst({
    where: and(eq(attendanceSessions.employeeId, employeeId), eq(attendanceSessions.workDate, today)),
  });
  if (!record?.actualWorkingStart) {
    return c.json({ error: 'NOT_WORKING', message: 'There is no active working session to close.' }, 409);
  }
  if (record.clockOut) {
    return c.json({ error: 'ALREADY_CLOCKED_OUT', message: 'You have already clocked out today.' }, 409);
  }

  const clockOut = new Date().toISOString();
  const todayBreaks = await database.query.breakSessions.findMany({
    where: and(eq(breakSessions.employeeId, employeeId), eq(breakSessions.workDate, today)),
  });
  const openBreak = todayBreaks.find((b) => !b.endAt);
  if (openBreak) {
    await database
      .update(breakSessions)
      .set({ endAt: clockOut, durationSeconds: secondsBetween(openBreak.startAt, clockOut), closedBy: 'SYSTEM' })
      .where(eq(breakSessions.id, openBreak.id));
  }

  const breakSeconds = todayBreaks
    .filter((b) => b.endAt)
    .reduce((sum, b) => sum + secondsBetween(b.startAt, b.endAt as string), 0);
  // The regular shift ends when the approved overtime session starts. The
  // break time is tracked on its own and never subtracted from the working
  // counter.
  const shiftEnd = record.overtimeStartedAt ?? clockOut;
  const workingSeconds = Math.max(0, secondsBetween(record.actualWorkingStart, shiftEnd));

  await database
    .update(attendanceSessions)
    .set({ clockOut, totalWorkingSeconds: workingSeconds })
    .where(eq(attendanceSessions.id, record.id));

  await closeOvertimeSession(database, record, clockOut);

  const person = await database.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (person) {
    await writeAudit(database, {
      actor: person.fullName,
      actorRole: person.role as any,
      action: 'attendance.clock-out',
      entity: 'attendance',
      entityId: record.id,
      after: clockOut,
    });
  }

  return c.json({
    record: { ...record, clockOut, totalWorkingSeconds: workingSeconds },
    verification: record.verificationResult,
    method: record.verificationMethod,
    message: 'Clocked out. Your working time for today is recorded.',
  });
});


/* ------------------------------------------------------------------ *
 * Breaks
 * ------------------------------------------------------------------ */

employee.post('/break/start', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const today = bdDateKey(new Date());

  const record = await database.query.attendanceSessions.findFirst({
    where: and(eq(attendanceSessions.employeeId, employeeId), eq(attendanceSessions.workDate, today)),
  });
  if (!record?.actualWorkingStart) {
    return c.json({ error: 'NOT_WORKING', message: 'Clock in before starting a break.' }, 409);
  }
  const open = await database.query.breakSessions.findFirst({
    where: and(eq(breakSessions.employeeId, employeeId), eq(breakSessions.workDate, today)),
  });
  if (open && !open.endAt) {
    return c.json({ error: 'BREAK_ACTIVE', message: 'A break is already running.' }, 409);
  }

  const id = `brk-${Date.now().toString(36)}`;
  const brk = {
    id,
    employeeId,
    workDate: today,
    startAt: new Date().toISOString(),
    endAt: null,
    durationSeconds: 0,
    closedBy: 'EMPLOYEE',
  };
  await database.insert(breakSessions).values(brk);
  return c.json({ break: brk });
});

employee.post('/break/end', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const today = bdDateKey(new Date());
  const open = await database.query.breakSessions.findFirst({
    where: and(eq(breakSessions.employeeId, employeeId), eq(breakSessions.workDate, today)),
  });
  if (!open || open.endAt) {
    return c.json({ error: 'NO_BREAK', message: 'There is no running break.' }, 409);
  }
  const endAt = new Date().toISOString();
  const durationSeconds = secondsBetween(open.startAt, endAt);
  await database
    .update(breakSessions)
    .set({ endAt, durationSeconds, closedBy: 'EMPLOYEE' })
    .where(eq(breakSessions.id, open.id));
  return c.json({ break: { ...open, endAt, durationSeconds } });
});

employee.get('/breaks', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const month = c.req.query('month') ?? bdDateKey(new Date()).slice(0, 7);
  const rows = await database.query.breakSessions.findMany({
    where: eq(breakSessions.employeeId, employeeId),
    orderBy: desc(breakSessions.startAt),
  });
  return c.json(rows.filter((r) => r.workDate.startsWith(month)));
});

/* ------------------------------------------------------------------ *
 * Roster
 * ------------------------------------------------------------------ */

employee.get('/roster', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');

  const published = await database.query.rosters.findMany({
    where: eq(rosters.status, 'Published'),
    orderBy: desc(rosters.startDate),
  });
  const entries = await database.query.rosterEntries.findMany({
    where: eq(rosterEntries.employeeId, employeeId),
    orderBy: sql`${rosterEntries.date} asc`,
  });
  const allEntries = await database.query.rosterEntries.findMany();

  const teamByDate: Record<string, unknown[]> = {};
  for (const version of published) {
    for (const entry of allEntries.filter((e) => e.rosterId === version.id)) {
      const person = await database.query.employees.findFirst({
        where: eq(employees.id, entry.employeeId),
      });
      (teamByDate[entry.date] ??= []).push({
        employeeName: person?.fullName ?? '',
        shiftCode: entry.shiftCode,
        shiftName: entry.shiftCode,
        departmentName: '',
      });
    }
  }

  const myNotices = await database.query.notifications.findMany({
    where: eq(notifications.employeeId, employeeId),
  });

  return c.json({
    versions: published,
    entries,
    teamByDate,
    unreadUpdates: myNotices.filter((n) => n.category === 'roster' && !n.read).length,
  });
});

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

employee.get('/tasks', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const rows = await database.query.tasks.findMany({
    where: eq(tasks.employeeId, employeeId),
    orderBy: sql`${tasks.dueDate} asc`,
  });
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

employee.post('/tasks/:id/submit', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const taskId = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as {
    submissionLink?: string;
    note?: string;
    fileName?: string;
  };

  const task = await database.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) return c.json({ error: 'NOT_FOUND', message: 'Task not found.' }, 404);
  if (task.employeeId !== employeeId) {
    return c.json({ error: 'FORBIDDEN', message: 'You can only submit your own tasks.' }, 403);
  }

  await database.insert(taskSubmissions).values({
    id: `sub-${Date.now().toString(36)}`,
    taskId,
    submittedAt: new Date().toISOString(),
    submissionLink: body.submissionLink ?? null,
    fileName: body.fileName ?? null,
    note: body.note ?? null,
  });
  await database.update(tasks).set({ status: 'Pending' }).where(eq(tasks.id, taskId));
  return c.json({ ...task, status: 'Pending' });
});

/* ------------------------------------------------------------------ *
 * Leave & roster change requests
 * ------------------------------------------------------------------ */

employee.get('/leaves', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const applications = await database.query.leaveApplications.findMany({
    where: eq(leaveApplications.employeeId, employeeId),
    orderBy: desc(leaveApplications.submittedAt),
  });
  const balance = Object.entries(LEAVE_ENTITLEMENT).map(([type, entitlement]) => {
    const used = applications
      .filter((l) => l.status === 'Approved' && l.leaveType === type)
      .reduce((sum, l) => sum + l.totalDays, 0);
    return { type, entitlement, used, remaining: Math.max(0, entitlement - used) };
  });
  return c.json({ applications, balance });
});

employee.post('/leaves', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    leaveType?: string;
    fromDate?: string;
    toDate?: string;
    reason?: string;
    attachmentName?: string | null;
  };
  if (!body.fromDate || !body.toDate || !body.reason) {
    return c.json({ error: 'BAD_REQUEST', message: 'Leave type, dates and reason are required.' }, 400);
  }
  if (body.toDate < body.fromDate) {
    return c.json(
      { error: 'INVALID_RANGE', field: 'toDate', message: 'The end date cannot be before the start date.' },
      400,
    );
  }

  const existing = await database.query.leaveApplications.findMany({
    where: and(eq(leaveApplications.employeeId, employeeId), eq(leaveApplications.status, 'Pending')),
  });
  const overlap = existing.some(
    (l) => !(body.toDate! < l.fromDate || body.fromDate! > l.toDate),
  );
  if (overlap) {
    return c.json(
      { error: 'DUPLICATE', message: 'A leave application already exists for those dates.' },
      409,
    );
  }

  const person = await database.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  const totalDays =
    Math.round(
      (new Date(`${body.toDate}T00:00:00Z`).getTime() -
        new Date(`${body.fromDate}T00:00:00Z`).getTime()) /
        86400000,
    ) + 1;

  const applicationId = `LA-${new Date().getFullYear()}-${String(
    (await database.query.leaveApplications.findMany()).length + 1,
  ).padStart(4, '0')}`;

  const application = {
    id: `lv-${Date.now().toString(36)}`,
    applicationId,
    employeeId,
    leaveType: body.leaveType ?? 'Casual Leave',
    fromDate: body.fromDate,
    toDate: body.toDate,
    totalDays,
    reason: body.reason,
    attachmentName: body.attachmentName ?? null,
    submittedAt: new Date().toISOString(),
    status: 'Pending' as const,
    emailStatus: 'Not Sent' as const,
  };
  await database.insert(leaveApplications).values(application);
  return c.json({ ...application, employeeName: person?.fullName ?? '' });
});

employee.get('/roster-requests', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  return c.json(
    await database.query.rosterChangeRequests.findMany({
      where: eq(rosterChangeRequests.employeeId, employeeId),
      orderBy: desc(rosterChangeRequests.createdAt),
    }),
  );
});

employee.post('/roster-requests', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    type?: 'Off Day Change' | 'Shift Change';
    currentDate?: string;
    currentShift?: string;
    requestedDate?: string;
    requestedShift?: string | null;
    reason?: string;
  };
  if (!body.currentDate || !body.requestedDate || !body.reason) {
    return c.json({ error: 'BAD_REQUEST', message: 'Dates and reason are required.' }, 400);
  }

  const request = {
    id: `rcr-${Date.now().toString(36)}`,
    employeeId,
    type: body.type ?? ('Off Day Change' as const),
    currentDate: body.currentDate,
    currentShift: body.currentShift ?? 'OFF',
    requestedDate: body.requestedDate,
    requestedShift: body.requestedShift ?? null,
    reason: body.reason,
    status: 'Pending' as const,
    rosterUpdated: 0,
    createdAt: new Date().toISOString(),
  };
  await database.insert(rosterChangeRequests).values(request);
  return c.json(request);
});

/* ------------------------------------------------------------------ *
 * Overtime
 * ------------------------------------------------------------------ */

employee.get('/overtime', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  return c.json(
    await database.query.overtimeRequests.findMany({
      where: eq(overtimeRequests.employeeId, employeeId),
      orderBy: desc(overtimeRequests.workDate),
    }),
  );
});

employee.post('/overtime', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    workDate?: string;
    requestedStart?: string;
    requestedEnd?: string;
    reason?: string;
  };
  if (!body.workDate || !body.requestedStart || !body.requestedEnd || !body.reason) {
    return c.json({ error: 'BAD_REQUEST', message: 'Date, times and reason are required.' }, 400);
  }

  const start = toMinutes(body.requestedStart);
  const end = toMinutes(body.requestedEnd);
  const requestedMinutes = end > start ? end - start : end + 1440 - start;

  const request = {
    id: `ot-${Date.now().toString(36)}`,
    employeeId,
    workDate: body.workDate,
    requestedStart: body.requestedStart,
    requestedEnd: body.requestedEnd,
    requestedMinutes,
    status: 'Pending' as const,
    reason: body.reason,
    createdAt: new Date().toISOString(),
  };
  await database.insert(overtimeRequests).values(request);
  return c.json(request);
});

/* ------------------------------------------------------------------ *
 * Notifications & profile
 * ------------------------------------------------------------------ */

employee.get('/notifications', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  return c.json(
    await database.query.notifications.findMany({
      where: eq(notifications.employeeId, employeeId),
      orderBy: desc(notifications.createdAt),
    }),
  );
});

employee.post('/notifications/:id/read', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  await database
    .update(notifications)
    .set({ read: 1 })
    .where(and(eq(notifications.id, c.req.param('id')!), eq(notifications.employeeId, employeeId)));
  return c.json({ ok: true });
});

employee.post('/notifications/read-all', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  await database.update(notifications).set({ read: 1 }).where(eq(notifications.employeeId, employeeId));
  return c.json({ ok: true });
});

employee.get('/profile', async (c) => {
  const database = db(c.env);
  const person = await database.query.employees.findFirst({
    where: eq(employees.id, c.get('user').employeeId),
  });
  if (!person) return c.json({ error: 'NOT_FOUND', message: 'Employee not found.' }, 404);
  return c.json(person);
});

employee.get('/profile/photo', async (c) => {
  const database = db(c.env);
  const person = await database.query.employees.findFirst({
    where: eq(employees.id, c.get('user').employeeId),
  });
  if (!person?.profilePhotoKey) {
    return c.json({ error: 'NOT_FOUND', message: 'No profile photo.' }, 404);
  }
  try {
    const file = await readDriveFile(c.env, person.profilePhotoKey);
    if (!file) return c.json({ error: 'NOT_FOUND', message: 'No profile photo.' }, 404);
    return c.body(new Blob([file.data]), 200, {
      'Content-Type': file.contentType,
      'Cache-Control': 'private, max-age=60',
    });
  } catch {
    return c.json({ error: 'DRIVE_UNAVAILABLE', message: 'The photo storage is not reachable.' }, 503);
  }
});

employee.post('/profile/photo', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    fileName?: string;
    contentType?: string;
    data?: string;
  };
  if (!body.data || !body.contentType) {
    return c.json({ error: 'BAD_REQUEST', message: 'A photo file is required.' }, 400);
  }
  if (!body.contentType.startsWith('image/')) {
    return c.json({ error: 'BAD_REQUEST', message: 'Only an image can be uploaded.' }, 400);
  }
  // 5 MB of binary data, roughly 6.6 MB as base64.
  if (body.data.length > 6_600_000) {
    return c.json({ error: 'TOO_LARGE', message: 'The photo must be smaller than 5 MB.' }, 413);
  }

  const person = await database.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!person) return c.json({ error: 'NOT_FOUND', message: 'Employee not found.' }, 404);

  try {
    // The previous photo is removed from the drive before the new one lands.
    if (person.profilePhotoKey) {
      await deleteDriveFile(c.env, person.profilePhotoKey);
    }
    const fileId = await uploadProfilePhoto(c.env, {
      fileName: body.fileName ?? `profile-${employeeId}.jpg`,
      contentType: body.contentType,
      data: body.data,
    });
    await database
      .update(employees)
      .set({ profilePhotoKey: fileId })
      .where(eq(employees.id, employeeId));
    await writeAudit(database, {
      actor: c.get('user').fullName,
      actorRole: c.get('user').role,
      action: 'employee.profile-photo',
      entity: 'employee',
      entityId: employeeId,
      after: 'profile photo uploaded',
    });
    return c.json({ profilePhotoUrl: '/api/employee/profile/photo' });
  } catch (err) {
    return c.json(
      {
        error: 'DRIVE_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'The photo storage is not reachable.',
      },
      503,
    );
  }
});

employee.delete('/profile/photo', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const person = await database.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!person) return c.json({ error: 'NOT_FOUND', message: 'Employee not found.' }, 404);
  if (person.profilePhotoKey) {
    try {
      await deleteDriveFile(c.env, person.profilePhotoKey);
    } catch {
      /* the row is cleared even when the drive is unreachable */
    }
  }
  await database
    .update(employees)
    .set({ profilePhotoKey: null })
    .where(eq(employees.id, employeeId));
  await writeAudit(database, {
    actor: c.get('user').fullName,
    actorRole: c.get('user').role,
    action: 'employee.profile-photo',
    entity: 'employee',
    entityId: employeeId,
    after: 'profile photo removed',
  });
  return c.json({ profilePhotoUrl: null });
});

employee.post('/profile/correction', async (c) => {
  const database = db(c.env);
  const { employeeId } = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    field?: string;
    currentValue?: string;
    requestedValue?: string;
    reason?: string;
  };

  await database.insert(notifications).values({
    id: `ntf-${Date.now().toString(36)}`,
    employeeId,
    title: 'Profile correction request received',
    message: `Your request to update ${body.field ?? 'a profile field'} was sent to HR for review.`,
    type: 'Individual HR Message',
    category: 'general',
    createdAt: new Date().toISOString(),
    read: 0,
    emailStatus: 'Sent',
  });
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function summarise(records: Array<any>) {
  return {
    records,
    totalPresent: records.filter((r) => r.attendanceStatus === 'Verified' || r.attendanceStatus === 'Present').length,
    totalAbsent: records.filter((r) => r.attendanceStatus === 'Absent').length,
    totalLate: records.filter((r) => r.lateStatus === 'Late').length,
    totalOnLeave: records.filter((r) => r.attendanceStatus === 'On Leave').length,
    totalPendingReview: records.filter(
      (r) => r.attendanceStatus === 'Pending Review' || r.attendanceStatus === 'Verification Failed',
    ).length,
  };
}

function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
}

export { employee, bdInstant, addMinutesIso };

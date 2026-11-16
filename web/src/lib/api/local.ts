/**
 * BRONEE HRMS — local (demo) API adapter.
 *
 * A complete in-browser implementation of the API contract. It runs the same
 * shared attendance/payroll engine as the production Worker, stores data in
 * localStorage, and is seeded with real BRONEE Limited people and rows.
 *
 * Every mutation writes an audit-log entry, exactly like the Worker does.
 */

import {
  ATTENDANCE_BONUS_TIERS,
  LEAVE_ENTITLEMENT,
  ROLE_PERMISSIONS,
  SHIFT_BY_CODE,
  type Permission,
  type Role,
  type ShiftCode,
} from '@shared/constants';
import {
  addMinutesIso,
  bdDateKey,
  bdInstant,
  computeClosedSession,
  evaluatePreClockIn,
  evaluateVerification,
  isTooEarlyForPunchIn,
  minutesBetween,
  minutesBetweenInstants,
  scheduleFor,
  secondsBetween,
  type ShiftSchedule,
  type VerificationOutcome,
} from '@shared/attendance';
import { hashPassword, randomOtp, randomToken, verifyPassword } from '@shared/crypto';
import { isValidBdMobile, normalizeBdMobile } from '@shared/mobile';
import { isLatinOnly } from '@shared/text';
import type {
  Announcement,
  AttendanceRecord,
  BreakRecord,
  Department,
  Designation,
  Employee,
  EmployeeDashboard,
  HrDashboard,
  LeaveApplication,
  OvertimeRequest,
  RosterChangeRequest,
  RosterSummary,
  SessionUser,
  Task,
} from '@shared/types';
import type { DbShape, SyncLogEntry } from './db-types';
import type {
  ApiClient,
  AttendanceSummary,
  LeaveBalance,
  RosterPayload,
  StaffingCheckRow,
  SyncStatus,
} from './contract';
import { getSessionToken, loadDb, resetDb, saveDb, setSessionToken } from './store';
import { SEED_CREDENTIALS } from '@/data/credentials';

const now = () => new Date().toISOString();

class ApiError extends Error {
  constructor(
    message: string,
    public code = 'BAD_REQUEST',
    public field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function fail(message: string, code = 'BAD_REQUEST', field?: string): never {
  throw new ApiError(message, code, field);
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ *
 * Session helpers
 * ------------------------------------------------------------------ */

function currentUser(db: DbShape): { user: SessionUser; employee: Employee } | null {
  const token = getSessionToken();
  if (!token) return null;
  const session = db.sessions.find((s) => s.token === token);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  const employee = db.employees.find((e) => e.id === session.employeeId);
  if (!employee || employee.status !== 'Active') return null;
  return { user: toSessionUser(employee), employee };
}

function toSessionUser(employee: Employee): SessionUser {
  const role = employee.role as Role;
  return {
    id: employee.id,
    employeeId: employee.employeeId,
    fullName: employee.fullName,
    email: employee.email,
    designation: employee.designation,
    departmentId: employee.departmentId,
    departmentName: employee.departmentName,
    subDepartmentId: employee.subDepartmentId,
    subDepartmentName: employee.subDepartmentName,
    reportingManager: employee.reportingManager,
    joiningDate: employee.joiningDate,
    shiftCode: employee.shiftCode,
    shiftName: employee.shiftName,
    status: employee.status,
    portal: employee.portal,
    role,
    permissions: employee.portal === 'HR' ? ROLE_PERMISSIONS[role] : [],
    profilePhotoUrl: employee.profilePhotoUrl ?? null,
    baseSalary: employee.baseSalary,
  };
}

function requireUser(db: DbShape): { user: SessionUser; employee: Employee } {
  const session = currentUser(db);
  if (!session) fail('Your session has expired. Please sign in again.', 'UNAUTHORISED');
  return session;
}

function requirePermission(db: DbShape, permission: Permission): SessionUser {
  const { user } = requireUser(db);
  if (!user.permissions.includes(permission)) {
    fail('Your role does not allow this operation.', 'FORBIDDEN');
  }
  return user;
}

function audit(
  db: DbShape,
  actor: string,
  actorRole: Role,
  action: string,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
  note?: string,
): void {
  db.auditLogs.unshift({
    id: uid('aud'),
    actor,
    actorRole,
    action,
    entity,
    entityId,
    before: before === null || before === undefined ? null : String(before),
    after: after === null || after === undefined ? null : String(after),
    note: note ?? null,
    createdAt: now(),
  });
  if (db.auditLogs.length > 500) db.auditLogs.length = 500;
}

/* ------------------------------------------------------------------ *
 * Derived reads
 * ------------------------------------------------------------------ */

function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function leaveBalanceFor(db: DbShape, employeeId: string): LeaveBalance[] {
  const used = new Map<string, number>();
  for (const leave of db.leaves) {
    if (leave.employeeId !== employeeId || leave.status !== 'Approved') continue;
    used.set(leave.leaveType, (used.get(leave.leaveType) ?? 0) + leave.totalDays);
  }
  return Object.entries(LEAVE_ENTITLEMENT).map(([type, entitlement]) => {
    const u = used.get(type) ?? 0;
    return { type, entitlement, used: u, remaining: Math.max(0, entitlement - u) };
  });
}

function summariseAttendance(records: AttendanceRecord[]): AttendanceSummary {
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

function nextApplicationId(db: DbShape): string {
  const year = new Date().getFullYear();
  const max = db.leaves.reduce((acc, l) => {
    const match = /LA-(\d{4})-(\d+)/.exec(l.applicationId);
    if (!match) return acc;
    return Math.max(acc, Number(match[2]));
  }, 0);
  return `LA-${year}-${String(max + 1).padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Attendance engine helpers (§6.2 – §6.8)
 * ------------------------------------------------------------------ */

interface GpsFix {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
}

/**
 * Runs the office verification for a day (§6.3 – §6.5).
 *
 * The office public IP is always tried first. When it does not match, the GPS
 * geofence is used — the fix has to be inside the 50 metre radius and its
 * accuracy radius has to be acceptable.
 */
function runVerification(
  db: DbShape,
  record: AttendanceRecord,
  schedule: ShiftSchedule,
  verifiedAt: string,
  gps: GpsFix,
): VerificationOutcome {
  const hasGps = gps.latitude != null && gps.longitude != null;
  // Demo device fallback: without a GPS fix the request is treated as coming
  // from the office network, which the local adapter simulates.
  const officeIpMatched = !hasGps;

  const outcome = evaluateVerification({
    schedule,
    punchIn: record.punchIn ?? verifiedAt,
    verifiedAt,
    officeIpMatched,
    gpsLat: gps.latitude ?? null,
    gpsLng: gps.longitude ?? null,
    gpsAccuracy: gps.accuracy ?? null,
    officeLat: db.settings.officeLat,
    officeLng: db.settings.officeLng,
  });

  if (gps.latitude != null && gps.longitude != null) {
    record.gpsLat = gps.latitude;
    record.gpsLng = gps.longitude;
    record.gpsAccuracy = gps.accuracy ?? null;
  }
  record.officeIpMatch = officeIpMatched ? true : null;

  if (outcome.result === 'SUCCESS') {
    record.verificationResult = 'SUCCESS';
    record.verificationMethod = outcome.method;
    record.verificationCompletedAt = verifiedAt;
    record.actualWorkingStart = outcome.workingStart;
    record.attendanceStatus = outcome.attendanceStatus;
    record.lateStatus = outcome.lateStatus;
  } else if (outcome.result === 'PENDING') {
    // The window is still open — the system keeps checking.
    record.verificationResult = 'PENDING';
    record.verificationMethod = 'NONE';
    record.attendanceStatus = outcome.attendanceStatus;
    record.lateStatus = outcome.lateStatus;
  } else {
    record.verificationResult = 'FAILED';
    record.verificationMethod = 'NONE';
    record.verificationCompletedAt = verifiedAt;
    record.attendanceStatus = outcome.attendanceStatus;
    record.lateStatus = outcome.lateStatus;
  }
  return outcome;
}

/** The overtime request HR approved for this employee and day. */
function approvedOvertimeFor(db: DbShape, employeeId: string, workDate: string) {
  return db.overtime.find(
    (o) =>
      o.employeeId === employeeId &&
      o.workDate === workDate &&
      o.status === 'Approved' &&
      Boolean(o.approvedStart),
  );
}

/** ISO instant of the approved overtime start on the work date. */
function overtimeStartInstant(
  schedule: ShiftSchedule,
  workDate: string,
  approvedStart: string,
): string {
  const [hours, minutes] = approvedStart.split(':').map(Number);
  let total = (hours || 0) * 60 + (minutes || 0);
  const shiftEndMinutes = schedule.endMinutes + (schedule.endNextDay ? 1440 : 0);
  if (total < shiftEndMinutes) total += 1440;
  return bdInstant(workDate, total);
}

/**
 * Automatic clock out at the scheduled shift end (§6.8).
 *
 * The working session closes, an open break is closed and — when HR approved
 * overtime for the day — an overtime session starts instead of a full clock out.
 */
function runAutoClockOut(
  db: DbShape,
  record: AttendanceRecord,
  schedule: ShiftSchedule,
): 'CLOSED' | 'OVERTIME' | null {
  if (!record.actualWorkingStart || record.clockOut) return null;
  const at = now();
  if (Date.parse(at) < Date.parse(schedule.end)) return null;

  const breaks = db.breaks.filter(
    (b) => b.employeeId === record.employeeId && b.workDate === record.workDate,
  );
  const openBreak = breaks.find((b) => !b.endAt);
  if (openBreak) {
    openBreak.endAt = schedule.end;
    openBreak.durationSeconds = secondsBetween(openBreak.startAt, schedule.end);
    openBreak.closedBy = 'SYSTEM';
  }
  const closedBreaks = breaks
    .filter((b) => b.endAt)
    .map((b) => ({ start: b.startAt, end: b.endAt as string }));

  const overtime = approvedOvertimeFor(db, record.employeeId, record.workDate);
  if (overtime?.approvedStart) {
    const overtimeStart = overtimeStartInstant(schedule, record.workDate, overtime.approvedStart);
    if (Date.parse(at) >= Date.parse(overtimeStart)) {
      record.overtimeStartedAt = overtimeStart;
      record.totalWorkingSeconds = computeClosedSession({
        workingStart: record.actualWorkingStart,
        clockOut: overtimeStart,
        breaks: closedBreaks,
      }).totalWorkingSeconds;
      return 'OVERTIME';
    }
  }

  record.clockOut = schedule.end;
  const closed = computeClosedSession({
    workingStart: record.actualWorkingStart,
    clockOut: schedule.end,
    breaks: closedBreaks,
  });
  record.totalWorkingSeconds = closed.totalWorkingSeconds;
  record.segments = (record.segments ?? []).map((seg) => ({
    ...seg,
    endAt: seg.endAt ?? schedule.end,
    seconds: closed.totalWorkingSeconds,
  }));
  return 'CLOSED';
}

/* ------------------------------------------------------------------ *
 * Adapter
 * ------------------------------------------------------------------ */

/** Methods that write to the dataset — every one of them persists afterwards. */
const MUTATING_METHODS = new Set<string>([
  'login', 'requestSignupOtp', 'verifySignupOtp', 'submitSignup', 'requestPasswordReset',
  'resetPassword', 'logout', 'clockIn', 'attendanceTick', 'clockOut', 'startBreak', 'endBreak', 'submitTask',
  'submitLeave', 'submitRosterChangeRequest', 'requestOvertime', 'markNotificationRead',
  'markAllNotificationsRead', 'submitProfileCorrection', 'updateEmployee', 'decideSignup',
  'saveDepartment', 'reorderDepartments', 'saveDesignation', 'createRoster', 'updateRoster',
  'publishRoster', 'sendRosterUpdate', 'updatePublishedRoster', 'reviewAttendance', 'decideLeave', 'decideOvertime',
  'publishPayroll', 'saveTask', 'saveAnnouncement', 'runSheetsSync', 'saveSettings',
  'decideRosterChange',
]);

export function createLocalAdapter(): ApiClient {
  const api: ApiClient = {
    /* ---------------- auth ---------------- */
    async login(email, password) {
      const db = loadDb();
      const credential = findCredential(email);
      const employee = db.employees.find(
        (e) => e.email.toLowerCase() === email.trim().toLowerCase(),
      );

      if (!employee) {
        fail('Not a registered employee. Please sign up first.', 'NOT_REGISTERED');
      }
      if (!credential) {
        fail('This account has not completed email verification yet.', 'NOT_REGISTERED');
      }
      const ok = await verifyPassword(password, credential.passwordHash);
      if (!ok) fail('The email or password you entered is incorrect.', 'BAD_CREDENTIALS');

      if (employee.status === 'Pending') {
        fail('Your registration is awaiting HR approval.', 'PENDING_APPROVAL');
      }
      if (employee.status === 'Declined') fail('Contact HR for instructions.', 'DECLINED');
      if (employee.status === 'Suspended') fail('Your account is suspended. Contact HR.', 'SUSPENDED');

      const token = randomToken();
      db.sessions = db.sessions.filter((s) => s.employeeId !== employee.id);
      db.sessions.push({
        token,
        employeeId: employee.id,
        expiresAt: addMinutesIso(now(), 60 * 12),
      });
      setSessionToken(token);
      return { user: toSessionUser(employee), token };
    },

    async requestSignupOtp(form) {
      const db = loadDb();
      const email = form.email.trim().toLowerCase();
      const duplicateEmail = db.employees.some((e) => e.email.toLowerCase() === email);
      const duplicateCode = db.employees.some((e) => e.employeeId === form.employeeId.trim());
      if (duplicateEmail) fail('This email address is already registered.', 'DUPLICATE', 'email');
      if (duplicateCode) fail('This employee ID is already registered.', 'DUPLICATE', 'employeeId');
      if (!isValidBdMobile(form.mobile.trim())) {
        fail('Enter an 11-digit mobile number starting with 01.', 'BAD_MOBILE', 'mobile');
      }
      for (const [field, value] of [
        ['fullName', form.fullName],
        ['employeeId', form.employeeId],
        ['designation', form.designation],
        ['reportingManager', form.reportingManager ?? ''],
      ] as const) {
        if (value && !isLatinOnly(value)) {
          fail('This field only accepts English characters.', 'BAD_REQUEST', field);
        }
      }

      const code = randomOtp();
      db.otpCodes = db.otpCodes.filter((c) => !(c.email === email && c.purpose === 'signup'));
      db.otpCodes.push({
        email,
        code,
        purpose: 'signup',
        expiresAt: addMinutesIso(now(), 10),
        verified: false,
      });
      // Demo mode surfaces the code so the flow is testable without a mailbox.
      return { email, expiresAt: addMinutesIso(now(), 10), devCode: code };
    },

    async verifySignupOtp(email, code) {
      const db = loadDb();
      const entry = db.otpCodes.find(
        (c) => c.email === email.trim().toLowerCase() && c.purpose === 'signup',
      );
      if (!entry) fail('No verification is in progress for this email.', 'NO_CHALLENGE');
      if (new Date(entry.expiresAt).getTime() < Date.now()) {
        fail('The verification code has expired. Request a new one.', 'EXPIRED');
      }
      if (entry.code !== code.trim()) fail('That code is not correct.', 'BAD_CODE');
      entry.verified = true;
      return { verified: true };
    },

    async submitSignup(form) {
      const db = loadDb();
      const email = form.email.trim().toLowerCase();
      const signupChallenge = db.otpCodes.find((c) => c.email === email && c.purpose === 'signup');
      if (!signupChallenge?.verified) {
        fail('Verify your email address before submitting the registration.', 'NO_CHALLENGE');
      }
      if (!isValidBdMobile(form.mobile.trim())) {
        fail('Enter an 11-digit mobile number starting with 01.', 'BAD_MOBILE', 'mobile');
      }
      const existing = db.signups.find(
        (s) => s.email.toLowerCase() === email && s.status === 'Pending',
      );
      if (existing) return { status: 'Pending' };

      const applicationId = uid('sg');
      const mobile = normalizeBdMobile(form.mobile) ?? form.mobile.trim();
      const submittedAt = now();

      db.signups.unshift({
        id: applicationId,
        fullName: form.fullName,
        mobile,
        employeeId: form.employeeId.trim(),
        designation: form.designation,
        email,
        departmentName: form.departmentName,
        subDepartmentName: form.subDepartmentName,
        reportingManager: form.reportingManager,
        joiningDate: form.joiningDate,
        submittedAt,
        status: 'Pending',
        reviewNote: null,
        salary: null,
        decidedAt: null,
        decidedBy: null,
      });
      db.otpCodes = db.otpCodes.filter((c) => !(c.email === email && c.purpose === 'signup'));

      // Mirror the application to the Employee Signups sheet. The serial is
      // zero-prefixed and the mobile number keeps its leading 0.
      const serial = db.signupSheetRows.length + 1;
      db.signupSheetRows.unshift({
        sl: String(serial).padStart(3, '0'),
        applicationId,
        fullName: form.fullName,
        mobile,
        employeeId: form.employeeId.trim(),
        designation: form.designation,
        email,
        departmentName: form.departmentName,
        subDepartmentName: form.subDepartmentName,
        reportingManager: form.reportingManager,
        joiningDate: form.joiningDate,
        submittedAt,
        status: 'Pending',
        reviewNote: null,
        decidedAt: null,
        decidedBy: null,
      });
      db.syncLogs.unshift({
        id: uid('sync'),
        sheet: 'Main HRMS · Employee Signups',
        direction: 'PUSH',
        status: 'Success',
        records: 1,
        message: `Registration ${applicationId} written to Employee Signups as row ${String(serial).padStart(3, '0')}.`,
        createdAt: submittedAt,
      });

      return { status: 'Pending' };
    },

    async requestPasswordReset(email) {
      const db = loadDb();
      const employee = db.employees.find((e) => e.email.toLowerCase() === email.trim().toLowerCase());
      if (!employee) fail('Not a registered employee. Please sign up first.', 'NOT_REGISTERED');
      const code = randomOtp();
      db.otpCodes = db.otpCodes.filter((c) => !(c.email === email && c.purpose === 'reset'));
      db.otpCodes.push({
        email: email.trim().toLowerCase(),
        code,
        purpose: 'reset',
        expiresAt: addMinutesIso(now(), 10),
        verified: false,
      });
      return { sent: true };
    },

    async resetPassword(email, code, password) {
      const db = loadDb();
      const entry = db.otpCodes.find(
        (c) => c.email === email.trim().toLowerCase() && c.purpose === 'reset',
      );
      if (!entry) fail('No password reset is in progress for this email.', 'NO_CHALLENGE');
      if (new Date(entry.expiresAt).getTime() < Date.now()) {
        fail('The verification code has expired. Request a new one.', 'EXPIRED');
      }
      if (entry.code !== code.trim()) fail('That code is not correct.', 'BAD_CODE');
      if (password.length < 8) fail('Use at least 8 characters for the new password.', 'WEAK_PASSWORD');

      const hash = await hashPassword(password);
      const credential = findCredential(email);
      if (credential) setCredentialHash(email, hash);
      db.otpCodes = db.otpCodes.filter((c) => !(c.email === email && c.purpose === 'reset'));
      return { ok: true };
    },

    async me() {
      const db = loadDb();
      return currentUser(db)?.user ?? null;
    },

    async logout() {
      const db = loadDb();
      const token = getSessionToken();
      db.sessions = db.sessions.filter((s) => s.token !== token);
      setSessionToken(null);
    },

    /* ---------------- employee ---------------- */
    async employeeDashboard() {
      const db = loadDb();
      const { user, employee } = requireUser(db);
      const today = bdDateKey(new Date());
      const month = monthOf(today);

      const todayRecord =
        db.attendance.find((r) => r.employeeId === employee.id && r.workDate === today) ?? null;
      const activeBreak = db.breaks.find(
        (b) => b.employeeId === employee.id && b.workDate === today && !b.endAt,
      );
      const todayBreaks = db.breaks.filter((b) => b.employeeId === employee.id && b.workDate === today);
      const monthRecords = db.attendance.filter(
        (r) => r.employeeId === employee.id && monthOf(r.workDate) === month,
      );
      const monthBreaks = db.breaks.filter(
        (b) => b.employeeId === employee.id && monthOf(b.workDate) === month,
      );
      const approvedOt = db.overtime.find(
        (o) => o.employeeId === employee.id && o.workDate === today && o.status === 'Approved',
      );

      const rosterEntries = db.rosterEntries.filter((e) => e.employeeId === employee.id);
      const rosterByDate = new Map(rosterEntries.map((e) => [e.date, e]));
      const currentRoster = rosterByDate.get(today) ?? null;

      const tasks = db.tasks.filter((t) => t.employeeId === employee.id);
      const unreadRoster = db.notifications.filter(
        (n) => n.employeeId === employee.id && n.category === 'roster' && !n.read,
      );

      const lastRecord = [...db.attendance]
        .filter((r) => r.employeeId === employee.id)
        .sort((a, b) => b.workDate.localeCompare(a.workDate))[0];
      const lastBreak = [...db.breaks]
        .filter((b) => b.employeeId === employee.id)
        .sort((a, b) => b.startAt.localeCompare(a.startAt))[0];

      return {
        user,
        today: {
          workDate: today,
          shiftCode: employee.shiftCode,
          shiftName: employee.shiftName,
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
          overtimeApproved: approvedOt ?? null,
          overtimeActive: false,
          segments: todayRecord?.segments ?? [],
        },
        month: {
          label: month,
          totalWorkingSeconds: monthRecords.reduce((sum, r) => sum + r.totalWorkingSeconds, 0),
          totalBreakSeconds: monthBreaks.reduce((sum, b) => sum + b.durationSeconds, 0),
          totalOvertimeSeconds: db.overtime
            .filter(
              (o) =>
                o.employeeId === employee.id &&
                monthOf(o.workDate) === month &&
                o.status === 'Approved',
            )
            .reduce((sum, o) => sum + o.approvedMinutes * 60, 0),
          lateDays: monthRecords.filter((r) => r.lateStatus === 'Late').length,
          completedTasks: tasks.filter((t) => t.status === 'Complete').length,
          pendingTasks: tasks.filter((t) => t.status !== 'Complete').length,
        },
        recentActivity: {
          lastDutyDate: lastRecord?.workDate ?? null,
          lastClockIn: lastRecord?.punchIn ?? null,
          lastClockOut: lastRecord?.clockOut ?? null,
          lastBreakStart: lastBreak?.startAt ?? null,
          lastBreakEnd: lastBreak?.endAt ?? null,
        },
        quickAccess: {
          pendingTasks: tasks.filter((t) => t.status !== 'Complete').length,
          leaveBalance: leaveBalanceFor(db, employee.id)
            .filter((b) => b.entitlement > 0)
            .reduce((sum, b) => sum + b.remaining, 0),
          upcomingDeadlines: tasks
            .filter((t) => t.status !== 'Complete')
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
            .slice(0, 4)
            .map((t) => ({ taskId: t.taskId, name: t.name, dueDate: t.dueDate })),
          unreadNotifications: db.notifications.filter((n) => n.employeeId === employee.id && !n.read).length,
          unreadRosterUpdates: unreadRoster.length,
          currentRoster: currentRoster
            ? { date: currentRoster.date, shiftCode: currentRoster.shiftCode, shiftName: currentRoster.shiftName }
            : null,
        },
      } satisfies EmployeeDashboard;
    },

    async employeeAttendance(month) {
      const db = loadDb();
      const { employee } = requireUser(db);
      const target = month ?? monthOf(bdDateKey(new Date()));
      const records = db.attendance
        .filter((r) => r.employeeId === employee.id && monthOf(r.workDate) === target)
        .sort((a, b) => b.workDate.localeCompare(a.workDate));
      return summariseAttendance(records);
    },

    async clockIn(payload) {
      const db = loadDb();
      const { user, employee } = requireUser(db);
      const today = bdDateKey(new Date());
      const schedule = scheduleFor(employee.shiftCode, today);
      const punchAt = now();

      const existing = db.attendance.find(
        (r) => r.employeeId === employee.id && r.workDate === today,
      );
      if (existing?.actualWorkingStart) {
        fail('You have already clocked in today.', 'ALREADY_CLOCKED_IN');
      }
      if (existing?.punchIn) {
        // A punch already exists. Before the shift starts that is the recorded
        // pre-clock-in; once the shift has started the punch triggers the
        // office verification straight away.
        if (Date.parse(punchAt) < Date.parse(schedule.start)) {
          fail(
            'Your pre-clock-in is already recorded. The system verifies you automatically when the shift starts.',
            'PENDING',
          );
        }
        const outcome = runVerification(db, existing, schedule, punchAt, payload);
        audit(
          db,
          user.fullName,
          user.role,
          'attendance.clock-in',
          'attendance',
          existing.id,
          null,
          outcome.result,
          outcome.message,
        );
        saveDb(db);
        return {
          record: existing,
          verification: outcome.result,
          method: outcome.method,
          message: outcome.message,
        };
      }
      if (isTooEarlyForPunchIn(schedule, punchAt)) {
        fail(
          'You can punch in only 15 minutes before your scheduled shift starts.',
          'TOO_EARLY',
        );
      }

      const preClockIn = Date.parse(punchAt) < Date.parse(schedule.start);

      const record: AttendanceRecord = {
        id: existing?.id ?? uid('att'),
        employeeId: employee.id,
        employeeName: employee.fullName,
        employeeCode: employee.employeeId,
        departmentName: employee.departmentName,
        shiftCode: employee.shiftCode,
        shiftName: employee.shiftName,
        workDate: today,
        scheduledStart: schedule.start,
        punchIn: punchAt,
        actualWorkingStart: null,
        verificationCompletedAt: null,
        verificationMethod: 'NONE',
        verificationResult: 'PENDING',
        gpsLat: payload.latitude ?? null,
        gpsLng: payload.longitude ?? null,
        gpsAccuracy: payload.accuracy ?? null,
        officeIpMatch: null,
        clockOut: null,
        overtimeStartedAt: null,
        totalWorkingSeconds: 0,
        attendanceStatus: 'Pre-Clocked In',
        lateStatus: 'Not Late',
        isManual: false,
        hrReviewStatus: 'Not Reviewed',
        hrReviewNote: null,
        segments: schedule.segments.map((seg) => ({
          name: seg.name,
          workLocation: seg.workLocation,
          startAt: null,
          endAt: null,
          seconds: 0,
        })),
      };

      if (existing) Object.assign(existing, record);
      else db.attendance.push(record);

      let outcome: VerificationOutcome;
      if (preClockIn) {
        // §6.2 — the punch timestamp is stored, no verification runs yet and
        // the working timer does not start.
        outcome = evaluatePreClockIn(schedule, punchAt);
        record.verificationResult = 'PENDING';
        record.verificationMethod = 'NONE';
        record.attendanceStatus = outcome.attendanceStatus;
        record.lateStatus = outcome.lateStatus;
      } else {
        outcome = runVerification(db, record, schedule, punchAt, payload);
      }

      audit(db, user.fullName, user.role, 'attendance.clock-in', 'attendance', record.id, null, outcome.result, outcome.message);
      return { record, verification: outcome.result, method: outcome.method, message: outcome.message };
    },

    async attendanceTick(payload) {
      const db = loadDb();
      const { employee } = requireUser(db);
      const today = bdDateKey(new Date());
      const schedule = scheduleFor(employee.shiftCode, today);
      const record =
        db.attendance.find((r) => r.employeeId === employee.id && r.workDate === today) ?? null;

      let changed: 'CLOCKED_IN' | 'CLOCKED_OUT' | null = null;
      let message = 'No attendance change.';

      if (record?.punchIn && !record.actualWorkingStart && !record.verificationCompletedAt) {
        // The shift has started — the system verifies the punch on its own.
        const verifiedAt = now();
        if (Date.parse(verifiedAt) >= Date.parse(schedule.start)) {
          const outcome = runVerification(db, record, schedule, verifiedAt, payload);
          message = outcome.message;
          if (outcome.result === 'SUCCESS') changed = 'CLOCKED_IN';
        }
      }

      if (record?.actualWorkingStart && !record.clockOut) {
        const outcome = runAutoClockOut(db, record, schedule);
        if (outcome === 'CLOSED') {
          changed = 'CLOCKED_OUT';
          message = 'The scheduled shift ended — your working session was closed automatically.';
        } else if (outcome === 'OVERTIME') {
          changed = 'CLOCKED_OUT';
          message = 'The scheduled shift ended — your approved overtime session has started.';
        }
      }

      return {
        record,
        verification: record?.verificationResult ?? null,
        method: record?.verificationMethod ?? null,
        message,
        changed,
      };
    },

    async clockOut() {
      const db = loadDb();
      const { user, employee } = requireUser(db);
      const today = bdDateKey(new Date());
      const record = db.attendance.find(
        (r) => r.employeeId === employee.id && r.workDate === today,
      );
      if (!record?.actualWorkingStart) {
        fail('There is no active working session to close.', 'NOT_WORKING');
      }
      if (record.clockOut) fail('You have already clocked out today.', 'ALREADY_CLOCKED_OUT');

      const clockOut = now();
      const activeBreak = db.breaks.find(
        (b) => b.employeeId === employee.id && b.workDate === today && !b.endAt,
      );
      if (activeBreak) {
        activeBreak.endAt = clockOut;
        activeBreak.durationSeconds = secondsBetween(activeBreak.startAt, clockOut);
        activeBreak.closedBy = 'SYSTEM';
      }

      const breaks = db.breaks
        .filter((b) => b.employeeId === employee.id && b.workDate === today && b.endAt)
        .map((b) => ({ start: b.startAt, end: b.endAt as string }));

      // The regular shift ends when the approved overtime session starts.
      const shiftEnd = record.overtimeStartedAt ?? clockOut;
      const closed = computeClosedSession({
        workingStart: record.actualWorkingStart,
        clockOut: shiftEnd,
        breaks,
      });

      record.clockOut = clockOut;
      record.totalWorkingSeconds = closed.totalWorkingSeconds;

      if (record.overtimeStartedAt) {
        const overtime = approvedOvertimeFor(db, employee.id, today);
        if (overtime) {
          overtime.actualMinutes = minutesBetweenInstants(record.overtimeStartedAt, clockOut);
        }
      }

      record.segments = (record.segments ?? []).map((seg) => ({
        ...seg,
        endAt: seg.endAt ?? clockOut,
        seconds: record.totalWorkingSeconds,
      }));

      audit(db, user.fullName, user.role, 'attendance.clock-out', 'attendance', record.id, null, clockOut);
      return {
        record,
        verification: record.verificationResult,
        method: record.verificationMethod,
        message: 'Clocked out. Your working time for today is recorded.',
      };
    },

    async startBreak() {
      const db = loadDb();
      const { user, employee } = requireUser(db);
      const today = bdDateKey(new Date());
      const active = db.breaks.find(
        (b) => b.employeeId === employee.id && b.workDate === today && !b.endAt,
      );
      if (active) fail('A break is already running.', 'BREAK_ACTIVE');
      const record = db.attendance.find(
        (r) => r.employeeId === employee.id && r.workDate === today,
      );
      if (!record?.actualWorkingStart) {
        fail('Clock in before starting a break.', 'NOT_WORKING');
      }
      const brk: BreakRecord = {
        id: uid('brk'),
        employeeId: employee.id,
        employeeName: employee.fullName,
        workDate: today,
        startAt: now(),
        endAt: null,
        durationSeconds: 0,
        closedBy: 'EMPLOYEE',
      };
      db.breaks.push(brk);
      audit(db, user.fullName, user.role, 'break.start', 'break', brk.id, null, null);
      return { break: brk };
    },

    async endBreak() {
      const db = loadDb();
      const { user, employee } = requireUser(db);
      const today = bdDateKey(new Date());
      const active = db.breaks.find(
        (b) => b.employeeId === employee.id && b.workDate === today && !b.endAt,
      );
      if (!active) fail('There is no running break.', 'NO_BREAK');
      active.endAt = now();
      active.durationSeconds = secondsBetween(active.startAt, active.endAt);
      audit(db, user.fullName, user.role, 'break.end', 'break', active.id, null, active.durationSeconds);
      return { break: active };
    },

    async employeeBreaks(month) {
      const db = loadDb();
      const { employee } = requireUser(db);
      const target = month ?? monthOf(bdDateKey(new Date()));
      return db.breaks
        .filter((b) => b.employeeId === employee.id && monthOf(b.workDate) === target)
        .sort((a, b) => b.startAt.localeCompare(a.startAt));
    },

    async employeeRoster() {
      const db = loadDb();
      const { employee } = requireUser(db);
      const published = db.rosterVersions.filter((v) => v.status === 'Published');
      const relevant = published
        .map((v) => db.rosterEntries.filter((e) => e.rosterId === v.id))
        .flat()
        .filter((e) => e.employeeId === employee.id);
      const entries = relevant.sort((a, b) => a.date.localeCompare(b.date));

      const teamByDate: RosterPayload['teamByDate'] = {};
      for (const version of published) {
        for (const entry of db.rosterEntries.filter((e) => e.rosterId === version.id)) {
          (teamByDate[entry.date] ??= []).push({
            employeeName: entry.employeeName,
            shiftCode: entry.shiftCode,
            shiftName: entry.shiftName,
            departmentName: entry.departmentName,
          });
        }
      }
      for (const key of Object.keys(teamByDate)) {
        teamByDate[key] = teamByDate[key].sort((a, b) => a.employeeName.localeCompare(b.employeeName));
      }

      return {
        versions: published,
        entries,
        teamByDate,
        unreadUpdates: db.notifications.filter(
          (n) => n.employeeId === employee.id && n.category === 'roster' && !n.read,
        ).length,
      };
    },

    async employeeTasks() {
      const db = loadDb();
      const { employee } = requireUser(db);
      return db.tasks
        .filter((t) => t.employeeId === employee.id)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    },

    async submitTask(taskId, payload) {
      const db = loadDb();
      const { user, employee } = requireUser(db);
      const task = db.tasks.find((t) => t.id === taskId);
      if (!task) fail('Task not found.', 'NOT_FOUND');
      if (task.employeeId !== employee.id) fail('You can only submit your own tasks.', 'FORBIDDEN');
      task.submissions.unshift({
        id: uid('sub'),
        submittedAt: now(),
        submissionLink: payload.submissionLink ?? null,
        fileName: payload.fileName ?? null,
        note: payload.note ?? null,
        reviewerFeedback: null,
      });
      task.status = 'Pending';
      audit(db, user.fullName, user.role, 'task.submit', 'task', task.id, null, 'Pending', payload.note ?? undefined);
      return task;
    },

    async employeeLeaves() {
      const db = loadDb();
      const { employee } = requireUser(db);
      return {
        applications: db.leaves
          .filter((l) => l.employeeId === employee.id)
          .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
        balance: leaveBalanceFor(db, employee.id),
      };
    },

    async submitLeave(payload) {
      const db = loadDb();
      const { user, employee } = requireUser(db);
      if (payload.fromDate > payload.toDate) fail('The end date cannot be before the start date.', 'INVALID_RANGE', 'toDate');
      const duplicate = db.leaves.some(
        (l) =>
          l.employeeId === employee.id &&
          l.status === 'Pending' &&
          !(payload.toDate < l.fromDate || payload.fromDate > l.toDate),
      );
      if (duplicate) fail('A leave application already exists for those dates.', 'DUPLICATE');

      const totalDays = Math.max(
        1,
        Math.round(
          (new Date(`${payload.toDate}T00:00:00Z`).getTime() -
            new Date(`${payload.fromDate}T00:00:00Z`).getTime()) /
            86400000,
        ) + 1,
      );
      const application: LeaveApplication = {
        id: uid('lv'),
        applicationId: nextApplicationId(db),
        employeeId: employee.id,
        employeeName: employee.fullName,
        employeeCode: employee.employeeId,
        designation: employee.designation,
        email: employee.email,
        departmentName: employee.departmentName,
        reportingManager: employee.reportingManager,
        leaveType: payload.leaveType as LeaveApplication['leaveType'],
        fromDate: payload.fromDate,
        toDate: payload.toDate,
        totalDays,
        reason: payload.reason,
        attachmentUrl: null,
        attachmentName: payload.attachmentName ?? null,
        submittedAt: now(),
        status: 'Pending',
        reviewReason: null,
        emailStatus: 'Not Sent',
        approvedAt: null,
        decidedBy: null,
        isRosterChangeRequest: false,
      };
      db.leaves.unshift(application);
      audit(db, user.fullName, user.role, 'leave.apply', 'leave', application.id, null, 'Pending');
      return application;
    },

    async employeeRosterChangeRequests() {
      const db = loadDb();
      const { employee } = requireUser(db);
      return db.rosterChangeRequests
        .filter((r) => r.employeeId === employee.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async submitRosterChangeRequest(payload) {
      const db = loadDb();
      const { user, employee } = requireUser(db);
      const entry = db.rosterEntries.find(
        (e) => e.employeeId === employee.id && e.date === payload.currentDate,
      );
      if (!entry) fail('That roster entry could not be found.', 'NOT_FOUND');
      if (
        db.rosterChangeRequests.some(
          (r) => r.employeeId === employee.id && r.currentDate === payload.currentDate && r.status === 'Pending',
        )
      ) {
        fail('A roster change request for that day is already pending.', 'DUPLICATE');
      }
      const request: RosterChangeRequest = {
        id: uid('rcr'),
        employeeId: employee.id,
        employeeName: employee.fullName,
        type: payload.type,
        currentDate: payload.currentDate,
        currentShift: payload.currentShift as RosterChangeRequest['currentShift'],
        currentShiftName: entry.shiftName,
        requestedDate: payload.requestedDate,
        requestedShift: (payload.requestedShift ?? null) as RosterChangeRequest['requestedShift'],
        requestedShiftName: payload.requestedShift
          ? SHIFT_BY_CODE[payload.requestedShift as ShiftCode]?.name ?? null
          : null,
        reason: payload.reason,
        status: 'Pending',
        updateMode: null,
        rosterUpdated: false,
        note: null,
        createdAt: now(),
        decidedAt: null,
        decidedBy: null,
      };
      db.rosterChangeRequests.unshift(request);
      audit(db, user.fullName, user.role, 'roster-change.request', 'roster-change', request.id, null, 'Pending', payload.reason);
      return request;
    },

    async employeeOvertime() {
      const db = loadDb();
      const { employee } = requireUser(db);
      return db.overtime
        .filter((o) => o.employeeId === employee.id)
        .sort((a, b) => b.workDate.localeCompare(a.workDate));
    },

    async requestOvertime(payload) {
      const db = loadDb();
      const { user, employee } = requireUser(db);
      const requestedMinutes = minutesBetween(
        bdInstant(payload.workDate, toMinutes(payload.requestedStart)),
        bdInstant(payload.workDate, toMinutes(payload.requestedEnd)),
      );
      if (requestedMinutes <= 0) fail('The end time must be after the start time.', 'INVALID_RANGE');
      const request: OvertimeRequest = {
        id: uid('ot'),
        employeeId: employee.id,
        employeeName: employee.fullName,
        departmentName: employee.departmentName,
        workDate: payload.workDate,
        requestedStart: payload.requestedStart,
        requestedEnd: payload.requestedEnd,
        requestedMinutes,
        approvedStart: null,
        approvedEnd: null,
        approvedMinutes: 0,
        actualMinutes: null,
        status: 'Pending',
        reason: payload.reason,
        note: null,
        createdAt: now(),
        decidedAt: null,
        decidedBy: null,
      };
      db.overtime.unshift(request);
      audit(db, user.fullName, user.role, 'overtime.request', 'overtime', request.id, null, 'Pending');
      return request;
    },

    async employeeNotifications() {
      const db = loadDb();
      const { employee } = requireUser(db);
      return db.notifications
        .filter((n) => n.employeeId === employee.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async markNotificationRead(id) {
      const db = loadDb();
      const { employee } = requireUser(db);
      const notification = db.notifications.find(
        (n) => n.id === id && n.employeeId === employee.id,
      );
      if (notification) notification.read = true;
    },

    async markAllNotificationsRead() {
      const db = loadDb();
      const { employee } = requireUser(db);
      for (const n of db.notifications) if (n.employeeId === employee.id) n.read = true;
    },

    async employeeProfile() {
      const db = loadDb();
      const { employee } = requireUser(db);
      return employee;
    },

    /**
     * Uploads the profile photo.
     *
     * The photo is kept in the company drive. In the demo adapter the file is
     * stored with the employee row, and the previous photo is replaced — it is
     * never kept twice.
     */
    async uploadProfilePhoto(payload) {
      const db = loadDb();
      const { user, employee } = requireUser(db);
      const record = db.employees.find((e) => e.id === employee.id);
      if (!record) fail('Employee not found.', 'NOT_FOUND');
      if (!payload.contentType.startsWith('image/')) {
        fail('Only an image can be uploaded.', 'BAD_REQUEST');
      }
      if (payload.data.length > 6_600_000) {
        fail('The photo must be smaller than 5 MB.', 'TOO_LARGE');
      }
      // The old photo is removed from the drive when it is replaced.
      record.profilePhotoUrl = `data:${payload.contentType};base64,${payload.data}`;
      audit(
        db,
        user.fullName,
        user.role,
        'profile.photo-upload',
        'employee',
        record.id,
        null,
        payload.fileName,
      );
      return { profilePhotoUrl: record.profilePhotoUrl };
    },

    /** Removes the profile photo — the file leaves the drive with it. */
    async removeProfilePhoto() {
      const db = loadDb();
      const { user, employee } = requireUser(db);
      const record = db.employees.find((e) => e.id === employee.id);
      if (!record) fail('Employee not found.', 'NOT_FOUND');
      record.profilePhotoUrl = null;
      audit(db, user.fullName, user.role, 'profile.photo-remove', 'employee', record.id, null, null);
      return { profilePhotoUrl: null };
    },

    /** The profile photo as a data url, or null when there is none. */
    async fetchProfilePhoto() {
      const db = loadDb();
      const { employee } = requireUser(db);
      return employee.profilePhotoUrl ?? null;
    },

    async submitProfileCorrection(payload) {
      const db = loadDb();
      const { user, employee } = requireUser(db);
      const id = uid('cor');
      db.notifications.unshift({
        id: `ntf-${id}`,
        employeeId: employee.id,
        title: 'Profile correction request received',
        message: `Your request to update ${payload.field} was sent to HR for review.`,
        type: 'Individual HR Message',
        createdAt: now(),
        read: false,
        emailStatus: 'Sent',
        category: 'general',
      });
      audit(
        db,
        user.fullName,
        user.role,
        'profile.correction-request',
        'employee',
        employee.id,
        payload.currentValue,
        payload.requestedValue,
        payload.reason,
      );
    },

    /* ---------------- HR ---------------- */
    async hrDashboard() {
      const db = loadDb();
      requirePermission(db, 'employee.view');
      const today = bdDateKey(new Date());
      const month = monthOf(today);
      const todayRecords = db.attendance.filter((r) => r.workDate === today);
      const monthLeaves = db.leaves.filter((l) => monthOf(l.submittedAt.slice(0, 10)) === month);

      const months: string[] = [];
      for (let i = 5; i >= 0; i -= 1) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      const tasks = db.tasks;
      const pendingCount =
        db.signups.filter((s) => s.status === 'Pending').length +
        db.leaves.filter((l) => l.status === 'Pending').length +
        db.overtime.filter((o) => o.status === 'Pending').length +
        db.rosterChangeRequests.filter((r) => r.status === 'Pending').length;

      return {
        totalEmployees: db.employees.length,
        activeEmployees: db.employees.filter((e) => e.status === 'Active').length,
        pendingApplications: pendingCount,
        approvedThisMonth: monthLeaves.filter((l) => l.status === 'Approved').length,
        totalApplications: db.leaves.length,
        todaysApplications: db.leaves.filter((l) => l.submittedAt.slice(0, 10) === today).length,
        leaveTypeDistribution: Object.entries(
          db.leaves.reduce<Record<string, number>>((acc, l) => {
            acc[l.leaveType] = (acc[l.leaveType] ?? 0) + 1;
            return acc;
          }, {}),
        ).map(([label, value]) => ({ label, value })),
        applicationsByMonth: months.map((m) => ({
          month: m,
          applied: db.leaves.filter((l) => l.submittedAt.slice(0, 7) === m).length,
          approved: db.leaves.filter((l) => l.submittedAt.slice(0, 7) === m && l.status === 'Approved').length,
        })),
        todaysAttendance: {
          present: todayRecords.filter((r) => r.attendanceStatus === 'Verified').length,
          absent: todayRecords.filter((r) => r.attendanceStatus === 'Absent').length,
          late: todayRecords.filter((r) => r.lateStatus === 'Late').length,
          onLeave: db.leaves.filter((l) => l.status === 'Approved' && l.fromDate <= today && l.toDate >= today).length,
          pendingReview: todayRecords.filter(
            (r) => r.attendanceStatus === 'Pending Review' || r.attendanceStatus === 'Verification Failed',
          ).length,
        },
        lateEmployees: todayRecords
          .filter((r) => r.lateStatus === 'Late')
          .map((r) => ({
            employeeId: r.employeeId,
            name: r.employeeName,
            department: r.departmentName,
            punchIn: r.punchIn,
          })),
        currentlyWorking: todayRecords.filter(
          (r) => r.actualWorkingStart && !r.clockOut && new Date(r.actualWorkingStart) <= new Date(),
        ).length,
        onBreak: db.breaks.filter((b) => b.workDate === today && !b.endAt).length,
        overtimeSummary: {
          requested: db.overtime.filter((o) => o.status === 'Pending').length,
          approved: db.overtime.filter((o) => o.status === 'Approved').length,
          actualHours: Math.round(
            db.overtime.reduce((sum, o) => sum + (o.actualMinutes ?? 0), 0) / 60,
          ),
        },
        monthlyPayroll: {
          month,
          netPayable: db.salaries
            .filter((s) => s.month === month)
            .reduce((sum, s) => sum + s.netPayable, 0),
          employees: db.salaries.filter((s) => s.month === month).length,
        },
        taskSummary: {
          total: tasks.length,
          inProgress: tasks.filter((t) => t.status === 'In Progress').length,
          completed: tasks.filter((t) => t.status === 'Complete').length,
          yetToStart: tasks.filter((t) => t.status === 'Yet to Start').length,
          pending: tasks.filter((t) => t.status === 'Pending').length,
          overdue: tasks.filter((t) => t.status !== 'Complete' && t.dueDate < today).length,
          byPriority: (['High', 'Medium', 'Low'] as const).map((label) => ({
            label,
            value: tasks.filter((t) => t.priority === label).length,
          })),
          byDepartment: Object.entries(
            tasks.reduce<Record<string, number>>((acc, t) => {
              acc[t.departmentName] = (acc[t.departmentName] ?? 0) + 1;
              return acc;
            }, {}),
          ).map(([label, value]) => ({ label, value })),
          byStatus: (['Complete', 'In Progress', 'Pending', 'Yet to Start'] as const).map((label) => ({
            label,
            value: tasks.filter((t) => t.status === label).length,
          })),
        },
      } satisfies HrDashboard;
    },

    async hrEmployees() {
      const db = loadDb();
      requirePermission(db, 'employee.view');
      return db.employees;
    },

    async updateEmployee(id, payload) {
      const db = loadDb();
      const user = requirePermission(db, 'employee.edit');
      const employee = db.employees.find((e) => e.id === id);
      if (!employee) fail('Employee not found.', 'NOT_FOUND');
      const before = { ...employee };
      Object.assign(employee, payload);
      audit(db, user.fullName, user.role, 'employee.update', 'employee', id, before.fullName, employee.fullName);
      return employee;
    },

    async hrSignups() {
      const db = loadDb();
      requirePermission(db, 'signup.approve');
      return db.signups;
    },

    async decideSignup(id, payload) {
      const db = loadDb();
      const user = requirePermission(db, 'signup.approve');
      const signup = db.signups.find((s) => s.id === id);
      if (!signup) fail('Application not found.', 'NOT_FOUND');

      signup.status = payload.decision === 'approve' ? 'Approved' : 'Declined';
      signup.reviewNote = payload.note ?? null;
      signup.salary = payload.salary ?? null;
      signup.decidedAt = now();
      signup.decidedBy = user.fullName;

      // The decision and its note are tracked on the Employee Signups sheet row.
      const sheetRow = db.signupSheetRows.find((row) => row.applicationId === signup.id);
      if (sheetRow) {
        sheetRow.status = signup.status;
        sheetRow.reviewNote = signup.reviewNote;
        sheetRow.decidedAt = signup.decidedAt;
        sheetRow.decidedBy = signup.decidedBy;
      }
      db.syncLogs.unshift({
        id: uid('sync'),
        sheet: 'Main HRMS · Employee Signups',
        direction: 'PUSH',
        status: 'Success',
        records: 1,
        message: `${signup.fullName} — ${signup.status}${
          signup.reviewNote ? `: ${signup.reviewNote}` : ''
        }.`,
        createdAt: signup.decidedAt,
      });

      const newEmployeeId = uid('emp');
      if (payload.decision === 'approve') {
        const dept = db.departments.find((d) => d.name === signup.departmentName);
        const sub = db.departments.find((d) => d.name === signup.subDepartmentName);
        db.employees.push({
          id: newEmployeeId,
          employeeId: signup.employeeId,
          fullName: signup.fullName,
          mobile: signup.mobile,
          email: signup.email,
          designation: signup.designation,
          departmentId: dept?.id ?? db.departments[0].id,
          departmentName: signup.departmentName,
          subDepartmentId: sub?.id ?? null,
          subDepartmentName: signup.subDepartmentName,
          reportingManager: signup.reportingManager,
          joiningDate: signup.joiningDate,
          shiftCode: 'MORNING',
          shiftName: SHIFT_BY_CODE.MORNING.name,
          status: 'Approved',
          portal: 'EMPLOYEE',
          role: 'HR_VIEWER',
          baseSalary: payload.salary ?? undefined,
          allowances: 0,
          createdAt: now(),
        });
        db.notifications.unshift({
          id: uid('ntf'),
          employeeId: newEmployeeId,
          title: 'Account approved',
          message: 'Your employee account has been approved. You can now sign in.',
          type: 'Account Approved',
          createdAt: now(),
          read: false,
          emailStatus: 'Sent',
          category: 'general',
        });
      } else {
        db.notifications.unshift({
          id: uid('ntf'),
          employeeId: signup.employeeId,
          title: 'Account declined',
          message: `Your registration was declined.${payload.note ? ` ${payload.note}` : ''}`,
          type: 'Account Declined',
          createdAt: now(),
          read: false,
          emailStatus: 'Not Required',
          category: 'general',
        });
      }
      audit(db, user.fullName, user.role, `signup.${payload.decision}`, 'signup', id, 'Pending', signup.status, payload.note);
      return signup;
    },

    async hrDepartments() {
      const db = loadDb();
      requirePermission(db, 'department.manage');
      return db.departments.map((d) => ({
        ...d,
        employeeCount: db.employees.filter((e) => e.departmentId === d.id).length,
      }));
    },

    async saveDepartment(payload) {
      const db = loadDb();
      const user = requirePermission(db, 'department.manage');
      if (payload.id) {
        const dept = db.departments.find((d) => d.id === payload.id);
        if (!dept) fail('Department not found.', 'NOT_FOUND');
        if (dept.protected && !user.permissions.includes('department.protected.reorder')) {
          fail('Protected departments cannot be reordered by your role.', 'FORBIDDEN');
        }
        dept.name = payload.name;
        dept.active = payload.active;
        audit(db, user.fullName, user.role, 'department.update', 'department', dept.id, null, payload.name);
        return dept;
      }
      const dept: Department = {
        id: uid('dep'),
        name: payload.name,
        kind: payload.parentId ? 'SUB_DEPARTMENT' : 'DEPARTMENT',
        parentId: payload.parentId,
        displayOrder: payload.displayOrder,
        active: payload.active,
        protected: false,
      };
      db.departments.push(dept);
      audit(db, user.fullName, user.role, 'department.create', 'department', dept.id, null, dept.name);
      return dept;
    },

    async reorderDepartments(idsInOrder) {
      const db = loadDb();
      const user = requirePermission(db, 'department.manage');
      const protectedIds = db.departments.filter((d) => d.protected).map((d) => d.id);
      const reorderedProtected = idsInOrder.filter((id) => protectedIds.includes(id));
      const currentProtected = db.departments
        .filter((d) => d.protected)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((d) => d.id);
      if (
        JSON.stringify(reorderedProtected) !== JSON.stringify(currentProtected) &&
        !user.permissions.includes('department.protected.reorder')
      ) {
        fail('HR and CEO must always keep their protected order.', 'FORBIDDEN');
      }
      idsInOrder.forEach((id, index) => {
        const dept = db.departments.find((d) => d.id === id);
        if (dept) dept.displayOrder = index + 1;
      });
      audit(db, user.fullName, user.role, 'department.reorder', 'department', 'all', null, idsInOrder.join(','));
      return db.departments;
    },

    async hrDesignations() {
      const db = loadDb();
      requirePermission(db, 'designation.manage');
      return db.designations.map((d) => ({
        ...d,
        employeeCount: db.employees.filter((e) => e.designation === d.name).length,
      }));
    },

    async saveDesignation(payload) {
      const db = loadDb();
      const user = requirePermission(db, 'designation.manage');
      if (payload.id) {
        const des = db.designations.find((d) => d.id === payload.id);
        if (!des) fail('Designation not found.', 'NOT_FOUND');
        des.name = payload.name;
        des.active = payload.active;
        audit(db, user.fullName, user.role, 'designation.update', 'designation', des.id, null, payload.name);
        return des;
      }
      const des: Designation = {
        id: uid('des'),
        name: payload.name,
        departmentId: payload.departmentId,
        active: payload.active,
      };
      db.designations.push(des);
      audit(db, user.fullName, user.role, 'designation.create', 'designation', des.id, null, des.name);
      return des;
    },

    async hrRosterVersions() {
      const db = loadDb();
      requirePermission(db, 'roster.view');
      return db.rosterVersions;
    },

    async hrRosterEntries(versionId) {
      const db = loadDb();
      requirePermission(db, 'roster.view');
      return db.rosterEntries.filter((e) => e.rosterId === versionId);
    },

    async createRoster(payload) {
      const db = loadDb();
      const user = requirePermission(db, 'roster.edit');
      const version: RosterSummary = {
        id: uid('roster'),
        version: db.rosterVersions.length + 1,
        startDate: payload.startDate,
        endDate: payload.endDate,
        status: 'Draft',
        publishAt: null,
        publishedAt: null,
        publishedBy: null,
        createdAt: now(),
        notificationSent: false,
      };
      db.rosterVersions.unshift(version);
      writeAssignments(db, version, payload.assignments);
      audit(db, user.fullName, user.role, 'roster.create', 'roster', version.id, null, `${payload.startDate} → ${payload.endDate}`);
      return version;
    },

    async updateRoster(versionId, assignments) {
      const db = loadDb();
      const user = requirePermission(db, 'roster.edit');
      const version = db.rosterVersions.find((v) => v.id === versionId);
      if (!version) fail('Roster not found.', 'NOT_FOUND');
      if (version.status === 'Published') {
        fail('Published rosters are versioned. Create a new version instead.', 'LOCKED');
      }
      writeAssignments(db, version, assignments);
      audit(db, user.fullName, user.role, 'roster.update', 'roster', version.id, null, 'assignments updated');
      return version;
    },

    /**
     * Applies an update to an already published roster.
     *
     * Only the employees whose shift or off day actually changed are notified
     * and every change is written to the change history.
     */
    async updatePublishedRoster(versionId, assignments) {
      const db = loadDb();
      const user = requirePermission(db, 'roster.publish');
      const version = db.rosterVersions.find((v) => v.id === versionId);
      if (!version) fail('Roster not found.', 'NOT_FOUND');
      if (version.status !== 'Published') {
        fail('Only a published roster can be updated. Edit the draft instead.', 'LOCKED');
      }

      const before = db.rosterEntries.filter((e) => e.rosterId === version.id);
      const notified: string[] = [];
      for (const entry of before) {
        const next = assignments[entry.employeeId]?.[entry.date] as ShiftCode | undefined;
        if (!next || next === entry.shiftCode) continue;
        const employee = db.employees.find((e) => e.id === entry.employeeId);
        db.rosterChangeLog.unshift({
          id: uid('rcl'),
          rosterId: version.id,
          rosterVersion: version.version,
          employeeId: entry.employeeId,
          employeeName: employee?.fullName ?? entry.employeeName,
          previousShift: entry.shiftCode,
          updatedShift: next,
          changedBy: user.fullName,
          changedAt: now(),
          publishStatus: 'Updated',
          notificationStatus: 'Sent',
        });
        entry.shiftCode = next;
        entry.shiftName = SHIFT_BY_CODE[next]?.name ?? next;
        entry.offDay = next === 'OFF';
        entry.changed = true;
        if (!notified.includes(entry.employeeId)) notified.push(entry.employeeId);
        db.notifications.unshift({
          id: uid('ntf'),
          employeeId: entry.employeeId,
          title: 'Roster updated',
          message: `Your shift for ${entry.date} is now ${entry.shiftName}.`,
          type: 'Roster Update',
          createdAt: now(),
          read: false,
          emailStatus: 'Not Required',
          category: 'roster',
        });
        void employee;
      }
      version.publishedAt = now();
      version.publishedBy = user.fullName;
      version.notificationSent = notified.length > 0;
      audit(
        db,
        user.fullName,
        user.role,
        'roster.update',
        'roster',
        version.id,
        null,
        `published roster updated, ${notified.length} notified`,
      );
      return { version, notified };
    },

    async publishRoster(versionId, mode, publishAt) {
      const db = loadDb();
      const user = requirePermission(db, 'roster.publish');
      const version = db.rosterVersions.find((v) => v.id === versionId);
      if (!version) fail('Roster not found.', 'NOT_FOUND');

      if (mode === 'schedule') {
        version.status = 'Scheduled';
        version.publishAt = publishAt ?? addMinutesIso(now(), 60);
        audit(db, user.fullName, user.role, 'roster.schedule', 'roster', version.id, null, version.publishAt);
        return { version, notified: [] as string[] };
      }

      version.status = 'Published';
      version.publishedAt = now();
      version.publishedBy = user.fullName;

      // Only employees whose shift or off day actually changed are notified (§15.3 I).
      const previous = db.rosterEntries.filter(
        (e) => e.rosterId !== version.id && e.date >= version.startDate && e.date <= version.endDate,
      );
      const notified: string[] = [];
      const current = db.rosterEntries.filter((e) => e.rosterId === version.id);
      for (const entry of current) {
        const prior = previous.find(
          (p) => p.employeeId === entry.employeeId && p.date === entry.date,
        );
        if (!prior || prior.shiftCode !== entry.shiftCode) {
          if (!notified.includes(entry.employeeId)) notified.push(entry.employeeId);
          db.notifications.unshift({
            id: uid('ntf'),
            employeeId: entry.employeeId,
            title: 'Roster updated',
            message: `Your shift for ${entry.date} is now ${entry.shiftName}.`,
            type: 'Roster Update',
            createdAt: now(),
            read: false,
            emailStatus: 'Not Required',
            category: 'roster',
          });
        }
      }
      version.notificationSent = notified.length > 0;
      audit(db, user.fullName, user.role, 'roster.publish', 'roster', version.id, null, `published, ${notified.length} notified`);
      return { version, notified };
    },

    async sendRosterUpdate(versionId, employeeId) {
      const db = loadDb();
      const user = requirePermission(db, 'roster.publish');
      const entry = db.rosterEntries.find(
        (e) => e.rosterId === versionId && e.employeeId === employeeId,
      );
      if (!entry) fail('No roster entry found for this employee.', 'NOT_FOUND');
      db.notifications.unshift({
        id: uid('ntf'),
        employeeId: entry.employeeId,
        title: 'Roster update',
        message: `Your shift for ${entry.date} is ${entry.shiftName}.`,
        type: 'Roster Update',
        createdAt: now(),
        read: false,
        emailStatus: 'Not Required',
        category: 'roster',
      });
      audit(db, user.fullName, user.role, 'roster.send-update', 'roster', versionId, null, entry.employeeId);
      return { notified: [employeeId] };
    },

    async rosterConflicts(versionId) {
      const db = loadDb();
      requirePermission(db, 'roster.view');
      const entries = db.rosterEntries.filter((e) => e.rosterId === versionId);
      const checks: StaffingCheckRow[] = [];
      const dates = Array.from(new Set(entries.map((e) => e.date))).sort();
      for (const rule of db.staffingRules) {
        const dept = db.departments.find((d) => d.id === rule.departmentId);
        if (!dept) continue;
        for (const date of dates) {
          const assigned = entries.filter(
            (e) =>
              e.departmentName === dept.name &&
              e.shiftCode === rule.shiftCode &&
              e.date === date,
          ).length;
          checks.push({
            departmentName: dept.name,
            shiftCode: rule.shiftCode,
            date,
            required: rule.minEmployees,
            assigned,
            shortfall: Math.max(0, rule.minEmployees - assigned),
          });
        }
      }
      return checks;
    },

    async rosterChangeLog() {
      const db = loadDb();
      requirePermission(db, 'roster.view');
      return db.rosterChangeLog;
    },

    async hrAttendance(month) {
      const db = loadDb();
      requirePermission(db, 'attendance.view');
      const target = month ?? monthOf(bdDateKey(new Date()));
      const records = db.attendance
        .filter((r) => monthOf(r.workDate) === target)
        .sort((a, b) => b.workDate.localeCompare(a.workDate));
      return summariseAttendance(records);
    },

    async reviewAttendance(id, payload) {
      const db = loadDb();
      const user = requirePermission(db, 'attendance.review');
      const record = db.attendance.find((r) => r.id === id);
      if (!record) fail('Attendance record not found.', 'NOT_FOUND');
      const before = { ...record };

      switch (payload.action) {
        case 'verify':
          record.attendanceStatus = 'Verified';
          record.lateStatus = 'Not Late';
          record.actualWorkingStart ??= record.scheduledStart ?? null;
          break;
        case 'approve-late':
          record.attendanceStatus = 'Verified';
          record.lateStatus = 'Late';
          break;
        case 'excuse':
          record.attendanceStatus = 'Excused';
          record.lateStatus = 'Excused';
          break;
        case 'reject':
          record.attendanceStatus = 'Rejected';
          record.lateStatus = 'Excused';
          break;
        case 'correct':
          record.isManual = true;
          break;
        case 'clear-issue':
          record.attendanceStatus = 'Verified';
          record.lateStatus = 'Not Late';
          record.verificationResult = 'SUCCESS';
          break;
        default:
          fail('Unknown attendance review action.', 'BAD_REQUEST');
      }

      record.hrReviewStatus = 'Reviewed';
      record.hrReviewNote = payload.note ?? null;
      record.reviewedBy = user.fullName;
      record.reviewedAt = now();
      audit(
        db,
        user.fullName,
        user.role,
        `attendance.${payload.action}`,
        'attendance',
        id,
        before.attendanceStatus,
        record.attendanceStatus,
        payload.note,
      );
      return record;
    },

    async hrBreaks(month) {
      const db = loadDb();
      requirePermission(db, 'break.view');
      const target = month ?? monthOf(bdDateKey(new Date()));
      return db.breaks
        .filter((b) => monthOf(b.workDate) === target)
        .sort((a, b) => b.startAt.localeCompare(a.startAt));
    },

    async hrLeaves() {
      const db = loadDb();
      requirePermission(db, 'leave.view');
      return db.leaves.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    },

    async decideLeave(id, payload) {
      const db = loadDb();
      const user = requirePermission(db, 'leave.review');
      const leave = db.leaves.find((l) => l.id === id);
      if (!leave) fail('Leave application not found.', 'NOT_FOUND');
      const before = leave.status;
      leave.status = payload.decision === 'approve' ? 'Approved' : 'Declined';
      leave.reviewReason = payload.note ?? null;
      leave.emailStatus = 'Sent';
      leave.approvedAt = now();
      leave.decidedBy = user.fullName;
      db.notifications.unshift({
        id: uid('ntf'),
        employeeId: leave.employeeId,
        title: leave.status === 'Approved' ? 'Leave approved' : 'Leave declined',
        message:
          leave.status === 'Approved'
            ? `Your ${leave.leaveType} application for ${leave.fromDate} has been approved.`
            : `Your ${leave.leaveType} application was declined.${payload.note ? ` ${payload.note}` : ''}`,
        type: leave.status === 'Approved' ? 'Leave Approved' : 'Leave Declined',
        createdAt: now(),
        read: false,
        emailStatus: 'Sent',
        category: 'general',
      });
      audit(db, user.fullName, user.role, `leave.${payload.decision}`, 'leave', id, before, leave.status, payload.note);
      return leave;
    },

    async hrOvertime() {
      const db = loadDb();
      requirePermission(db, 'overtime.view');
      return db.overtime.sort((a, b) => b.workDate.localeCompare(a.workDate));
    },

    async decideOvertime(id, payload) {
      const db = loadDb();
      const user = requirePermission(db, 'overtime.review');
      const request = db.overtime.find((o) => o.id === id);
      if (!request) fail('Overtime request not found.', 'NOT_FOUND');
      const before = request.status;
      request.status = payload.decision === 'approve' ? 'Approved' : 'Declined';
      request.decidedAt = now();
      request.decidedBy = user.fullName;
      request.note = payload.note ?? null;
      if (request.status === 'Approved') {
        request.approvedStart = payload.approvedStart ?? request.requestedStart;
        request.approvedEnd = payload.approvedEnd ?? request.requestedEnd;
        request.approvedMinutes = request.requestedMinutes;
      }
      db.notifications.unshift({
        id: uid('ntf'),
        employeeId: request.employeeId,
        title: request.status === 'Approved' ? 'Overtime approved' : 'Overtime declined',
        message:
          request.status === 'Approved'
            ? `Your overtime request for ${request.workDate} was approved.`
            : `Your overtime request for ${request.workDate} was declined.`,
        type: request.status === 'Approved' ? 'Overtime Approved' : 'Overtime Declined',
        createdAt: now(),
        read: false,
        emailStatus: request.status === 'Approved' ? 'Sent' : 'Not Required',
        category: 'general',
      });
      audit(db, user.fullName, user.role, `overtime.${payload.decision}`, 'overtime', id, before, request.status, payload.note);
      return request;
    },

    async hrBonus(month) {
      const db = loadDb();
      requirePermission(db, 'bonus.view');
      const records = db.attendance.filter((r) => monthOf(r.workDate) === month);
      return db.employees.map((employee) => {
        const lateDays = records.filter(
          (r) => r.employeeId === employee.id && r.lateStatus === 'Late',
        ).length;
        const tier = ATTENDANCE_BONUS_TIERS.find(
          (t) => lateDays >= t.minLateDays && lateDays <= t.maxLateDays,
        )!;
        return {
          employeeId: employee.id,
          employeeName: employee.fullName,
          departmentName: employee.departmentName,
          lateDays,
          amount: tier.amount,
          tier: tier.label,
        };
      });
    },

    async hrPayroll(month) {
      const db = loadDb();
      requirePermission(db, 'payroll.view');
      return db.salaries
        .filter((s) => s.month === month)
        .sort((a, b) => b.netPayable - a.netPayable);
    },

    async publishPayroll(month) {
      const db = loadDb();
      const user = requirePermission(db, 'payroll.publish');
      const rows = db.salaries.filter((s) => s.month === month);
      let published = 0;
      for (const row of rows) {
        if (row.published) continue;
        row.published = true;
        row.publishedAt = now();
        published += 1;
        db.notifications.unshift({
          id: uid('ntf'),
          employeeId: row.employeeId,
          title: 'Salary published',
          message: `Your payslip for ${month} has been published.`,
          type: 'Salary Published',
          createdAt: now(),
          read: false,
          emailStatus: 'Sent',
          category: 'general',
        });
      }
      audit(db, user.fullName, user.role, 'payroll.publish', 'payroll', month, null, `${published} published`);
      return { published };
    },

    async hrTasks() {
      const db = loadDb();
      requirePermission(db, 'task.view');
      return db.tasks;
    },

    async saveTask(payload) {
      const db = loadDb();
      const user = requirePermission(db, 'task.manage');
      if (payload.id) {
        const task = db.tasks.find((t) => t.id === payload.id);
        if (!task) fail('Task not found.', 'NOT_FOUND');
        Object.assign(task, payload);
        audit(db, user.fullName, user.role, 'task.update', 'task', task.id, null, task.status);
        return task;
      }
      const employee = db.employees.find((e) => e.id === payload.employeeId);
      const task: Task = {
        id: uid('task'),
        taskId: `TSK-${String(db.tasks.length + 1).padStart(4, '0')}`,
        name: payload.name ?? 'Untitled task',
        description: payload.description ?? '',
        departmentName: payload.departmentName ?? employee?.departmentName ?? 'General',
        employeeId: payload.employeeId ?? '',
        employeeName: employee?.fullName ?? '',
        priority: payload.priority ?? 'Medium',
        assignedDate: payload.assignedDate ?? bdDateKey(new Date()),
        startDate: payload.startDate ?? bdDateKey(new Date()),
        dueDate: payload.dueDate ?? bdDateKey(new Date()),
        status: payload.status ?? 'Yet to Start',
        referenceLink: payload.referenceLink ?? null,
        attachmentName: payload.attachmentName ?? null,
        notes: payload.notes ?? null,
        completeDate: null,
        submissions: [],
        feedback: null,
      };
      db.tasks.unshift(task);
      audit(db, user.fullName, user.role, 'task.create', 'task', task.id, null, task.name);
      return task;
    },

    async hrAnnouncements() {
      const db = loadDb();
      requirePermission(db, 'announcement.send');
      return db.announcements;
    },

    async saveAnnouncement(payload) {
      const db = loadDb();
      const user = requirePermission(db, 'announcement.send');
      if (payload.id) {
        const announcement = db.announcements.find((a) => a.id === payload.id);
        if (!announcement) fail('Announcement not found.', 'NOT_FOUND');
        Object.assign(announcement, payload);
        audit(db, user.fullName, user.role, 'announcement.update', 'announcement', announcement.id, null, announcement.title);
        return announcement;
      }
      const recipients =
        payload.recipients ??
        (payload.audience === 'all'
          ? db.employees.map((e) => e.id)
          : db.employees
              .filter((e) => e.departmentName === payload.audienceLabel)
              .map((e) => e.id));
      const announcement: Announcement = {
        id: uid('ann'),
        title: payload.title ?? '',
        body: payload.body ?? '',
        type: payload.type ?? 'General HR Announcement',
        audience: payload.audience ?? 'all',
        audienceLabel: payload.audienceLabel ?? 'All Employees',
        attachmentName: payload.attachmentName ?? null,
        status: payload.status ?? 'Draft',
        publishAt: payload.publishAt ?? null,
        publishedAt: payload.publishedAt ?? null,
        emailNotification: payload.emailNotification ?? false,
        recipients,
        createdAt: now(),
        createdBy: user.fullName,
      };
      db.announcements.unshift(announcement);
      audit(db, user.fullName, user.role, 'announcement.create', 'announcement', announcement.id, null, announcement.title);
      return announcement;
    },

    async hrSignupSheetRows() {
      const db = loadDb();
      requirePermission(db, 'sheets.integration');
      return db.signupSheetRows;
    },

    async hrSheetsStatus() {
      const db = loadDb();
      requirePermission(db, 'sheets.integration');
      return {
        connected: true,
        lastSyncAt: db.syncLogs[0]?.createdAt ?? null,
        sheets: [
          {
            id: '1BYeXS8TdZ--0XiSNpagb7h6tE9U6rzZnCRP5Uf5ht-U',
            name: 'Task Management',
            tabs: ['Support', 'Management System', 'Dashboard', 'Roster'],
            url: 'https://docs.google.com/spreadsheets/d/1BYeXS8TdZ--0XiSNpagb7h6tE9U6rzZnCRP5Uf5ht-U/edit?gid=804686369',
          },
          {
            id: '14aH8tlWWGh98tgztao1FHrLZn9DzYNScJXVMNhLfe98',
            name: 'Main HRMS',
            tabs: ['LeaveApplications', 'Employee Signups', 'HR_Users'],
            url: 'https://docs.google.com/spreadsheets/d/14aH8tlWWGh98tgztao1FHrLZn9DzYNScJXVMNhLfe98/edit?usp=sharing',
          },
        ],
        pendingSync: 0,
        errors: db.syncLogs.filter((l) => l.status !== 'Success').map((l) => l.message),
      } satisfies SyncStatus;
    },

    async runSheetsSync(direction) {
      const db = loadDb();
      const user = requirePermission(db, 'sheets.integration');
      const sheet = direction === 'PUSH' ? 'Task Management · Management System' : 'Main HRMS · LeaveApplications';
      const count = direction === 'PUSH' ? db.tasks.length : db.leaves.length;
      const log: SyncLogEntry = {
        id: uid('sync'),
        sheet,
        direction,
        status: 'Success',
        records: count,
        message:
          direction === 'PUSH'
            ? `${count} task rows written to the spreadsheet after backend validation.`
            : `${count} leave rows imported. Duplicate employee IDs and emails were skipped.`,
        createdAt: now(),
      };
      db.syncLogs.unshift(log);
      audit(db, user.fullName, user.role, 'sheets.sync', 'sheets', sheet, null, `${count} records`);
      return { synced: count, log };
    },

    async hrAuditLogs() {
      const db = loadDb();
      requirePermission(db, 'audit.view');
      return db.auditLogs;
    },

    async hrSettings() {
      const db = loadDb();
      requirePermission(db, 'settings.manage');
      return db.settings;
    },

    async saveSettings(payload) {
      const db = loadDb();
      const user = requirePermission(db, 'settings.manage');
      const before = { ...db.settings };
      Object.assign(db.settings, payload);
      audit(
        db,
        user.fullName,
        user.role,
        'settings.update',
        'settings',
        'company',
        JSON.stringify(before),
        JSON.stringify(db.settings),
      );
      return db.settings;
    },

    async hrRosterChangeRequests() {
      const db = loadDb();
      requirePermission(db, 'roster.view');
      return db.rosterChangeRequests;
    },

    async decideRosterChange(id, payload) {
      const db = loadDb();
      const user = requirePermission(db, 'roster.review' as Permission);
      const request = db.rosterChangeRequests.find((r) => r.id === id);
      if (!request) fail('Roster change request not found.', 'NOT_FOUND');
      const before = request.status;
      request.status = payload.decision === 'approve' ? 'Approved' : 'Declined';
      request.updateMode = payload.updateMode ?? null;
      request.note = payload.note ?? null;
      request.decidedAt = now();
      request.decidedBy = user.fullName;

      if (request.status === 'Approved' && payload.updateMode === 'AUTO') {
        const entries = db.rosterEntries.filter(
          (e) => e.employeeId === request.employeeId && e.date === request.currentDate,
        );
        for (const entry of entries) {
          const previousShift = entry.shiftCode;
          if (request.type === 'Shift Change' && request.requestedShift) {
            entry.shiftCode = request.requestedShift;
            entry.shiftName = SHIFT_BY_CODE[request.requestedShift].name;
            entry.offDay = false;
          } else {
            entry.shiftCode = 'OFF';
            entry.shiftName = 'Off';
            entry.offDay = true;
          }
          db.rosterChangeLog.unshift({
            id: uid('rcl'),
            rosterId: entry.rosterId,
            rosterVersion: entry.rosterVersion,
            employeeId: entry.employeeId,
            employeeName: entry.employeeName,
            previousShift,
            updatedShift: entry.shiftCode,
            changedBy: user.fullName,
            changedAt: now(),
            publishStatus: 'Published',
            notificationStatus: 'Sent',
          });
        }
        request.rosterUpdated = true;
      }

      db.notifications.unshift({
        id: uid('ntf'),
        employeeId: request.employeeId,
        title: request.status === 'Approved' ? 'Off day change approved' : 'Off day change declined',
        message:
          request.status === 'Approved'
            ? `Your roster change request for ${request.currentDate} was approved.`
            : `Your roster change request for ${request.currentDate} was declined.`,
        type: request.status === 'Approved' ? 'Off Day Change' : 'Shift Change',
        createdAt: now(),
        read: false,
        emailStatus: 'Not Required',
        category: 'roster',
      });
      audit(db, user.fullName, user.role, `roster-change.${payload.decision}`, 'roster-change', id, before, request.status, payload.note);
      return request;
    },

    /* ---------------- reporting ---------------- */
    async report(kind) {
      const db = loadDb();
      requirePermission(db, 'reports.export');
      const month = monthOf(bdDateKey(new Date()));

      if (kind === 'attendance') {
        return {
          columns: ['Employee ID', 'Name', 'Department', 'Date', 'Shift', 'Punch In', 'Clock Out', 'Working Hours', 'Status', 'Late'],
          rows: db.attendance
            .filter((r) => monthOf(r.workDate) === month)
            .map((r) => [
              r.employeeCode,
              r.employeeName,
              r.departmentName,
              r.workDate,
              r.shiftName,
              r.punchIn ?? '',
              r.clockOut ?? '',
              (r.totalWorkingSeconds / 3600).toFixed(2),
              r.attendanceStatus,
              r.lateStatus,
            ]),
        };
      }
      if (kind === 'leave') {
        return {
          columns: ['Application ID', 'Name', 'Department', 'Leave Type', 'From', 'To', 'Days', 'Status', 'Reason'],
          rows: db.leaves.map((l) => [
            l.applicationId,
            l.employeeName,
            l.departmentName,
            l.leaveType,
            l.fromDate,
            l.toDate,
            l.totalDays,
            l.status,
            l.reviewReason ?? l.reason,
          ]),
        };
      }
      if (kind === 'payroll') {
        return {
          columns: ['Employee ID', 'Name', 'Department', 'Basic', 'Allowance', 'Overtime', 'Bonus', 'Deductions', 'Net Payable', 'Published'],
          rows: db.salaries
            .filter((s) => s.month === month)
            .map((s) => {
              const emp = db.employees.find((e) => e.id === s.employeeId);
              return [
                emp?.employeeId ?? '',
                emp?.fullName ?? '',
                emp?.departmentName ?? '',
                s.basicSalary,
                s.allowances,
                s.overtimePayment,
                s.bonusAmount,
                s.deductions,
                s.netPayable,
                s.published ? 'Yes' : 'No',
              ];
            }),
        };
      }
      if (kind === 'roster') {
        return {
          columns: ['Roster ID', 'Employee ID', 'Name', 'Department', 'Date', 'Shift', 'Off Day'],
          rows: db.rosterEntries.map((e) => [
            e.rosterId,
            e.employeeCode,
            e.employeeName,
            e.departmentName,
            e.date,
            e.shiftName,
            e.offDay ? 'Yes' : 'No',
          ]),
        };
      }
      return {
        columns: ['Task ID', 'Task Name', 'Department', 'Employee', 'Priority', 'Start Date', 'Due Date', 'Status', 'Pending Days', 'Overdue', 'Reference Link'],
        rows: db.tasks.map((t) => {
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
            t.employeeName,
            t.priority,
            t.startDate,
            t.dueDate,
            t.status,
            pendingDays,
            t.status !== 'Complete' && t.dueDate < bdDateKey(new Date()) ? 'Yes' : 'No',
            t.referenceLink ?? '',
          ];
        }),
      };
    },

    async exportReport(kind) {
      const { columns, rows } = await api.report(kind);
      const escape = (value: string | number | null) => {
        const text = String(value ?? '');
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      return [columns.join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
    },
  };

  /**
   * Every mutating call persists the dataset, so a page reload keeps the
   * session, the attendance records and any approval the user made.
   */
  return new Proxy(api, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function' || typeof prop !== 'string') return value;
      if (!MUTATING_METHODS.has(prop)) return value;
      return async (...args: unknown[]) => {
        const result = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        saveDb(loadDb());
        return result;
      };
    },
  });
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function writeAssignments(
  db: DbShape,
  version: RosterSummary,
  assignments: Record<string, Record<string, string>>,
): void {
  db.rosterEntries = db.rosterEntries.filter((e) => e.rosterId !== version.id);
  const start = new Date(`${version.startDate}T00:00:00Z`).getTime();
  const end = new Date(`${version.endDate}T00:00:00Z`).getTime();
  for (const [employeeId, byDate] of Object.entries(assignments)) {
    const employee = db.employees.find((e) => e.id === employeeId);
    if (!employee) continue;
    for (const [date, shiftCode] of Object.entries(byDate)) {
      const ts = new Date(`${date}T00:00:00Z`).getTime();
      if (ts < start || ts > end) continue;
      const code = shiftCode as ShiftCode;
      const off = code === 'OFF';
      db.rosterEntries.push({
        rosterId: version.id,
        rosterVersion: version.version,
        employeeId: employee.id,
        employeeName: employee.fullName,
        employeeCode: employee.employeeId,
        departmentName: employee.departmentName,
        subDepartmentName: employee.subDepartmentName,
        joiningDate: employee.joiningDate,
        date,
        shiftCode: code,
        shiftName: off ? 'Off' : SHIFT_BY_CODE[code].name,
        offDay: off,
        changed: false,
      });
    }
  }
}

const CREDENTIAL_OVERRIDES_KEY = 'bronee.hrms.credentials.v1';

interface CredentialRecord {
  email: string;
  passwordHash: string;
}

/** Credentials live in localStorage so a password change survives a reload. */
function findCredential(email: string): CredentialRecord | undefined {
  const key = email.trim().toLowerCase();
  const overrides = safeJson<Record<string, string>>(localStorage.getItem(CREDENTIAL_OVERRIDES_KEY));
  if (overrides?.[key]) return { email: key, passwordHash: overrides[key] };
  const seeded = SEED_CREDENTIALS.find((c) => c.email.toLowerCase() === key);
  return seeded ? { email: key, passwordHash: seeded.passwordHash } : undefined;
}

function setCredentialHash(email: string, passwordHash: string): void {
  const key = email.trim().toLowerCase();
  const overrides = safeJson<Record<string, string>>(localStorage.getItem(CREDENTIAL_OVERRIDES_KEY)) ?? {};
  overrides[key] = passwordHash;
  try {
    localStorage.setItem(CREDENTIAL_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    /* storage unavailable — the session still works for this page view */
  }
}

function safeJson<T>(raw: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
}

export { resetDb };

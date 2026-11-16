/**
 * BRONEE HRMS — frontend API contract.
 *
 * The web app never talks to the database directly. It talks to this
 * interface, which has two implementations:
 *   • `localAdapter` — a complete in-browser implementation of the same
 *     contract, seeded with real BRONEE data (demo / offline mode).
 *   • `httpAdapter` — talks to the Cloudflare Worker (`/api/*`).
 *
 * Swapping between them is a single environment switch, so the UI code is
 * identical in both modes.
 */

import type {
  Announcement,
  AttendanceRecord,
  AuditLog,
  BreakRecord,
  ClockInResult,
  CompanySettings,
  Department,
  Designation,
  Employee,
  EmployeeDashboard,
  HrDashboard,
  LeaveApplication,
  Notification,
  OvertimeRequest,
  RosterChangeRequest,
  RosterEntry,
  RosterSummary,
  SalaryRecord,
  SessionUser,
  SignupForm,
  Task,
  VerificationMethod,
  VerificationResult,
} from '@shared/types';
import type { OtpChallenge } from '@shared/types';
import type { DbShape, PendingSignup, SignupSheetRow, SyncLogEntry } from './db-types';

export interface AttendanceSummary {
  records: AttendanceRecord[];
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  totalOnLeave: number;
  totalPendingReview: number;
}

/**
 * The result of one automatic attendance tick (§6.2 – §6.8).
 *
 * The tick runs the automatic clock in at the shift start and the automatic
 * clock out at the shift end, so the employee never has to press a button for
 * either of them.
 */
export interface AttendanceTickResult {
  record: AttendanceRecord | null;
  verification: VerificationResult | null;
  method: VerificationMethod | null;
  message: string;
  changed: 'CLOCKED_IN' | 'CLOCKED_OUT' | null;
}

export interface RosterPayload {
  versions: RosterSummary[];
  entries: RosterEntry[];
  /** Team view of the same day — other employees' shifts only. */
  teamByDate: Record<string, { employeeName: string; shiftCode: string; shiftName: string; departmentName: string }[]>;
  unreadUpdates: number;
}

export interface StaffingCheckRow {
  departmentName: string;
  shiftCode: string;
  date: string;
  required: number;
  assigned: number;
  shortfall: number;
}

export interface RosterConflict {
  type: 'STAFFING' | 'DOUBLE_ASSIGNMENT';
  message: string;
  severity: 'warning' | 'error';
}

export interface SyncStatus {
  connected: boolean;
  lastSyncAt: string | null;
  sheets: { id: string; name: string; tabs: string[]; url: string }[];
  pendingSync: number;
  errors: string[];
}

export interface LeaveBalance {
  type: string;
  entitlement: number;
  used: number;
  remaining: number;
}

export interface ApiClient {
  /* ---------------- auth ---------------- */
  login(email: string, password: string): Promise<{ user: SessionUser; token: string }>;
  requestSignupOtp(form: SignupForm): Promise<OtpChallenge>;
  verifySignupOtp(email: string, code: string): Promise<{ verified: boolean }>;
  submitSignup(form: SignupForm): Promise<{ status: 'Pending' }>;
  requestPasswordReset(email: string): Promise<{ sent: boolean }>;
  resetPassword(email: string, code: string, password: string): Promise<{ ok: boolean }>;
  me(): Promise<SessionUser | null>;
  logout(): Promise<void>;

  /* ---------------- employee ---------------- */
  employeeDashboard(): Promise<EmployeeDashboard>;
  employeeAttendance(month?: string): Promise<AttendanceSummary>;
  clockIn(payload: {
    latitude?: number | null;
    longitude?: number | null;
    accuracy?: number | null;
  }): Promise<ClockInResult>;
  /** Runs the automatic clock in and automatic clock out for today. */
  attendanceTick(payload: {
    latitude?: number | null;
    longitude?: number | null;
    accuracy?: number | null;
  }): Promise<AttendanceTickResult>;
  clockOut(): Promise<ClockInResult>;
  startBreak(): Promise<{ break: BreakRecord }>;
  endBreak(): Promise<{ break: BreakRecord }>;
  employeeBreaks(month?: string): Promise<BreakRecord[]>;
  employeeRoster(): Promise<RosterPayload>;
  employeeTasks(): Promise<Task[]>;
  submitTask(taskId: string, payload: { submissionLink?: string; note?: string; fileName?: string }): Promise<Task>;
  employeeLeaves(): Promise<{ applications: LeaveApplication[]; balance: LeaveBalance[] }>;
  submitLeave(payload: {
    leaveType: string;
    fromDate: string;
    toDate: string;
    reason: string;
    attachmentName?: string | null;
  }): Promise<LeaveApplication>;
  employeeRosterChangeRequests(): Promise<RosterChangeRequest[]>;
  submitRosterChangeRequest(payload: {
    type: 'Off Day Change' | 'Shift Change';
    currentDate: string;
    currentShift: string;
    requestedDate: string;
    requestedShift?: string | null;
    reason: string;
  }): Promise<RosterChangeRequest>;
  employeeOvertime(): Promise<OvertimeRequest[]>;
  requestOvertime(payload: { workDate: string; requestedStart: string; requestedEnd: string; reason: string }): Promise<OvertimeRequest>;
  employeeNotifications(): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  employeeProfile(): Promise<Employee>;
  submitProfileCorrection(payload: { field: string; currentValue: string; requestedValue: string; reason: string }): Promise<void>;
  /** Uploads the profile photo — the file is kept in the company drive. */
  uploadProfilePhoto(payload: {
    fileName: string;
    contentType: string;
    /** The file as a base64 string (without the data url prefix). */
    data: string;
  }): Promise<{ profilePhotoUrl: string | null }>;
  /** Removes the profile photo — the file is removed from the drive. */
  removeProfilePhoto(): Promise<{ profilePhotoUrl: string | null }>;
  /** The profile photo as a data url, or null when there is none. */
  fetchProfilePhoto(): Promise<string | null>;

  /* ---------------- HR ---------------- */
  hrDashboard(): Promise<HrDashboard>;
  hrEmployees(): Promise<Employee[]>;
  updateEmployee(id: string, payload: Partial<Employee>): Promise<Employee>;
  hrSignups(): Promise<PendingSignup[]>;
  decideSignup(id: string, payload: { decision: 'approve' | 'decline'; note?: string; salary?: number }): Promise<PendingSignup>;
  hrDepartments(): Promise<Department[]>;
  saveDepartment(payload: { id?: string; name: string; parentId: string | null; displayOrder: number; active: boolean }): Promise<Department>;
  reorderDepartments(idsInOrder: string[]): Promise<Department[]>;
  hrDesignations(): Promise<Designation[]>;
  saveDesignation(payload: { id?: string; name: string; departmentId: string | null; active: boolean }): Promise<Designation>;
  hrRosterVersions(): Promise<RosterSummary[]>;
  hrRosterEntries(versionId: string): Promise<RosterEntry[]>;
  createRoster(payload: { startDate: string; endDate: string; assignments: Record<string, Record<string, string>> }): Promise<RosterSummary>;
  updateRoster(versionId: string, assignments: Record<string, Record<string, string>>): Promise<RosterSummary>;
  /** Applies an update to an already published roster. */
  updatePublishedRoster(
    versionId: string,
    assignments: Record<string, Record<string, string>>,
  ): Promise<{ version: RosterSummary; notified: string[] }>;
  publishRoster(versionId: string, mode: 'now' | 'schedule', publishAt?: string): Promise<{ version: RosterSummary; notified: string[] }>;
  sendRosterUpdate(versionId: string, employeeId: string): Promise<{ notified: string[] }>;
  rosterConflicts(versionId: string): Promise<StaffingCheckRow[]>;
  rosterChangeLog(): Promise<import('@shared/types').RosterChangeLog[]>;
  hrAttendance(month?: string): Promise<AttendanceSummary>;
  reviewAttendance(id: string, payload: { action: string; note?: string }): Promise<AttendanceRecord>;
  hrBreaks(month?: string): Promise<BreakRecord[]>;
  hrLeaves(): Promise<LeaveApplication[]>;
  decideLeave(id: string, payload: { decision: 'approve' | 'decline'; note?: string }): Promise<LeaveApplication>;
  hrOvertime(): Promise<OvertimeRequest[]>;
  decideOvertime(id: string, payload: { decision: 'approve' | 'decline'; approvedStart?: string; approvedEnd?: string; note?: string }): Promise<OvertimeRequest>;
  hrBonus(month: string): Promise<{ employeeId: string; employeeName: string; departmentName: string; lateDays: number; amount: number; tier: string }[]>;
  hrPayroll(month: string): Promise<SalaryRecord[]>;
  publishPayroll(month: string): Promise<{ published: number }>;
  hrTasks(): Promise<Task[]>;
  saveTask(payload: Partial<Task> & { id?: string }): Promise<Task>;
  hrAnnouncements(): Promise<Announcement[]>;
  saveAnnouncement(payload: Partial<Announcement> & { id?: string }): Promise<Announcement>;
  hrSheetsStatus(): Promise<SyncStatus>;
  hrSignupSheetRows(): Promise<SignupSheetRow[]>;
  runSheetsSync(direction: 'PUSH' | 'PULL'): Promise<{ synced: number; log: SyncLogEntry }>;
  hrAuditLogs(): Promise<AuditLog[]>;
  hrSettings(): Promise<CompanySettings>;
  saveSettings(payload: Partial<CompanySettings>): Promise<CompanySettings>;
  hrRosterChangeRequests(): Promise<RosterChangeRequest[]>;
  decideRosterChange(id: string, payload: { decision: 'approve' | 'decline'; updateMode?: 'AUTO' | 'MANUAL'; note?: string }): Promise<RosterChangeRequest>;

  /* ---------------- reporting ---------------- */
  report(kind: 'attendance' | 'leave' | 'payroll' | 'roster' | 'task'): Promise<{ columns: string[]; rows: (string | number | null)[][] }>;
  exportReport(kind: 'attendance' | 'leave' | 'payroll' | 'roster' | 'task'): Promise<string>;
}

export type { DbShape };

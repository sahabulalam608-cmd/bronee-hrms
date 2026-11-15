import type {
  Announcement,
  AttendanceRecord,
  AuditLog,
  BreakRecord,
  CompanySettings,
  Department,
  Designation,
  Employee,
  LeaveApplication,
  Notification,
  OvertimeRequest,
  RosterChangeLog,
  RosterChangeRequest,
  RosterEntry,
  RosterSummary,
  SalaryRecord,
  StaffingRule,
  Task,
} from '@shared/types';

/** A signup request awaiting HR approval. */
export interface PendingSignup {
  id: string;
  fullName: string;
  mobile: string;
  employeeId: string;
  designation: string;
  email: string;
  departmentName: string;
  subDepartmentName: string | null;
  reportingManager: string | null;
  joiningDate: string;
  submittedAt: string;
  status: 'Pending' | 'Approved' | 'Declined';
  reviewNote: string | null;
  salary: number | null;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface OtpEntry {
  email: string;
  code: string;
  expiresAt: string;
  purpose: 'signup' | 'reset';
  /** Set once the code has been checked, so the form cannot be skipped. */
  verified: boolean;
}

export interface SessionEntry {
  token: string;
  employeeId: string;
  expiresAt: string;
}

export interface SyncLogEntry {
  id: string;
  sheet: string;
  direction: 'PUSH' | 'PULL';
  status: 'Success' | 'Failed' | 'Partial';
  records: number;
  message: string;
  createdAt: string;
}

/**
 * A row mirrored to the Employee Signups sheet.
 * `sl` is the zero-prefixed serial (001, 002, …) and `mobile` is always in
 * the local Bangladesh format, so both numbers begin with 0.
 */
export interface SignupSheetRow {
  sl: string;
  applicationId: string;
  fullName: string;
  mobile: string;
  employeeId: string;
  designation: string;
  email: string;
  departmentName: string;
  subDepartmentName: string | null;
  reportingManager: string | null;
  joiningDate: string;
  submittedAt: string;
  status: string;
  /** The note HR recorded when the application was approved or declined. */
  reviewNote: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
}

/** The complete local dataset. Mirrors the D1 table layout one-for-one. */
export interface DbShape {
  departments: Department[];
  designations: Designation[];
  employees: Employee[];
  signups: PendingSignup[];
  rosterVersions: RosterSummary[];
  rosterEntries: RosterEntry[];
  rosterChangeRequests: RosterChangeRequest[];
  rosterChangeLog: RosterChangeLog[];
  attendance: AttendanceRecord[];
  breaks: BreakRecord[];
  leaves: LeaveApplication[];
  overtime: OvertimeRequest[];
  tasks: Task[];
  salaries: SalaryRecord[];
  notifications: Notification[];
  announcements: Announcement[];
  auditLogs: AuditLog[];
  staffingRules: StaffingRule[];
  settings: CompanySettings;
  otpCodes: OtpEntry[];
  sessions: SessionEntry[];
  syncLogs: SyncLogEntry[];
  signupSheetRows: SignupSheetRow[];
}

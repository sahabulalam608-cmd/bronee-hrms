/**
 * BRONEE HRMS — shared entity and API payload types.
 * Used by the web app (local adapter + http adapter) and the Cloudflare Worker.
 */

import type {
  AccountStatus,
  AnnouncementType,
  ApprovalStatus,
  AttendanceStatus,
  LateStatus,
  LeaveType,
  NotificationType,
  Permission,
  Role,
  ShiftCode,
  TaskPriority,
  TaskStatus,
  VerificationMethod,
  VerificationResult,
} from './constants';

export type { AccountStatus, AnnouncementType, ApprovalStatus, AttendanceStatus, LateStatus, LeaveType, NotificationType, Permission, Role, ShiftCode, TaskPriority, TaskStatus, VerificationMethod, VerificationResult };

/* ------------------------------------------------------------------ *
 * Core entities
 * ------------------------------------------------------------------ */

export interface Department {
  id: string;
  name: string;
  kind: 'DEPARTMENT' | 'SUB_DEPARTMENT' | 'PROTECTED';
  parentId: string | null;
  displayOrder: number;
  active: boolean;
  protected: boolean;
  employeeCount?: number;
}

export interface Designation {
  id: string;
  name: string;
  departmentId: string | null;
  active: boolean;
  employeeCount?: number;
}

export interface Shift {
  code: ShiftCode;
  name: string;
  shortName: string;
  startMinutes: number;
  endMinutes: number;
  endNextDay: boolean;
  workLocation: 'OFFICE' | 'HOME';
  officeVerification: boolean;
  segments?: ShiftSegment[];
  accent: string;
  active: boolean;
}

export interface ShiftSegment {
  name: string;
  workLocation: 'OFFICE' | 'HOME';
  startMinutes: number;
  endMinutes: number;
  endNextDay: boolean;
}

export interface Employee {
  id: string;
  employeeId: string;
  fullName: string;
  mobile: string;
  email: string;
  designation: string;
  departmentId: string;
  departmentName: string;
  subDepartmentId: string | null;
  subDepartmentName: string | null;
  reportingManager: string | null;
  joiningDate: string;
  shiftCode: ShiftCode;
  shiftName: string;
  status: AccountStatus;
  /** Which portal this account may sign in to. */
  portal: 'EMPLOYEE' | 'HR';
  role: Role;
  profilePhotoUrl?: string | null;
  baseSalary?: number;
  allowances?: number;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  shiftCode: ShiftCode;
  shiftName: string;
  workDate: string;
  scheduledStart: string | null;
  punchIn: string | null;
  actualWorkingStart: string | null;
  verificationCompletedAt: string | null;
  verificationMethod: VerificationMethod;
  verificationResult: VerificationResult;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAccuracy: number | null;
  officeIpMatch: boolean | null;
  clockOut: string | null;
  /** When the approved overtime session started (§6.8). */
  overtimeStartedAt?: string | null;
  totalWorkingSeconds: number;
  attendanceStatus: AttendanceStatus;
  lateStatus: LateStatus;
  isManual: boolean;
  hrReviewStatus: 'Not Reviewed' | 'Reviewed' | 'Approved' | 'Rejected' | 'Excused';
  hrReviewNote: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  segments?: AttendanceSegment[];
}

export interface AttendanceSegment {
  name: string;
  workLocation: 'OFFICE' | 'HOME';
  startAt: string | null;
  endAt: string | null;
  seconds: number;
}

export interface BreakRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  startAt: string;
  endAt: string | null;
  durationSeconds: number;
  closedBy: 'EMPLOYEE' | 'SYSTEM';
}

export interface RosterEntry {
  rosterId: string;
  rosterVersion: number;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  subDepartmentName: string | null;
  joiningDate: string;
  date: string;
  shiftCode: ShiftCode;
  shiftName: string;
  offDay: boolean;
  changed: boolean;
}

export interface RosterSummary {
  id: string;
  version: number;
  startDate: string;
  endDate: string;
  status: 'Draft' | 'Scheduled' | 'Published';
  publishAt: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
  notificationSent: boolean;
}

export interface RosterChangeRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: 'Off Day Change' | 'Shift Change';
  currentDate: string;
  currentShift: ShiftCode;
  currentShiftName: string;
  requestedDate: string;
  requestedShift: ShiftCode | null;
  requestedShiftName: string | null;
  reason: string;
  status: ApprovalStatus;
  updateMode: 'AUTO' | 'MANUAL' | null;
  rosterUpdated: boolean;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface RosterChangeLog {
  id: string;
  rosterId: string;
  rosterVersion: number;
  employeeId: string;
  employeeName: string;
  previousShift: string;
  updatedShift: string;
  changedBy: string;
  changedAt: string;
  publishStatus: string;
  notificationStatus: string;
}

export interface LeaveApplication {
  id: string;
  applicationId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  designation: string;
  email: string;
  departmentName: string;
  reportingManager: string | null;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  totalDays: number;
  reason: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  submittedAt: string;
  status: ApprovalStatus;
  reviewReason: string | null;
  emailStatus: 'Sent' | 'Not Sent' | 'Failed';
  approvedAt: string | null;
  decidedBy: string | null;
  isRosterChangeRequest: boolean;
}

export interface OvertimeRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentName: string;
  workDate: string;
  requestedStart: string | null;
  requestedEnd: string | null;
  requestedMinutes: number;
  approvedStart: string | null;
  approvedEnd: string | null;
  approvedMinutes: number;
  actualMinutes: number | null;
  status: ApprovalStatus;
  reason: string;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface Task {
  id: string;
  taskId: string;
  name: string;
  description: string;
  departmentName: string;
  employeeId: string;
  employeeName: string;
  priority: TaskPriority;
  assignedDate: string;
  startDate: string;
  dueDate: string;
  status: TaskStatus;
  referenceLink: string | null;
  attachmentName: string | null;
  notes: string | null;
  completeDate: string | null;
  submissions: TaskSubmission[];
  feedback: string | null;
}

export interface TaskSubmission {
  id: string;
  submittedAt: string;
  submissionLink: string | null;
  fileName: string | null;
  note: string | null;
  reviewerFeedback: string | null;
}

export interface SalaryRecord {
  id: string;
  employeeId: string;
  month: string;
  basicSalary: number;
  allowances: number;
  overtimePayment: number;
  bonusAmount: number | null;
  deductions: number;
  netPayable: number;
  published: boolean;
  publishedAt: string | null;
  lateDays: number;
  approvedOvertimeMinutes: number;
}

export interface Notification {
  id: string;
  /** Owning employee — a notification is never visible to another employee. */
  employeeId: string;
  title: string;
  message: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
  emailStatus: 'Sent' | 'Not Sent' | 'Failed' | 'Not Required';
  category: 'roster' | 'general';
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: AnnouncementType;
  audience: string;
  audienceLabel: string;
  attachmentName: string | null;
  status: 'Draft' | 'Scheduled' | 'Published';
  publishAt: string | null;
  publishedAt: string | null;
  emailNotification: boolean;
  recipients: string[];
  createdAt: string;
  createdBy: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  actorRole: Role;
  action: string;
  entity: string;
  entityId: string;
  before: string | null;
  after: string | null;
  note: string | null;
  createdAt: string;
}

export interface StaffingRule {
  id: string;
  departmentId: string;
  shiftCode: ShiftCode;
  minEmployees: number;
}

export interface CompanySettings {
  companyName: string;
  timezone: string;
  officePublicIps: string[];
  officeLat: number;
  officeLng: number;
  geofenceRadiusM: number;
  otRatePerHour: number;
  payrollApprovedBy: string;
  lateGraceMinutes: number;
}

/* ------------------------------------------------------------------ *
 * Session & auth
 * ------------------------------------------------------------------ */

export interface SessionUser {
  id: string;
  employeeId: string;
  fullName: string;
  email: string;
  designation: string;
  departmentId: string;
  departmentName: string;
  subDepartmentId: string | null;
  subDepartmentName: string | null;
  reportingManager: string | null;
  joiningDate: string;
  shiftCode: ShiftCode;
  shiftName: string;
  status: AccountStatus;
  portal: 'EMPLOYEE' | 'HR';
  role: Role;
  permissions: Permission[];
  profilePhotoUrl?: string | null;
  baseSalary?: number;
}

export interface SignupForm {
  fullName: string;
  mobile: string;
  employeeId: string;
  designation: string;
  email: string;
  departmentName: string;
  subDepartmentName: string | null;
  reportingManager: string | null;
  joiningDate: string;
  password: string;
}

/* ------------------------------------------------------------------ *
 * Dashboard payloads
 * ------------------------------------------------------------------ */

export interface EmployeeDashboard {
  user: SessionUser;
  today: {
    workDate: string;
    shiftCode: ShiftCode;
    shiftName: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    punchIn: string | null;
    clockOut: string | null;
    workingStart: string | null;
    working: boolean;
    onBreak: boolean;
    breakStartedAt: string | null;
    totalWorkingSeconds: number;
    totalBreakSeconds: number;
    breakSessions: number;
    attendanceStatus: AttendanceStatus;
    lateStatus: LateStatus;
    verificationResult: VerificationResult;
    verificationMethod: VerificationMethod;
    overtimeApproved: OvertimeRequest | null;
    overtimeActive: boolean;
    segments: AttendanceSegment[];
  };
  month: {
    label: string;
    totalWorkingSeconds: number;
    totalBreakSeconds: number;
    totalOvertimeSeconds: number;
    lateDays: number;
    completedTasks: number;
    pendingTasks: number;
  };
  recentActivity: {
    lastDutyDate: string | null;
    lastClockIn: string | null;
    lastClockOut: string | null;
    lastBreakStart: string | null;
    lastBreakEnd: string | null;
  };
  quickAccess: {
    pendingTasks: number;
    leaveBalance: number;
    upcomingDeadlines: { taskId: string; name: string; dueDate: string }[];
    unreadNotifications: number;
    unreadRosterUpdates: number;
    currentRoster: { date: string; shiftCode: ShiftCode; shiftName: string } | null;
  };
}

export interface HrDashboard {
  totalEmployees: number;
  activeEmployees: number;
  pendingApplications: number;
  approvedThisMonth: number;
  totalApplications: number;
  todaysApplications: number;
  leaveTypeDistribution: { label: string; value: number }[];
  applicationsByMonth: { month: string; applied: number; approved: number }[];
  todaysAttendance: { present: number; absent: number; late: number; onLeave: number; pendingReview: number };
  lateEmployees: { employeeId: string; name: string; department: string; punchIn: string | null }[];
  currentlyWorking: number;
  onBreak: number;
  overtimeSummary: { requested: number; approved: number; actualHours: number };
  monthlyPayroll: { month: string; netPayable: number; employees: number };
  taskSummary: {
    total: number;
    inProgress: number;
    completed: number;
    yetToStart: number;
    pending: number;
    overdue: number;
    byPriority: { label: string; value: number }[];
    byDepartment: { label: string; value: number }[];
    byStatus: { label: string; value: number }[];
  };
}

/* ------------------------------------------------------------------ *
 * API envelope
 * ------------------------------------------------------------------ */

export interface ApiError {
  error: string;
  message: string;
  code?: string;
  field?: string;
}

export interface OtpChallenge {
  email: string;
  expiresAt: string;
  /** Only populated in local/demo mode so the flow is testable without a mailbox. */
  devCode?: string;
}

export interface ClockInResult {
  record: AttendanceRecord;
  verification: VerificationResult;
  method: VerificationMethod;
  message: string;
}

export interface BulkResult {
  affected: number;
  errors: string[];
}

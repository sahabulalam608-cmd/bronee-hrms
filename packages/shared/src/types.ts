/**
 * BRONEE HRMS — shared domain types.
 * Used by the Cloudflare Worker API and the React client alike.
 */

export type Role = 'employee' | 'manager' | 'hr' | 'super_admin';

export type UserStatus = 'pending' | 'approved' | 'declined' | 'suspended' | 'active';

export type DepartmentType = 'regular' | 'parent' | 'protected';

export type ShiftLocationPolicy = 'office' | 'wfh' | 'split';

export type ShiftSegment = {
  key: 'office' | 'home';
  label: string;
  startTime: string;
  endTime: string;
  requiresOfficeVerification: boolean;
};

export type Shift = {
  id: string;
  code: string;
  name: string;
  shortName: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  locationPolicy: ShiftLocationPolicy;
  requiresOfficeVerification: boolean;
  segments: ShiftSegment[] | null;
  displayOrder: number;
  isActive: boolean;
};

export type Department = {
  id: string;
  name: string;
  type: DepartmentType;
  parentId: string | null;
  displayOrder: number;
  isActive: boolean;
};

export type DepartmentNode = Department & {
  children: Department[];
};

export type Designation = {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
};

export type PublicUser = {
  id: string;
  email: string;
  fullName: string;
  mobile: string;
  employeeCode: string;
  designation: string | null;
  designationId: string | null;
  department: string | null;
  departmentId: string | null;
  subDepartment: string | null;
  subDepartmentId: string | null;
  reportingManagerId: string | null;
  reportingManagerName: string | null;
  joiningDate: string;
  role: Role;
  status: UserStatus;
  avatarKey: string | null;
  avatarUrl: string | null;
  mustChangePassword: boolean;
};

export type VerificationMethod = 'office_ip' | 'gps' | 'manual' | 'none';

export type VerificationResult = 'verified' | 'failed' | 'pending' | 'not_required';

export type LateStatus = 'on_time' | 'pending_review' | 'late' | 'excused' | 'rejected';

export type AttendanceStatus = 'present' | 'absent' | 'leave' | 'holiday' | 'off' | 'partial';

export type SessionStatus = 'open' | 'closed' | 'auto_closed';

export type AttendanceSession = {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  date: string;
  shiftId: string | null;
  shiftCode: string | null;
  shiftName: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  punchInAt: string | null;
  actualWorkingStart: string | null;
  verificationCompletedAt: string | null;
  verificationMethod: VerificationMethod;
  verificationResult: VerificationResult;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  officeIpMatched: boolean | null;
  officeIp: string | null;
  clockOutAt: string | null;
  workingSeconds: number;
  breakSeconds: number;
  breakCount: number;
  status: SessionStatus;
  lateStatus: LateStatus;
  attendanceStatus: AttendanceStatus;
  autoAction: string | null;
  reviewStatus: 'not_required' | 'pending' | 'reviewed';
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  exceptionHistory: unknown;
  segment: 'office' | 'home' | null;
  isOvertime: boolean;
  createdAt: string;
};

export type BreakRecord = {
  id: string;
  employeeId: string;
  sessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  closedBy: 'employee' | 'system';
};

export type RosterStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export type Roster = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  version: number;
  status: RosterStatus;
  scheduledFor: string | null;
  publishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  entryCount: number;
};

export type RosterEntry = {
  id: string;
  rosterId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string | null;
  subDepartment: string | null;
  date: string;
  shiftId: string | null;
  shiftCode: string | null;
  shiftName: string | null;
  isOff: boolean;
  updatedAt: string;
};

export type RosterDayCell = {
  date: string;
  dayLabel: string;
  isOff: boolean;
  shiftId: string | null;
  shiftCode: string | null;
  shiftName: string | null;
  shiftShortName: string | null;
  team: Array<{ employeeId: string; employeeName: string; shiftCode: string | null; isOff: boolean }>;
};

export type LeaveTypeCode = 'casual' | 'sick' | 'earned' | 'unpaid';

export type LeaveStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

export type LeaveRequest = {
  id: string;
  employeeId: string;
  employeeName?: string;
  leaveType: LeaveTypeCode;
  fromDate: string;
  toDate: string;
  totalDays: number;
  reason: string;
  attachmentKey: string | null;
  attachmentName: string | null;
  status: LeaveStatus;
  isRosterChange: boolean;
  rosterChangeId: string | null;
  rosterUpdateMode: 'auto' | 'manual' | null;
  rosterUpdateStatus: 'none' | 'pending' | 'completed' | 'manual_required' | null;
  reviewedBy: string | null;
  reviewedByName?: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeaveBalance = {
  leaveType: LeaveTypeCode;
  entitled: number;
  used: number;
  remaining: number;
  year: number;
};

export type OvertimeStatus = 'pending' | 'approved' | 'declined' | 'completed' | 'cancelled';

export type OvertimeRequest = {
  id: string;
  employeeId: string;
  employeeName?: string;
  requestedStart: string | null;
  requestedEnd: string | null;
  requestedHours: number;
  approvedStart: string | null;
  approvedEnd: string | null;
  approvedHours: number | null;
  actualStart: string | null;
  actualEnd: string | null;
  actualHours: number | null;
  status: OvertimeStatus;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
};

export type TaskStatus = 'yet_to_start' | 'in_progress' | 'pending' | 'complete';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type Task = {
  id: string;
  taskCode: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  department: string | null;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  reviewerId: string | null;
  reviewerName: string | null;
  priority: TaskPriority;
  assignedDate: string | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  status: TaskStatus;
  referenceLink: string | null;
  createdBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskSubmission = {
  id: string;
  taskId: string;
  employeeId: string;
  employeeName?: string;
  submissionLink: string | null;
  notes: string | null;
  attachmentKey: string | null;
  attachmentName: string | null;
  status: 'submitted' | 'approved' | 'rejected';
  feedback: string | null;
  createdAt: string;
};

export type PayrollStatus = 'draft' | 'published';

export type PayrollRecord = {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  department?: string | null;
  year: number;
  month: number;
  basicSalary: number;
  allowances: number;
  overtimeAmount: number;
  bonusAmount: number;
  deductions: number;
  netPayable: number;
  workingDays: number;
  presentDays: number;
  lateDays: number;
  status: PayrollStatus;
  publishedAt: string | null;
  notes: string | null;
  createdAt: string;
};

export type AttendanceBonusSnapshot = {
  id: string;
  employeeId: string;
  employeeName?: string;
  year: number;
  month: number;
  lateDays: number;
  bonusAmount: number;
  eligible: boolean;
};

export type NotificationType =
  | 'account_approved'
  | 'account_declined'
  | 'leave_approved'
  | 'leave_declined'
  | 'overtime_approved'
  | 'overtime_declined'
  | 'task_assigned'
  | 'task_deadline_reminder'
  | 'task_feedback'
  | 'salary_published'
  | 'announcement'
  | 'holiday_notice'
  | 'attendance_notice'
  | 'roster_update'
  | 'shift_change'
  | 'off_day_change'
  | 'individual_message'
  | 'profile_request';

export type AppNotification = {
  id: string;
  employeeId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  emailSent: boolean;
  emailStatus: 'not_required' | 'pending' | 'sent' | 'failed';
  readAt: string | null;
  publishedAt: string;
  createdBy: string | null;
  meta: Record<string, unknown> | null;
};

export type AnnouncementStatus = 'draft' | 'scheduled' | 'published';

export type AnnouncementTargetType = 'all' | 'department' | 'sub_department' | 'employees';

export type Announcement = {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  targetType: AnnouncementTargetType;
  targetIds: string[];
  targetLabel: string | null;
  attachmentKey: string | null;
  status: AnnouncementStatus;
  scheduledFor: string | null;
  publishedAt: string | null;
  emailNotification: boolean;
  createdBy: string | null;
  createdByName?: string | null;
  recipientCount: number;
  readCount: number;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type CompanySetting = {
  key: string;
  value: unknown;
  updatedBy: string | null;
  updatedAt: string;
};

export type StaffingRule = {
  id: string;
  departmentId: string;
  shiftId: string | null;
  minStaff: number;
  dayOfWeek: number | null;
  isActive: boolean;
};

export type StaffingWarning = {
  code: 'UNDERSTAFFED' | 'CONFLICT' | 'SHORT_SHIFT' | 'MISSING_EMPLOYEE';
  severity: 'warning' | 'error';
  message: string;
  date: string | null;
  departmentId: string | null;
  employeeId: string | null;
};

export type SyncLog = {
  id: string;
  direction: 'export' | 'import' | 'manual';
  sheetId: string | null;
  tab: string | null;
  status: 'success' | 'failed' | 'running';
  rowsProcessed: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string | null;
};

export type FileMeta = {
  id: string;
  key: string;
  name: string;
  mimeType: string;
  size: number;
  ownerId: string;
  purpose: string;
  createdAt: string;
  url?: string;
};

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  fullName: string;
  employeeCode: string;
};

/** Standard envelope for every API response. */
export type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  meta?: Record<string, unknown>;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** Employee dashboard payload. */
export type EmployeeDashboard = {
  profile: PublicUser;
  assignedShift: Shift | null;
  today: {
    date: string;
    session: AttendanceSession | null;
    liveWorkingSeconds: number;
    liveBreakSeconds: number;
    activeBreak: BreakRecord | null;
    workingSeconds: number;
    breakSeconds: number;
    breakCount: number;
    status: 'not_started' | 'working' | 'on_break' | 'closed';
    scheduledShift: Shift | null;
    rosterShift: Shift | null;
    isOffDay: boolean;
    approvedOvertime: OvertimeRequest | null;
  };
  month: {
    year: number;
    month: number;
    totalWorkingSeconds: number;
    totalBreakSeconds: number;
    totalOvertimeSeconds: number;
    lateDays: number;
    presentDays: number;
    tasksCompleted: number;
    tasksPending: number;
  };
  recent: {
    lastDutyDate: string | null;
    lastClockIn: string | null;
    lastClockOut: string | null;
    lastBreakStart: string | null;
    lastBreakEnd: string | null;
  };
  quick: {
    pendingTasks: number;
    upcomingDeadlines: number;
    unreadNotifications: number;
    unreadRosterUpdates: number;
    leaveBalance: LeaveBalance[];
  };
};

/** HR dashboard payload. */
export type HrDashboard = {
  kpi: {
    totalEmployees: number;
    pendingApplications: number;
    approvedThisMonth: number;
    totalApplications: number;
    todayApplications: number;
    activeToday: number;
    onBreak: number;
    lateToday: number;
    absentToday: number;
  };
  leaveTypeDistribution: Array<{ leaveType: string; count: number }>;
  applicationsByMonth: Array<{ month: string; count: number }>;
  overtimeSummary: { pending: number; approved: number; hoursThisMonth: number };
  payrollSummary: { month: number; year: number; totalNet: number; employees: number; published: number };
  attendanceStatusToday: Array<{ status: string; count: number }>;
  departmentHeadcount: Array<{ department: string; count: number }>;
};

export type AuthSession = {
  user: PublicUser;
  permissions: string[];
};

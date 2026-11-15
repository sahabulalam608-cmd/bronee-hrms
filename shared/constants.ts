/**
 * BRONEE HRMS — shared domain constants.
 * Single source of truth for shifts, departments, policy tables and status vocabularies.
 * Imported by the web app, the Cloudflare Worker and the local demo adapter.
 */

/* ------------------------------------------------------------------ *
 * Departments (§15.2)
 * ------------------------------------------------------------------ */

export type DepartmentKind = 'DEPARTMENT' | 'SUB_DEPARTMENT' | 'PROTECTED';

export interface DepartmentSeed {
  id: string;
  name: string;
  kind: DepartmentKind;
  parentId: string | null;
  displayOrder: number;
  /** Protected departments always render last and cannot be reordered by normal HR. */
  protected: boolean;
}

/**
 * Fixed display order from the specification.
 * CEO is always last, HR always directly above CEO — this ordering is protected.
 */
export const DEPARTMENTS: DepartmentSeed[] = [
  { id: 'dep-supply-chain', name: 'Supply Chain', kind: 'DEPARTMENT', parentId: null, displayOrder: 1, protected: false },
  { id: 'dep-digital-marketing', name: 'Digital Marketing', kind: 'DEPARTMENT', parentId: null, displayOrder: 2, protected: false },
  { id: 'dep-accounts', name: 'Accounts', kind: 'DEPARTMENT', parentId: null, displayOrder: 3, protected: false },
  { id: 'dep-sales-team', name: 'Sales Team', kind: 'DEPARTMENT', parentId: null, displayOrder: 4, protected: false },
  { id: 'dep-direct-sales', name: 'Direct Sales', kind: 'SUB_DEPARTMENT', parentId: 'dep-sales-team', displayOrder: 1, protected: false },
  { id: 'dep-social-media', name: 'Social Media', kind: 'SUB_DEPARTMENT', parentId: 'dep-sales-team', displayOrder: 2, protected: false },
  { id: 'dep-retention-team', name: 'Retention Team', kind: 'SUB_DEPARTMENT', parentId: 'dep-sales-team', displayOrder: 3, protected: false },
  { id: 'dep-courier-team', name: 'Courier Team', kind: 'SUB_DEPARTMENT', parentId: 'dep-sales-team', displayOrder: 4, protected: false },
  { id: 'dep-hr', name: 'HR', kind: 'PROTECTED', parentId: null, displayOrder: 5, protected: true },
  { id: 'dep-ceo', name: 'CEO', kind: 'PROTECTED', parentId: null, displayOrder: 6, protected: true },
];

/** Flat ordered list used by the signup form (§4.2). */
export const SIGNUP_DEPARTMENT_ORDER = [
  'Supply Chain',
  'Digital Marketing',
  'Accounts',
  'Sales Team',
  'Direct Sales',
  'Social Media',
  'Retention Team',
  'Courier Team',
  'HR',
  'CEO',
];

/** The only parent department that owns sub-departments. */
export const PARENT_DEPARTMENT = 'Sales Team';

/* ------------------------------------------------------------------ *
 * Shifts (§6.1)
 * ------------------------------------------------------------------ */

export type ShiftCode = 'MORNING' | 'EVENING_E1' | 'LATE_EVENING' | 'OFF';

export interface ShiftSeed {
  code: ShiftCode;
  name: string;
  shortName: string;
  /** Minutes from midnight, local Asia/Dhaka. `endNextDay` marks overnight shifts. */
  startMinutes: number;
  endMinutes: number;
  endNextDay: boolean;
  workLocation: 'OFFICE' | 'HOME';
  /** Human readable window, e.g. `9:20 AM - 6:00 PM`. */
  timeLabel: string;
  officeVerification: boolean;
  accent: string;
}

const h = (hour: number, minute = 0) => hour * 60 + minute;

/**
 * The three live shifts (§6.1).
 *
 *   Morning Shift (Office)          9:20 AM - 6:00 PM   office verification required
 *   Evening Shift (Office)          2:00 PM - 9:00 PM   office verification required
 *   Late Evening Shift (Work From Home) 6:00 PM - 1:00 AM (next day)  no office verification
 *
 * The split shift (office + home) has been removed.
 */
export const SHIFTS: ShiftSeed[] = [
  {
    code: 'MORNING',
    name: 'Morning Shift (Office)',
    shortName: 'Morning',
    startMinutes: h(9, 20),
    endMinutes: h(18, 0),
    endNextDay: false,
    workLocation: 'OFFICE',
    timeLabel: '9:20 AM - 6:00 PM',
    officeVerification: true,
    accent: '#6366f1',
  },
  {
    code: 'EVENING_E1',
    name: 'Evening Shift (Office)',
    shortName: 'Evening',
    startMinutes: h(14, 0),
    endMinutes: h(21, 0),
    endNextDay: false,
    workLocation: 'OFFICE',
    timeLabel: '2:00 PM - 9:00 PM',
    officeVerification: true,
    accent: '#8b5cf6',
  },
  {
    code: 'LATE_EVENING',
    name: 'Late Evening Shift (Work From Home)',
    shortName: 'Late Evening (LE)',
    startMinutes: h(18, 0),
    endMinutes: h(1, 0),
    endNextDay: true,
    workLocation: 'HOME',
    timeLabel: '6:00 PM - 1:00 AM',
    officeVerification: false,
    accent: '#06b6d4',
  },
  {
    code: 'OFF',
    name: 'Off',
    shortName: 'Off',
    startMinutes: 0,
    endMinutes: 0,
    endNextDay: false,
    workLocation: 'HOME',
    timeLabel: 'Off',
    officeVerification: false,
    accent: '#94a3b8',
  },
];

/**
 * The exact labels used by every shift picker on the site (§6.1).
 * The time window is always part of the label.
 */
export const SHIFT_OPTION_LABELS: Record<ShiftCode, string> = {
  MORNING: 'Morning 9:20 AM - 6:00 PM',
  EVENING_E1: 'Evening 2:00 PM - 9:00 PM',
  LATE_EVENING: 'Late Evening (LE) 6:00 PM - 1:00 AM',
  OFF: 'Off',
};

/** Compact label used inside the coloured roster cells. */
export const SHIFT_CELL_LABELS: Record<ShiftCode, string> = {
  MORNING: 'Morning 9:20 AM - 6:00 PM',
  EVENING_E1: 'Evening 2:00 PM - 9:00 PM',
  LATE_EVENING: 'Late Evening (LE) 6:00 PM - 1:00 AM',
  OFF: 'Off',
};

export const SHIFT_BY_CODE: Record<ShiftCode, ShiftSeed> = Object.fromEntries(SHIFTS.map((s) => [s.code, s])) as Record<
  ShiftCode,
  ShiftSeed
>;

/* ------------------------------------------------------------------ *
 * Attendance verification policy (§6.3 / §6.4)
 * ------------------------------------------------------------------ */

export const VERIFICATION = {
  /** Verification window: first N minutes after scheduled shift start. */
  WINDOW_MINUTES: 1,
  /** Pre clock-in allowed window, in minutes before scheduled shift start. */
  PRE_CLOCK_IN_MIN: 10,
  PRE_CLOCK_IN_MAX: 15,
  /** GPS geofence radius around the office, in metres. */
  GEOFENCE_RADIUS_M: 50,
  /** Maximum accepted GPS accuracy radius, in metres. */
  MAX_GPS_ACCURACY_M: 100,
  /** Timezone used for every display and attendance calculation. */
  TIMEZONE: 'Asia/Dhaka',
} as const;

/* ------------------------------------------------------------------ *
 * Attendance bonus policy (§8)
 * ------------------------------------------------------------------ */

export interface BonusTier {
  minLateDays: number;
  maxLateDays: number;
  amount: number;
  label: string;
}

export const ATTENDANCE_BONUS_TIERS: BonusTier[] = [
  { minLateDays: 0, maxLateDays: 0, amount: 2000, label: 'Perfect attendance' },
  { minLateDays: 1, maxLateDays: 1, amount: 100, label: '1 late day' },
  { minLateDays: 2, maxLateDays: 2, amount: 1000, label: '2 late days' },
  { minLateDays: 3, maxLateDays: 9999, amount: 0, label: '3 or more late days' },
];

export function attendanceBonusFor(lateDays: number): BonusTier {
  return (
    ATTENDANCE_BONUS_TIERS.find((tier) => lateDays >= tier.minLateDays && lateDays <= tier.maxLateDays) ??
    ATTENDANCE_BONUS_TIERS[ATTENDANCE_BONUS_TIERS.length - 1]
  );
}

/* ------------------------------------------------------------------ *
 * Status vocabularies
 * ------------------------------------------------------------------ */

export const ACCOUNT_STATUS = ['Pending', 'Approved', 'Declined', 'Suspended', 'Active'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUS)[number];

export const ATTENDANCE_STATUS = [
  'Present',
  'Verified',
  'Pre-Clocked In',
  'Awaiting Verification',
  'Pending Review',
  'Verification Failed',
  'Excused',
  'Rejected',
  'On Leave',
  'Holiday',
  'Absent',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];

export const LATE_STATUS = ['Not Late', 'Pending Review', 'Late', 'Excused'] as const;
export type LateStatus = (typeof LATE_STATUS)[number];

export const VERIFICATION_RESULT = ['SUCCESS', 'FAILED', 'PENDING'] as const;
export type VerificationResult = (typeof VERIFICATION_RESULT)[number];

export const VERIFICATION_METHOD = ['OFFICE_IP', 'GPS', 'NONE', 'AUTO'] as const;
export type VerificationMethod = (typeof VERIFICATION_METHOD)[number];

export const TASK_STATUS = ['Yet to Start', 'In Progress', 'Pending', 'Complete'] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export const TASK_PRIORITY = ['High', 'Medium', 'Low'] as const;
export type TaskPriority = (typeof TASK_PRIORITY)[number];

export const LEAVE_TYPES = [
  'Weekly Off',
  'Casual Leave',
  'Sick Leave',
  'Annual Leave',
  'Earned Leave',
  'Maternity Leave',
  'Unpaid Leave',
  'Work From Home',
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const APPROVAL_STATUS = ['Pending', 'Approved', 'Declined'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUS)[number];

export const NOTIFICATION_TYPES = [
  'Account Approved',
  'Account Declined',
  'Leave Approved',
  'Leave Declined',
  'Overtime Approved',
  'Overtime Declined',
  'New Task Assigned',
  'Task Deadline Reminder',
  'Task Feedback',
  'Salary Published',
  'HR Announcement',
  'Holiday Notice',
  'Important Attendance Notice',
  'Roster Update',
  'Shift Change',
  'Off Day Change',
  'Individual HR Message',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Types that are delivered over email by default (§13). */
export const EMAIL_NOTIFICATION_TYPES: NotificationType[] = [
  'Account Approved',
  'Leave Approved',
  'Overtime Approved',
  'Task Deadline Reminder',
  'HR Announcement',
  'Important Attendance Notice',
];

export const ANNOUNCEMENT_TYPES = [
  'General HR Announcement',
  'Holiday Notice',
  'Salary Published Notice',
  'Attendance Notice',
  'Important Office Notice',
  'Department-wise Notice',
  'Sub-department-wise Notice',
  'Individual Employee Message',
] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

/* ------------------------------------------------------------------ *
 * Roles & permissions (§15.8)
 * ------------------------------------------------------------------ */

export const ROLES = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'HR_VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  HR_ADMIN: 'HR Admin',
  HR_MANAGER: 'HR Manager',
  HR_EXECUTIVE: 'HR Executive',
  HR_VIEWER: 'HR Viewer',
};

export const PERMISSIONS = [
  'employee.view',
  'employee.edit',
  'employee.suspend',
  'signup.approve',
  'department.manage',
  'designation.manage',
  'shift.manage',
  'roster.view',
  'roster.edit',
  'roster.publish',
  'attendance.view',
  'attendance.review',
  'break.view',
  'leave.view',
  'leave.review',
  'overtime.view',
  'overtime.review',
  'bonus.view',
  'payroll.view',
  'payroll.publish',
  'task.view',
  'task.manage',
  'announcement.send',
  'sheets.integration',
  'reports.export',
  'settings.manage',
  'audit.view',
  'department.protected.reorder',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY: Permission[] = [
  'employee.view',
  'roster.view',
  'attendance.view',
  'break.view',
  'leave.view',
  'overtime.view',
  'bonus.view',
  'payroll.view',
  'task.view',
  'reports.export',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [...PERMISSIONS],
  HR_ADMIN: PERMISSIONS.filter((p) => p !== 'department.protected.reorder'),
  HR_MANAGER: [
    ...READ_ONLY,
    'employee.edit',
    'signup.approve',
    'leave.review',
    'overtime.review',
    'attendance.review',
    'task.manage',
    'announcement.send',
  ],
  HR_EXECUTIVE: [
    'employee.view',
    'roster.view',
    'attendance.view',
    'break.view',
    'leave.view',
    'leave.review',
    'overtime.view',
    'overtime.review',
    'task.view',
    'task.manage',
    'announcement.send',
    'sheets.integration',
  ],
  HR_VIEWER: READ_ONLY,
};

/** The Super Admin is always an HR — never anyone else (§1). */
export const SUPER_ADMIN_EMAIL = 'hr@bronneltd.com';

/* ------------------------------------------------------------------ *
 * Module registry (§15 HR portal navigation)
 * ------------------------------------------------------------------ */

export interface HrModule {
  key: string;
  label: string;
  permission?: Permission;
  group: 'Overview' | 'People' | 'Time & Attendance' | 'Payroll' | 'Work' | 'Communication' | 'System';
}

export const HR_MODULES: HrModule[] = [
  { key: 'dashboard', label: 'HR Dashboard', group: 'Overview' },
  { key: 'employees', label: 'Employee Management', permission: 'employee.view', group: 'People' },
  { key: 'approvals', label: 'Employee Signup Approval', permission: 'signup.approve', group: 'People' },
  { key: 'departments', label: 'Department Management', permission: 'department.manage', group: 'People' },
  { key: 'designations', label: 'Designation Management', permission: 'designation.manage', group: 'People' },
  { key: 'roster', label: 'Roster Management', permission: 'roster.view', group: 'Time & Attendance' },
  { key: 'attendance', label: 'Attendance Management', permission: 'attendance.view', group: 'Time & Attendance' },
  { key: 'attendance-review', label: 'Attendance Review & Late Login', permission: 'attendance.review', group: 'Time & Attendance' },
  { key: 'breaks', label: 'Break Records', permission: 'break.view', group: 'Time & Attendance' },
  { key: 'leave', label: 'Leave Management', permission: 'leave.view', group: 'Time & Attendance' },
  { key: 'overtime', label: 'Overtime Management', permission: 'overtime.view', group: 'Time & Attendance' },
  { key: 'bonus', label: 'Attendance Bonus Calculation', permission: 'bonus.view', group: 'Payroll' },
  { key: 'payroll', label: 'Payroll Management', permission: 'payroll.view', group: 'Payroll' },
  { key: 'tasks', label: 'Task Management', permission: 'task.view', group: 'Work' },
  { key: 'announcements', label: 'Announcements & Notifications', permission: 'announcement.send', group: 'Communication' },
  { key: 'sheets', label: 'Google Sheets Integration', permission: 'sheets.integration', group: 'System' },
  { key: 'reports', label: 'Reports & Export', permission: 'reports.export', group: 'System' },
  { key: 'settings', label: 'Company Settings', permission: 'settings.manage', group: 'System' },
  { key: 'audit', label: 'Audit Logs', permission: 'audit.view', group: 'System' },
];

export interface EmployeeModule {
  key: string;
  label: string;
}

export const EMPLOYEE_MODULES: EmployeeModule[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'roster', label: 'Roster' },
  { key: 'break', label: 'Break Management' },
  { key: 'tasks', label: 'My Tasks' },
  { key: 'leave', label: 'Leave Management' },
  { key: 'overtime', label: 'Overtime' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'profile', label: 'My Profile' },
];

/** Bottom navigation on mobile — the six highest-frequency destinations. */
export const EMPLOYEE_BOTTOM_NAV = ['dashboard', 'attendance', 'roster', 'tasks', 'leave', 'notifications'];

/* ------------------------------------------------------------------ *
 * Google Sheets wiring (§15.7 / §16)
 * ------------------------------------------------------------------ */

export const SHEETS = {
  TASK_SPREADSHEET_ID: '1BYeXS8TdZ--0XiSNpagb7h6tE9U6rzZnCRP5Uf5ht-U',
  MAIN_SPREADSHEET_ID: '14aH8tlWWGh98tgztao1FHrLZn9DzYNScJXVMNhLfe98',
  TASK_TAB: 'Management System',
  TASK_DASHBOARD_TAB: 'Dashboard',
  TASK_SUPPORT_TAB: 'Support',
  ROSTER_TAB: 'Roster',
  LEAVE_TAB: 'LeaveApplications',
  SIGNUP_TAB: 'Employee Signups',
  HR_USERS_TAB: 'HR_Users',
} as const;

/**
 * Column layout of the Employee Signups sheet.
 * `SL` is a zero-prefixed serial (001, 002, …) and `Mobile` is always stored
 * in the local Bangladesh format, so both numbers begin with 0.
 */
export const SIGNUP_SHEET_COLUMNS = [
  'SL',
  'Application ID',
  'Full Name',
  'Mobile',
  'Employee ID',
  'Designation',
  'Email',
  'Department',
  'Sub-department',
  'Reporting Manager',
  'Joining Date',
  'Submitted At',
  'Status',
  'Review Note',
  'Decided At',
  'Decided By',
] as const;


/** Column layout of the Task Management sheet, mirrored by the D1 task table. */
export const TASK_SHEET_COLUMNS = [
  'Task ID',
  'Task Name',
  'Description',
  'Department',
  'Employee ID',
  'Employee Name',
  'Priority',
  'Assigned Date',
  'Start Date',
  'Due Date',
  'Task Status',
  'Reference Link',
  'Pending Days',
  'Overdue Status',
  'Notes',
  'Complete Date',
] as const;

/** Column layout of the LeaveApplications sheet. */
export const LEAVE_SHEET_COLUMNS = [
  'Timestamp',
  'Application ID',
  'Employee ID',
  'Name',
  'Designation',
  'Email',
  'Department',
  'Reporting Manager',
  'Leave Type',
  'From Date',
  'To Date',
  'Total Days',
  'Reason',
  'Attachment Link',
  'Submission Date',
  'Approval Status',
  'Review Reason',
  'Email Status',
  'Approved Date',
] as const;

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */

export const CURRENCY = 'BDT';

/**
 * Overtime is paid at a flat rate per hour (§9).
 * HR sees the money next to the hours, the employee only sees the hours.
 */
export const OVERTIME_RATE_PER_HOUR = 70;

export const LEAVE_ENTITLEMENT = {
  'Casual Leave': 12,
  'Sick Leave': 10,
  'Annual Leave': 14,
  'Earned Leave': 10,
  'Weekly Off': 0,
  'Maternity Leave': 120,
  'Unpaid Leave': 0,
  'Work From Home': 0,
} as const;

export const PENDING_BUCKETS = [
  { label: '0 to 5 days', min: 0, max: 5 },
  { label: '5 to 10 days', min: 5, max: 10 },
  { label: '10 to 15 days', min: 10, max: 15 },
  { label: '15 to 20 days', min: 15, max: 20 },
  { label: 'Above 20 days', min: 20, max: 9999 },
] as const;

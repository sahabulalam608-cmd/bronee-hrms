/**
 * BRONEE HRMS — shared domain constants.
 * Single source of truth for values referenced by both the API and the web client.
 */

/** Canonical IANA time zone for all display + business calculations. */
export const APP_TIME_ZONE = 'Asia/Dhaka';

/** Asia/Dhaka has a fixed +06:00 offset (no DST). Used for fast date bucketing. */
export const APP_UTC_OFFSET_MINUTES = 360;

export const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_ONLY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Verification window (in minutes) measured from the scheduled shift start. */
export const VERIFICATION_WINDOW_MINUTES = 1;

/** How early (in minutes) an employee may punch in before the scheduled shift start. */
export const PRE_CLOCK_IN_MINUTES = 15;

/** Radius (meters) of the office GPS geofence. */
export const OFFICE_GEOFENCE_METERS = 50;

/** Maximum acceptable GPS accuracy radius (meters) for a verification to count. */
export const MAX_GPS_ACCURACY_METERS = 100;

/** OTP lifetime (minutes). */
export const OTP_TTL_MINUTES = 10;

/** OTP max verification attempts before it is burned. */
export const OTP_MAX_ATTEMPTS = 5;

/** Session lifetime (days). */
export const SESSION_TTL_DAYS = 7;

/** Password reset token lifetime (minutes). */
export const PASSWORD_RESET_TTL_MINUTES = 30;

/** Maximum size (bytes) for a single uploaded file. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Allowed upload MIME types. */
export const ALLOWED_UPLOAD_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/** Attendance bonus ladder (BRONEE Limited policy). */
export const ATTENDANCE_BONUS_LADDER: ReadonlyArray<{
  maxLateDays: number;
  amount: number;
  label: string;
}> = [
  { maxLateDays: 0, amount: 2000, label: '0 late days' },
  { maxLateDays: 1, amount: 1500, label: '1 late day' },
  { maxLateDays: 2, amount: 1000, label: '2 late days' },
  { maxLateDays: 3, amount: 0, label: '3+ late days' },
];

/** Default shift definitions seeded into the database. */
export const DEFAULT_SHIFTS = [
  {
    code: 'MORNING',
    name: 'Morning Shift',
    shortName: 'Morning',
    startTime: '09:20',
    endTime: '18:00',
    endsNextDay: false,
    locationPolicy: 'office' as const,
    requiresOfficeVerification: true,
    displayOrder: 1,
  },
  {
    code: 'E1',
    name: 'Evening Shift E1',
    shortName: 'Evening E1',
    startTime: '13:00',
    endTime: '21:00',
    endsNextDay: false,
    locationPolicy: 'office' as const,
    requiresOfficeVerification: true,
    displayOrder: 2,
  },
  {
    code: 'E2',
    name: 'Evening Shift E2',
    shortName: 'Evening E2',
    startTime: '14:00',
    endTime: '22:00',
    endsNextDay: false,
    locationPolicy: 'office' as const,
    requiresOfficeVerification: true,
    displayOrder: 3,
  },
  {
    code: 'LE',
    name: 'Late Evening Shift',
    shortName: 'Late Evening',
    startTime: '18:00',
    endTime: '01:00',
    endsNextDay: true,
    locationPolicy: 'wfh' as const,
    requiresOfficeVerification: false,
    displayOrder: 4,
  },
  {
    code: 'SS',
    name: 'Split Shift',
    shortName: 'Split Shift',
    startTime: '09:20',
    endTime: '01:00',
    endsNextDay: true,
    locationPolicy: 'split' as const,
    requiresOfficeVerification: true,
    displayOrder: 5,
  },
];

/** Split shift segment boundaries (minutes from midnight, Dhaka local). */
export const SPLIT_SEGMENTS = [
  { key: 'office', label: 'Office Segment', startTime: '09:20', endTime: '18:00', requiresOfficeVerification: true },
  { key: 'home', label: 'Home / WFH Segment', startTime: '18:00', endTime: '01:00', requiresOfficeVerification: false },
] as const;

/** Roster shift dropdown options (HR + Sheets dropdown). */
export const ROSTER_SHIFT_OPTIONS = [
  { value: 'MORNING', label: 'Morning' },
  { value: 'E1', label: 'Evening E1' },
  { value: 'E2', label: 'Evening E2' },
  { value: 'LE', label: 'Late Evening (LE)' },
  { value: 'SS', label: 'Split Shift (SS)' },
  { value: 'OFF', label: 'Off' },
] as const;

/** Default department tree. `parent: null` = top-level department. */
export const DEFAULT_DEPARTMENTS: ReadonlyArray<{
  name: string;
  type: 'regular' | 'parent' | 'protected';
  parent: string | null;
  displayOrder: number;
}> = [
  { name: 'Supply Chain', type: 'regular', parent: null, displayOrder: 1 },
  { name: 'Digital Marketing', type: 'regular', parent: null, displayOrder: 2 },
  { name: 'Accounts', type: 'regular', parent: null, displayOrder: 3 },
  { name: 'Sales Team', type: 'parent', parent: null, displayOrder: 4 },
  { name: 'Direct Sales', type: 'regular', parent: 'Sales Team', displayOrder: 1 },
  { name: 'Social Media', type: 'regular', parent: 'Sales Team', displayOrder: 2 },
  { name: 'Retention Team', type: 'regular', parent: 'Sales Team', displayOrder: 3 },
  { name: 'Courier Team', type: 'regular', parent: 'Sales Team', displayOrder: 4 },
  { name: 'HR', type: 'protected', parent: null, displayOrder: 5 },
  { name: 'CEO', type: 'protected', parent: null, displayOrder: 6 },
];

/** Departments whose relative display order is locked (HR above CEO, CEO always last). */
export const PROTECTED_DEPARTMENT_NAMES = ['HR', 'CEO'] as const;

/** Seeded Google Sheets targets. */
export const SHEET_LINKS = {
  taskManagement:
    'https://docs.google.com/spreadsheets/d/1BYeXS8TdZ--0XiSNpagb7h6tE9U6rzZnCRP5Uf5ht-U/edit?gid=804686369#gid=804686369',
  mainHrms: 'https://docs.google.com/spreadsheets/d/14aH8tlWWGh98tgztao1FHrLZn9DzYNScJXVMNhLfe98/edit?usp=sharing',
} as const;

export const SHEET_TABS = {
  taskManagement: ['Support', 'Management System', 'Dashboard', 'Roster'],
  mainHrms: [
    'Employee',
    'Attendance',
    'Leave',
    'Overtime',
    'Payroll',
    'HR Operations',
    'Roster',
  ],
} as const;

/** Default leave types + entitlements per year. */
export const DEFAULT_LEAVE_TYPES = [
  { code: 'casual', name: 'Casual Leave', entitlement: 12, paid: true },
  { code: 'sick', name: 'Sick Leave', entitlement: 12, paid: true },
  { code: 'earned', name: 'Earned Leave', entitlement: 14, paid: true },
  { code: 'unpaid', name: 'Unpaid Leave', entitlement: 0, paid: false },
] as const;

export const LEAVE_TYPE_CODES = ['casual', 'sick', 'earned', 'unpaid'] as const;

/** Notification catalogue — used by both the portal and email dispatch. */
export const NOTIFICATION_TYPES = {
  ACCOUNT_APPROVED: 'account_approved',
  ACCOUNT_DECLINED: 'account_declined',
  LEAVE_APPROVED: 'leave_approved',
  LEAVE_DECLINED: 'leave_declined',
  OVERTIME_APPROVED: 'overtime_approved',
  OVERTIME_DECLINED: 'overtime_declined',
  TASK_ASSIGNED: 'task_assigned',
  TASK_DEADLINE_REMINDER: 'task_deadline_reminder',
  TASK_FEEDBACK: 'task_feedback',
  SALARY_PUBLISHED: 'salary_published',
  ANNOUNCEMENT: 'announcement',
  HOLIDAY_NOTICE: 'holiday_notice',
  ATTENDANCE_NOTICE: 'attendance_notice',
  ROSTER_UPDATE: 'roster_update',
  SHIFT_CHANGE: 'shift_change',
  OFF_DAY_CHANGE: 'off_day_change',
  INDIVIDUAL_MESSAGE: 'individual_message',
  PROFILE_REQUEST: 'profile_request',
} as const;

/** Notification types that always dispatch an email. */
export const EMAIL_NOTIFICATION_TYPES: string[] = [
  NOTIFICATION_TYPES.ACCOUNT_APPROVED,
  NOTIFICATION_TYPES.LEAVE_APPROVED,
  NOTIFICATION_TYPES.OVERTIME_APPROVED,
  NOTIFICATION_TYPES.TASK_DEADLINE_REMINDER,
  NOTIFICATION_TYPES.ANNOUNCEMENT,
  NOTIFICATION_TYPES.ATTENDANCE_NOTICE,
];

/** Notification types that increment the roster unread counter. */
export const ROSTER_NOTIFICATION_TYPES: string[] = [
  NOTIFICATION_TYPES.ROSTER_UPDATE,
  NOTIFICATION_TYPES.SHIFT_CHANGE,
  NOTIFICATION_TYPES.OFF_DAY_CHANGE,
];

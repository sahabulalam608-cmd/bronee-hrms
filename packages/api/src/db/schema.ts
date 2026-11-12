/**
 * BRONEE HRMS — D1 schema.
 * D1 is the single source of truth; Google Sheets is a controlled integration
 * layer only (no credentials, no tokens, no binary documents live there).
 */
import { sql } from 'drizzle-orm';
import {
  AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const now = sql`CURRENT_TIMESTAMP`;
const id = () => text('id').primaryKey();

/* ------------------------------------------------------------------ org */

export const departments = sqliteTable(
  'departments',
  {
    id: id(),
    name: text('name').notNull(),
    type: text('type', { enum: ['regular', 'parent', 'protected'] }).notNull().default('regular'),
    parentId: text('parent_id').references((): AnySQLiteColumn => departments.id, { onDelete: 'restrict' }),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    nameIdx: index('departments_name_idx').on(t.name),
    parentIdx: index('departments_parent_idx').on(t.parentId),
  }),
);

export const designations = sqliteTable(
  'designations',
  {
    id: id(),
    name: text('name').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    nameUnique: uniqueIndex('designations_name_unique').on(t.name),
  }),
);

export const shifts = sqliteTable(
  'shifts',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    endsNextDay: integer('ends_next_day', { mode: 'boolean' }).notNull().default(false),
    locationPolicy: text('location_policy', { enum: ['office', 'wfh', 'split'] }).notNull().default('office'),
    requiresOfficeVerification: integer('requires_office_verification', { mode: 'boolean' }).notNull().default(true),
    segments: text('segments', { mode: 'json' }).$type<
      Array<{ key: 'office' | 'home'; label: string; startTime: string; endTime: string; requiresOfficeVerification: boolean }>
    >(),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    codeUnique: uniqueIndex('shifts_code_unique').on(t.code),
  }),
);

/* ---------------------------------------------------------------- users */

export const users = sqliteTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    passwordSalt: text('password_salt').notNull(),
    role: text('role', { enum: ['employee', 'manager', 'hr', 'super_admin'] }).notNull().default('employee'),
    status: text('status', { enum: ['pending', 'approved', 'declined', 'suspended', 'active'] })
      .notNull()
      .default('pending'),
    fullName: text('full_name').notNull(),
    mobile: text('mobile').notNull(),
    employeeCode: text('employee_code').notNull(),
    designationId: text('designation_id').references(() => designations.id, { onDelete: 'set null' }),
    designationLabel: text('designation_label').notNull(),
    departmentId: text('department_id').references(() => departments.id, { onDelete: 'restrict' }),
    subDepartmentId: text('sub_department_id').references(() => departments.id, { onDelete: 'restrict' }),
    reportingManagerId: text('reporting_manager_id'),
    joiningDate: text('joining_date').notNull(),
    avatarKey: text('avatar_key'),
    mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
    lastLoginAt: text('last_login_at'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
    codeUnique: uniqueIndex('users_employee_code_unique').on(t.employeeCode),
    deptIdx: index('users_department_idx').on(t.departmentId),
    statusIdx: index('users_status_idx').on(t.status),
  }),
);

export const signupRequests = sqliteTable(
  'signup_requests',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'approved', 'declined'] }).notNull().default('pending'),
    proposedSalary: integer('proposed_salary'),
    reviewedBy: text('reviewed_by'),
    reviewNote: text('review_note'),
    reviewedAt: text('reviewed_at'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    statusIdx: index('signup_requests_status_idx').on(t.status),
    userIdx: index('signup_requests_user_idx').on(t.userId),
  }),
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
    expiresIdx: index('sessions_expires_idx').on(t.expiresAt),
  }),
);

export const otpCodes = sqliteTable(
  'otp_codes',
  {
    id: id(),
    email: text('email').notNull(),
    purpose: text('purpose', { enum: ['signup', 'password_reset', 'login_2fa'] }).notNull().default('signup'),
    codeHash: text('code_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: text('consumed_at'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => ({
    emailIdx: index('otp_codes_email_idx').on(t.email),
    purposeIdx: index('otp_codes_purpose_idx').on(t.purpose),
  }),
);

/* ------------------------------------------------------------- roster */

export const rosters = sqliteTable(
  'rosters',
  {
    id: id(),
    name: text('name').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    version: integer('version').notNull().default(1),
    status: text('status', { enum: ['draft', 'scheduled', 'published', 'archived'] }).notNull().default('draft'),
    scheduledFor: text('scheduled_for'),
    publishedAt: text('published_at'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    rangeIdx: index('rosters_range_idx').on(t.startDate, t.endDate),
    statusIdx: index('rosters_status_idx').on(t.status),
  }),
);

export const rosterEntries = sqliteTable(
  'roster_entries',
  {
    id: id(),
    rosterId: text('roster_id').notNull().references(() => rosters.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    shiftId: text('shift_id').references(() => shifts.id, { onDelete: 'set null' }),
    isOff: integer('is_off', { mode: 'boolean' }).notNull().default(false),
    updatedBy: text('updated_by'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    uniqueEntry: uniqueIndex('roster_entries_unique').on(t.rosterId, t.employeeId, t.date),
    employeeDateIdx: index('roster_entries_employee_date_idx').on(t.employeeId, t.date),
  }),
);

export const rosterChanges = sqliteTable(
  'roster_changes',
  {
    id: id(),
    rosterId: text('roster_id').notNull(),
    employeeId: text('employee_id').notNull(),
    previousShiftId: text('previous_shift_id'),
    newShiftId: text('new_shift_id'),
    previousIsOff: integer('previous_is_off', { mode: 'boolean' }),
    newIsOff: integer('new_is_off', { mode: 'boolean' }),
    changeType: text('change_type', { enum: ['publish', 'manual', 'leave_request'] }).notNull().default('publish'),
    notified: integer('notified', { mode: 'boolean' }).notNull().default(false),
    changedBy: text('changed_by'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => ({
    rosterIdx: index('roster_changes_roster_idx').on(t.rosterId),
    employeeIdx: index('roster_changes_employee_idx').on(t.employeeId),
  }),
);

/* ---------------------------------------------------------- attendance */

export const attendanceSessions = sqliteTable(
  'attendance_sessions',
  {
    id: id(),
    employeeId: text('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    shiftId: text('shift_id').references(() => shifts.id, { onDelete: 'set null' }),
    segment: text('segment', { enum: ['office', 'home'] }),
    scheduledStart: text('scheduled_start'),
    scheduledEnd: text('scheduled_end'),
    punchInAt: text('punch_in_at'),
    actualWorkingStart: text('actual_working_start'),
    verificationCompletedAt: text('verification_completed_at'),
    verificationMethod: text('verification_method', { enum: ['office_ip', 'gps', 'manual', 'none'] })
      .notNull()
      .default('none'),
    verificationResult: text('verification_result', { enum: ['verified', 'failed', 'pending', 'not_required'] })
      .notNull()
      .default('pending'),
    latitude: integer('latitude'),
    longitude: integer('longitude'),
    accuracyMeters: integer('accuracy_meters'),
    officeIpMatched: integer('office_ip_matched', { mode: 'boolean' }),
    officeIp: text('office_ip'),
    clockOutAt: text('clock_out_at'),
    workingSeconds: integer('working_seconds').notNull().default(0),
    breakSeconds: integer('break_seconds').notNull().default(0),
    breakCount: integer('break_count').notNull().default(0),
    status: text('status', { enum: ['open', 'closed', 'auto_closed'] }).notNull().default('open'),
    lateStatus: text('late_status', { enum: ['on_time', 'pending_review', 'late', 'excused', 'rejected'] })
      .notNull()
      .default('pending_review'),
    attendanceStatus: text('attendance_status', { enum: ['present', 'absent', 'leave', 'holiday', 'off', 'partial'] })
      .notNull()
      .default('present'),
    autoAction: text('auto_action'),
    reviewStatus: text('review_status', { enum: ['not_required', 'pending', 'reviewed'] }).notNull().default('not_required'),
    reviewNote: text('review_note'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: text('reviewed_at'),
    exceptionHistory: text('exception_history', { mode: 'json' }).$type<Array<Record<string, unknown>>>(),
    isOvertime: integer('is_overtime', { mode: 'boolean' }).notNull().default(false),
    overtimeRequestId: text('overtime_request_id'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    employeeDateIdx: index('attendance_sessions_employee_date_idx').on(t.employeeId, t.date),
    statusIdx: index('attendance_sessions_status_idx').on(t.status),
    reviewIdx: index('attendance_sessions_review_idx').on(t.reviewStatus),
  }),
);

export const breaks = sqliteTable(
  'breaks',
  {
    id: id(),
    employeeId: text('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => attendanceSessions.id, { onDelete: 'set null' }),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    closedBy: text('closed_by', { enum: ['employee', 'system'] }).notNull().default('employee'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => ({
    employeeIdx: index('breaks_employee_idx').on(t.employeeId),
    sessionIdx: index('breaks_session_idx').on(t.sessionId),
  }),
);

/* --------------------------------------------------------------- leave */

export const leaveRequests = sqliteTable(
  'leave_requests',
  {
    id: id(),
    employeeId: text('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    leaveType: text('leave_type', { enum: ['casual', 'sick', 'earned', 'unpaid'] }).notNull(),
    fromDate: text('from_date').notNull(),
    toDate: text('to_date').notNull(),
    totalDays: integer('total_days').notNull().default(1),
    reason: text('reason').notNull(),
    attachmentKey: text('attachment_key'),
    attachmentName: text('attachment_name'),
    status: text('status', { enum: ['pending', 'approved', 'declined', 'cancelled'] }).notNull().default('pending'),
    isRosterChange: integer('is_roster_change', { mode: 'boolean' }).notNull().default(false),
    rosterChangeId: text('roster_change_id'),
    rosterUpdateMode: text('roster_update_mode', { enum: ['auto', 'manual'] }),
    rosterUpdateStatus: text('roster_update_status', { enum: ['none', 'pending', 'completed', 'manual_required'] })
      .notNull()
      .default('none'),
    reviewedBy: text('reviewed_by'),
    reviewNote: text('review_note'),
    reviewedAt: text('reviewed_at'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    employeeIdx: index('leave_requests_employee_idx').on(t.employeeId),
    statusIdx: index('leave_requests_status_idx').on(t.status),
  }),
);

export const leaveBalances = sqliteTable(
  'leave_balances',
  {
    id: id(),
    employeeId: text('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    leaveType: text('leave_type', { enum: ['casual', 'sick', 'earned', 'unpaid'] }).notNull(),
    entitled: integer('entitled').notNull().default(0),
    used: integer('used').notNull().default(0),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    uniqueBalance: uniqueIndex('leave_balances_unique').on(t.employeeId, t.year, t.leaveType),
  }),
);

/* ------------------------------------------------------------ overtime */

export const overtimeRequests = sqliteTable(
  'overtime_requests',
  {
    id: id(),
    employeeId: text('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    requestedStart: text('requested_start'),
    requestedEnd: text('requested_end'),
    requestedHours: integer('requested_hours').notNull().default(0),
    approvedStart: text('approved_start'),
    approvedEnd: text('approved_end'),
    approvedHours: integer('approved_hours'),
    actualStart: text('actual_start'),
    actualEnd: text('actual_end'),
    actualHours: integer('actual_hours'),
    status: text('status', { enum: ['pending', 'approved', 'declined', 'completed', 'cancelled'] })
      .notNull()
      .default('pending'),
    reviewedBy: text('reviewed_by'),
    reviewNote: text('review_note'),
    reviewedAt: text('reviewed_at'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    employeeIdx: index('overtime_requests_employee_idx').on(t.employeeId),
    statusIdx: index('overtime_requests_status_idx').on(t.status),
  }),
);

/* --------------------------------------------------------------- tasks */

export const tasks = sqliteTable(
  'tasks',
  {
    id: id(),
    taskCode: text('task_code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    departmentId: text('department_id').references(() => departments.id, { onDelete: 'set null' }),
    assignedEmployeeId: text('assigned_employee_id').references(() => users.id, { onDelete: 'set null' }),
    reviewerId: text('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] }).notNull().default('medium'),
    assignedDate: text('assigned_date'),
    startDate: text('start_date'),
    dueDate: text('due_date'),
    completedAt: text('completed_at'),
    status: text('status', { enum: ['yet_to_start', 'in_progress', 'pending', 'complete'] })
      .notNull()
      .default('yet_to_start'),
    referenceLink: text('reference_link'),
    notes: text('notes'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    codeUnique: uniqueIndex('tasks_code_unique').on(t.taskCode),
    employeeIdx: index('tasks_employee_idx').on(t.assignedEmployeeId),
    statusIdx: index('tasks_status_idx').on(t.status),
    deptIdx: index('tasks_department_idx').on(t.departmentId),
  }),
);

export const taskSubmissions = sqliteTable(
  'task_submissions',
  {
    id: id(),
    taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    submissionLink: text('submission_link'),
    notes: text('notes'),
    attachmentKey: text('attachment_key'),
    attachmentName: text('attachment_name'),
    status: text('status', { enum: ['submitted', 'approved', 'rejected'] }).notNull().default('submitted'),
    feedback: text('feedback'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => ({
    taskIdx: index('task_submissions_task_idx').on(t.taskId),
  }),
);

/* ------------------------------------------------------------- payroll */

export const payrollRecords = sqliteTable(
  'payroll_records',
  {
    id: id(),
    employeeId: text('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    basicSalary: integer('basic_salary').notNull().default(0),
    allowances: integer('allowances').notNull().default(0),
    overtimeAmount: integer('overtime_amount').notNull().default(0),
    bonusAmount: integer('bonus_amount').notNull().default(0),
    deductions: integer('deductions').notNull().default(0),
    netPayable: integer('net_payable').notNull().default(0),
    workingDays: integer('working_days').notNull().default(0),
    presentDays: integer('present_days').notNull().default(0),
    lateDays: integer('late_days').notNull().default(0),
    status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
    publishedAt: text('published_at'),
    notes: text('notes'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    uniquePeriod: uniqueIndex('payroll_records_unique').on(t.employeeId, t.year, t.month),
    periodIdx: index('payroll_records_period_idx').on(t.year, t.month),
  }),
);

export const attendanceBonusSnapshots = sqliteTable(
  'attendance_bonus_snapshots',
  {
    id: id(),
    employeeId: text('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    lateDays: integer('late_days').notNull().default(0),
    bonusAmount: integer('bonus_amount').notNull().default(0),
    eligible: integer('eligible', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    uniqueBonus: uniqueIndex('attendance_bonus_snapshots_unique').on(t.employeeId, t.year, t.month),
  }),
);

/* -------------------------------------------------------- notifications */

export const notifications = sqliteTable(
  'notifications',
  {
    id: id(),
    employeeId: text('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    emailSent: integer('email_sent', { mode: 'boolean' }).notNull().default(false),
    emailStatus: text('email_status', { enum: ['not_required', 'pending', 'sent', 'failed'] })
      .notNull()
      .default('not_required'),
    emailError: text('email_error'),
    readAt: text('read_at'),
    publishedAt: text('published_at').notNull().default(now),
    createdBy: text('created_by'),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (t) => ({
    employeeIdx: index('notifications_employee_idx').on(t.employeeId),
    readIdx: index('notifications_read_idx').on(t.employeeId, t.readAt),
    typeIdx: index('notifications_type_idx').on(t.type),
  }),
);

export const announcements = sqliteTable(
  'announcements',
  {
    id: id(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    type: text('type').notNull(),
    targetType: text('target_type', { enum: ['all', 'department', 'sub_department', 'employees'] }).notNull().default('all'),
    targetIds: text('target_ids', { mode: 'json' }).$type<string[]>().notNull(),
    targetLabel: text('target_label'),
    attachmentKey: text('attachment_key'),
    status: text('status', { enum: ['draft', 'scheduled', 'published'] }).notNull().default('draft'),
    scheduledFor: text('scheduled_for'),
    publishedAt: text('published_at'),
    emailNotification: integer('email_notification', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    statusIdx: index('announcements_status_idx').on(t.status),
  }),
);

export const announcementRecipients = sqliteTable(
  'announcement_recipients',
  {
    id: id(),
    announcementId: text('announcement_id').notNull().references(() => announcements.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    readAt: text('read_at'),
    emailStatus: text('email_status', { enum: ['not_required', 'pending', 'sent', 'failed'] })
      .notNull()
      .default('not_required'),
  },
  (t) => ({
    uniqueRecipient: uniqueIndex('announcement_recipients_unique').on(t.announcementId, t.employeeId),
  }),
);

/* --------------------------------------------------------------- files */

export const files = sqliteTable(
  'files',
  {
    id: id(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => ({
    keyUnique: uniqueIndex('files_key_unique').on(t.key),
    ownerIdx: index('files_owner_idx').on(t.ownerId),
  }),
);

/* ------------------------------------------------------- admin & audit */

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: id(),
    actorId: text('actor_id'),
    actorName: text('actor_name'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    before: text('before', { mode: 'json' }).$type<unknown>(),
    after: text('after', { mode: 'json' }).$type<unknown>(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => ({
    entityIdx: index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    actorIdx: index('audit_logs_actor_idx').on(t.actorId),
  }),
);

export const companySettings = sqliteTable(
  'company_settings',
  {
    key: text('key').primaryKey(),
    value: text('value', { mode: 'json' }).notNull(),
    updatedBy: text('updated_by'),
    updatedAt: text('updated_at').notNull().default(now),
  },
);

export const staffingRules = sqliteTable(
  'staffing_rules',
  {
    id: id(),
    departmentId: text('department_id').notNull().references(() => departments.id, { onDelete: 'cascade' }),
    shiftId: text('shift_id').references(() => shifts.id, { onDelete: 'set null' }),
    minStaff: integer('min_staff').notNull().default(0),
    dayOfWeek: integer('day_of_week'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
);

export const holidays = sqliteTable(
  'holidays',
  {
    id: id(),
    date: text('date').notNull(),
    name: text('name').notNull(),
    type: text('type', { enum: ['holiday', 'special_off', 'working_day'] }).notNull().default('holiday'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => ({
    dateUnique: uniqueIndex('holidays_date_unique').on(t.date),
  }),
);

export const profileUpdateRequests = sqliteTable(
  'profile_update_requests',
  {
    id: id(),
    employeeId: text('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fields: text('fields', { mode: 'json' }).notNull(),
    reason: text('reason').notNull(),
    status: text('status', { enum: ['pending', 'approved', 'declined'] }).notNull().default('pending'),
    reviewedBy: text('reviewed_by'),
    reviewNote: text('review_note'),
    reviewedAt: text('reviewed_at'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => ({
    employeeIdx: index('profile_update_requests_employee_idx').on(t.employeeId),
  }),
);

export const syncLogs = sqliteTable(
  'sync_logs',
  {
    id: id(),
    direction: text('direction', { enum: ['export', 'import', 'manual'] }).notNull().default('manual'),
    sheetId: text('sheet_id'),
    tab: text('tab'),
    status: text('status', { enum: ['success', 'failed', 'running'] }).notNull().default('running'),
    rowsProcessed: integer('rows_processed').notNull().default(0),
    error: text('error'),
    startedAt: text('started_at').notNull().default(now),
    finishedAt: text('finished_at'),
    triggeredBy: text('triggered_by'),
  },
);

export const emailLog = sqliteTable(
  'email_log',
  {
    id: id(),
    toEmail: text('to_email').notNull(),
    subject: text('subject').notNull(),
    provider: text('provider').notNull(),
    status: text('status', { enum: ['sent', 'failed', 'skipped'] }).notNull(),
    error: text('error'),
    createdAt: text('created_at').notNull().default(now),
  },
);

/** Composite key helper used by upserts. */
export const usersPk = primaryKey({ columns: [users.id] });

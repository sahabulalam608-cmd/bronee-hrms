/**
 * BRONEE HRMS — D1 schema (SQLite via Drizzle ORM).
 *
 * D1 is the single source of truth. Google Sheets is an integration layer
 * only; no schema table mirrors a spreadsheet as a primary store.
 */

import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/* ------------------------------------------------------------------ *
 * People & structure
 * ------------------------------------------------------------------ */

export const departments = sqliteTable(
  'departments',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind').notNull(), // DEPARTMENT | SUB_DEPARTMENT | PROTECTED
    parentId: text('parent_id'),
    displayOrder: integer('display_order').notNull().default(0),
    active: integer('active').notNull().default(1),
    protected: integer('protected').notNull().default(0),
  },
  (table) => ({
    nameIdx: uniqueIndex('departments_name_idx').on(table.name),
    orderIdx: index('departments_order_idx').on(table.displayOrder),
  }),
);

export const designations = sqliteTable(
  'designations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    departmentId: text('department_id').references(() => departments.id),
    active: integer('active').notNull().default(1),
  },
  (table) => ({
    nameIdx: uniqueIndex('designations_name_idx').on(table.name),
  }),
);

export const employees = sqliteTable(
  'employees',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id').notNull(),
    fullName: text('full_name').notNull(),
    mobile: text('mobile').notNull(),
    email: text('email').notNull(),
    designation: text('designation').notNull(),
    departmentId: text('department_id').notNull(),
    subDepartmentId: text('sub_department_id'),
    reportingManager: text('reporting_manager'),
    joiningDate: text('joining_date').notNull(),
    shiftCode: text('shift_code').notNull(),
    status: text('status').notNull().default('Pending'),
    portal: text('portal').notNull().default('EMPLOYEE'),
    role: text('role').notNull().default('HR_VIEWER'),
    baseSalary: integer('base_salary'),
    allowances: integer('allowances'),
    profilePhotoKey: text('profile_photo_key'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    employeeIdIdx: uniqueIndex('employees_employee_id_idx').on(table.employeeId),
    emailIdx: uniqueIndex('employees_email_idx').on(table.email),
    deptIdx: index('employees_dept_idx').on(table.departmentId),
  }),
);

/** Credentials never live in Google Sheets — only a PBKDF2 hash lives here. */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    employeeId: text('employee_id').notNull(),
    role: text('role').notNull().default('HR_VIEWER'),
    status: text('status').notNull().default('Active'),
    lastLoginAt: text('last_login_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    employeeIdx: index('users_employee_idx').on(table.employeeId),
  }),
);

export const signupApplications = sqliteTable(
  'signup_applications',
  {
    id: text('id').primaryKey(),
    fullName: text('full_name').notNull(),
    mobile: text('mobile').notNull(),
    employeeId: text('employee_id').notNull(),
    designation: text('designation').notNull(),
    email: text('email').notNull(),
    departmentName: text('department_name').notNull(),
    subDepartmentName: text('sub_department_name'),
    reportingManager: text('reporting_manager'),
    joiningDate: text('joining_date').notNull(),
    passwordHash: text('password_hash'),
    submittedAt: text('submitted_at').notNull(),
    status: text('status').notNull().default('Pending'),
    reviewNote: text('review_note'),
    salary: integer('salary'),
    decidedAt: text('decided_at'),
    decidedBy: text('decided_by'),
  },
  (table) => ({
    statusIdx: index('signups_status_idx').on(table.status),
  }),
);

export const otpCodes = sqliteTable(
  'otp_codes',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    purpose: text('purpose').notNull(), // signup | reset
    expiresAt: text('expires_at').notNull(),
    consumed: integer('consumed').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    emailIdx: index('otp_email_idx').on(table.email),
  }),
);

export const sessions = sqliteTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    employeeId: text('employee_id').notNull(),
    role: text('role').notNull(),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => ({
    employeeIdx: index('sessions_employee_idx').on(table.employeeId),
  }),
);

/* ------------------------------------------------------------------ *
 * Roster
 * ------------------------------------------------------------------ */

export const rosters = sqliteTable(
  'rosters',
  {
    id: text('id').primaryKey(),
    version: integer('version').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    status: text('status').notNull().default('Draft'),
    publishAt: text('publish_at'),
    publishedAt: text('published_at'),
    publishedBy: text('published_by'),
    notificationSent: integer('notification_sent').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    rangeIdx: index('rosters_range_idx').on(table.startDate, table.endDate),
  }),
);

export const rosterEntries = sqliteTable(
  'roster_entries',
  {
    id: text('id').primaryKey(),
    rosterId: text('roster_id').notNull(),
    rosterVersion: integer('roster_version').notNull(),
    employeeId: text('employee_id').notNull(),
    date: text('date').notNull(),
    shiftCode: text('shift_code').notNull(),
    changed: integer('changed').notNull().default(0),
  },
  (table) => ({
    rosterIdx: index('roster_entries_roster_idx').on(table.rosterId),
    employeeDateIdx: index('roster_entries_emp_date_idx').on(table.employeeId, table.date),
  }),
);

export const rosterChangeRequests = sqliteTable(
  'roster_change_requests',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id').notNull(),
    type: text('type').notNull(),
    currentDate: text('current_date').notNull(),
    currentShift: text('current_shift').notNull(),
    requestedDate: text('requested_date').notNull(),
    requestedShift: text('requested_shift'),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('Pending'),
    updateMode: text('update_mode'),
    rosterUpdated: integer('roster_updated').notNull().default(0),
    note: text('note'),
    createdAt: text('created_at').notNull(),
    decidedAt: text('decided_at'),
    decidedBy: text('decided_by'),
  },
  (table) => ({
    employeeIdx: index('roster_requests_emp_idx').on(table.employeeId),
  }),
);

export const rosterChangeLog = sqliteTable(
  'roster_change_log',
  {
    id: text('id').primaryKey(),
    rosterId: text('roster_id').notNull(),
    rosterVersion: integer('roster_version').notNull(),
    employeeId: text('employee_id').notNull(),
    previousShift: text('previous_shift').notNull(),
    updatedShift: text('updated_shift').notNull(),
    changedBy: text('changed_by').notNull(),
    changedAt: text('changed_at').notNull(),
    publishStatus: text('publish_status').notNull(),
    notificationStatus: text('notification_status').notNull(),
  },
  (table) => ({
    rosterIdx: index('roster_log_roster_idx').on(table.rosterId),
  }),
);

/* ------------------------------------------------------------------ *
 * Attendance & breaks
 * ------------------------------------------------------------------ */

export const attendanceSessions = sqliteTable(
  'attendance_sessions',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id').notNull(),
    workDate: text('work_date').notNull(),
    shiftCode: text('shift_code').notNull(),
    scheduledStart: text('scheduled_start'),
    punchIn: text('punch_in'),
    actualWorkingStart: text('actual_working_start'),
    verificationCompletedAt: text('verification_completed_at'),
    verificationMethod: text('verification_method').notNull().default('NONE'),
    verificationResult: text('verification_result').notNull().default('PENDING'),
    gpsLat: real('gps_lat'),
    gpsLng: real('gps_lng'),
    gpsAccuracy: real('gps_accuracy'),
    officeIpMatch: integer('office_ip_match'),
    clockOut: text('clock_out'),
    overtimeStartedAt: text('overtime_started_at'),
    totalWorkingSeconds: integer('total_working_seconds').notNull().default(0),
    attendanceStatus: text('attendance_status').notNull().default('Pending Review'),
    lateStatus: text('late_status').notNull().default('Pending Review'),
    isManual: integer('is_manual').notNull().default(0),
    hrReviewStatus: text('hr_review_status').notNull().default('Not Reviewed'),
    hrReviewNote: text('hr_review_note'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: text('reviewed_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    employeeDateIdx: uniqueIndex('attendance_emp_date_idx').on(table.employeeId, table.workDate),
    statusIdx: index('attendance_status_idx').on(table.attendanceStatus),
  }),
);

export const breakSessions = sqliteTable(
  'break_sessions',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id').notNull(),
    workDate: text('work_date').notNull(),
    startAt: text('start_at').notNull(),
    endAt: text('end_at'),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    closedBy: text('closed_by').notNull().default('EMPLOYEE'),
  },
  (table) => ({
    employeeDateIdx: index('breaks_emp_date_idx').on(table.employeeId, table.workDate),
  }),
);

/* ------------------------------------------------------------------ *
 * Leave, overtime, tasks
 * ------------------------------------------------------------------ */

export const leaveApplications = sqliteTable(
  'leave_applications',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id').notNull(),
    employeeId: text('employee_id').notNull(),
    leaveType: text('leave_type').notNull(),
    fromDate: text('from_date').notNull(),
    toDate: text('to_date').notNull(),
    totalDays: integer('total_days').notNull(),
    reason: text('reason').notNull(),
    attachmentKey: text('attachment_key'),
    attachmentName: text('attachment_name'),
    submittedAt: text('submitted_at').notNull(),
    status: text('status').notNull().default('Pending'),
    reviewReason: text('review_reason'),
    emailStatus: text('email_status').notNull().default('Not Sent'),
    approvedAt: text('approved_at'),
    decidedBy: text('decided_by'),
  },
  (table) => ({
    applicationIdIdx: uniqueIndex('leave_application_id_idx').on(table.applicationId),
    employeeIdx: index('leave_emp_idx').on(table.employeeId),
  }),
);

export const overtimeRequests = sqliteTable(
  'overtime_requests',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id').notNull(),
    workDate: text('work_date').notNull(),
    requestedStart: text('requested_start'),
    requestedEnd: text('requested_end'),
    requestedMinutes: integer('requested_minutes').notNull().default(0),
    approvedStart: text('approved_start'),
    approvedEnd: text('approved_end'),
    approvedMinutes: integer('approved_minutes').notNull().default(0),
    actualMinutes: integer('actual_minutes'),
    status: text('status').notNull().default('Pending'),
    reason: text('reason').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull(),
    decidedAt: text('decided_at'),
    decidedBy: text('decided_by'),
  },
  (table) => ({
    employeeIdx: index('overtime_emp_idx').on(table.employeeId),
  }),
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    departmentName: text('department_name').notNull(),
    employeeId: text('employee_id').notNull(),
    priority: text('priority').notNull().default('Medium'),
    assignedDate: text('assigned_date').notNull(),
    startDate: text('start_date').notNull(),
    dueDate: text('due_date').notNull(),
    status: text('status').notNull().default('Yet to Start'),
    referenceLink: text('reference_link'),
    attachmentKey: text('attachment_key'),
    notes: text('notes'),
    completeDate: text('complete_date'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    taskIdIdx: uniqueIndex('tasks_task_id_idx').on(table.taskId),
    employeeIdx: index('tasks_emp_idx').on(table.employeeId),
    statusIdx: index('tasks_status_idx').on(table.status),
  }),
);

export const taskSubmissions = sqliteTable(
  'task_submissions',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull(),
    submittedAt: text('submitted_at').notNull(),
    submissionLink: text('submission_link'),
    fileKey: text('file_key'),
    fileName: text('file_name'),
    note: text('note'),
    reviewerFeedback: text('reviewer_feedback'),
  },
  (table) => ({
    taskIdx: index('submissions_task_idx').on(table.taskId),
  }),
);

/* ------------------------------------------------------------------ *
 * Payroll, notifications, files
 * ------------------------------------------------------------------ */

export const salaryRecords = sqliteTable(
  'salary_records',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id').notNull(),
    month: text('month').notNull(),
    basicSalary: integer('basic_salary').notNull().default(0),
    allowances: integer('allowances').notNull().default(0),
    overtimePayment: integer('overtime_payment').notNull().default(0),
    bonusAmount: integer('bonus_amount').notNull().default(0),
    deductions: integer('deductions').notNull().default(0),
    netPayable: integer('net_payable').notNull().default(0),
    lateDays: integer('late_days').notNull().default(0),
    approvedOvertimeMinutes: integer('approved_overtime_minutes').notNull().default(0),
    published: integer('published').notNull().default(0),
    publishedAt: text('published_at'),
  },
  (table) => ({
    employeeMonthIdx: uniqueIndex('salary_emp_month_idx').on(table.employeeId, table.month),
  }),
);

export const announcements = sqliteTable(
  'announcements',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    type: text('type').notNull(),
    audience: text('audience').notNull(),
    audienceLabel: text('audience_label').notNull(),
    attachmentKey: text('attachment_key'),
    status: text('status').notNull().default('Draft'),
    publishAt: text('publish_at'),
    publishedAt: text('published_at'),
    emailNotification: integer('email_notification').notNull().default(0),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
  },
  (table) => ({
    statusIdx: index('announcements_status_idx').on(table.status),
  }),
);

export const announcementRecipients = sqliteTable(
  'announcement_recipients',
  {
    id: text('id').primaryKey(),
    announcementId: text('announcement_id').notNull(),
    employeeId: text('employee_id').notNull(),
    delivered: integer('delivered').notNull().default(0),
    emailStatus: text('email_status').notNull().default('Not Required'),
    readAt: text('read_at'),
  },
  (table) => ({
    announcementIdx: index('recipients_ann_idx').on(table.announcementId),
    employeeIdx: index('recipients_emp_idx').on(table.employeeId),
  }),
);

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: text('type').notNull(),
    category: text('category').notNull().default('general'),
    createdAt: text('created_at').notNull(),
    read: integer('read').notNull().default(0),
    emailStatus: text('email_status').notNull().default('Not Required'),
  },
  (table) => ({
    employeeIdx: index('notifications_emp_idx').on(table.employeeId),
    readIdx: index('notifications_read_idx').on(table.read),
  }),
);

export const files = sqliteTable(
  'files',
  {
    id: text('id').primaryKey(),
    storageKey: text('storage_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    ownerId: text('owner_id').notNull(),
    purpose: text('purpose').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    storageKeyIdx: uniqueIndex('files_storage_key_idx').on(table.storageKey),
    ownerIdx: index('files_owner_idx').on(table.ownerId),
  }),
);

/* ------------------------------------------------------------------ *
 * System
 * ------------------------------------------------------------------ */

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actor: text('actor').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    before: text('before'),
    after: text('after'),
    note: text('note'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    createdIdx: index('audit_created_idx').on(table.createdAt),
    actorIdx: index('audit_actor_idx').on(table.actor),
  }),
);

export const companySettings = sqliteTable('company_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const staffingRules = sqliteTable(
  'staffing_rules',
  {
    id: text('id').primaryKey(),
    departmentId: text('department_id').notNull(),
    shiftCode: text('shift_code').notNull(),
    minEmployees: integer('min_employees').notNull().default(0),
  },
  (table) => ({
    deptIdx: index('staffing_dept_idx').on(table.departmentId),
  }),
);

export const syncLogs = sqliteTable(
  'sync_logs',
  {
    id: text('id').primaryKey(),
    sheet: text('sheet').notNull(),
    direction: text('direction').notNull(),
    status: text('status').notNull(),
    records: integer('records').notNull().default(0),
    message: text('message').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    createdIdx: index('sync_created_idx').on(table.createdAt),
  }),
);

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type DepartmentRow = typeof departments.$inferSelect;
export type EmployeeRow = typeof employees.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type RosterRow = typeof rosters.$inferSelect;
export type RosterEntryRow = typeof rosterEntries.$inferSelect;
export type AttendanceRow = typeof attendanceSessions.$inferSelect;
export type BreakRow = typeof breakSessions.$inferSelect;
export type LeaveRow = typeof leaveApplications.$inferSelect;
export type OvertimeRow = typeof overtimeRequests.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type SalaryRow = typeof salaryRecords.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type AnnouncementRow = typeof announcements.$inferSelect;
export type AuditRow = typeof auditLogs.$inferSelect;
export type SignupRow = typeof signupApplications.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type SyncLogRow = typeof syncLogs.$inferSelect;

/**
 * Zod schemas shared by the API (request validation) and the web client
 * (form validation), so both sides agree on every rule.
 */
import { z } from 'zod';
import { LEAVE_TYPE_CODES } from './constants.js';

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

/**
 * Entity identifiers are opaque, server-generated tokens (UUIDs for runtime
 * records, readable slugs for seeded reference data such as shifts). They are
 * never chosen by the user, so a length-bounded string is the right shape.
 */
export const idSchema = () => z.string().trim().min(1).max(64);

/** A variant that reports a friendly message when the field is missing. */
export const requiredIdSchema = (message: string) =>
  z.string({ required_error: message }).trim().min(1, message).max(64);

export const emailSchema = z
  .string({ required_error: 'Official email is required' })
  .trim()
  .toLowerCase()
  .min(5, 'Enter a valid email address')
  .max(160, 'Email is too long')
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), 'Enter a valid email address');

export const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((v) => /[a-zA-Z]/.test(v), 'Password must contain a letter')
  .refine((v) => /[0-9]/.test(v), 'Password must contain a number');

export const otpSchema = z
  .string({ required_error: 'OTP is required' })
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit OTP');

export const mobileSchema = z
  .string({ required_error: 'Mobile number is required' })
  .trim()
  .regex(/^(\+?88)?0?1[3-9]\d{8}$/, 'Enter a valid Bangladeshi mobile number');

export const employeeCodeSchema = z
  .string({ required_error: 'Employee ID is required' })
  .trim()
  .toUpperCase()
  .min(2, 'Employee ID must be at least 2 characters')
  .max(24, 'Employee ID must be at most 24 characters')
  .regex(/^[A-Z0-9][A-Z0-9\-_/]*$/, 'Employee ID may only contain letters, numbers, - _ /');

export const dateKeySchema = z
  .string({ required_error: 'Date is required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');

/* ------------------------------------------------------------------ auth */

export const signupRequestSchema = z.object({
  fullName: trimmed(2, 80, 'Full name'),
  mobile: mobileSchema,
  employeeCode: employeeCodeSchema,
  designation: trimmed(2, 60, 'Designation'),
  email: emailSchema,
  departmentId: requiredIdSchema('Select a department'),
  subDepartmentId: idSchema().nullable().optional(),
  reportingManagerId: idSchema().nullable().optional(),
  joiningDate: dateKeySchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  otpToken: z.string().min(10, 'Verify your email first'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type SignupRequestInput = z.infer<typeof signupRequestSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const otpRequestSchema = z.object({
  email: emailSchema,
  purpose: z.enum(['signup', 'password_reset', 'login_2fa']).default('signup'),
});

export const otpVerifySchema = z.object({
  email: emailSchema,
  code: otpSchema,
  purpose: z.enum(['signup', 'password_reset', 'login_2fa']).default('signup'),
});

export const passwordResetSchema = z.object({
  email: emailSchema,
  code: otpSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const signupReviewSchema = z.object({
  decision: z.enum(['approve', 'decline']),
  note: z.string().trim().max(1000).optional(),
  salary: z.number().min(0).max(10000000).optional(),
  correction: z
    .object({
      fullName: z.string().trim().min(2).max(80).optional(),
      mobile: z.string().trim().max(20).optional(),
      employeeCode: z.string().trim().max(24).optional(),
      designation: z.string().trim().max(60).optional(),
      departmentId: idSchema().optional(),
      subDepartmentId: idSchema().nullable().optional(),
      reportingManagerId: idSchema().nullable().optional(),
      joiningDate: dateKeySchema.optional(),
    })
    .optional(),
});

/* ------------------------------------------------------------- profile */

export const profileUpdateRequestSchema = z.object({
  fields: z.object({
    mobile: z.string().trim().max(20).optional(),
    reportingManagerId: idSchema().nullable().optional(),
    avatarKey: z.string().max(200).optional(),
  }),
  reason: z.string().trim().min(3, 'Please give a short reason').max(500),
});

/* ---------------------------------------------------------- attendance */

export const clockInSchema = z.object({
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  accuracyMeters: z.number().min(0).max(100000).nullable().optional(),
  source: z.enum(['pwa', 'web']).default('pwa'),
});

export const verificationPayloadSchema = z.object({
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  accuracyMeters: z.number().min(0).max(100000).nullable().optional(),
  accuracy: z.number().min(0).max(100000).nullable().optional(),
});

/* -------------------------------------------------------------- roster */

export const rosterCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  startDate: dateKeySchema,
  endDate: dateKeySchema,
  entries: z
    .array(
      z.object({
        employeeId: idSchema(),
        date: dateKeySchema,
        shiftId: idSchema().nullable(),
        isOff: z.boolean(),
      }),
    )
    .min(1, 'Add at least one roster entry'),
}).refine((d) => d.endDate >= d.startDate, {
  message: 'End date must be on or after the start date',
  path: ['endDate'],
});

export const rosterPublishSchema = z.object({
  publishMode: z.enum(['now', 'schedule']).default('now'),
  scheduledFor: z.string().optional(),
});

/* --------------------------------------------------------------- leave */

export const leaveApplySchema = z.object({
  leaveType: z.enum(LEAVE_TYPE_CODES as unknown as [string, ...string[]]),
  fromDate: dateKeySchema,
  toDate: dateKeySchema,
  reason: trimmed(3, 500, 'Reason'),
  attachmentKey: z.string().max(200).nullable().optional(),
  isRosterChange: z.boolean().default(false),
  rosterChange: z
    .object({
      rosterId: idSchema(),
      currentOffDate: dateKeySchema,
      requestedOffDate: dateKeySchema,
      note: z.string().trim().max(500).optional(),
    })
    .nullable()
    .optional(),
}).refine((d) => d.toDate >= d.fromDate, {
  message: 'To date must be on or after the from date',
  path: ['toDate'],
});

export const leaveReviewSchema = z.object({
  decision: z.enum(['approve', 'decline']),
  note: z.string().trim().max(1000).optional(),
  rosterUpdateMode: z.enum(['auto', 'manual']).nullable().optional(),
});

/* ------------------------------------------------------------ overtime */

export const overtimeApplySchema = z.object({
  requestedStart: z.string().min(4),
  requestedEnd: z.string().min(4),
  reason: z.string().trim().max(500).optional(),
});

export const overtimeReviewSchema = z.object({
  decision: z.enum(['approve', 'decline']),
  approvedStart: z.string().optional(),
  approvedEnd: z.string().optional(),
  note: z.string().trim().max(1000).optional(),
});

/* --------------------------------------------------------------- tasks */

export const taskCreateSchema = z.object({
  name: trimmed(3, 140, 'Task name'),
  description: z.string().trim().max(4000).optional(),
  departmentId: idSchema().nullable().optional(),
  assignedEmployeeId: idSchema().nullable().optional(),
  reviewerId: idSchema().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assignedDate: dateKeySchema.optional(),
  startDate: dateKeySchema.optional(),
  dueDate: dateKeySchema.optional(),
  referenceLink: z.string().url().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const taskUpdateSchema = taskCreateSchema.partial().extend({
  status: z.enum(['yet_to_start', 'in_progress', 'pending', 'complete']).optional(),
});

export const taskSubmitSchema = z.object({
  submissionLink: z.string().url().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  attachmentKey: z.string().max(200).nullable().optional(),
  status: z.enum(['yet_to_start', 'in_progress', 'pending']).optional(),
});

export const taskReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  feedback: z.string().trim().max(2000).optional(),
});

/* ------------------------------------------------------------- payroll */

export const payrollGenerateSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export const payrollUpdateSchema = z.object({
  basicSalary: z.number().min(0).max(10000000).optional(),
  allowances: z.number().min(0).max(10000000).optional(),
  overtimeAmount: z.number().min(0).max(10000000).optional(),
  deductions: z.number().min(0).max(10000000).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/* ------------------------------------------------------ announcements */

export const announcementSchema = z.object({
  title: trimmed(3, 140, 'Notice title'),
  body: trimmed(3, 5000, 'Message body'),
  type: z.enum([
    'announcement',
    'holiday_notice',
    'salary_published',
    'attendance_notice',
    'individual_message',
  ]).default('announcement'),
  targetType: z.enum(['all', 'department', 'sub_department', 'employees']).default('all'),
  targetIds: z.array(z.string()).default([]),
  attachmentKey: z.string().max(200).nullable().optional(),
  publishMode: z.enum(['now', 'schedule', 'draft']).default('now'),
  scheduledFor: z.string().optional(),
  emailNotification: z.boolean().default(false),
});

/* -------------------------------------------------------- departments */

export const departmentSchema = z.object({
  name: trimmed(2, 60, 'Department name'),
  type: z.enum(['regular', 'parent', 'protected']).default('regular'),
  parentId: idSchema().nullable().optional(),
  displayOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const designationSchema = z.object({
  name: trimmed(2, 60, 'Designation name'),
  displayOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const shiftSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: trimmed(2, 80, 'Shift name'),
  shortName: z.string().trim().min(1).max(30),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endsNextDay: z.boolean().default(false),
  locationPolicy: z.enum(['office', 'wfh', 'split']).default('office'),
  requiresOfficeVerification: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

/* ------------------------------------------------------- staffing rules */

export const staffingRuleSchema = z.object({
  departmentId: idSchema(),
  shiftId: idSchema().nullable().optional(),
  minStaff: z.number().int().min(0).max(999),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  isActive: z.boolean().optional(),
});

/* ------------------------------------------------------------ settings */

export const settingsSchema = z.object({
  key: z.string().trim().min(1).max(100),
  value: z.unknown(),
});

/* --------------------------------------------------------------- files */

export const fileMetaSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  ownerId: z.string(),
  purpose: z.string(),
  createdAt: z.string(),
  url: z.string().optional(),
});

export type SignupReviewInput = z.infer<typeof signupReviewSchema>;
export type LeaveApplyInput = z.infer<typeof leaveApplySchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type AnnouncementInput = z.infer<typeof announcementSchema>;

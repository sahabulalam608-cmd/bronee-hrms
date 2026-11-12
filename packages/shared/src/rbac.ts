/**
 * Role-based access control — permission catalogue shared by API guards and the
 * client's navigation/visibility logic.
 */
import type { Role } from './types.js';

export const PERMISSIONS = {
  // Employee self-service
  EMPLOYEE_PROFILE_VIEW: 'employee.profile.view',
  EMPLOYEE_PROFILE_EDIT: 'employee.profile.edit',
  EMPLOYEE_ATTENDANCE_VIEW: 'employee.attendance.view',
  EMPLOYEE_BREAK_USE: 'employee.break.use',
  EMPLOYEE_ROSTER_VIEW: 'employee.roster.view',
  EMPLOYEE_LEAVE_APPLY: 'employee.leave.apply',
  EMPLOYEE_LEAVE_VIEW: 'employee.leave.view',
  EMPLOYEE_OVERTIME_APPLY: 'employee.overtime.apply',
  EMPLOYEE_OVERTIME_VIEW: 'employee.overtime.view',
  EMPLOYEE_TASK_VIEW: 'employee.task.view',
  EMPLOYEE_TASK_SUBMIT: 'employee.task.submit',
  EMPLOYEE_SALARY_VIEW: 'employee.salary.view',
  EMPLOYEE_NOTIFICATION_VIEW: 'employee.notification.view',

  // HR — people
  HR_EMPLOYEE_VIEW: 'hr.employee.view',
  HR_EMPLOYEE_MANAGE: 'hr.employee.manage',
  HR_SIGNUP_APPROVE: 'hr.signup.approve',
  HR_DEPARTMENT_MANAGE: 'hr.department.manage',
  HR_DESIGNATION_MANAGE: 'hr.designation.manage',

  // HR — workforce
  HR_SHIFT_MANAGE: 'hr.shift.manage',
  HR_ROSTER_MANAGE: 'hr.roster.manage',
  HR_ROSTER_PUBLISH: 'hr.roster.publish',
  HR_ATTENDANCE_VIEW: 'hr.attendance.view',
  HR_ATTENDANCE_REVIEW: 'hr.attendance.review',
  HR_ATTENDANCE_CORRECT: 'hr.attendance.correct',
  HR_BREAK_VIEW: 'hr.break.view',

  // HR — requests
  HR_LEAVE_VIEW: 'hr.leave.view',
  HR_LEAVE_REVIEW: 'hr.leave.review',
  HR_OVERTIME_VIEW: 'hr.overtime.view',
  HR_OVERTIME_REVIEW: 'hr.overtime.review',

  // HR — comp & tasks
  HR_PAYROLL_VIEW: 'hr.payroll.view',
  HR_PAYROLL_MANAGE: 'hr.payroll.manage',
  HR_PAYROLL_PUBLISH: 'hr.payroll.publish',
  HR_BONUS_VIEW: 'hr.bonus.view',
  HR_TASK_MANAGE: 'hr.task.manage',
  HR_TASK_REVIEW: 'hr.task.review',

  // HR — comms & config
  HR_ANNOUNCEMENT_MANAGE: 'hr.announcement.manage',
  HR_SHEETS_INTEGRATION: 'hr.sheets.integration',
  HR_REPORT_EXPORT: 'hr.report.export',
  HR_SETTINGS_MANAGE: 'hr.settings.manage',
  HR_AUDIT_VIEW: 'hr.audit.view',
  HR_ROLE_MANAGE: 'hr.role.manage',

  // Super admin only
  ADMIN_PROTECTED_DEPARTMENT_ORDER: 'admin.protected.department.order',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const EMPLOYEE_PERMISSIONS: Permission[] = [
  PERMISSIONS.EMPLOYEE_PROFILE_VIEW,
  PERMISSIONS.EMPLOYEE_PROFILE_EDIT,
  PERMISSIONS.EMPLOYEE_ATTENDANCE_VIEW,
  PERMISSIONS.EMPLOYEE_BREAK_USE,
  PERMISSIONS.EMPLOYEE_ROSTER_VIEW,
  PERMISSIONS.EMPLOYEE_LEAVE_APPLY,
  PERMISSIONS.EMPLOYEE_LEAVE_VIEW,
  PERMISSIONS.EMPLOYEE_OVERTIME_APPLY,
  PERMISSIONS.EMPLOYEE_OVERTIME_VIEW,
  PERMISSIONS.EMPLOYEE_TASK_VIEW,
  PERMISSIONS.EMPLOYEE_TASK_SUBMIT,
  PERMISSIONS.EMPLOYEE_SALARY_VIEW,
  PERMISSIONS.EMPLOYEE_NOTIFICATION_VIEW,
];

/** Read-only oversight permissions granted to a department manager. */
const MANAGER_PERMISSIONS: Permission[] = [
  ...EMPLOYEE_PERMISSIONS,
  PERMISSIONS.HR_EMPLOYEE_VIEW,
  PERMISSIONS.HR_ATTENDANCE_VIEW,
  PERMISSIONS.HR_BREAK_VIEW,
  PERMISSIONS.HR_LEAVE_VIEW,
  PERMISSIONS.HR_OVERTIME_VIEW,
  PERMISSIONS.HR_TASK_REVIEW,
  PERMISSIONS.HR_REPORT_EXPORT,
];

const HR_PERMISSIONS: Permission[] = [
  ...EMPLOYEE_PERMISSIONS,
  PERMISSIONS.HR_EMPLOYEE_VIEW,
  PERMISSIONS.HR_EMPLOYEE_MANAGE,
  PERMISSIONS.HR_SIGNUP_APPROVE,
  PERMISSIONS.HR_DEPARTMENT_MANAGE,
  PERMISSIONS.HR_DESIGNATION_MANAGE,
  PERMISSIONS.HR_SHIFT_MANAGE,
  PERMISSIONS.HR_ROSTER_MANAGE,
  PERMISSIONS.HR_ROSTER_PUBLISH,
  PERMISSIONS.HR_ATTENDANCE_VIEW,
  PERMISSIONS.HR_ATTENDANCE_REVIEW,
  PERMISSIONS.HR_ATTENDANCE_CORRECT,
  PERMISSIONS.HR_BREAK_VIEW,
  PERMISSIONS.HR_LEAVE_VIEW,
  PERMISSIONS.HR_LEAVE_REVIEW,
  PERMISSIONS.HR_OVERTIME_VIEW,
  PERMISSIONS.HR_OVERTIME_REVIEW,
  PERMISSIONS.HR_PAYROLL_VIEW,
  PERMISSIONS.HR_PAYROLL_MANAGE,
  PERMISSIONS.HR_PAYROLL_PUBLISH,
  PERMISSIONS.HR_BONUS_VIEW,
  PERMISSIONS.HR_TASK_MANAGE,
  PERMISSIONS.HR_TASK_REVIEW,
  PERMISSIONS.HR_ANNOUNCEMENT_MANAGE,
  PERMISSIONS.HR_REPORT_EXPORT,
  PERMISSIONS.HR_AUDIT_VIEW,
];

/** Super admin additionally owns protected department ordering + role management. */
const SUPER_ADMIN_EXTRA: Permission[] = [
  PERMISSIONS.ADMIN_PROTECTED_DEPARTMENT_ORDER,
  PERMISSIONS.HR_ROLE_MANAGE,
  PERMISSIONS.HR_SETTINGS_MANAGE,
  PERMISSIONS.HR_SHEETS_INTEGRATION,
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  employee: EMPLOYEE_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  hr: HR_PERMISSIONS,
  super_admin: [...HR_PERMISSIONS, ...SUPER_ADMIN_EXTRA],
};

export function permissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? EMPLOYEE_PERMISSIONS;
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  const granted = permissionsForRole(role);
  return permissions.some((p) => granted.includes(p));
}

/** Roles that may sign in to the HR portal. */
export const HR_ROLES: Role[] = ['hr', 'super_admin'];

export function isHrRole(role: Role): boolean {
  return HR_ROLES.includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  employee: 'Employee',
  manager: 'Manager',
  hr: 'HR Admin',
  super_admin: 'Super Admin',
};

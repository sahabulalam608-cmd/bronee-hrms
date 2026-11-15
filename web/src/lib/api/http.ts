/**
 * BRONEE HRMS — HTTP API adapter.
 * Talks to the Cloudflare Worker (Hono) over `/api/*`.
 *
 * Enable with `VITE_API_MODE=http` and `VITE_API_BASE_URL=https://<worker>`.
 */

import type {
  Announcement,
  AttendanceRecord,
  AuditLog,
  BreakRecord,
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
  RosterChangeLog,
  RosterEntry,
  RosterSummary,
  SalaryRecord,
  SessionUser,
  SignupForm,
  Task,
} from '@shared/types';
import type { PendingSignup, SignupSheetRow, SyncLogEntry } from './db-types';
import type {
  ApiClient,
  AttendanceSummary,
  AttendanceTickResult,
  LeaveBalance,
  RosterPayload,
  StaffingCheckRow,
  SyncStatus,
} from './contract';

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
const TOKEN_KEY = 'bronee.hrms.session';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setHttpToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public field?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const url = new URL(`${BASE}/api${path}`, window.location.origin);
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }
  const token = getToken();
  const response = await fetch(url.toString(), {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    const err = payload as { error?: string; message?: string; code?: string; field?: string };
    throw new HttpError(
      err.message ?? err.error ?? 'The request could not be completed.',
      response.status,
      err.code,
      err.field,
    );
  }
  return payload as T;
}

export function createHttpAdapter(): ApiClient {
  return {
    login: async (email, password) => {
      const res = await request<{ user: SessionUser; token: string }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setHttpToken(res.token);
      return res;
    },
    requestSignupOtp: (form: SignupForm) =>
      request('/auth/signup/otp', { method: 'POST', body: form }),
    verifySignupOtp: (email, code) =>
      request('/auth/signup/verify', { method: 'POST', body: { email, code } }),
    submitSignup: (form: SignupForm) =>
      request('/auth/signup', { method: 'POST', body: form }),
    requestPasswordReset: (email) =>
      request('/auth/password/forgot', { method: 'POST', body: { email } }),
    resetPassword: (email, code, password) =>
      request('/auth/password/reset', { method: 'POST', body: { email, code, password } }),
    me: () => request<SessionUser | null>('/auth/me'),
    logout: async () => {
      await request('/auth/logout', { method: 'POST' }).catch(() => undefined);
      setHttpToken(null);
    },

    employeeDashboard: () => request<EmployeeDashboard>('/employee/dashboard'),
    employeeAttendance: (month) =>
      request<AttendanceSummary>('/employee/attendance', { query: { month } }),
    clockIn: (payload) => request('/employee/attendance/clock-in', { method: 'POST', body: payload }),
    attendanceTick: (payload) =>
      request<AttendanceTickResult>('/employee/attendance/tick', { method: 'POST', body: payload }),
    clockOut: () => request('/employee/attendance/clock-out', { method: 'POST' }),
    startBreak: () => request('/employee/break/start', { method: 'POST' }),
    endBreak: () => request('/employee/break/end', { method: 'POST' }),
    employeeBreaks: (month) => request('/employee/breaks', { query: { month } }),
    employeeRoster: () => request<RosterPayload>('/employee/roster'),
    employeeTasks: () => request<Task[]>('/employee/tasks'),
    submitTask: (taskId, payload) =>
      request<Task>(`/employee/tasks/${taskId}/submit`, { method: 'POST', body: payload }),
    employeeLeaves: () =>
      request<{ applications: LeaveApplication[]; balance: LeaveBalance[] }>('/employee/leaves'),
    submitLeave: (payload) => request('/employee/leaves', { method: 'POST', body: payload }),
    employeeRosterChangeRequests: () => request<RosterChangeRequest[]>('/employee/roster-requests'),
    submitRosterChangeRequest: (payload) =>
      request<RosterChangeRequest>('/employee/roster-requests', { method: 'POST', body: payload }),
    employeeOvertime: () => request<OvertimeRequest[]>('/employee/overtime'),
    requestOvertime: (payload) =>
      request<OvertimeRequest>('/employee/overtime', { method: 'POST', body: payload }),
    employeeNotifications: () => request<Notification[]>('/employee/notifications'),
    markNotificationRead: (id) =>
      request(`/employee/notifications/${id}/read`, { method: 'POST' }),
    markAllNotificationsRead: () => request('/employee/notifications/read-all', { method: 'POST' }),
    employeeProfile: () => request<Employee>('/employee/profile'),
    submitProfileCorrection: (payload) =>
      request('/employee/profile/correction', { method: 'POST', body: payload }),

    hrDashboard: () => request<HrDashboard>('/hr/dashboard'),
    hrEmployees: () => request<Employee[]>('/hr/employees'),
    updateEmployee: (id, payload) =>
      request<Employee>(`/hr/employees/${id}`, { method: 'PATCH', body: payload }),
    hrSignups: () => request<PendingSignup[]>('/hr/signups'),
    decideSignup: (id, payload) =>
      request<PendingSignup>(`/hr/signups/${id}`, { method: 'POST', body: payload }),
    hrDepartments: () => request<Department[]>('/hr/departments'),
    saveDepartment: (payload) => request('/hr/departments', { method: 'POST', body: payload }),
    reorderDepartments: (idsInOrder) =>
      request<Department[]>('/hr/departments/reorder', { method: 'POST', body: { idsInOrder } }),
    hrDesignations: () => request<Designation[]>('/hr/designations'),
    saveDesignation: (payload) => request('/hr/designations', { method: 'POST', body: payload }),
    hrRosterVersions: () => request<RosterSummary[]>('/hr/rosters'),
    hrRosterEntries: (versionId) => request<RosterEntry[]>(`/hr/rosters/${versionId}/entries`),
    createRoster: (payload) => request('/hr/rosters', { method: 'POST', body: payload }),
    updateRoster: (versionId, assignments) =>
      request(`/hr/rosters/${versionId}`, { method: 'PATCH', body: { assignments } }),
    updatePublishedRoster: (versionId, assignments) =>
      request(`/hr/rosters/${versionId}/update`, { method: 'POST', body: { assignments } }),
    publishRoster: (versionId, mode, publishAt) =>
      request(`/hr/rosters/${versionId}/publish`, { method: 'POST', body: { mode, publishAt } }),
    sendRosterUpdate: (versionId, employeeId) =>
      request(`/hr/rosters/${versionId}/send`, { method: 'POST', body: { employeeId } }),
    rosterConflicts: (versionId) => request<StaffingCheckRow[]>(`/hr/rosters/${versionId}/conflicts`),
    rosterChangeLog: () => request<RosterChangeLog[]>('/hr/rosters/history'),
    hrAttendance: (month) => request<AttendanceSummary>('/hr/attendance', { query: { month } }),
    reviewAttendance: (id, payload) =>
      request<AttendanceRecord>(`/hr/attendance/${id}/review`, { method: 'POST', body: payload }),
    hrBreaks: (month) => request<BreakRecord[]>('/hr/breaks', { query: { month } }),
    hrLeaves: () => request<LeaveApplication[]>('/hr/leaves'),
    decideLeave: (id, payload) =>
      request<LeaveApplication>(`/hr/leaves/${id}`, { method: 'POST', body: payload }),
    hrOvertime: () => request<OvertimeRequest[]>('/hr/overtime'),
    decideOvertime: (id, payload) =>
      request<OvertimeRequest>(`/hr/overtime/${id}`, { method: 'POST', body: payload }),
    hrBonus: (month) => request(`/hr/bonus`, { query: { month } }),
    hrPayroll: (month) => request<SalaryRecord[]>('/hr/payroll', { query: { month } }),
    publishPayroll: (month) => request('/hr/payroll/publish', { method: 'POST', body: { month } }),
    hrTasks: () => request<Task[]>('/hr/tasks'),
    saveTask: (payload) => request('/hr/tasks', { method: 'POST', body: payload }),
    hrAnnouncements: () => request<Announcement[]>('/hr/announcements'),
    saveAnnouncement: (payload) => request('/hr/announcements', { method: 'POST', body: payload }),
    hrSheetsStatus: () => request<SyncStatus>('/hr/sheets'),
    hrSignupSheetRows: () => request<SignupSheetRow[]>('/hr/sheets/signups'),
    runSheetsSync: (direction) =>
      request<{ synced: number; log: SyncLogEntry }>('/hr/sheets/sync', {
        method: 'POST',
        body: { direction },
      }),
    hrAuditLogs: () => request<AuditLog[]>('/hr/audit-logs'),
    hrSettings: () => request<CompanySettings>('/hr/settings'),
    saveSettings: (payload) => request('/hr/settings', { method: 'PATCH', body: payload }),
    hrRosterChangeRequests: () => request<RosterChangeRequest[]>('/hr/roster-requests'),
    decideRosterChange: (id, payload) =>
      request<RosterChangeRequest>(`/hr/roster-requests/${id}`, { method: 'POST', body: payload }),
    report: (kind) => request('/hr/reports/' + kind),
    exportReport: (kind) => request<string>('/hr/reports/' + kind + '/export', { method: 'POST' }),
  };
}

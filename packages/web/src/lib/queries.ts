import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  Announcement,
  AppNotification,
  AttendanceBonusSnapshot,
  AttendanceSession,
  AuditLog,
  BreakRecord,
  Department,
  Designation,
  EmployeeDashboard,
  HrDashboard,
  LeaveBalance,
  LeaveRequest,
  OvertimeRequest,
  PayrollRecord,
  PublicUser,
  Roster,
  RosterDayCell,
  Shift,
  StaffingWarning,
  SyncLog,
  Task,
  TaskSubmission,
} from '@bronee/shared';
import { api } from './api';

const stale = 30_000;

/* ============================================================ employee */

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'employee'],
    queryFn: () => api.get<EmployeeDashboard>('/dashboard/employee'),
    refetchInterval: 60_000,
    staleTime: stale,
  });
}

export function useAttendanceStatus() {
  return useQuery({
    queryKey: ['attendance', 'status'],
    queryFn: () =>
      api.get<{
        date: string;
        session: AttendanceSession | null;
        activeBreak: BreakRecord | null;
        liveWorkingSeconds: number;
        liveBreakSeconds: number;
        scheduledShift: Shift | null;
        rosterShift: Shift | null;
        isOffDay: boolean;
        approvedOvertime: OvertimeRequest | null;
      }>('/attendance/status'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useAttendanceHistory(limit = 60) {
  return useQuery({
    queryKey: ['attendance', 'history', limit],
    queryFn: () => api.get<{ items: AttendanceSession[] }>('/attendance/history', { query: { limit } }),
    staleTime: stale,
  });
}

export function useMonthlySummary() {
  return useQuery({
    queryKey: ['attendance', 'monthly'],
    queryFn: () =>
      api.get<{
        month: string;
        totalWorkingSeconds: number;
        totalBreakSeconds: number;
        presentDays: number;
        lateDays: number;
        overtimeSeconds: number;
      }>('/attendance/monthly-summary'),
    staleTime: stale,
  });
}

export function useBreaks(limit = 50) {
  return useQuery({
    queryKey: ['breaks', limit],
    queryFn: () =>
      api.get<{
        items: BreakRecord[];
        today: { seconds: number; count: number };
        month: { seconds: number; count: number };
      }>('/attendance/breaks', { query: { limit } }),
    staleTime: stale,
  });
}

export function useMyRoster(from?: string, to?: string) {
  return useQuery({
    queryKey: ['roster', 'my', from, to],
    queryFn: () =>
      api.get<{ from: string; to: string; rosterName: string | null; items: RosterDayCell[] }>('/roster/my', {
        query: { from, to },
      }),
    staleTime: stale,
  });
}

export function useTeamRoster(date: string) {
  return useQuery({
    queryKey: ['roster', 'team', date],
    queryFn: () =>
      api.get<{
        date: string;
        items: Array<{
          employeeId: string;
          employeeName: string;
          shiftCode: string | null;
          shiftName: string | null;
          shiftShortName: string | null;
          isOff: boolean;
          isMe: boolean;
        }>;
      }>(`/roster/team/${date}`),
    staleTime: stale,
  });
}

export function useCurrentRoster() {
  return useQuery({
    queryKey: ['roster', 'current'],
    queryFn: () =>
      api.get<{
        date: string;
        shift: Shift | null;
        shiftCode: string | null;
        shiftName: string | null;
        rosterName: string | null;
        rosterStart: string | null;
        rosterEnd: string | null;
        isOff: boolean;
      }>('/roster/current'),    staleTime: stale,
  });
}

export function useMyLeave(year?: number) {
  return useQuery({
    queryKey: ['leave', 'my', year],
    queryFn: () =>
      api.get<{
        year: number;
        balances: LeaveBalance[];
        pending: LeaveRequest[];
        approved: LeaveRequest[];
        declined: LeaveRequest[];
        items: LeaveRequest[];
      }>('/leave/my', { query: { year } }),
    staleTime: stale,
  });
}

export function useOffDays() {
  return useQuery({
    queryKey: ['leave', 'off-days'],
    queryFn: () => api.get<{ items: Array<{ date: string; rosterId: string }> }>('/leave/off-days'),
    staleTime: stale,
  });
}

export function useMyOvertime() {
  return useQuery({
    queryKey: ['overtime', 'my'],
    queryFn: () =>
      api.get<{
        items: OvertimeRequest[];
        summary: {
          pending: number;
          approved: number;
          approvedHoursThisMonth: number;
          actualHoursThisMonth: number;
        };
      }>('/overtime/my'),
    staleTime: stale,
  });
}

export function useMyTasks() {
  return useQuery({
    queryKey: ['tasks', 'my'],
    queryFn: () =>
      api.get<{
        items: Array<Task & { overdue: boolean; submissions: TaskSubmission[] }>;
        summary: {
          yetToStart: number;
          inProgress: number;
          pending: number;
          complete: number;
          overdue: number;
        };
      }>('/tasks/my'),
    staleTime: stale,
  });
}

export function useTask(id: string | null | undefined) {
  return useQuery({
    queryKey: ['tasks', 'detail', id],
    queryFn: () => api.get<{ task: Task; submissions: TaskSubmission[] }>(`/tasks/${id}`),
    enabled: Boolean(id),
    staleTime: stale,
  });
}

export function useMyPayslips() {
  return useQuery({
    queryKey: ['payroll', 'my'],
    queryFn: () =>
      api.get<{ items: PayrollRecord[]; latest: PayrollRecord | null; yearToDate: number }>('/payroll/my'),
    staleTime: stale,
  });
}

export function useNotifications(limit = 50) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      api.get<{ items: AppNotification[]; unread: number; unreadRoster: number }>('/notifications', {
        query: { limit },
      }),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () =>
      api.get<{
        profile: PublicUser;
        pendingRequests: Array<{
          id: string;
          fields: Record<string, unknown>;
          reason: string;
          status: string;
          createdAt: string;
        }>;
      }>('/profile'),
    staleTime: stale,
  });
}

export function useRosterHistory() {
  return useQuery({
    queryKey: ['notifications', 'roster-history'],
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          previousShift: string;
          newShift: string;
          previousIsOff: boolean | null;
          newIsOff: boolean;
          changeType: string;
          notified: boolean;
          changedAt: string;
        }>;
      }>('/notifications/roster-history'),
    staleTime: stale,
  });
}

/* ================================================================ meta */

export function useDepartments(includeInactive = false) {
  return useQuery({
    queryKey: ['meta', 'departments', includeInactive],
    queryFn: () =>
      api.get<{
        items: Department[];
        tree: Array<Department & { children: Department[] }>;
      }>('/meta/departments', { query: { includeInactive: includeInactive ? '1' : undefined } }),
    staleTime: 5 * 60_000,
  });
}

export function useDesignations() {
  return useQuery({
    queryKey: ['meta', 'designations'],
    queryFn: () => api.get<{ items: Designation[] }>('/meta/designations'),
    staleTime: 5 * 60_000,
  });
}

export function useShifts() {
  return useQuery({
    queryKey: ['meta', 'shifts'],
    queryFn: () => api.get<{ items: Shift[] }>('/meta/shifts'),
    staleTime: 5 * 60_000,
  });
}

export function useEmployeeDirectory(search?: string) {
  return useQuery({
    queryKey: ['meta', 'employees', search],
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          fullName: string;
          employeeCode: string;
          email: string;
          mobile: string;
          designationLabel: string;
          departmentId: string | null;
          subDepartmentId: string | null;
          joiningDate: string;
          role: string;
          status: string;
          departmentName: string | null;
        }>;
      }>('/meta/employees', { query: { search } }),
    staleTime: 60_000,
  });
}

/* ================================================================== hr */

export function useHrDashboard() {
  return useQuery({
    queryKey: ['hr', 'dashboard'],
    queryFn: () => api.get<HrDashboard>('/hr/dashboard'),
    staleTime: stale,
  });
}

export function useHrEmployees(search?: string, status?: string) {
  return useQuery({
    queryKey: ['hr', 'employees', search, status],
    queryFn: () => api.get<{ items: HrEmployee[] }>('/hr/employees', { query: { search, status } }),
    staleTime: stale,
  });
}

export type HrEmployee = {
  id: string;
  fullName: string;
  employeeCode: string;
  email: string;
  mobile: string;
  designationLabel: string;
  departmentId: string | null;
  subDepartmentId: string | null;
  reportingManagerId: string | null;
  joiningDate: string;
  role: string;
  status: string;
  avatarKey: string | null;
  departmentName: string | null;
};

export function useHrSignups(status = 'pending') {
  return useQuery({
    queryKey: ['hr', 'signups', status],
    queryFn: () =>
      api.get<{
        items: Array<{
          requestId: string;
          status: string;
          proposedSalary: number | null;
          reviewNote: string | null;
          createdAt: string;
          reviewedAt: string | null;
          employee: {
            id: string;
            fullName: string;
            email: string;
            mobile: string;
            employeeCode: string;
            designation: string;
            departmentId: string | null;
            department: string | null;
            subDepartmentId: string | null;
            joiningDate: string;
            reportingManagerId: string | null;
          };
        }>;
      }>('/hr/signups', { query: { status } }),
    staleTime: stale,
  });
}

export function useHrProfileRequests() {
  return useQuery({
    queryKey: ['hr', 'profile-requests'],
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          employeeId: string;
          employeeName: string;
          employeeCode: string;
          fields: Record<string, unknown>;
          reason: string;
          status: string;
          reviewNote: string | null;
          createdAt: string;
        }>;
      }>('/hr/profile-requests'),
    staleTime: stale,
  });
}

export function useHrDepartments() {
  return useQuery({
    queryKey: ['hr', 'departments'],
    queryFn: () =>
      api.get<{
        items: Array<Department & { employeeCount: number }>;
        tree: Array<Department & { employeeCount: number; children: Array<Department & { employeeCount: number }> }>;
      }>('/hr/departments'),
    staleTime: stale,
  });
}

export function useHrDesignations() {
  return useQuery({
    queryKey: ['hr', 'designations'],
    queryFn: () => api.get<{ items: Designation[] }>('/hr/designations'),
    staleTime: stale,
  });
}

export function useHrShifts() {
  return useQuery({
    queryKey: ['hr', 'shifts'],
    queryFn: () => api.get<{ items: Shift[] }>('/hr/shifts'),
    staleTime: stale,
  });
}

export function useHrRosters(status?: string) {
  return useQuery({
    queryKey: ['hr', 'rosters', status],
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          name: string;
          startDate: string;
          endDate: string;
          version: number;
          status: string;
          scheduledFor: string | null;
          publishedAt: string | null;
          createdAt: string;
          entryCount: number;
        }>;
      }>('/hr/roster', { query: { status } }),
    staleTime: stale,
  });
}

export function useHrRoster(id: string | undefined) {
  return useQuery({
    queryKey: ['hr', 'roster', id],
    queryFn: () =>
      api.get<{
        roster: Roster;
        items: Array<{
          employeeId: string;
          employeeName: string;
          employeeCode: string;
          joiningDate: string;
          department: string | null;
          date: string;
          shiftId: string | null;
          shiftCode: string | null;
          shiftName: string | null;
          isOff: boolean;
        }>;
        conflicts: StaffingWarning[];
      }>(`/hr/roster/${id}`),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useHrRosterEmployees() {
  return useQuery({
    queryKey: ['hr', 'roster', 'employees'],
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          fullName: string;
          employeeCode: string;
          joiningDate: string;
          departmentId: string | null;
          subDepartmentId: string | null;
          departmentName: string | null;
          departmentOrder: number | null;
        }>;
      }>('/hr/roster/employees/ordered'),
    staleTime: 60_000,
  });
}

export function useHrRosterHistory(id: string | undefined) {
  return useQuery({
    queryKey: ['hr', 'roster', id, 'history'],
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          employeeId: string;
          employeeName: string;
          employeeCode: string;
          previousShift: string;
          newShift: string;
          changedBy: string | null;
          changeType: string;
          notified: boolean;
          createdAt: string;
        }>;
      }>(`/hr/roster/${id}/history`),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useHrAttendance(date?: string) {
  return useQuery({
    queryKey: ['hr', 'attendance', date],
    queryFn: () =>
      api.get<{
        date: string;
        items: AttendanceSession[];
        summary: {
          present: number;
          late: number;
          verificationFailed: number;
          pendingReview: number;
          total: number;
        };
      }>('/hr/attendance', { query: { date } }),
    staleTime: 20_000,
  });
}

export function useHrAttendanceRecord(id: string | undefined) {
  return useQuery({
    queryKey: ['hr', 'attendance', 'record', id],
    queryFn: () =>
      api.get<{
        record: AttendanceSession;
        history: AttendanceSession[];
        breaks: BreakRecord[];
      }>(`/hr/attendance/${id}`),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useHrBreakRecords(date?: string) {
  return useQuery({
    queryKey: ['hr', 'breaks', date],
    queryFn: () =>
      api.get<{
        date: string;
        items: Array<BreakRecord & { employeeName: string; employeeCode: string }>;
      }>('/hr/attendance/breaks/records', { query: { date } }),
    staleTime: 30_000,
  });
}

export function useHrOfficeNetwork() {
  return useQuery({
    queryKey: ['hr', 'office-network'],
    queryFn: () =>
      api.get<{
        allowlist: string[];
        geofenceMeters: number;
        latitude: number;
        longitude: number;
        maxAccuracyMeters: number;
        verificationWindowMinutes: number;
      }>('/hr/attendance/office-network'),
    staleTime: 60_000,
  });
}

export function useHrLeave(status?: string) {
  return useQuery({
    queryKey: ['hr', 'leave', status],
    queryFn: () =>
      api.get<{
        items: Array<LeaveRequest & { employeeName: string; employeeCode: string }>;
      }>('/hr/requests/leave', { query: { status } }),
    staleTime: 20_000,
  });
}

export function useHrOvertime(status?: string) {
  return useQuery({
    queryKey: ['hr', 'overtime', status],
    queryFn: () =>
      api.get<{
        items: Array<OvertimeRequest & { employeeName: string; employeeCode: string }>;
      }>('/hr/requests/overtime', { query: { status } }),
    staleTime: 20_000,
  });
}

export function useHrPayroll(year: number, month: number) {
  return useQuery({
    queryKey: ['hr', 'payroll', year, month],
    queryFn: () =>
      api.get<{
        year: number;
        month: number;
        items: Array<PayrollRecord & { employeeName: string; employeeCode: string; department: string | null }>;
        totals: {
          netPayable: number;
          basicSalary: number;
          bonus: number;
          overtime: number;
          deductions: number;
        };
      }>('/hr/compensation/payroll', { query: { year, month } }),
    staleTime: 30_000,
  });
}

export function useHrBonus(year: number, month: number) {
  return useQuery({
    queryKey: ['hr', 'bonus', year, month],
    queryFn: () =>
      api.get<{
        year: number;
        month: number;
        policy: Array<{ maxLateDays: number; amount: number; label: string }>;
        items: Array<AttendanceBonusSnapshot & { employeeName: string; employeeCode: string }>;
        totalAmount: number;
      }>('/hr/compensation/bonus', { query: { year, month } }),
    staleTime: 30_000,
  });
}

export function useHrTasks(filters?: {
  from?: string;
  to?: string;
  status?: string;
  priority?: string;
  departmentId?: string;
  employeeId?: string;
}) {
  return useQuery({
    queryKey: ['hr', 'tasks', filters],
    queryFn: () =>
      api.get<{
        items: Array<Task & { pendingDays: number; overdue: boolean }>;
        summary: {
          total: number;
          yetToStart: number;
          inProgress: number;
          pending: number;
          complete: number;
          overdue: number;
        };
        prioritySummary: Array<{ priority: string; count: number }>;
        departmentSummary: Array<{ department: string; count: number }>;
        statusSummary: Array<{ status: string; count: number }>;
        dateSummary: Array<{ date: string; count: number }>;
      }>('/hr/tasks', { query: filters }),
    staleTime: 20_000,
  });
}

export function useHrTaskSubmissions() {
  return useQuery({
    queryKey: ['hr', 'task-submissions'],
    queryFn: () =>
      api.get<{
        items: Array<TaskSubmission & { taskName: string; taskCode: string }>;
      }>('/hr/tasks/submissions/pending'),
    staleTime: 20_000,
  });
}

export function useHrAnnouncements(status?: string) {
  return useQuery({
    queryKey: ['hr', 'announcements', status],
    queryFn: () =>
      api.get<{
        items: Array<
          Announcement & {
            createdByName: string | null;
            recipientCount: number;
            readCount: number;
          }
        >;
      }>('/hr/comms', { query: { status } }),
    staleTime: 20_000,
  });
}

export function useHrAnnouncementHistory() {
  return useQuery({
    queryKey: ['hr', 'announcements', 'history'],
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          title: string;
          status: string;
          targetLabel: string | null;
          publishedAt: string | null;
          scheduledFor: string | null;
          createdByName: string | null;
          recipients: Array<{ employeeName: string; read: boolean; emailStatus: string }>;
          readCount: number;
          recipientCount: number;
        }>;
      }>('/hr/comms/history'),
    staleTime: 20_000,
  });
}

export function useHrSheetsStatus() {
  return useQuery({
    queryKey: ['hr', 'sheets', 'status'],
    queryFn: () =>
      api.get<{
        connected: boolean;
        provider: string;
        sheets: {
          taskManagement: { id: string; url: string; tabs: string[] };
          mainHrms: { id: string; url: string; tabs: string[] };
        };
        autoSync: boolean;
        lastSync: SyncLog | null;
      }>('/hr/sheets/status'),
    staleTime: 30_000,
  });
}

export function useHrSyncHistory() {
  return useQuery({
    queryKey: ['hr', 'sheets', 'history'],
    queryFn: () => api.get<{ items: SyncLog[] }>('/hr/sheets/history'),
    staleTime: 30_000,
  });
}

export function useHrAudit(entityType?: string) {
  return useQuery({
    queryKey: ['hr', 'audit', entityType],
    queryFn: () => api.get<{ items: AuditLog[] }>('/hr/system/audit', { query: { entityType } }),
    staleTime: 20_000,
  });
}

export function useHrSettings() {
  return useQuery({
    queryKey: ['hr', 'settings'],
    queryFn: () =>
      api.get<{ items: Array<{ key: string; value: unknown; updatedBy: string | null; updatedAt: string }> }>(
        '/hr/system/settings',
      ),
    staleTime: 60_000,
  });
}

export function useHrStaffingRules() {
  return useQuery({
    queryKey: ['hr', 'staffing-rules'],
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          departmentId: string;
          shiftId: string | null;
          minStaff: number;
          dayOfWeek: number | null;
          isActive: boolean;
        }>;
      }>('/hr/system/staffing-rules'),
    staleTime: 60_000,
  });
}

/* =========================================================== mutations */

export function useInvalidate() {
  const queryClient = useQueryClient();
  return (keys: string[][]) => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: key });
  };
}

export function useMutationWithInvalidate<TVariables, TData = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  invalidateKeys: string[][],
) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn,
    onSuccess: () => invalidate(invalidateKeys),
  });
}

export type QueryOptionsLike<T> = UseQueryOptions<T>;

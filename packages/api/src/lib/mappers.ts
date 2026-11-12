/**
 * Row -> DTO mappers. Keeps the API surface stable and free of database
 * internals (hashes, salts, internal flags).
 */
import type {
  AppNotification,
  AttendanceBonusSnapshot,
  AttendanceSession,
  BreakRecord,
  Department,
  Designation,
  LeaveRequest,
  OvertimeRequest,
  PayrollRecord,
  PublicUser,
  RosterEntry,
  Shift,
  Task,
  TaskSubmission,
} from '@bronee/shared';
import * as s from '../db/schema.js';

export function toShift(row: typeof s.shifts.$inferSelect): Shift {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    shortName: row.shortName,
    startTime: row.startTime,
    endTime: row.endTime,
    endsNextDay: row.endsNextDay,
    locationPolicy: row.locationPolicy,
    requiresOfficeVerification: row.requiresOfficeVerification,
    segments: row.segments ?? null,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
  };
}

export function toDepartment(row: typeof s.departments.$inferSelect): Department {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    parentId: row.parentId,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
  };
}

export function toDesignation(row: typeof s.designations.$inferSelect): Designation {
  return {
    id: row.id,
    name: row.name,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
  };
}

export type UserWithRefs = typeof s.users.$inferSelect & {
  departmentName?: string | null;
  subDepartmentName?: string | null;
  managerName?: string | null;
};

export function toPublicUser(row: UserWithRefs, avatarUrl?: string | null): PublicUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    mobile: row.mobile,
    employeeCode: row.employeeCode,
    designation: row.designationLabel,
    designationId: row.designationId,
    department: row.departmentName ?? null,
    departmentId: row.departmentId,
    subDepartment: row.subDepartmentName ?? null,
    subDepartmentId: row.subDepartmentId,
    reportingManagerId: row.reportingManagerId,
    reportingManagerName: row.managerName ?? null,
    joiningDate: row.joiningDate,
    role: row.role,
    status: row.status,
    avatarKey: row.avatarKey,
    avatarUrl: avatarUrl ?? null,
    mustChangePassword: row.mustChangePassword,
  };
}

export function toAttendanceSession(
  row: typeof s.attendanceSessions.$inferSelect & {
    employeeName?: string;
    employeeCode?: string;
    shiftCode?: string | null;
    shiftName?: string | null;
  },
): AttendanceSession {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    employeeCode: row.employeeCode,
    date: row.date,
    shiftId: row.shiftId,
    shiftCode: row.shiftCode ?? null,
    shiftName: row.shiftName ?? null,
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    punchInAt: row.punchInAt,
    actualWorkingStart: row.actualWorkingStart,
    verificationCompletedAt: row.verificationCompletedAt,
    verificationMethod: row.verificationMethod,
    verificationResult: row.verificationResult,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracyMeters,
    officeIpMatched: row.officeIpMatched,
    officeIp: row.officeIp,
    clockOutAt: row.clockOutAt,
    workingSeconds: row.workingSeconds,
    breakSeconds: row.breakSeconds,
    breakCount: row.breakCount,
    status: row.status,
    lateStatus: row.lateStatus,
    attendanceStatus: row.attendanceStatus,
    autoAction: row.autoAction,
    reviewStatus: row.reviewStatus,
    reviewNote: row.reviewNote,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    exceptionHistory: row.exceptionHistory ?? [],
    segment: row.segment,
    isOvertime: row.isOvertime,
    createdAt: row.createdAt,
  };
}

export function toBreak(row: typeof s.breaks.$inferSelect): BreakRecord {
  return {
    id: row.id,
    employeeId: row.employeeId,
    sessionId: row.sessionId,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationSeconds: row.durationSeconds,
    closedBy: row.closedBy,
  };
}

export function toRosterEntry(
  row: typeof s.rosterEntries.$inferSelect & {
    employeeName: string;
    employeeCode: string;
    department: string | null;
    subDepartment: string | null;
    shiftCode: string | null;
    shiftName: string | null;
  },
): RosterEntry {
  return {
    id: row.id,
    rosterId: row.rosterId,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    employeeCode: row.employeeCode,
    department: row.department,
    subDepartment: row.subDepartment,
    date: row.date,
    shiftId: row.shiftId,
    shiftCode: row.shiftCode,
    shiftName: row.shiftName,
    isOff: row.isOff,
    updatedAt: row.updatedAt,
  };
}

export function toLeaveRequest(
  row: typeof s.leaveRequests.$inferSelect & { employeeName?: string; reviewedByName?: string | null },
): LeaveRequest {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    leaveType: row.leaveType,
    fromDate: row.fromDate,
    toDate: row.toDate,
    totalDays: row.totalDays,
    reason: row.reason,
    attachmentKey: row.attachmentKey,
    attachmentName: row.attachmentName,
    status: row.status,
    isRosterChange: row.isRosterChange,
    rosterChangeId: row.rosterChangeId,
    rosterUpdateMode: row.rosterUpdateMode,
    rosterUpdateStatus: row.rosterUpdateStatus,
    reviewedBy: row.reviewedBy,
    reviewedByName: row.reviewedByName ?? null,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toOvertimeRequest(
  row: typeof s.overtimeRequests.$inferSelect & { employeeName?: string },
): OvertimeRequest {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    requestedStart: row.requestedStart,
    requestedEnd: row.requestedEnd,
    requestedHours: row.requestedHours,
    approvedStart: row.approvedStart,
    approvedEnd: row.approvedEnd,
    approvedHours: row.approvedHours,
    actualStart: row.actualStart,
    actualEnd: row.actualEnd,
    actualHours: row.actualHours,
    status: row.status,
    reviewedBy: row.reviewedBy,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
  };
}

export function toTask(row: typeof s.tasks.$inferSelect & {
  department?: string | null;
  assignedEmployeeName?: string | null;
  reviewerName?: string | null;
}): Task {
  return {
    id: row.id,
    taskCode: row.taskCode,
    name: row.name,
    description: row.description,
    departmentId: row.departmentId,
    department: row.department ?? null,
    assignedEmployeeId: row.assignedEmployeeId,
    assignedEmployeeName: row.assignedEmployeeName ?? null,
    reviewerId: row.reviewerId,
    reviewerName: row.reviewerName ?? null,
    priority: row.priority,
    assignedDate: row.assignedDate,
    startDate: row.startDate,
    dueDate: row.dueDate,
    completedAt: row.completedAt,
    status: row.status,
    referenceLink: row.referenceLink,
    createdBy: row.createdBy,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toTaskSubmission(
  row: typeof s.taskSubmissions.$inferSelect & { employeeName?: string },
): TaskSubmission {
  return {
    id: row.id,
    taskId: row.taskId,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    submissionLink: row.submissionLink,
    notes: row.notes,
    attachmentKey: row.attachmentKey,
    attachmentName: row.attachmentName,
    status: row.status,
    feedback: row.feedback,
    createdAt: row.createdAt,
  };
}

export function toPayrollRecord(
  row: typeof s.payrollRecords.$inferSelect & {
    employeeName?: string;
    employeeCode?: string;
    department?: string | null;
  },
): PayrollRecord {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    employeeCode: row.employeeCode,
    department: row.department ?? null,
    year: row.year,
    month: row.month,
    basicSalary: row.basicSalary,
    allowances: row.allowances,
    overtimeAmount: row.overtimeAmount,
    bonusAmount: row.bonusAmount,
    deductions: row.deductions,
    netPayable: row.netPayable,
    workingDays: row.workingDays,
    presentDays: row.presentDays,
    lateDays: row.lateDays,
    status: row.status,
    publishedAt: row.publishedAt,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

export function toBonusSnapshot(
  row: typeof s.attendanceBonusSnapshots.$inferSelect & { employeeName?: string },
): AttendanceBonusSnapshot {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    year: row.year,
    month: row.month,
    lateDays: row.lateDays,
    bonusAmount: row.bonusAmount,
    eligible: row.eligible,
  };
}

export function toNotification(row: typeof s.notifications.$inferSelect): AppNotification {
  return {
    id: row.id,
    employeeId: row.employeeId,
    type: row.type as AppNotification['type'],
    title: row.title,
    body: row.body,
    link: row.link,
    emailSent: row.emailSent,
    emailStatus: row.emailStatus,
    readAt: row.readAt,
    publishedAt: row.publishedAt,
    createdBy: row.createdBy,
    meta: row.meta ?? null,
  };
}

/**
 * BRONEE HRMS — demo dataset.
 *
 * Seeded from BRONEE Limited's real people and the live Google Sheets
 * (Task Management `Management System` tab + Main HRMS `LeaveApplications`
 * tab) so the product is populated with genuine BRONEE data rather than
 * placeholder rows.
 *
 * Everything is generated deterministically — the same dataset appears on
 * every device, which keeps screenshots, demos and tests reproducible.
 */

import {
  ATTENDANCE_BONUS_TIERS,
  DEPARTMENTS,
  SHIFT_BY_CODE,
  type AttendanceStatus,
  type LateStatus,
  type Role,
  type ShiftCode,
} from '@shared/constants';
import { bdDateKey, bdInstant, scheduleFor } from '@shared/attendance';
import type {
  Announcement,
  AttendanceRecord,
  AuditLog,
  BreakRecord,
  CompanySettings,
  Department,
  Designation,
  Employee,
  LeaveApplication,
  Notification,
  OvertimeRequest,
  RosterEntry,
  RosterSummary,
  SalaryRecord,
  StaffingRule,
  Task,
} from '@shared/types';
import type { DbShape, PendingSignup } from '@/lib/api/db-types';

/* ------------------------------------------------------------------ *
 * Deterministic pseudo-random generator
 * ------------------------------------------------------------------ */

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const rng = makeRng(20261112);
const between = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

/* ------------------------------------------------------------------ *
 * Reference data
 * ------------------------------------------------------------------ */

const DESIGNATIONS: Array<{ name: string; departmentName: string | null }> = [
  { name: 'HR Director & Super Admin', departmentName: 'HR' },
  { name: 'HR Manager', departmentName: 'HR' },
  { name: 'HR Executive', departmentName: 'HR' },
  { name: 'Chief Executive Officer', departmentName: 'CEO' },
  { name: 'Head of Department', departmentName: 'Sales Team' },
  { name: 'Retention Team Leader & CSO', departmentName: 'Retention Team' },
  { name: 'Direct Sales Team Leader', departmentName: 'Direct Sales' },
  { name: 'Social Media Team Leader', departmentName: 'Social Media' },
  { name: 'Courier Team Leader', departmentName: 'Courier Team' },
  { name: 'Customer Relationship Officer', departmentName: 'Sales Team' },
  { name: 'Digital Marketing Manager', departmentName: 'Digital Marketing' },
  { name: 'Digital Marketing Executive', departmentName: 'Digital Marketing' },
  { name: 'Supply Chain Team Leader', departmentName: 'Supply Chain' },
  { name: 'Accounts Officer', departmentName: 'Accounts' },
  { name: 'Accounts Executive', departmentName: 'Accounts' },
  { name: 'Media Buying Executive', departmentName: 'Digital Marketing' },
  { name: 'Creative Designer', departmentName: 'Digital Marketing' },
  { name: 'Content Writer', departmentName: 'Digital Marketing' },
];

interface SeedEmployee {
  id: string;
  code: string;
  name: string;
  email: string;
  mobile: string;
  designation: string;
  department: string;
  subDepartment: string | null;
  manager: string | null;
  joiningDate: string;
  shift: ShiftCode;
  portal: 'EMPLOYEE' | 'HR';
  role: Role;
  salary: number;
  allowances: number;
}

/** The real BRONEE Limited team, recovered from the live Sheets. */
const SEED_EMPLOYEES: SeedEmployee[] = [
  {
    id: 'emp-hr-admin',
    code: 'BRN-001',
    name: 'Sabrina Rahman',
    email: 'hr@bronneltd.com',
    mobile: '+8801711000001',
    designation: 'HR Director & Super Admin',
    department: 'HR',
    subDepartment: null,
    manager: null,
    joiningDate: '2022-01-02',
    shift: 'MORNING',
    portal: 'HR',
    role: 'SUPER_ADMIN',
    salary: 85000,
    allowances: 12000,
  },
  {
    id: 'emp-farhana',
    code: 'BRN-002',
    name: 'Farhana Akter',
    email: 'farhana.bronee@gmail.com',
    mobile: '+8801711000002',
    designation: 'HR Manager',
    department: 'HR',
    subDepartment: null,
    manager: 'Sabrina Rahman',
    joiningDate: '2022-06-12',
    shift: 'MORNING',
    portal: 'HR',
    role: 'HR_MANAGER',
    salary: 62000,
    allowances: 9000,
  },
  {
    id: 'emp-nusrat',
    code: 'BRN-003',
    name: 'Nusrat Jahan',
    email: 'nusrat.bronee@gmail.com',
    mobile: '+8801711000003',
    designation: 'HR Executive',
    department: 'HR',
    subDepartment: null,
    manager: 'Farhana Akter',
    joiningDate: '2023-02-05',
    shift: 'EVENING_E1',
    portal: 'HR',
    role: 'HR_EXECUTIVE',
    salary: 42000,
    allowances: 6000,
  },
  {
    id: 'emp-ismail',
    code: 'BRN-004',
    name: 'MD Ismail Hossain',
    email: 'ismailhossainm712@gmail.com',
    mobile: '+8801711000004',
    designation: 'Retention Team Leader & CSO',
    department: 'Sales Team',
    subDepartment: 'Retention Team',
    manager: 'Mayin Bhuiyan',
    joiningDate: '2022-03-15',
    shift: 'EVENING_E1',
    portal: 'EMPLOYEE',
    role: 'HR_VIEWER',
    salary: 55000,
    allowances: 8000,
  },
  {
    id: 'emp-mayin',
    code: 'BRN-005',
    name: 'Mayin Bhuiyan',
    email: 'chinexbd3@gmail.com',
    mobile: '+8801711000005',
    designation: 'Head of Department',
    department: 'Sales Team',
    subDepartment: null,
    manager: 'Sabrina Rahman',
    joiningDate: '2022-02-01',
    shift: 'MORNING',
    portal: 'EMPLOYEE',
    role: 'HR_VIEWER',
    salary: 70000,
    allowances: 10000,
  },
  {
    id: 'emp-sabbir',
    code: 'BRN-006',
    name: 'Sabbir Ahmed',
    email: 'bronneltd@gmail.com',
    mobile: '+8801711000006',
    designation: 'HR Executive',
    department: 'HR',
    subDepartment: null,
    manager: 'Farhana Akter',
    joiningDate: '2023-07-18',
    shift: 'EVENING_E1',
    portal: 'EMPLOYEE',
    role: 'HR_VIEWER',
    salary: 38000,
    allowances: 5500,
  },
  {
    id: 'emp-sanjida',
    code: 'BRN-007',
    name: 'Sanjida Akter',
    email: 'sanjidaaktersampa005@gmail.com',
    mobile: '+8801711000007',
    designation: 'Customer Relationship Officer',
    department: 'Sales Team',
    subDepartment: 'Direct Sales',
    manager: 'Mayin Bhuiyan',
    joiningDate: '2023-11-01',
    shift: 'MORNING',
    portal: 'EMPLOYEE',
    role: 'HR_VIEWER',
    salary: 30000,
    allowances: 4000,
  },
  {
    id: 'emp-ashif',
    code: 'BRN-008',
    name: 'Al Ashif Ibna Zaman',
    email: 'alashif.official@gmail.com',
    mobile: '+8801711000008',
    designation: 'Social Media Team Leader',
    department: 'Sales Team',
    subDepartment: 'Social Media',
    manager: 'Mayin Bhuiyan',
    joiningDate: '2023-05-20',
    shift: 'EVENING_E1',
    portal: 'EMPLOYEE',
    role: 'HR_VIEWER',
    salary: 46000,
    allowances: 6500,
  },
  {
    id: 'emp-rabbi',
    code: 'BRN-009',
    name: 'Rabbi Hossain',
    email: 'rabbihossain255@gmail.com',
    mobile: '+8801711000009',
    designation: 'Courier Team Leader',
    department: 'Sales Team',
    subDepartment: 'Courier Team',
    manager: 'Mayin Bhuiyan',
    joiningDate: '2024-01-08',
    shift: 'EVENING_E1',
    portal: 'EMPLOYEE',
    role: 'HR_VIEWER',
    salary: 40000,
    allowances: 5500,
  },
  {
    id: 'emp-mohiuddin',
    code: 'BRN-010',
    name: 'Mohiuddin Ahmed',
    email: 'mohiuddin.bronee@gmail.com',
    mobile: '+8801711000010',
    designation: 'Digital Marketing Manager',
    department: 'Digital Marketing',
    subDepartment: null,
    manager: 'Sabrina Rahman',
    joiningDate: '2022-09-12',
    shift: 'MORNING',
    portal: 'EMPLOYEE',
    role: 'HR_VIEWER',
    salary: 52000,
    allowances: 7500,
  },
  {
    id: 'emp-abir',
    code: 'BRN-011',
    name: 'Abir Rahman',
    email: 'abir.bronee@gmail.com',
    mobile: '+8801711000011',
    designation: 'Chief Executive Officer',
    department: 'CEO',
    subDepartment: null,
    manager: null,
    joiningDate: '2021-12-01',
    shift: 'MORNING',
    portal: 'EMPLOYEE',
    role: 'HR_VIEWER',
    salary: 120000,
    allowances: 20000,
  },
  {
    id: 'emp-shohid',
    code: 'BRN-012',
    name: 'Shohid Hossain',
    email: 'shohid.bronee@gmail.com',
    mobile: '+8801711000012',
    designation: 'Supply Chain Team Leader',
    department: 'Supply Chain',
    subDepartment: null,
    manager: 'Sabrina Rahman',
    joiningDate: '2023-03-06',
    shift: 'MORNING',
    portal: 'EMPLOYEE',
    role: 'HR_VIEWER',
    salary: 44000,
    allowances: 6000,
  },
  {
    id: 'emp-abduljalil',
    code: 'BRN-013',
    name: 'Abdul Jalil',
    email: 'abduljalil.bronee@gmail.com',
    mobile: '+8801711000013',
    designation: 'Accounts Officer',
    department: 'Accounts',
    subDepartment: null,
    manager: 'Sabrina Rahman',
    joiningDate: '2023-08-14',
    shift: 'MORNING',
    portal: 'EMPLOYEE',
    role: 'HR_VIEWER',
    salary: 36000,
    allowances: 5000,
  },
  {
    id: 'emp-sabbir-ahamed',
    code: 'BRN-014',
    name: 'Sabbir Ahamed',
    email: 'sezan5800@gmail.com',
    mobile: '+8801711000014',
    designation: 'Customer Relationship Officer',
    department: 'Sales Team',
    subDepartment: 'Direct Sales',
    manager: 'Mayin Bhuiyan',
    joiningDate: '2024-04-02',
    shift: 'EVENING_E1',
    portal: 'EMPLOYEE',
    role: 'HR_VIEWER',
    salary: 28000,
    allowances: 3500,
  },
  {
    id: 'emp-tania',
    code: 'BRN-015',
    name: 'Tania Akter',
    email: 'tania.bronee@gmail.com',
    mobile: '+8801711000015',
    designation: 'Accounts Executive',
    department: 'Accounts',
    subDepartment: null,
    manager: 'Abdul Jalil',
    joiningDate: '2024-06-17',
    shift: 'MORNING',
    portal: 'EMPLOYEE',
    role: 'HR_VIEWER',
    salary: 25000,
    allowances: 3000,
  },
  {
    id: 'emp-rafiq',
    code: 'BRN-016',
    name: 'Rafiq Islam',
    email: 'rafiq.bronee@gmail.com',
    mobile: '+8801711000016',
    designation: 'Digital Marketing Executive',
    department: 'Digital Marketing',
    subDepartment: null,
    manager: 'Mohiuddin Ahmed',
    joiningDate: '2024-09-09',
    shift: 'LATE_EVENING',
    portal: 'EMPLOYEE',
    role: 'HR_VIEWER',
    salary: 24000,
    allowances: 2800,
  },
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const DAY = 86_400_000;

function shiftDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return bdDateKey(new Date(Date.UTC(y, m - 1, d) + days * DAY));
}

function startOfWeek(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay(); // 0 = Sunday
  const delta = dow === 0 ? -6 : 1 - dow;
  return bdDateKey(new Date(date.getTime() + delta * DAY));
}

function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Fridays and Saturdays are the standard BRONEE weekly off days. */
function isWeeklyOff(dateKey: string): boolean {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 5 || dow === 6;
}

/* ------------------------------------------------------------------ *
 * Task seeds — the real rows from the Task Management sheet
 * ------------------------------------------------------------------ */

const TASK_SEED_ROWS: Array<{
  name: string;
  department: string;
  employeeId: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Yet to Start' | 'In Progress' | 'Pending' | 'Complete';
}> = [
  { name: 'Retention campaign follow-up', department: 'Sales Team', employeeId: 'emp-ismail', priority: 'High', status: 'In Progress' },
  { name: 'Monthly accounts reconciliation', department: 'Accounts', employeeId: 'emp-mayin', priority: 'Medium', status: 'Yet to Start' },
  { name: 'Shift data validation', department: 'HR', employeeId: 'emp-sabbir', priority: 'Low', status: 'Complete' },
  { name: 'Courier routing audit', department: 'Sales Team', employeeId: 'emp-rabbi', priority: 'High', status: 'Pending' },
  { name: 'Performance review compilation', department: 'CEO', employeeId: 'emp-abir', priority: 'Medium', status: 'Yet to Start' },
  { name: 'Supply vendor comparison', department: 'Supply Chain', employeeId: 'emp-shohid', priority: 'Low', status: 'Yet to Start' },
  { name: 'Paid media plan — Q4', department: 'Digital Marketing', employeeId: 'emp-mohiuddin', priority: 'High', status: 'In Progress' },
  { name: 'Direct sales pipeline cleanup', department: 'Sales Team', employeeId: 'emp-sanjida', priority: 'Medium', status: 'Complete' },
  { name: 'Social media content calendar', department: 'Sales Team', employeeId: 'emp-ashif', priority: 'Medium', status: 'Complete' },
  { name: 'Payroll input sheet', department: 'Accounts', employeeId: 'emp-abduljalil', priority: 'High', status: 'In Progress' },
  { name: 'Creative asset refresh', department: 'Digital Marketing', employeeId: 'emp-rafiq', priority: 'Low', status: 'Yet to Start' },
  { name: 'Roster publish — week 46', department: 'HR', employeeId: 'emp-farhana', priority: 'High', status: 'Pending' },
  { name: 'Candidate onboarding — direct sales', department: 'Sales Team', employeeId: 'emp-mayin', priority: 'Medium', status: 'Complete' },
  { name: 'Break policy documentation', department: 'HR', employeeId: 'emp-nusrat', priority: 'Low', status: 'Complete' },
  { name: 'Customer care escalation log', department: 'Sales Team', employeeId: 'emp-tania', priority: 'Medium', status: 'Yet to Start' },
  { name: 'Vendor invoice reconciliation', department: 'Accounts', employeeId: 'emp-tania', priority: 'Low', status: 'Complete' },
  { name: 'Search ads optimisation', department: 'Digital Marketing', employeeId: 'emp-rafiq', priority: 'High', status: 'Pending' },
  { name: 'Courier SLA dashboard', department: 'Sales Team', employeeId: 'emp-rabbi', priority: 'Medium', status: 'Complete' },
  { name: 'Handover notes — night shift', department: 'Sales Team', employeeId: 'emp-sabbir-ahamed', priority: 'Low', status: 'In Progress' },
  { name: 'Monthly tax statement', department: 'Accounts', employeeId: 'emp-abduljalil', priority: 'Medium', status: 'Complete' },
];

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

export function buildSeedDb(today = bdDateKey(new Date())): DbShape {
  const departments: Department[] = DEPARTMENTS.map((dep) => ({
    id: dep.id,
    name: dep.name,
    kind: dep.kind,
    parentId: dep.parentId,
    displayOrder: dep.displayOrder,
    active: true,
    protected: dep.protected,
  }));

  const designations: Designation[] = DESIGNATIONS.map((d, index) => ({
    id: `des-${index + 1}`,
    name: d.name,
    departmentId: departments.find((dep) => dep.name === d.departmentName)?.id ?? null,
    active: true,
  }));

  const employees: Employee[] = SEED_EMPLOYEES.map((seed) => {
    const dept = departments.find((d) => d.name === seed.department)!;
    const sub = seed.subDepartment
      ? departments.find((d) => d.name === seed.subDepartment) ?? null
      : null;
    return {
      id: seed.id,
      employeeId: seed.code,
      fullName: seed.name,
      mobile: seed.mobile,
      email: seed.email,
      designation: seed.designation,
      departmentId: dept.id,
      departmentName: dept.name,
      subDepartmentId: sub?.id ?? null,
      subDepartmentName: sub?.name ?? null,
      reportingManager: seed.manager,
      joiningDate: seed.joiningDate,
      shiftCode: seed.shift,
      shiftName: SHIFT_BY_CODE[seed.shift].name,
      status: 'Active',
      portal: seed.portal,
      role: seed.role,
      baseSalary: seed.salary,
      allowances: seed.allowances,
      createdAt: bdInstant(seed.joiningDate, 9 * 60),
    };
  });

  const byId = Object.fromEntries(employees.map((e) => [e.id, e])) as Record<string, Employee>;

  /* ---------------- rosters ---------------- */
  const weekStart = startOfWeek(today);
  const rosterVersions: RosterSummary[] = [
    {
      id: 'roster-cur',
      version: 2,
      startDate: weekStart,
      endDate: shiftDays(weekStart, 6),
      status: 'Published',
      publishAt: null,
      publishedAt: bdInstant(shiftDays(weekStart, -3), 18 * 60),
      publishedBy: 'Sabrina Rahman',
      createdAt: bdInstant(shiftDays(weekStart, -4), 11 * 60),
      notificationSent: true,
    },
    {
      id: 'roster-next',
      version: 1,
      startDate: shiftDays(weekStart, 7),
      endDate: shiftDays(weekStart, 13),
      status: 'Published',
      publishAt: null,
      publishedAt: bdInstant(today, 9 * 60),
      publishedBy: 'Farhana Akter',
      createdAt: bdInstant(shiftDays(weekStart, -1), 15 * 60),
      notificationSent: true,
    },
  ];

  const rosterEntries: RosterEntry[] = [];
  for (const version of rosterVersions) {
    const days = between(0, 6);
    for (let d = 0; d <= days; d += 1) {
      const date = shiftDays(version.startDate, d);
      for (const emp of employees) {
        const off = isWeeklyOff(date);
        const shiftCode: ShiftCode = off ? 'OFF' : emp.shiftCode;
        rosterEntries.push({
          rosterId: version.id,
          rosterVersion: version.version,
          employeeId: emp.id,
          employeeName: emp.fullName,
          employeeCode: emp.employeeId,
          departmentName: emp.departmentName,
          subDepartmentName: emp.subDepartmentName,
          joiningDate: emp.joiningDate,
          date,
          shiftCode,
          shiftName: off ? 'Off' : SHIFT_BY_CODE[shiftCode].name,
          offDay: off,
          changed: false,
        });
      }
    }
  }

  /* ---------------- attendance + breaks ---------------- */
  const attendance: AttendanceRecord[] = [];
  const breaks: BreakRecord[] = [];

  for (let back = 32; back >= 1; back -= 1) {
    const date = shiftDays(today, -back);
    if (isWeeklyOff(date)) continue;
    for (const emp of employees) {
      if (date < emp.joiningDate) continue;
      const schedule = scheduleFor(emp.shiftCode, date);

      // Roughly 1 in 8 shifts is late, 1 in 14 fails verification.
      const roll = rng();
      const isLate = roll > 0.87;
      const verificationFailed = !isLate && roll < 0.072;

      const lateMinutes = isLate ? between(3, 26) : between(-8, 1);
      const punchIn = bdInstant(
        date,
        Math.max(0, schedule.startMinutes + lateMinutes),
        schedule.startMinutes + lateMinutes < 0,
      );

      let attendanceStatus: AttendanceStatus = 'Verified';
      let lateStatus: LateStatus = isLate ? 'Late' : 'Not Late';
      let workingStart: string | null = schedule.start;
      let verificationMethod: AttendanceRecord['verificationMethod'] =
        rng() > 0.5 ? 'OFFICE_IP' : 'GPS';
      let verificationResult: AttendanceRecord['verificationResult'] = 'SUCCESS';
      let hrReviewStatus: AttendanceRecord['hrReviewStatus'] = isLate ? 'Reviewed' : 'Not Reviewed';

      if (verificationFailed) {
        attendanceStatus = 'Verification Failed';
        lateStatus = 'Pending Review';
        workingStart = null;
        verificationMethod = 'NONE';
        verificationResult = 'FAILED';
        hrReviewStatus = 'Not Reviewed';
      } else if (isLate) {
        attendanceStatus = 'Verified';
        verificationMethod = 'GPS';
        hrReviewStatus = 'Reviewed';
      }

      const clockOut = bdInstant(
        date,
        schedule.endMinutes + between(-18, 12),
        schedule.endNextDay,
      );
      const totalWorkingSeconds = verificationFailed
        ? 0
        : Math.max(0, Math.round((new Date(clockOut).getTime() - new Date(workingStart!).getTime()) / 1000) - between(3, 4) * 900);

      const breakCount = between(1, 3);
      const breakSlices: { start: string; end: string }[] = [];
      for (let bIdx = 0; bIdx < breakCount; bIdx += 1) {
        const startMinute = schedule.startMinutes + between(70, Math.max(90, schedule.endMinutes - schedule.startMinutes - 120));
        const endMinute = startMinute + between(15, 35);
        const bStart = bdInstant(date, startMinute);
        const bEnd = bdInstant(date, endMinute);
        breakSlices.push({ start: bStart, end: bEnd });
        breaks.push({
          id: `brk-${date}-${emp.id}-${bIdx}`,
          employeeId: emp.id,
          employeeName: emp.fullName,
          workDate: date,
          startAt: bStart,
          endAt: bEnd,
          durationSeconds: Math.round((new Date(bEnd).getTime() - new Date(bStart).getTime()) / 1000),
          closedBy: 'EMPLOYEE',
        });
      }

      attendance.push({
        id: `att-${date}-${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        employeeCode: emp.employeeId,
        departmentName: emp.departmentName,
        shiftCode: emp.shiftCode,
        shiftName: emp.shiftName,
        workDate: date,
        scheduledStart: schedule.start,
        punchIn,
        actualWorkingStart: workingStart,
        verificationCompletedAt: verificationFailed ? null : bdInstant(date, schedule.startMinutes, false),
        verificationMethod,
        verificationResult,
        gpsLat: verificationMethod === 'GPS' ? 23.81 + (rng() - 0.5) * 0.0006 : null,
        gpsLng: verificationMethod === 'GPS' ? 90.41 + (rng() - 0.5) * 0.0006 : null,
        gpsAccuracy: verificationMethod === 'GPS' ? between(6, 34) : null,
        officeIpMatch: verificationMethod === 'OFFICE_IP' ? true : null,
        clockOut: verificationFailed ? null : clockOut,
        totalWorkingSeconds,
        attendanceStatus,
        lateStatus,
        isManual: false,
        hrReviewStatus,
        hrReviewNote: isLate ? 'Late arrival confirmed from office GPS.' : null,
        reviewedBy: isLate ? 'Sabrina Rahman' : null,
        reviewedAt: isLate ? bdInstant(date, 20 * 60) : null,
        segments: schedule.segments.map((seg) => ({
          name: seg.name,
          workLocation: seg.workLocation,
          startAt: verificationFailed ? null : seg.start,
          endAt: verificationFailed ? null : seg.end,
          seconds: verificationFailed ? 0 : totalWorkingSeconds,
        })),
      });
    }
  }

  /* ---------------- leaves (real sheet rows + pending) ---------------- */
  const leaves: LeaveApplication[] = [
    {
      id: 'lv-1',
      applicationId: 'LA-2026-0001',
      employeeId: 'emp-mayin',
      employeeName: 'Mayin Bhuiyan',
      employeeCode: 'BRN-005',
      designation: 'Head of Department',
      email: 'chinexbd3@gmail.com',
      departmentName: 'Sales Team',
      reportingManager: 'Mayin Bhuiyan',
      leaveType: 'Weekly Off',
      fromDate: shiftDays(today, -9),
      toDate: shiftDays(today, -9),
      totalDays: 1,
      reason: 'argent',
      attachmentUrl: null,
      attachmentName: null,
      submittedAt: bdInstant(shiftDays(today, -12), 11 * 60 + 21),
      status: 'Pending',
      reviewReason: 'date invalid',
      emailStatus: 'Sent',
      approvedAt: null,
      decidedBy: null,
      isRosterChangeRequest: false,
    },
    {
      id: 'lv-2',
      applicationId: 'LA-2026-0002',
      employeeId: 'emp-sabbir',
      employeeName: 'Sabbir Ahmed',
      employeeCode: 'BRN-006',
      designation: 'HR Executive',
      email: 'bronneltd@gmail.com',
      departmentName: 'HR',
      reportingManager: 'Mayin Bhuiyan',
      leaveType: 'Weekly Off',
      fromDate: shiftDays(today, -5),
      toDate: shiftDays(today, -5),
      totalDays: 1,
      reason: 'personal',
      attachmentUrl: null,
      attachmentName: null,
      submittedAt: bdInstant(shiftDays(today, -6), 11 * 60 + 27),
      status: 'Approved',
      reviewReason: null,
      emailStatus: 'Sent',
      approvedAt: bdInstant(shiftDays(today, -6), 11 * 60 + 32),
      decidedBy: 'Sabrina Rahman',
      isRosterChangeRequest: false,
    },
    {
      id: 'lv-3',
      applicationId: 'LA-2026-0003',
      employeeId: 'emp-sanjida',
      employeeName: 'Sanjida Akter',
      employeeCode: 'BRN-007',
      designation: 'Customer Relationship Officer',
      email: 'sanjidaaktersampa005@gmail.com',
      departmentName: 'Sales Team',
      reportingManager: 'Mayin Bhuiya',
      leaveType: 'Weekly Off',
      fromDate: shiftDays(today, -3),
      toDate: shiftDays(today, -3),
      totalDays: 1,
      reason: 'Personal',
      attachmentUrl: null,
      attachmentName: null,
      submittedAt: bdInstant(shiftDays(today, -4), 11 * 60 + 41),
      status: 'Approved',
      reviewReason: null,
      emailStatus: 'Sent',
      approvedAt: bdInstant(shiftDays(today, -4), 11 * 60 + 43),
      decidedBy: 'Farhana Akter',
      isRosterChangeRequest: false,
    },
    {
      id: 'lv-4',
      applicationId: 'LA-2026-0004',
      employeeId: 'emp-ashif',
      employeeName: 'Al Ashif Ibna Zaman',
      employeeCode: 'BRN-008',
      designation: 'Social Media Team Leader',
      email: 'alashif.official@gmail.com',
      departmentName: 'Sales Team',
      reportingManager: 'Mayin',
      leaveType: 'Weekly Off',
      fromDate: shiftDays(today, -2),
      toDate: shiftDays(today, -2),
      totalDays: 1,
      reason: 'Family commitment.',
      attachmentUrl: null,
      attachmentName: null,
      submittedAt: bdInstant(shiftDays(today, -3), 11 * 60 + 51),
      status: 'Declined',
      reviewReason:
        'Sorry, your leave request has been cancelled because another team member has already been granted leave on the same day. We apologize for the inconvenience and appreciate your understanding.',
      emailStatus: 'Sent',
      approvedAt: bdInstant(shiftDays(today, -3), 11 * 60 + 54),
      decidedBy: 'Sabrina Rahman',
      isRosterChangeRequest: false,
    },
    {
      id: 'lv-5',
      applicationId: 'LA-2026-0005',
      employeeId: 'emp-ismail',
      employeeName: 'MD Ismail Hossain',
      employeeCode: 'BRN-004',
      designation: 'Retention Team Leader & CSO',
      email: 'ismailhossainm712@gmail.com',
      departmentName: 'Sales Team',
      reportingManager: 'Mayin Bhuiyan',
      leaveType: 'Weekly Off',
      fromDate: shiftDays(today, 4),
      toDate: shiftDays(today, 4),
      totalDays: 1,
      reason: 'Personal engagement.',
      attachmentUrl: null,
      attachmentName: null,
      submittedAt: bdInstant(today, 10 * 60 + 15),
      status: 'Pending',
      reviewReason: null,
      emailStatus: 'Not Sent',
      approvedAt: null,
      decidedBy: null,
      isRosterChangeRequest: false,
    },
    {
      id: 'lv-6',
      applicationId: 'LA-2026-0006',
      employeeId: 'emp-rabbi',
      employeeName: 'Rabbi Hossain',
      employeeCode: 'BRN-009',
      designation: 'Courier Team Leader',
      email: 'rabbihossain255@gmail.com',
      departmentName: 'Sales Team',
      reportingManager: 'Mayin',
      leaveType: 'Sick Leave',
      fromDate: shiftDays(today, -7),
      toDate: shiftDays(today, -6),
      totalDays: 2,
      reason: 'I will take my father for an emergency medical checkup.',
      attachmentUrl: null,
      attachmentName: null,
      submittedAt: bdInstant(shiftDays(today, -8), 22 * 60 + 25),
      status: 'Approved',
      reviewReason: null,
      emailStatus: 'Sent',
      approvedAt: bdInstant(shiftDays(today, -8), 22 * 60 + 27),
      decidedBy: 'Farhana Akter',
      isRosterChangeRequest: false,
    },
    {
      id: 'lv-7',
      applicationId: 'LA-2026-0007',
      employeeId: 'emp-tania',
      employeeName: 'Tania Akter',
      employeeCode: 'BRN-015',
      designation: 'Accounts Executive',
      email: 'tania.bronee@gmail.com',
      departmentName: 'Accounts',
      reportingManager: 'Abdul Jalil',
      leaveType: 'Casual Leave',
      fromDate: shiftDays(today, 3),
      toDate: shiftDays(today, 3),
      totalDays: 1,
      reason: 'Medical appointment.',
      attachmentUrl: null,
      attachmentName: null,
      submittedAt: bdInstant(today, 9 * 60 + 30),
      status: 'Pending',
      reviewReason: null,
      emailStatus: 'Not Sent',
      approvedAt: null,
      decidedBy: null,
      isRosterChangeRequest: false,
    },
  ];

  /* ---------------- overtime ---------------- */
  const overtime: OvertimeRequest[] = [
    {
      id: 'ot-1',
      employeeId: 'emp-ismail',
      employeeName: 'MD Ismail Hossain',
      departmentName: 'Sales Team',
      workDate: shiftDays(today, -1),
      requestedStart: '20:30',
      requestedEnd: '22:30',
      requestedMinutes: 120,
      approvedStart: '20:30',
      approvedEnd: '22:30',
      approvedMinutes: 120,
      actualMinutes: 118,
      status: 'Approved',
      reason: 'Retention campaign handover.',
      note: 'Approved by Sabrina Rahman.',
      createdAt: bdInstant(shiftDays(today, -2), 14 * 60),
      decidedAt: bdInstant(shiftDays(today, -2), 15 * 60),
      decidedBy: 'Sabrina Rahman',
    },
    {
      id: 'ot-2',
      employeeId: 'emp-mohiuddin',
      employeeName: 'Mohiuddin Ahmed',
      departmentName: 'Digital Marketing',
      workDate: shiftDays(today, -2),
      requestedStart: '19:00',
      requestedEnd: '21:00',
      requestedMinutes: 120,
      approvedStart: '19:00',
      approvedEnd: '21:00',
      approvedMinutes: 120,
      actualMinutes: 125,
      status: 'Approved',
      reason: 'Launch night monitoring.',
      note: null,
      createdAt: bdInstant(shiftDays(today, -3), 13 * 60),
      decidedAt: bdInstant(shiftDays(today, -3), 13 * 60 + 30),
      decidedBy: 'Farhana Akter',
    },
    {
      id: 'ot-3',
      employeeId: 'emp-rabbi',
      employeeName: 'Rabbi Hossain',
      departmentName: 'Sales Team',
      workDate: shiftDays(today, 1),
      requestedStart: '22:30',
      requestedEnd: '23:30',
      requestedMinutes: 60,
      approvedStart: null,
      approvedEnd: null,
      approvedMinutes: 0,
      actualMinutes: null,
      status: 'Pending',
      reason: 'Late courier batch dispatch.',
      note: null,
      createdAt: bdInstant(today, 12 * 60),
      decidedAt: null,
      decidedBy: null,
    },
    {
      id: 'ot-4',
      employeeId: 'emp-ashif',
      employeeName: 'Al Ashif Ibna Zaman',
      employeeCode: 'BRN-008',
      departmentName: 'Sales Team',
      workDate: shiftDays(today, -5),
      requestedStart: '22:00',
      requestedEnd: '23:30',
      requestedMinutes: 90,
      approvedStart: null,
      approvedEnd: null,
      approvedMinutes: 0,
      actualMinutes: null,
      status: 'Declined',
      reason: 'Extra posting support.',
      note: 'Covered by the roster of the same week.',
      createdAt: bdInstant(shiftDays(today, -6), 16 * 60),
      decidedAt: bdInstant(shiftDays(today, -6), 17 * 60),
      decidedBy: 'Farhana Akter',
    } as OvertimeRequest,
  ];

  /* ---------------- tasks ---------------- */
  const tasks: Task[] = TASK_SEED_ROWS.map((row, index) => {
    const emp = byId[row.employeeId];
    const assigned = shiftDays(today, -between(2, 14));
    const start = shiftDays(assigned, between(0, 2));
    const due = shiftDays(start, between(3, 16));
    const complete = row.status === 'Complete';
    return {
      id: `task-${index + 1}`,
      taskId: `TSK-${String(index + 1).padStart(4, '0')}`,
      name: row.name,
      description: `${row.name} — assigned to the ${row.department} team. Reference and supporting files are attached to the task record.`,
      departmentName: row.department,
      employeeId: emp.id,
      employeeName: emp.fullName,
      priority: row.priority,
      assignedDate: assigned,
      startDate: start,
      dueDate: due,
      status: row.status,
      referenceLink: `https://docs.google.com/spreadsheets/d/1BYeXS8TdZ--0XiSNpagb7h6tE9U6rzZnCRP5Uf5ht-U/edit#gid=804686369`,
      attachmentName: row.status === 'Complete' ? `${row.name.replace(/\s+/g, '-').toLowerCase()}.pdf` : null,
      notes: null,
      completeDate: complete ? shiftDays(due, -between(0, 2)) : null,
      submissions: complete
        ? [
            {
              id: `sub-${index + 1}`,
              submittedAt: bdInstant(shiftDays(due, -1), 16 * 60),
              submissionLink: `https://drive.google.com/file/d/bronee-${index + 1}/view`,
              fileName: `${row.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
              note: 'Completed and submitted for review.',
              reviewerFeedback: index % 3 === 0 ? 'Verified — good work.' : null,
            },
          ]
        : [],
      feedback: null,
    };
  });

  /* ---------------- salaries ---------------- */
  const salaries: SalaryRecord[] = [];
  for (let m = 2; m >= 0; m -= 1) {
    const [y, mo] = today.split('-').map(Number);
    const d = new Date(Date.UTC(y, mo - 1 - m, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    for (const emp of employees) {
      const empRecords = attendance.filter(
        (a) => a.employeeId === emp.id && monthKey(a.workDate) === key && a.lateStatus === 'Late',
      );
      const lateDays = empRecords.length;
      const otMinutes = overtime
        .filter((o) => o.employeeId === emp.id && monthKey(o.workDate) === key && o.status === 'Approved')
        .reduce((sum, o) => sum + o.approvedMinutes, 0);
      const tier = ATTENDANCE_BONUS_TIERS.find(
        (t) => lateDays >= t.minLateDays && lateDays <= t.maxLateDays,
      )!;
      const overtimePayment = Math.round((otMinutes / 60) * 200);
      const published = m > 0;
      salaries.push({
        id: `sal-${key}-${emp.id}`,
        employeeId: emp.id,
        month: key,
        basicSalary: emp.baseSalary ?? 0,
        allowances: emp.allowances ?? 0,
        overtimePayment,
        bonusAmount: tier.amount,
        deductions: 0,
        netPayable: (emp.baseSalary ?? 0) + (emp.allowances ?? 0) + overtimePayment + tier.amount,
        published,
        publishedAt: published ? bdInstant(`${key}-01`, 12 * 60) : null,
        lateDays,
        approvedOvertimeMinutes: otMinutes,
      });
    }
  }

  /* ---------------- notifications ---------------- */
  const notifications: Notification[] = [];
  for (const emp of employees) {
    notifications.push({
      id: `ntf-roster-${emp.id}`,
      employeeId: emp.id,
      title: 'Roster updated',
      message: `Your roster for the current week was updated. Shift: ${emp.shiftName}.`,
      type: 'Roster Update',
      createdAt: bdInstant(today, 9 * 60),
      read: false,
      emailStatus: 'Not Required',
      category: 'roster',
    });
    notifications.push({
      id: `ntf-shift-${emp.id}`,
      employeeId: emp.id,
      title: 'Shift change',
      message: `Your assigned shift is ${emp.shiftName}. Please confirm your availability.`,
      type: 'Shift Change',
      createdAt: bdInstant(shiftDays(today, -1), 17 * 60),
      read: true,
      emailStatus: 'Not Required',
      category: 'roster',
    });
  }
  notifications.push(
    {
      id: 'ntf-ann-1',
      employeeId: 'emp-hr-admin',
      title: 'Eid holiday notice',
      message:
        'The office will remain closed on the second day of Eid. Please plan your roster accordingly.',
      type: 'Holiday Notice',
      createdAt: bdInstant(shiftDays(today, -2), 12 * 60),
      read: false,
      emailStatus: 'Sent',
      category: 'general',
    },
    {
      id: 'ntf-ann-2',
      employeeId: 'emp-hr-admin',
      title: 'Attendance policy reminder',
      message:
        'Office verification must complete within one minute of your shift start. Repeated failures require HR review.',
      type: 'Important Attendance Notice',
      createdAt: bdInstant(shiftDays(today, -4), 10 * 60),
      read: false,
      emailStatus: 'Sent',
      category: 'general',
    },
    {
      id: 'ntf-pay-1',
      employeeId: 'emp-hr-admin',
      title: 'Salary published',
      message: 'Your payslip for last month has been published by HR.',
      type: 'Salary Published',
      createdAt: bdInstant(shiftDays(today, -1), 18 * 60),
      read: false,
      emailStatus: 'Sent',
      category: 'general',
    },
    {
      id: 'ntf-approvals-1',
      employeeId: 'emp-hr-admin',
      title: 'New signup approval required',
      message: 'Three new employee registrations are waiting in the approval queue.',
      type: 'HR Announcement',
      createdAt: bdInstant(today, 8 * 60),
      read: false,
      emailStatus: 'Not Required',
      category: 'general',
    },
  );

  /* ---------------- announcements ---------------- */
  const announcements: Announcement[] = [
    {
      id: 'ann-1',
      title: 'Eid holiday — office closed',
      body: 'The office will remain closed for two days on Eid. Department heads should publish the roster before the closure.',
      type: 'Holiday Notice',
      audience: 'all',
      audienceLabel: 'All Employees',
      attachmentName: null,
      status: 'Published',
      publishAt: null,
      publishedAt: bdInstant(shiftDays(today, -2), 12 * 60),
      emailNotification: true,
      recipients: employees.map((e) => e.id),
      createdAt: bdInstant(shiftDays(today, -3), 15 * 60),
      createdBy: 'Sabrina Rahman',
    },
    {
      id: 'ann-2',
      title: 'Attendance verification policy',
      body:
        'Office verification runs on the office network public IP, with a 50 metre GPS geofence as a fallback. Verification must complete within one minute of the scheduled shift start.',
      type: 'Attendance Notice',
      audience: 'all',
      audienceLabel: 'All Employees',
      attachmentName: null,
      status: 'Published',
      publishAt: null,
      publishedAt: bdInstant(shiftDays(today, -4), 10 * 60),
      emailNotification: true,
      recipients: employees.map((e) => e.id),
      createdAt: bdInstant(shiftDays(today, -5), 16 * 60),
      createdBy: 'Farhana Akter',
    },
    {
      id: 'ann-3',
      title: 'Late evening handover note',
      body: 'Late evening staff: the work-from-home shift starts automatically at 6:00 PM and ends at 1:00 AM. No office verification is required.',
      type: 'Important Office Notice',
      audience: 'department',
      audienceLabel: 'Sales Team',
      attachmentName: null,
      status: 'Scheduled',
      publishAt: bdInstant(shiftDays(today, 1), 10 * 60),
      publishedAt: null,
      emailNotification: false,
      recipients: employees
        .filter((e) => e.departmentName === 'Sales Team')
        .map((e) => e.id),
      createdAt: bdInstant(today, 9 * 60),
      createdBy: 'Farhana Akter',
    },
    {
      id: 'ann-4',
      title: 'Draft — new leave policy',
      body: 'Draft of the revised casual leave policy for the next review cycle.',
      type: 'General HR Announcement',
      audience: 'all',
      audienceLabel: 'All Employees',
      attachmentName: null,
      status: 'Draft',
      publishAt: null,
      publishedAt: null,
      emailNotification: false,
      recipients: [],
      createdAt: bdInstant(today, 11 * 60),
      createdBy: 'Farhana Akter',
    },
  ];

  /* ---------------- signup approvals ---------------- */
  const signups: PendingSignup[] = [
    {
      id: 'sg-1',
      fullName: 'Jannatul Ferdous',
      mobile: '+8801811002201',
      employeeId: 'BRN-017',
      designation: 'Customer Relationship Officer',
      email: 'jannatul.ferdous@gmail.com',
      departmentName: 'Sales Team',
      subDepartmentName: 'Direct Sales',
      reportingManager: 'Mayin Bhuiyan',
      joiningDate: shiftDays(today, 5),
      submittedAt: bdInstant(shiftDays(today, -1), 14 * 60),
      status: 'Pending',
      reviewNote: null,
      salary: null,
      decidedAt: null,
      decidedBy: null,
    },
    {
      id: 'sg-2',
      fullName: 'Shahriar Hasan',
      mobile: '+8801811002202',
      employeeId: 'BRN-018',
      designation: 'Media Buying Executive',
      email: 'shahriar.hasan@gmail.com',
      departmentName: 'Digital Marketing',
      subDepartmentName: null,
      reportingManager: 'Mohiuddin Ahmed',
      joiningDate: shiftDays(today, 9),
      submittedAt: bdInstant(today, 9 * 60 + 20),
      status: 'Pending',
      reviewNote: null,
      salary: null,
      decidedAt: null,
      decidedBy: null,
    },
    {
      id: 'sg-3',
      fullName: 'Mehedi Hasan',
      mobile: '+8801811002203',
      employeeId: 'BRN-019',
      designation: 'Supply Chain Executive',
      email: 'mehedi.hasan@gmail.com',
      departmentName: 'Supply Chain',
      subDepartmentName: null,
      reportingManager: 'Shohid Hossain',
      joiningDate: shiftDays(today, 12),
      submittedAt: bdInstant(shiftDays(today, -2), 11 * 60 + 10),
      status: 'Pending',
      reviewNote: null,
      salary: null,
      decidedAt: null,
      decidedBy: null,
    },
    {
      id: 'sg-4',
      fullName: 'Rumana Islam',
      mobile: '+8801811002204',
      employeeId: 'BRN-020',
      designation: 'Accounts Executive',
      email: 'rumana.islam@gmail.com',
      departmentName: 'Accounts',
      subDepartmentName: null,
      reportingManager: 'Abdul Jalil',
      joiningDate: shiftDays(today, -30),
      submittedAt: bdInstant(shiftDays(today, -33), 10 * 60),
      status: 'Approved',
      reviewNote: null,
      salary: 26000,
      decidedAt: bdInstant(shiftDays(today, -32), 15 * 60),
      decidedBy: 'Sabrina Rahman',
    },
    {
      id: 'sg-5',
      fullName: 'Imran Kabir',
      mobile: '+8801811002205',
      employeeId: 'BRN-021',
      designation: 'Creative Designer',
      email: 'imran.kabir@gmail.com',
      departmentName: 'Digital Marketing',
      subDepartmentName: null,
      reportingManager: 'Mohiuddin Ahmed',
      joiningDate: shiftDays(today, -20),
      submittedAt: bdInstant(shiftDays(today, -24), 12 * 60),
      status: 'Declined',
      reviewNote: 'Employee ID BRN-021 is already registered. Please verify the employee ID.',
      salary: null,
      decidedAt: bdInstant(shiftDays(today, -23), 14 * 60),
      decidedBy: 'Farhana Akter',
    },
  ];

  /* ---------------- roster change requests ---------------- */
  const rosterChangeRequests = [
    {
      id: 'rcr-1',
      employeeId: 'emp-rabbi',
      employeeName: 'Rabbi Hossain',
      type: 'Off Day Change' as const,
      currentDate: shiftDays(today, 2),
      currentShift: 'EVENING_E1' as ShiftCode,
      currentShiftName: 'Evening Shift E2 (Office)',
      requestedDate: shiftDays(today, 5),
      requestedShift: null,
      requestedShiftName: null,
      reason: 'Family event that day — request to swap the weekly off.',
      status: 'Pending' as const,
      updateMode: null,
      rosterUpdated: false,
      note: null,
      createdAt: bdInstant(today, 10 * 60),
      decidedAt: null,
      decidedBy: null,
    },
    {
      id: 'rcr-2',
      employeeId: 'emp-sabbir-ahamed',
      employeeName: 'Sabbir Ahamed',
      type: 'Shift Change' as const,
      currentDate: shiftDays(today, 1),
      currentShift: 'MORNING' as ShiftCode,
      currentShiftName: 'Morning Shift (Office)',
      requestedDate: shiftDays(today, 1),
      requestedShift: 'LATE_EVENING' as ShiftCode,
      requestedShiftName: 'Late Evening Shift (Work From Home)',
      reason: 'Doctor appointment in the morning.',
      status: 'Approved' as const,
      updateMode: 'AUTO' as const,
      rosterUpdated: true,
      note: 'Roster updated automatically on approval.',
      createdAt: bdInstant(shiftDays(today, -1), 16 * 60),
      decidedAt: bdInstant(shiftDays(today, -1), 17 * 60),
      decidedBy: 'Farhana Akter',
    },
  ];

  /* ---------------- audit log ---------------- */
  const auditLogs: AuditLog[] = [
    {
      id: 'aud-1',
      actor: 'Sabrina Rahman',
      actorRole: 'SUPER_ADMIN',
      action: 'roster.publish',
      entity: 'roster',
      entityId: 'roster-next',
      before: null,
      after: 'version 1 published',
      note: 'Roster published for the week starting next Monday.',
      createdAt: bdInstant(today, 9 * 60),
    },
    {
      id: 'aud-2',
      actor: 'Farhana Akter',
      actorRole: 'HR_MANAGER',
      action: 'leave.approve',
      entity: 'leave',
      entityId: 'lv-2',
      before: 'Pending',
      after: 'Approved',
      note: null,
      createdAt: bdInstant(shiftDays(today, -6), 11 * 60 + 32),
    },
    {
      id: 'aud-3',
      actor: 'Sabrina Rahman',
      actorRole: 'SUPER_ADMIN',
      action: 'attendance.review',
      entity: 'attendance',
      entityId: `att-${shiftDays(today, -1)}-emp-rabbi`,
      before: 'Verification Failed',
      after: 'Late',
      note: 'Employee reached the office after the verification window; manual approval granted.',
      createdAt: bdInstant(shiftDays(today, -1), 12 * 60),
    },
    {
      id: 'aud-4',
      actor: 'Farhana Akter',
      actorRole: 'HR_MANAGER',
      action: 'signup.decline',
      entity: 'signup',
      entityId: 'sg-5',
      before: 'Pending',
      after: 'Declined',
      note: 'Employee ID BRN-021 is already registered.',
      createdAt: bdInstant(shiftDays(today, -23), 14 * 60),
    },
    {
      id: 'aud-5',
      actor: 'Sabrina Rahman',
      actorRole: 'SUPER_ADMIN',
      action: 'payroll.publish',
      entity: 'payroll',
      entityId: monthKey(shiftDays(today, -32)),
      before: null,
      after: 'published',
      note: 'Monthly payroll published to employees.',
      createdAt: bdInstant(shiftDays(today, -30), 12 * 60),
    },
  ];

  /* ---------------- staffing rules ---------------- */
  const staffingRules: StaffingRule[] = [
    { id: 'sr-1', departmentId: 'dep-sales-team', shiftCode: 'MORNING', minEmployees: 3 },
    { id: 'sr-2', departmentId: 'dep-sales-team', shiftCode: 'EVENING_E1', minEmployees: 4 },
    { id: 'sr-3', departmentId: 'dep-hr', shiftCode: 'EVENING_E1', minEmployees: 3 },
    { id: 'sr-4', departmentId: 'dep-hr', shiftCode: 'MORNING', minEmployees: 2 },
    { id: 'sr-5', departmentId: 'dep-accounts', shiftCode: 'MORNING', minEmployees: 2 },
    { id: 'sr-6', departmentId: 'dep-supply-chain', shiftCode: 'MORNING', minEmployees: 2 },
    { id: 'sr-7', departmentId: 'dep-digital-marketing', shiftCode: 'MORNING', minEmployees: 2 },
  ];

  const settings: CompanySettings = {
    companyName: 'BRONEE Limited',
    timezone: 'Asia/Dhaka',
    officePublicIps: ['203.0.113.24', '198.51.100.7'],
    officeLat: 23.8103,
    officeLng: 90.4125,
    geofenceRadiusM: 50,
    otRatePerHour: 70,
    payrollApprovedBy: 'Sabrina Rahman',
    lateGraceMinutes: 1,
  };

  return {
    departments,
    designations,
    employees,
    signups,
    rosterVersions,
    rosterEntries,
    rosterChangeRequests,
    rosterChangeLog: [],
    attendance,
    breaks,
    leaves,
    overtime,
    tasks,
    salaries,
    notifications,
    announcements,
    auditLogs,
    staffingRules,
    settings,
    otpCodes: [],
    signupSheetRows: [],
    sessions: [],
    syncLogs: [
      {
        id: 'sync-1',
        sheet: 'Task Management · Management System',
        direction: 'PULL',
        status: 'Success',
        records: TASK_SEED_ROWS.length,
        message: 'Task rows imported from the Task Management spreadsheet.',
        createdAt: bdInstant(today, 7 * 60),
      },
      {
        id: 'sync-2',
        sheet: 'Main HRMS · LeaveApplications',
        direction: 'PULL',
        status: 'Success',
        records: leaves.length,
        message: 'Leave applications imported from the main HRMS spreadsheet.',
        createdAt: bdInstant(today, 7 * 60 + 5),
      },
      {
        id: 'sync-3',
        sheet: 'Main HRMS · HR_Users',
        direction: 'PULL',
        status: 'Partial',
        records: 1,
        message:
          'HR_Users contains a plaintext password column. The row was skipped — credentials must be hashed in D1.',
        createdAt: bdInstant(today, 7 * 60 + 8),
      },
    ],
  };
}

export { SEED_EMPLOYEES };

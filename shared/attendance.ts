/**
 * BRONEE HRMS — attendance, shift and payroll calculation engine.
 *
 * This module is the single implementation of the rules in §6–§9 of the
 * specification. The Cloudflare Worker imports it directly, and the local
 * demo adapter imports the exact same file, so both behave identically.
 *
 * Timestamps are stored as ISO/UTC strings. Bangladesh is a fixed UTC+6 with
 * no daylight saving, which keeps the conversion exact and auditable.
 */

import {
  SHIFT_BY_CODE,
  VERIFICATION,
  attendanceBonusFor,
  type ShiftCode,
  type ShiftSeed,
  type VerificationMethod,
  type VerificationResult,
} from './constants';

export const BD_OFFSET_MINUTES = 6 * 60;
const MINUTES_PER_DAY = 1440;

/* ------------------------------------------------------------------ *
 * Bangladesh time helpers
 * ------------------------------------------------------------------ */

/** Absolute minute index (from a fixed epoch) for a Bangladesh wall-clock time. */
function bdDayIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 60000;
}

/** `YYYY-MM-DD` → absolute Bangladesh minute index. */
export function bdDateStart(dateKey: string): number {
  return bdDayIndex(dateKey);
}

/**
 * ISO/UTC instant for a Bangladesh wall-clock time on `dateKey`.
 * `minutes` is past local midnight; `nextDay` rolls into the following day.
 */
export function bdInstant(dateKey: string, minutes: number, nextDay = false): string {
  const total = bdDayIndex(dateKey) + minutes + (nextDay ? MINUTES_PER_DAY : 0) - BD_OFFSET_MINUTES;
  return new Date(total * 60000).toISOString();
}

/** Bangladesh wall-clock minutes past midnight for an ISO instant. */
export function bdMinutesOf(iso: string): number {
  const t = new Date(iso).getTime();
  const shifted = new Date(t + BD_OFFSET_MINUTES * 60000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** `YYYY-MM-DD` in Bangladesh time for an ISO instant. */
export function bdDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + BD_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` in Bangladesh time for any instant or date-key. */
export function bdDateKey(value: Date | string = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Date(date.getTime() + BD_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);
}

/** Difference in minutes between two ISO instants. */
export function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

/** Difference in seconds between two ISO instants. */
export function secondsBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
}

/* ------------------------------------------------------------------ *
 * Shift schedule
 * ------------------------------------------------------------------ */

export interface ScheduledSegment {
  name: string;
  workLocation: 'OFFICE' | 'HOME';
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  endNextDay: boolean;
}

export interface ShiftSchedule {
  shiftCode: ShiftCode;
  shiftName: string;
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  endNextDay: boolean;
  workLocation: 'OFFICE' | 'HOME';
  officeVerification: boolean;
  segments: ScheduledSegment[];
}

/** Resolve the concrete schedule of a shift on a given work date. */
export function scheduleFor(shiftCode: ShiftCode, workDate: string): ShiftSchedule {
  const shift: ShiftSeed = SHIFT_BY_CODE[shiftCode];
  const segment: ScheduledSegment = {
    name: shift.workLocation === 'HOME' ? 'Home Segment' : 'Office Segment',
    workLocation: shift.workLocation,
    // The shift always starts on the work date. `endNextDay` only moves the
    // end of the shift into the next calendar day.
    start: bdInstant(workDate, shift.startMinutes),
    end: bdInstant(workDate, shift.endMinutes, shift.endNextDay),
    startMinutes: shift.startMinutes,
    endMinutes: shift.endMinutes,
    endNextDay: shift.endNextDay,
  };

  return {
    shiftCode,
    shiftName: shift.name,
    start: segment.start,
    end: segment.end,
    startMinutes: shift.startMinutes,
    endMinutes: shift.endMinutes,
    endNextDay: shift.endNextDay,
    workLocation: shift.workLocation,
    officeVerification: shift.officeVerification,
    segments: [segment],
  };
}

/* ------------------------------------------------------------------ *
 * Verification (§6.3 – §6.5)
 * ------------------------------------------------------------------ */

export interface VerificationInput {
  schedule: ShiftSchedule;
  /** ISO instant the employee punched in. */
  punchIn: string;
  /** ISO instant the verification attempt completed (server clock). */
  verifiedAt: string;
  officeIpMatched: boolean;
  gpsLat?: number | null;
  gpsLng?: number | null;
  gpsAccuracy?: number | null;
  officeLat?: number;
  officeLng?: number;
}

export interface VerificationOutcome {
  result: VerificationResult;
  method: VerificationMethod;
  /** ISO instant the working timer starts from, or null when it must not start. */
  workingStart: string | null;
  lateStatus: 'Not Late' | 'Pending Review' | 'Late';
  attendanceStatus:
    | 'Verified'
    | 'Pending Review'
    | 'Verification Failed'
    | 'Pre-Clocked In'
    | 'Awaiting Verification';
  withinWindow: boolean;
  message: string;
}

/** Great-circle distance in metres between two coordinates. */
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ------------------------------------------------------------------ *
 * Pre-clock-in (§6.2)
 * ------------------------------------------------------------------ */

/** Minutes from `at` until the scheduled shift start — negative when past. */
export function minutesUntilStart(schedule: ShiftSchedule, at: string): number {
  return Math.round((Date.parse(schedule.start) - Date.parse(at)) / 60000);
}

/**
 * The pre-clock-in window of §6.2: the employee may punch in 10 to 15
 * minutes before the scheduled shift start. The punch timestamp is stored,
 * no verification runs and the working timer does not start.
 */
export function isPreClockInWindow(schedule: ShiftSchedule, at: string): boolean {
  const minutes = minutesUntilStart(schedule, at);
  return minutes >= VERIFICATION.PRE_CLOCK_IN_MIN && minutes <= VERIFICATION.PRE_CLOCK_IN_MAX;
}

/** A punch earlier than the pre-clock-in window is rejected. */
export function isTooEarlyForPunchIn(schedule: ShiftSchedule, at: string): boolean {
  return minutesUntilStart(schedule, at) > VERIFICATION.PRE_CLOCK_IN_MAX;
}

/** The outcome of a punch taken before the scheduled shift start. */
export function evaluatePreClockIn(schedule: ShiftSchedule, punchIn: string): VerificationOutcome {
  const minutes = minutesUntilStart(schedule, punchIn);
  return {
    result: 'PENDING',
    method: 'NONE',
    workingStart: null,
    lateStatus: 'Not Late',
    attendanceStatus: 'Pre-Clocked In',
    withinWindow: false,
    message: `Pre-clock-in recorded ${minutes} minutes before the scheduled shift start. The system verifies the office network or the office location automatically when your shift starts.`,
  };
}

/**
 * Office Wi-Fi public-IP match or GPS geofence match — either one is enough (§6.3).
 *
 * The office network is always tried first; GPS is only used when the public
 * IP does not match. The GPS fix must be inside the 50 metre geofence and its
 * accuracy radius has to be acceptable.
 */
export function matchOfficeVerification(input: VerificationInput): VerificationMethod | null {
  if (input.officeIpMatched) return 'OFFICE_IP';
  if (
    input.gpsLat != null &&
    input.gpsLng != null &&
    input.officeLat != null &&
    input.officeLng != null &&
    input.gpsAccuracy != null &&
    input.gpsAccuracy <= VERIFICATION.MAX_GPS_ACCURACY_M
  ) {
    const distance = distanceMetres(input.gpsLat, input.gpsLng, input.officeLat, input.officeLng);
    if (distance <= VERIFICATION.GEOFENCE_RADIUS_M) return 'GPS';
  }
  return null;
}

/**
 * Full verification decision (§6.3 – §6.5).
 *
 * `punchIn` is the stored punch timestamp, `verifiedAt` is the moment the
 * verification attempt completed. The working timer is counted from the
 * scheduled shift start — never from the punch and never from the moment the
 * verification finished.
 */
export function evaluateVerification(input: VerificationInput): VerificationOutcome {
  const { schedule, punchIn, verifiedAt } = input;
  const windowEnd = addMinutesIso(schedule.start, VERIFICATION.WINDOW_MINUTES);
  const verifiedMs = Date.parse(verifiedAt);
  const windowEndMs = Date.parse(windowEnd);

  if (!schedule.officeVerification) {
    // Work-from-home shift: no office verification gate (§6.7).
    const workingStart = punchIn <= schedule.start ? schedule.start : punchIn;
    const late = verifiedMs > windowEndMs;
    return {
      result: 'SUCCESS',
      method: 'NONE',
      workingStart,
      lateStatus: late ? 'Late' : 'Not Late',
      attendanceStatus: 'Verified',
      withinWindow: verifiedMs <= windowEndMs,
      message: late
        ? 'Clocked in after the shift start — recorded as late.'
        : 'Clocked in on time. Work-from-home shift needs no office verification.',
    };
  }

  const matched = matchOfficeVerification(input);

  if (!matched) {
    // The verification window is still open — the system keeps checking and
    // only closes the record once the first minute of the shift has passed.
    if (verifiedMs < windowEndMs) {
      return {
        result: 'PENDING',
        method: 'NONE',
        workingStart: null,
        lateStatus: 'Not Late',
        attendanceStatus: 'Awaiting Verification',
        withinWindow: true,
        message:
          'Office verification has not succeeded yet. The system keeps checking the office network and the office location until the end of the first minute of the shift.',
      };
    }
    return {
      result: 'FAILED',
      method: 'NONE',
      workingStart: null,
      lateStatus: 'Pending Review',
      attendanceStatus: 'Verification Failed',
      withinWindow: false,
      message:
        'Office verification failed. The working timer stays stopped until an HR review or exception approval.',
    };
  }

  if (verifiedMs <= windowEndMs) {
    return {
      result: 'SUCCESS',
      method: matched,
      workingStart: schedule.start,
      lateStatus: 'Not Late',
      attendanceStatus: 'Verified',
      withinWindow: true,
      message: `Verified via ${matched === 'OFFICE_IP' ? 'office network' : 'office GPS'}. Working time counted from the scheduled shift start.`,
    };
  }

  // Verified after the window — HR must review before the timer may start.
  return {
    result: 'SUCCESS',
    method: matched,
    workingStart: null,
    lateStatus: 'Pending Review',
    attendanceStatus: 'Pending Review',
    withinWindow: false,
    message:
      'Verified after the 1-minute window. The record is held for HR review before the working timer starts.',
  };
}

/* ------------------------------------------------------------------ *
 * Working time
 * ------------------------------------------------------------------ */

export interface WorkingSlice {
  start: string;
  end: string;
}

/**
 * Total working seconds of one or more work slices.
 *
 * The break time is tracked on its own, so it is not subtracted here — the
 * working counter keeps running while the employee is on a break.
 */
export function totalWorkingSeconds(slices: WorkingSlice[], breaks: WorkingSlice[]): number {
  const merged = [...slices].sort((a, b) => a.start.localeCompare(b.start));
  let total = 0;
  for (const slice of merged) {
    const sliceStart = new Date(slice.start).getTime();
    const sliceEnd = new Date(slice.end).getTime();
    let working = sliceEnd - sliceStart;
    for (const brk of breaks) {
      const bStart = new Date(brk.start).getTime();
      const bEnd = new Date(brk.end).getTime();
      const overlapStart = Math.max(sliceStart, bStart);
      const overlapEnd = Math.min(sliceEnd, bEnd);
      if (overlapEnd > overlapStart) working -= overlapEnd - overlapStart;
    }
    total += Math.max(0, working);
  }
  return Math.round(total / 1000);
}

/** Add minutes to an ISO instant. */
export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

/* ------------------------------------------------------------------ *
 * Automatic clock out (§6.8)
 * ------------------------------------------------------------------ */

export interface ClosedSession {
  /** ISO instant the working timer started. */
  workingStart: string;
  /** ISO instant the session is closed at. */
  clockOut: string;
  /** Every break slice of the day. */
  breaks: WorkingSlice[];
}

export interface ClosedSessionResult {
  totalWorkingSeconds: number;
  breakSeconds: number;
}

/**
 * Working seconds of a closed session.
 *
 * The break time is tracked on its own — the working counter keeps running
 * while the employee is on a break, so the break is never subtracted here.
 * The same helper closes a manual clock out and the automatic clock out at
 * the scheduled shift end.
 */
export function computeClosedSession(input: ClosedSession): ClosedSessionResult {
  const breakSeconds = input.breaks.reduce((sum, b) => sum + secondsBetween(b.start, b.end), 0);
  const totalWorkingSeconds = Math.max(0, secondsBetween(input.workingStart, input.clockOut));
  return { totalWorkingSeconds, breakSeconds };
}

/** Whole minutes between two instants — used for the overtime session. */
export function minutesBetweenInstants(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
}

/* ------------------------------------------------------------------ *
 * Late status & bonus (§6.5, §8)
 * ------------------------------------------------------------------ */

/**
 * Final late determination uses only HR-approved attendance records.
 * The system never auto-marks a failed verification as a final late (§6.5).
 */
export function resolveLateStatus(
  attendanceStatus: string,
  reviewStatus: string,
): 'Not Late' | 'Late' | 'Excused' | 'Pending Review' {
  if (reviewStatus === 'Approved' || reviewStatus === 'Excused') {
    return reviewStatus === 'Excused' ? 'Excused' : 'Late';
  }
  if (attendanceStatus === 'Verification Failed' || attendanceStatus === 'Pending Review') return 'Pending Review';
  if (attendanceStatus === 'Excused') return 'Excused';
  return 'Not Late';
}

/** Attendance bonus for a monthly late-day count (§8). */
export function bonusForLateDays(lateDays: number) {
  const tier = attendanceBonusFor(lateDays);
  return { amount: tier.amount, label: tier.label };
}

/* ------------------------------------------------------------------ *
 * Payroll (§12)
 * ------------------------------------------------------------------ */

export interface PayrollInput {
  basicSalary: number;
  allowances: number;
  approvedOvertimeMinutes: number;
  lateDays: number;
  otRatePerHour: number;
  deductions?: number;
}

export interface PayrollResult {
  basicSalary: number;
  allowances: number;
  overtimePayment: number;
  bonusAmount: number;
  deductions: number;
  netPayable: number;
  lateDays: number;
}

/** Monthly payroll — overtime is paid only for HR-approved time (§9, §12). */
export function computePayroll(input: PayrollInput): PayrollResult {
  const overtimePayment = Math.round((input.approvedOvertimeMinutes / 60) * input.otRatePerHour);
  const bonusAmount = attendanceBonusFor(input.lateDays).amount;
  const gross = input.basicSalary + input.allowances + overtimePayment + bonusAmount;
  const deductions = input.deductions ?? 0;
  return {
    basicSalary: input.basicSalary,
    allowances: input.allowances,
    overtimePayment,
    bonusAmount,
    deductions,
    netPayable: Math.max(0, gross - deductions),
    lateDays: input.lateDays,
  };
}

/* ------------------------------------------------------------------ *
 * Roster conflicts (§15.3 E)
 * ------------------------------------------------------------------ */

export interface StaffingCheck {
  departmentName: string;
  shiftCode: ShiftCode;
  /** The roster day this check applies to. */
  date: string;
  required: number;
  assigned: number;
  shortfall: number;
}

/** Compare roster staffing against the configured minimum staffing rules. */
export function evaluateStaffing(
  assignments: { departmentName: string; shiftCode: ShiftCode; date: string }[],
  rules: { departmentId: string; shiftCode: ShiftCode; minEmployees: number }[],
  departmentNameById: Record<string, string>,
): StaffingCheck[] {
  const dates = Array.from(new Set(assignments.map((a) => a.date))).sort();
  const checks: StaffingCheck[] = [];

  for (const rule of rules) {
    const departmentName = departmentNameById[rule.departmentId] ?? rule.departmentId;
    for (const date of dates) {
      const assigned = assignments.filter(
        (a) =>
          a.departmentName === departmentName &&
          a.shiftCode === rule.shiftCode &&
          a.date === date,
      ).length;
      checks.push({
        departmentName,
        shiftCode: rule.shiftCode,
        date,
        required: rule.minEmployees,
        assigned,
        shortfall: Math.max(0, rule.minEmployees - assigned),
      });
    }
  }

  return checks;
}

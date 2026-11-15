/**
 * BRONEE HRMS — server side attendance engine (§6.2 – §6.8).
 *
 * The rules implemented here are the same ones the web app shows:
 *
 *   • a pre-clock-in stores the punch timestamp but starts no timer,
 *   • the office verification runs automatically at the scheduled shift start,
 *   • the working timer is counted from the scheduled shift start,
 *   • the working session closes automatically at the scheduled shift end and
 *     an approved overtime session takes over from there.
 *
 * The employee route and the scheduled trigger both use this module, so the
 * behaviour is identical whether the browser is open or not.
 */

import { and, eq } from 'drizzle-orm';
import {
  computeClosedSession,
  evaluateVerification,
  minutesBetweenInstants,
  scheduleFor,
  type ShiftSchedule,
  type VerificationOutcome,
} from '../../../shared/attendance';
import {
  attendanceSessions,
  breakSessions,
  overtimeRequests,
} from '../db/schema';

export interface GpsFix {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

export interface OfficeConfig {
  officePublicIps: string[];
  officeLat: number;
  officeLng: number;
  geofenceRadiusM: number;
}

/** Reads the office configuration stored in the company settings table. */
export async function readOfficeConfig(database: any): Promise<OfficeConfig> {
  const rows = (await database.query.companySettings.findMany()) as Array<{
    key: string;
    value: string;
  }>;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    officePublicIps: (map.officePublicIps ?? '')
      .split(',')
      .map((ip: string) => ip.trim())
      .filter(Boolean),
    officeLat: Number(map.officeLat ?? 23.8103),
    officeLng: Number(map.officeLng ?? 90.4125),
    geofenceRadiusM: Number(map.geofenceRadiusM ?? 50),
  };
}

/**
 * The office check runs on the public IP of the office connection.
 * A browser cannot read the Wi-Fi SSID, so the backend compares the public IP.
 */
export function officeIpCheck(request: Request, officeIps: string[]): boolean {
  if (!officeIps.length) return false;
  const forwarded = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For');
  const ip = forwarded?.split(',')[0]?.trim();
  return Boolean(ip && officeIps.includes(ip));
}

/**
 * Runs the office verification and writes the outcome onto the session row.
 *
 * The punch timestamp and the moment the verification completed are stored
 * separately, and the working timer is only started when the verification
 * succeeded inside the one-minute verification window.
 */
export async function applyVerification(
  database: any,
  session: any,
  schedule: ShiftSchedule,
  verifiedAt: string,
  gps: GpsFix,
  office: OfficeConfig,
  officeIpMatched: boolean,
): Promise<VerificationOutcome> {
  const outcome = evaluateVerification({
    schedule,
    punchIn: session.punchIn ?? verifiedAt,
    verifiedAt,
    officeIpMatched,
    gpsLat: gps.latitude,
    gpsLng: gps.longitude,
    gpsAccuracy: gps.accuracy,
    officeLat: office.officeLat,
    officeLng: office.officeLng,
  });

  const patch: Record<string, unknown> = {
    verificationResult: outcome.result,
    verificationMethod: outcome.method,
    attendanceStatus: outcome.attendanceStatus,
    lateStatus: outcome.lateStatus,
    officeIpMatch: officeIpMatched ? 1 : null,
  };

  if (gps.latitude != null && gps.longitude != null) {
    patch.gpsLat = gps.latitude;
    patch.gpsLng = gps.longitude;
    patch.gpsAccuracy = gps.accuracy;
  }

  if (outcome.result === 'SUCCESS') {
    patch.verificationCompletedAt = verifiedAt;
    patch.actualWorkingStart = outcome.workingStart;
  } else if (outcome.result === 'FAILED') {
    patch.verificationCompletedAt = verifiedAt;
  }

  await database.update(attendanceSessions).set(patch).where(eq(attendanceSessions.id, session.id));
  Object.assign(session, patch);
  return outcome;
}

/** ISO instant of the approved overtime start on the work date. */
export function overtimeStartInstant(
  schedule: ShiftSchedule,
  workDate: string,
  approvedStart: string,
): string {
  const [hours, minutes] = approvedStart.split(':').map(Number);
  let total = (hours || 0) * 60 + (minutes || 0);
  const shiftEndMinutes = schedule.endMinutes + (schedule.endNextDay ? 1440 : 0);
  if (total < shiftEndMinutes) total += 1440;
  const [year, month, day] = workDate.split('-').map(Number);
  const base = Date.UTC(year, month - 1, day) / 60000;
  return new Date((base + total - 6 * 60) * 60000).toISOString();
}

/**
 * Automatic clock out at the scheduled shift end (§6.8).
 *
 * The working session closes, an open break is closed and — when HR approved
 * overtime for the day — an overtime session starts instead of a full clock out.
 */
export async function autoClockOut(
  database: any,
  session: any,
  schedule: ShiftSchedule,
  at: string,
): Promise<'CLOSED' | 'OVERTIME' | null> {
  if (!session.actualWorkingStart || session.clockOut) return null;
  if (Date.parse(at) < Date.parse(schedule.end)) return null;

  const breaks = await database.query.breakSessions.findMany({
    where: and(
      eq(breakSessions.employeeId, session.employeeId),
      eq(breakSessions.workDate, session.workDate),
    ),
  });
  const openBreak = breaks.find((b: { endAt?: string | null }) => !b.endAt);
  if (openBreak) {
    await database
      .update(breakSessions)
      .set({
        endAt: schedule.end,
        durationSeconds: Math.max(
          0,
          Math.round((Date.parse(schedule.end) - Date.parse(openBreak.startAt)) / 1000),
        ),
        closedBy: 'SYSTEM',
      })
      .where(eq(breakSessions.id, openBreak.id));
    openBreak.endAt = schedule.end;
  }

  const closedBreaks = breaks
    .filter((b: { endAt?: string | null }) => b.endAt)
    .map((b: { startAt: string; endAt: string }) => ({ start: b.startAt, end: b.endAt }));

  const approved = await database.query.overtimeRequests.findFirst({
    where: and(
      eq(overtimeRequests.employeeId, session.employeeId),
      eq(overtimeRequests.workDate, session.workDate),
      eq(overtimeRequests.status, 'Approved'),
    ),
  });

  if (approved?.approvedStart) {
    const overtimeStart = overtimeStartInstant(schedule, session.workDate, approved.approvedStart);
    if (Date.parse(at) >= Date.parse(overtimeStart)) {
      const working = computeClosedSession({
        workingStart: session.actualWorkingStart,
        clockOut: overtimeStart,
        breaks: closedBreaks,
      });
      await database
        .update(attendanceSessions)
        .set({ overtimeStartedAt: overtimeStart, totalWorkingSeconds: working.totalWorkingSeconds })
        .where(eq(attendanceSessions.id, session.id));
      session.overtimeStartedAt = overtimeStart;
      session.totalWorkingSeconds = working.totalWorkingSeconds;
      return 'OVERTIME';
    }
  }

  const working = computeClosedSession({
    workingStart: session.actualWorkingStart,
    clockOut: schedule.end,
    breaks: closedBreaks,
  });
  await database
    .update(attendanceSessions)
    .set({ clockOut: schedule.end, totalWorkingSeconds: working.totalWorkingSeconds })
    .where(eq(attendanceSessions.id, session.id));
  session.clockOut = schedule.end;
  session.totalWorkingSeconds = working.totalWorkingSeconds;
  return 'CLOSED';
}

/**
 * One automatic attendance step: the automatic clock in at the shift start and
 * the automatic clock out at the shift end.
 */
export async function runAutoAttendance(
  database: any,
  session: any,
  schedule: ShiftSchedule,
  at: string,
  gps: GpsFix,
  office: OfficeConfig,
  officeIpMatched: boolean,
  graceMs = 0,
): Promise<{ changed: 'CLOCKED_IN' | 'CLOCKED_OUT' | null; message: string; outcome: VerificationOutcome | null }> {
  let changed: 'CLOCKED_IN' | 'CLOCKED_OUT' | null = null;
  let message = 'No attendance change.';
  let outcome: VerificationOutcome | null = null;

  if (session.punchIn && !session.actualWorkingStart && !session.verificationCompletedAt) {
    if (Date.parse(at) >= Date.parse(schedule.start) + graceMs) {
      outcome = await applyVerification(
        database,
        session,
        schedule,
        at,
        gps,
        office,
        officeIpMatched,
      );
      message = outcome.message;
      if (outcome.result === 'SUCCESS') changed = 'CLOCKED_IN';
    }
  }

  if (session.actualWorkingStart && !session.clockOut) {
    const closed = await autoClockOut(database, session, schedule, at);
    if (closed === 'CLOSED') {
      changed = 'CLOCKED_OUT';
      message = 'The scheduled shift ended — the working session was closed automatically.';
    } else if (closed === 'OVERTIME') {
      changed = 'CLOCKED_OUT';
      message = 'The scheduled shift ended — the approved overtime session has started.';
    }
  }

  return { changed, message, outcome };
}

/** Closes an approved overtime session and stores the minutes actually worked. */
export async function closeOvertimeSession(
  database: any,
  session: any,
  clockOut: string,
): Promise<void> {
  if (!session.overtimeStartedAt) return;
  const approved = await database.query.overtimeRequests.findFirst({
    where: and(
      eq(overtimeRequests.employeeId, session.employeeId),
      eq(overtimeRequests.workDate, session.workDate),
      eq(overtimeRequests.status, 'Approved'),
    ),
  });
  if (!approved) return;
  await database
    .update(overtimeRequests)
    .set({ actualMinutes: minutesBetweenInstants(session.overtimeStartedAt, clockOut) })
    .where(eq(overtimeRequests.id, approved.id));
}

export { scheduleFor };

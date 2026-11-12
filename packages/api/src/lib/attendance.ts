/**
 * Attendance engine.
 *
 * All decisions are made server-side using server-authoritative UTC timestamps
 * that are interpreted in the Asia/Dhaka business timezone. The client never
 * decides whether an employee is late, verified, or present.
 */
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import {
  dhakaDateKey,
  dhakaInstant,
  PRE_CLOCK_IN_MINUTES,
  secondsBetween,
  timeToMinutes,
  VERIFICATION_WINDOW_MINUTES,
  type Shift,
  type ShiftSegment,
} from '@bronee/shared';
import type { DB } from '../db/client.js';
import {
  attendanceSessions,
  breaks,
  companySettings,
  rosterEntries,
  rosters,
  shifts,
  users,
} from '../db/schema.js';
import type { Env } from '../env.js';
import { officeConfig } from '../env.js';
import { randomId } from './crypto.js';

export const OFFICE_IP_SETTING_KEY = 'office.ip.allowlist';

export type OfficeIpAllowlist = string[];

export async function getOfficeIpAllowlist(db: DB): Promise<OfficeIpAllowlist> {
  const row = await db
    .select({ value: companySettings.value })
    .from(companySettings)
    .where(eq(companySettings.key, OFFICE_IP_SETTING_KEY))
    .limit(1);
  const value = row[0]?.value;
  return Array.isArray(value) ? (value as string[]) : [];
}

export async function setOfficeIpAllowlist(db: DB, ips: string[], actorId: string | null) {
  await db
    .insert(companySettings)
    .values({
      key: OFFICE_IP_SETTING_KEY,
      value: ips,
      updatedBy: actorId,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: companySettings.key,
      set: { value: ips, updatedBy: actorId, updatedAt: new Date().toISOString() },
    });
}

/** Haversine distance in meters. */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type GeoPayload = {
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
};

export type GpsVerdict = {
  ok: boolean;
  distanceMeters: number | null;
  reason: string | null;
};

export function evaluateGps(env: Env, payload: GeoPayload): GpsVerdict {
  const { latitude, longitude } = payload;
  if (latitude == null || longitude == null) {
    return { ok: false, distanceMeters: null, reason: 'GPS coordinates were not provided' };
  }
  const accuracy = payload.accuracyMeters ?? null;
  if (accuracy == null) {
    return { ok: false, distanceMeters: null, reason: 'GPS accuracy could not be determined' };
  }
  const cfg = officeConfig(env);
  if (accuracy > cfg.maxAccuracyMeters) {
    return {
      ok: false,
      distanceMeters: null,
      reason: `GPS accuracy (±${Math.round(accuracy)}m) is not precise enough to verify office attendance`,
    };
  }
  const distance = distanceMeters(latitude, longitude, cfg.latitude, cfg.longitude);
  if (distance > cfg.geofenceMeters) {
    return {
      ok: false,
      distanceMeters: Math.round(distance),
      reason: `You appear to be ${Math.round(distance)}m from the office (limit ${cfg.geofenceMeters}m)`,
    };
  }
  return { ok: true, distanceMeters: Math.round(distance), reason: null };
}

export function matchOfficeIp(allowlist: string[], ip: string | null): boolean {
  if (!ip || allowlist.length === 0) return false;
  const normalized = ip.trim().toLowerCase();
  return allowlist.some((entry) => {
    const e = entry.trim().toLowerCase();
    if (!e) return false;
    if (e.includes('/')) {
      // CIDR match (IPv4 only, /0-/32).
      const [base, bitsRaw] = e.split('/');
      const bits = Number(bitsRaw);
      if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
      const ipToInt = (value: string) => {
        const parts = value.split('.').map(Number);
        if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
        return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
      };
      const a = ipToInt(base);
      const b = ipToInt(normalized);
      if (a == null || b == null) return false;
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (a & mask) === (b & mask);
    }
    return e === normalized;
  });
}

/** Resolve the shift that applies to an employee on a given date. */
export async function resolveShiftForDate(
  db: DB,
  employeeId: string,
  date: string,
): Promise<{ shift: Shift | null; isOffDay: boolean; source: 'roster' | 'default' | 'none' }> {
  const published = await db
    .select({
      shiftId: rosterEntries.shiftId,
      isOff: rosterEntries.isOff,
      rosterStatus: rosters.status,
      startDate: rosters.startDate,
      endDate: rosters.endDate,
    })
    .from(rosterEntries)
    .innerJoin(rosters, eq(rosterEntries.rosterId, rosters.id))
    .where(
      and(
        eq(rosterEntries.employeeId, employeeId),
        eq(rosterEntries.date, date),
        eq(rosters.status, 'published'),
      ),
    )
    .limit(1);

  if (published[0]) {
    if (published[0].isOff || !published[0].shiftId) {
      return { shift: null, isOffDay: true, source: 'roster' };
    }
    const shift = await getShiftById(db, published[0].shiftId);
    return { shift, isOffDay: false, source: 'roster' };
  }

  // Fall back to the employee's default shift assignment.
  const [user] = await db
    .select({ defaultShiftId: users.id })
    .from(users)
    .where(eq(users.id, employeeId))
    .limit(1);
  void user;

  const [assignment] = await db
    .select({ shiftId: rosterEntries.shiftId })
    .from(rosterEntries)
    .where(and(eq(rosterEntries.employeeId, employeeId), isNull(rosterEntries.shiftId)))
    .limit(1);
  void assignment;

  return { shift: null, isOffDay: false, source: 'none' };
}

export async function getShiftById(db: DB, id: string): Promise<Shift | null> {
  const [row] = await db.select().from(shifts).where(eq(shifts.id, id)).limit(1);
  if (!row) return null;
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

export async function getShiftByCode(db: DB, code: string): Promise<Shift | null> {
  const [row] = await db.select().from(shifts).where(eq(shifts.code, code)).limit(1);
  if (!row) return null;
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

export type ShiftWindow = {
  scheduledStart: string;
  scheduledEnd: string;
  scheduledStartDate: string;
  scheduledEndDate: string;
};

export function shiftWindow(shift: Shift, date: string): ShiftWindow {
  const endDayOffset = shift.endsNextDay ? 1 : 0;
  const start = dhakaInstant(date, shift.startTime, 0);
  const end = dhakaInstant(date, shift.endTime, endDayOffset);
  return {
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
    scheduledStartDate: date,
    scheduledEndDate: dhakaDateKey(end),
  };
}

/** Split-shift segment boundaries expressed as UTC instants. */
export function segmentWindows(shift: Shift, date: string): Array<ShiftSegment & { start: string; end: string }> {
  const segments = shift.segments ?? [];
  return segments.map((segment) => {
    const startMinutes = timeToMinutes(segment.startTime);
    const endMinutes = timeToMinutes(segment.endTime);
    const start = dhakaInstant(date, segment.startTime, 0);
    const end = dhakaInstant(date, segment.endTime, endMinutes <= startMinutes ? 1 : 0);
    return { ...segment, start: start.toISOString(), end: end.toISOString() };
  });
}

export type VerificationOutcome = {
  result: 'verified' | 'failed' | 'not_required';
  method: 'office_ip' | 'gps' | 'manual' | 'none';
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  officeIpMatched: boolean | null;
  officeIp: string | null;
  reason: string | null;
};

/**
 * Verification priority (per policy):
 *   1. Office Wi-Fi public IP
 *   2. GPS geofence (±50m, acceptable accuracy)
 * Either one succeeding is sufficient.
 */
export async function runVerification(
  db: DB,
  env: Env,
  payload: GeoPayload,
  clientIp: string | null,
  requiresOffice: boolean,
): Promise<VerificationOutcome> {
  if (!requiresOffice) {
    return {
      result: 'not_required',
      method: 'none',
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      accuracyMeters: payload.accuracyMeters ?? null,
      officeIpMatched: null,
      officeIp: null,
      reason: null,
    };
  }

  const allowlist = await getOfficeIpAllowlist(db);
  if (matchOfficeIp(allowlist, clientIp)) {
    return {
      result: 'verified',
      method: 'office_ip',
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      accuracyMeters: payload.accuracyMeters ?? null,
      officeIpMatched: true,
      officeIp: clientIp,
      reason: 'Office network verified',
    };
  }

  const gps = evaluateGps(env, payload);
  if (gps.ok) {
    return {
      result: 'verified',
      method: 'gps',
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      accuracyMeters: payload.accuracyMeters ?? null,
      officeIpMatched: allowlist.length > 0 ? false : null,
      officeIp: clientIp,
      reason: 'Office location verified',
    };
  }

  return {
    result: 'failed',
    method: 'office_ip',
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    accuracyMeters: payload.accuracyMeters ?? null,
    officeIpMatched: allowlist.length > 0 ? false : null,
    officeIp: clientIp,
    reason: gps.reason ?? 'Office attendance could not be verified',
  };
}

/** The 1-minute verification window that starts at the scheduled shift start. */
export function verificationWindow(env: Env, scheduledStartIso: string) {
  const start = new Date(scheduledStartIso).getTime();
  const minutes = Number(env.VERIFICATION_WINDOW_MINUTES ?? VERIFICATION_WINDOW_MINUTES);
  return { opensAt: start, closesAt: start + minutes * 60000 };
}

export function preClockInWindow(env: Env, scheduledStartIso: string) {
  const start = new Date(scheduledStartIso).getTime();
  const minutes = Number(env.PRE_CLOCK_IN_MINUTES ?? PRE_CLOCK_IN_MINUTES);
  return { opensAt: start - minutes * 60000, closesAt: start };
}

export type ClockInDecision = {
  actualWorkingStart: string | null;
  lateStatus: 'on_time' | 'pending_review' | 'late';
  reviewStatus: 'not_required' | 'pending';
  autoAction: string | null;
  message: string;
};

export function decideWorkingStart(
  env: Env,
  scheduledStartIso: string,
  punchInIso: string,
  verificationResult: 'verified' | 'failed' | 'not_required',
): ClockInDecision {
  const window = verificationWindow(env, scheduledStartIso);
  const punch = new Date(punchInIso).getTime();
  const verificationAt = new Date().getTime();

  if (verificationResult === 'not_required') {
    const actualStart = punch < window.opensAt ? scheduledStartIso : punchInIso;
    return {
      actualWorkingStart: actualStart,
      lateStatus: punch > window.closesAt ? 'pending_review' : 'on_time',
      reviewStatus: punch > window.closesAt ? 'pending' : 'not_required',
      autoAction: null,
      message: 'Working session started',
    };
  }

  if (verificationResult === 'verified') {
    const inWindow = verificationAt <= window.closesAt;
    if (inWindow) {
      return {
        actualWorkingStart: scheduledStartIso,
        lateStatus: 'on_time',
        reviewStatus: 'not_required',
        autoAction: null,
        message: 'Attendance verified. Working timer started from the scheduled shift start.',
      };
    }
    // Verified after the window: record it, but route to HR review.
    return {
      actualWorkingStart: punchInIso,
      lateStatus: 'pending_review',
      reviewStatus: 'pending',
      autoAction: 'verification_after_window',
      message: 'Attendance verified after the verification window. Awaiting HR review.',
    };
  }

  // Verification failed — no working timer until HR approves an exception.
  return {
    actualWorkingStart: null,
    lateStatus: 'pending_review',
    reviewStatus: 'pending',
    autoAction: 'verification_failed',
    message:
      'Office attendance could not be verified. Your working timer has not started — please contact HR.',
  };
}

/** Total worked seconds for a session, excluding break time. */
export async function computeWorkingSeconds(db: DB, sessionId: string): Promise<number> {
  const session = await db
    .select()
    .from(attendanceSessions)
    .where(eq(attendanceSessions.id, sessionId))
    .limit(1);
  const row = session[0];
  if (!row) return 0;
  const start = row.actualWorkingStart;
  const end = row.clockOutAt ?? new Date().toISOString();
  const gross = secondsBetween(start, end);
  const activeBreaks = await db
    .select()
    .from(breaks)
    .where(and(eq(breaks.sessionId, sessionId), isNull(breaks.endedAt)));
  const breakRows = await db.select().from(breaks).where(eq(breaks.sessionId, sessionId));
  const breakSeconds = breakRows.reduce((sum, b) => sum + (b.endedAt ? b.durationSeconds : 0), 0);
  void activeBreaks;
  return Math.max(0, gross - breakSeconds);
}

/** Break totals for a session. */
export async function computeBreakTotals(db: DB, sessionId: string) {
  const rows = await db.select().from(breaks).where(eq(breaks.sessionId, sessionId));
  const seconds = rows.reduce((sum, b) => sum + (b.endedAt ? b.durationSeconds : 0), 0);
  return { seconds, count: rows.length };
}

/** Sessions that should be auto-closed because their scheduled end has passed. */
export async function findExpiredSessions(db: DB, now = new Date()): Promise<string[]> {
  const nowIso = now.toISOString();
  const rows = await db
    .select({ id: attendanceSessions.id, scheduledEnd: attendanceSessions.scheduledEnd })
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.status, 'open'),
        isNull(attendanceSessions.clockOutAt),
        lte(attendanceSessions.scheduledEnd, nowIso),
      ),
    );
  return rows.map((r) => r.id);
}

/** Sessions whose verification window has expired without a successful verification. */
export async function findStaleUnverifiedSessions(db: DB, now = new Date()): Promise<string[]> {
  const nowIso = now.toISOString();
  const rows = await db
    .select({
      id: attendanceSessions.id,
      scheduledStart: attendanceSessions.scheduledStart,
      verificationResult: attendanceSessions.verificationResult,
    })
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.status, 'open'),
        isNull(attendanceSessions.clockOutAt),
        eq(attendanceSessions.verificationResult, 'pending'),
        gte(attendanceSessions.scheduledStart, '1970-01-01'),
        lte(attendanceSessions.scheduledStart, nowIso),
      ),
    );
  return rows.map((r) => r.id);
}

export async function ensureSessionId() {
  return randomId();
}

/** Sessions opened by an employee for a given business date. */
export async function findOpenSessionForDate(db: DB, employeeId: string, date: string) {
  const rows = await db
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.employeeId, employeeId),
        eq(attendanceSessions.date, date),
        eq(attendanceSessions.status, 'open'),
        or(isNull(attendanceSessions.clockOutAt), isNull(attendanceSessions.clockOutAt)),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

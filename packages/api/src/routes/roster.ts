import { Hono } from 'hono';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { dhakaDateKey, shortBanglaDay, type RosterDayCell } from '@bronee/shared';
import { rosterEntries, rosters, shifts } from '../db/schema.js';
import { ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { getShiftById } from '../lib/attendance.js';
import { rosterAudience } from '../lib/queries.js';
import type { AppEnv } from '../types.js';
export const rosterRoutes = new Hono<AppEnv>();

rosterRoutes.use('*', requireAuth);

/**
 * The signed-in employee's own published roster.
 * `?from=&to=` limits the window; defaults to the current month.
 */
rosterRoutes.get('/my', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const today = dhakaDateKey(new Date());
  const from = c.req.query('from') ?? `${today.slice(0, 7)}-01`;
  const to = c.req.query('to') ?? `${today.slice(0, 7)}-31`;

  const rows = await db
    .select({
      entry: rosterEntries,
      shiftCode: shifts.code,
      shiftName: shifts.name,
      shiftShortName: shifts.shortName,
      rosterName: rosters.name,
      rosterStatus: rosters.status,
    })
    .from(rosterEntries)
    .innerJoin(rosters, eq(rosterEntries.rosterId, rosters.id))
    .leftJoin(shifts, eq(rosterEntries.shiftId, shifts.id))
    .where(
      and(
        eq(rosterEntries.employeeId, session.id),
        eq(rosters.status, 'published'),
        gte(rosterEntries.date, from),
        lte(rosterEntries.date, to),
      ),
    )
    .orderBy(asc(rosterEntries.date));

  const cells: RosterDayCell[] = rows.map((r) => ({
    date: r.entry.date,
    dayLabel: shortBanglaDay(r.entry.date),
    isOff: r.entry.isOff,
    shiftId: r.entry.shiftId,
    shiftCode: r.shiftCode,
    shiftName: r.shiftName,
    shiftShortName: r.shiftShortName,
    team: [],
  }));

  return ok(c, {
    from,
    to,
    rosterName: rows[0]?.rosterName ?? null,
    items: cells,
  });
});

/**
 * Same-day team overview — who is on which shift on a given day.
 * Only shift information is exposed, never private employee data.
 */
rosterRoutes.get('/team/:date', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const date = c.req.param('date');

  const peers = await rosterAudience(db, session.id);
  const peerIds = peers.map((p) => p.id);
  if (peerIds.length === 0) return ok(c, { date, items: [] });

  const rows = await db
    .select({
      entry: rosterEntries,
      employeeId: rosterEntries.employeeId,
      shiftCode: shifts.code,
      shiftName: shifts.name,
      shiftShortName: shifts.shortName,
    })
    .from(rosterEntries)
    .innerJoin(rosters, eq(rosterEntries.rosterId, rosters.id))
    .leftJoin(shifts, eq(rosterEntries.shiftId, shifts.id))
    .where(
      and(
        inArray(rosterEntries.employeeId, peerIds),
        eq(rosterEntries.date, date),
        eq(rosters.status, 'published'),
      ),
    )
    .orderBy(asc(shifts.displayOrder));

  const nameById = new Map(peers.map((p) => [p.id, p.fullName]));

  return ok(c, {
    date,
    items: rows.map((r) => ({
      employeeId: r.employeeId,
      employeeName: nameById.get(r.employeeId) ?? 'Team member',
      shiftCode: r.shiftCode,
      shiftName: r.shiftName,
      shiftShortName: r.shiftShortName,
      isOff: r.entry.isOff,
      isMe: r.employeeId === session.id,
    })),
  });
});

/** Roster shift options (shared with the HR dropdown + Google Sheets). */
rosterRoutes.get('/shift-options', async (c) => {
  const db = c.get('db');
  const rows = await db.select().from(shifts).orderBy(asc(shifts.displayOrder));
  return ok(c, {
    items: rows.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      shortName: s.shortName,
      startTime: s.startTime,
      endTime: s.endTime,
      endsNextDay: s.endsNextDay,
      locationPolicy: s.locationPolicy,
      requiresOfficeVerification: s.requiresOfficeVerification,
    })),
  });
});

/** Current published roster reference for the employee (dashboard widget). */
rosterRoutes.get('/current', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const today = dhakaDateKey(new Date());

  const rows = await db
    .select({
      entry: rosterEntries,
      shiftCode: shifts.code,
      shiftName: shifts.name,
      shiftShortName: shifts.shortName,
      rosterName: rosters.name,
      rosterStart: rosters.startDate,
      rosterEnd: rosters.endDate,
    })
    .from(rosterEntries)
    .innerJoin(rosters, eq(rosterEntries.rosterId, rosters.id))
    .leftJoin(shifts, eq(rosterEntries.shiftId, shifts.id))
    .where(
      and(
        eq(rosterEntries.employeeId, session.id),
        eq(rosterEntries.date, today),
        eq(rosters.status, 'published'),
      ),
    )
    .limit(1);

  const record = rows[0];
  if (!record) {
    return ok(c, { date: today, shift: null, rosterName: null, isOff: false });
  }

  const shift = record.entry.shiftId ? await getShiftById(db, record.entry.shiftId) : null;
  return ok(c, {
    date: today,
    shift,
    shiftCode: record.shiftCode,
    shiftName: record.shiftName,
    rosterName: record.rosterName,
    rosterStart: record.rosterStart,
    rosterEnd: record.rosterEnd,
    isOff: record.entry.isOff,
  });
});

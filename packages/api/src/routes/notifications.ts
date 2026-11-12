import { Hono } from 'hono';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { notifications, rosterChanges, rosterEntries, rosters, shifts } from '../db/schema.js';
import { ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { toNotification } from '../lib/mappers.js';
import { unreadCount, unreadRosterCount } from '../lib/notifications.js';
import type { AppEnv } from '../types.js';
export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.use('*', requireAuth);

/** Notification centre listing. */
notificationRoutes.get('/', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const limit = Math.min(100, Number(c.req.query('limit') ?? '50') || 50);
  const filter = c.req.query('filter');

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.employeeId, session.id))
    .orderBy(desc(notifications.publishedAt))
    .limit(filter === 'unread' ? 200 : limit);

  const items = rows.filter((r) => (filter === 'unread' ? r.readAt === null : true));

  return ok(c, {
    items: items.map(toNotification),
    unread: await unreadCount(db, session.id),
    unreadRoster: await unreadRosterCount(db, session.id),
  });
});

/** Mark one notification as read. */
notificationRoutes.post('/:id/read', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const id = c.req.param('id');

  await db
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.id, id), eq(notifications.employeeId, session.id), isNull(notifications.readAt)));

  return ok(c, {
    read: true,
    unread: await unreadCount(db, session.id),
    unreadRoster: await unreadRosterCount(db, session.id),
  });
});

/** Mark every notification as read (optionally only roster updates). */
notificationRoutes.post('/read-all', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const scope = c.req.query('scope');
  const now = new Date().toISOString();

  if (scope === 'roster') {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.employeeId, session.id),
          isNull(notifications.readAt),
          inArray(notifications.type, ['roster_update', 'shift_change', 'off_day_change']),
        ),
      );
  } else {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.employeeId, session.id), isNull(notifications.readAt)));
  }

  return ok(c, {
    read: true,
    unread: await unreadCount(db, session.id),
    unreadRoster: await unreadRosterCount(db, session.id),
  });
});

/**
 * Roster change history for the employee — every shift / off-day change that
 * was applied to their published roster.
 */
notificationRoutes.get('/roster-history', async (c) => {
  const db = c.get('db');
  const session = c.get('session');

  const rows = await db
    .select({
      change: rosterChanges,
      shiftCode: shifts.code,
      shiftName: shifts.name,
      newShiftCode: shifts.code,
    })
    .from(rosterChanges)
    .leftJoin(shifts, eq(rosterChanges.newShiftId, shifts.id))
    .where(eq(rosterChanges.employeeId, session.id))
    .orderBy(desc(rosterChanges.createdAt))
    .limit(100);

  const previousShiftIds = rows.map((r) => r.change.previousShiftId).filter(Boolean) as string[];
  const previousShifts = previousShiftIds.length
    ? await db.select().from(shifts).where(inArray(shifts.id, previousShiftIds))
    : [];

  return ok(c, {
    items: rows.map((r) => ({
      id: r.change.id,
      previousShift:
        previousShifts.find((s) => s.id === r.change.previousShiftId)?.shortName ?? (r.change.previousIsOff ? 'Off' : '—'),
      newShift: r.change.newIsOff ? 'Off' : (r.shiftName ?? '—'),
      previousIsOff: r.change.previousIsOff,
      newIsOff: r.change.newIsOff,
      changeType: r.change.changeType,
      notified: r.change.notified,
      changedAt: r.change.createdAt,
    })),
  });
});

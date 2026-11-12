import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { PERMISSIONS, rosterCreateSchema, rosterPublishSchema } from '@bronee/shared';
import { departments, rosterChanges, rosterEntries, rosters, shifts, users } from '../../db/schema.js';
import { badRequest, conflict, notFound, ok } from '../../lib/http.js';
import { randomId } from '../../lib/crypto.js';
import { requirePermission } from '../../middleware/auth.js';
import { requestMeta, writeAudit } from '../../lib/audit.js';
import { createNotifications } from '../../lib/notifications.js';
import { detailList, emailShell, paragraph } from '../../lib/email.js';
import {
  detectConflicts,
  diffRosters,
  recordRosterChange,
  rosterOrderedEmployees,
} from '../../lib/roster.js';
import type { AppEnv } from '../../types.js';

export const hrRosterRoutes = new Hono<AppEnv>();

const sqlCount = sql<number>`count(${rosterEntries.id})`;

/* --------------------------------------------------------------- listing */

hrRosterRoutes.get('/', requirePermission([PERMISSIONS.HR_ROSTER_MANAGE]), async (c) => {
  const db = c.get('db');
  const status = c.req.query('status');

  const rows = await db
    .select({
      roster: rosters,
      entryCount: sqlCount,
    })
    .from(rosters)
    .leftJoin(rosterEntries, eq(rosterEntries.rosterId, rosters.id))
    .where(status ? eq(rosters.status, status as never) : undefined)
    .groupBy(rosters.id)
    .orderBy(desc(rosters.createdAt));

  return ok(c, {
    items: rows.map((r) => ({
      id: r.roster.id,
      name: r.roster.name,
      startDate: r.roster.startDate,
      endDate: r.roster.endDate,
      version: r.roster.version,
      status: r.roster.status,
      scheduledFor: r.roster.scheduledFor,
      publishedAt: r.roster.publishedAt,
      createdAt: r.roster.createdAt,
      entryCount: r.entryCount ?? 0,
    })),
  });
});

/** Roster preview: entries grouped by employee. */
hrRosterRoutes.get('/:id', requirePermission([PERMISSIONS.HR_ROSTER_MANAGE]), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const rosterRows = await db.select().from(rosters).where(eq(rosters.id, id)).limit(1);
  const roster = rosterRows[0];
  if (!roster) throw notFound('Roster not found.');

  const entries = await db
    .select({
      entry: rosterEntries,
      employeeName: users.fullName,
      employeeCode: users.employeeCode,
      joiningDate: users.joiningDate,
      departmentName: departments.name,
      shiftCode: shifts.code,
      shiftName: shifts.name,
    })
    .from(rosterEntries)
    .innerJoin(users, eq(rosterEntries.employeeId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .leftJoin(shifts, eq(rosterEntries.shiftId, shifts.id))
    .where(eq(rosterEntries.rosterId, id))
    .orderBy(asc(departments.displayOrder), asc(users.joiningDate), asc(users.fullName), asc(rosterEntries.date));

  const conflicts = await detectConflicts(
    db,
    entries.map((e) => ({
      employeeId: e.entry.employeeId,
      date: e.entry.date,
      shiftId: e.entry.shiftId,
      isOff: e.entry.isOff,
    })),
    roster.startDate,
    roster.endDate,
  );

  return ok(c, {
    roster: {
      id: roster.id,
      name: roster.name,
      startDate: roster.startDate,
      endDate: roster.endDate,
      version: roster.version,
      status: roster.status,
      scheduledFor: roster.scheduledFor,
      publishedAt: roster.publishedAt,
    },
    items: entries.map((e) => ({
      employeeId: e.entry.employeeId,
      employeeName: e.employeeName,
      employeeCode: e.employeeCode,
      joiningDate: e.joiningDate,
      department: e.departmentName,
      date: e.entry.date,
      shiftId: e.entry.shiftId,
      shiftCode: e.shiftCode,
      shiftName: e.shiftName,
      isOff: e.entry.isOff,
    })),
    conflicts,
  });
});

/** Employees in roster order — used to pre-fill the roster builder. */
hrRosterRoutes.get(
  '/employees/ordered',
  requirePermission([PERMISSIONS.HR_ROSTER_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const rows = await rosterOrderedEmployees(db);
    return ok(c, { items: rows });
  },
);

/* --------------------------------------------------------------- writing */

hrRosterRoutes.post('/', requirePermission([PERMISSIONS.HR_ROSTER_MANAGE]), zValidator('json', rosterCreateSchema), async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const body = c.req.valid('json');

  const conflicts = await detectConflicts(db, body.entries, body.startDate, body.endDate);
  const blocking = conflicts.filter((c2) => c2.severity === 'error');
  if (blocking.length) {
    throw conflict('Resolve the roster conflicts before saving.', blocking);
  }

  const versionRows = await db
    .select({ version: rosters.version })
    .from(rosters)
    .where(and(eq(rosters.startDate, body.startDate), eq(rosters.endDate, body.endDate)))
    .orderBy(desc(rosters.version))
    .limit(1);

  const roster = {
    id: randomId(),
    name: body.name,
    startDate: body.startDate,
    endDate: body.endDate,
    version: (versionRows[0]?.version ?? 0) + 1,
    status: 'draft' as const,
    scheduledFor: null,
    publishedAt: null,
    createdBy: session.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.insert(rosters).values(roster);

  if (body.entries.length) {
    await db.insert(rosterEntries).values(
      body.entries.map((entry) => ({
        id: randomId(),
        rosterId: roster.id,
        employeeId: entry.employeeId,
        date: entry.date,
        shiftId: entry.isOff ? null : entry.shiftId,
        isOff: entry.isOff,
        updatedBy: session.id,
        createdAt: roster.createdAt,
        updatedAt: roster.updatedAt,
      })),
    );
  }

  await writeAudit(db, {
    actorId: session.id,
    actorName: session.fullName,
    action: 'roster.created',
    entityType: 'roster',
    entityId: roster.id,
    after: { name: roster.name, range: `${roster.startDate} → ${roster.endDate}`, entries: body.entries.length },
  });

  return ok(c, { roster, conflicts });
});

/** Update individual roster cells. */
hrRosterRoutes.patch(
  '/:id/entries',
  requirePermission([PERMISSIONS.HR_ROSTER_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = (await c.req.json()) as {
      updates: Array<{ employeeId: string; date: string; shiftId: string | null; isOff: boolean }>;
    };

    const rosterRows = await db.select().from(rosters).where(eq(rosters.id, id)).limit(1);
    if (!rosterRows[0]) throw notFound('Roster not found.');
    if (rosterRows[0].status === 'archived') throw badRequest('Archived rosters cannot be edited.');

    for (const update of body.updates) {
      await db
        .insert(rosterEntries)
        .values({
          id: randomId(),
          rosterId: id,
          employeeId: update.employeeId,
          date: update.date,
          shiftId: update.isOff ? null : update.shiftId,
          isOff: update.isOff,
          updatedBy: session.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: [rosterEntries.rosterId, rosterEntries.employeeId, rosterEntries.date],
          set: {
            shiftId: update.isOff ? null : update.shiftId,
            isOff: update.isOff,
            updatedBy: session.id,
            updatedAt: new Date().toISOString(),
          },
        });
    }

    return ok(c, { updated: body.updates.length });
  },
);

/**
 * Publish (or schedule) a roster. Only employees whose shift or off day
 * actually changed receive a notification.
 */
hrRosterRoutes.post(
  '/:id/publish',
  requirePermission([PERMISSIONS.HR_ROSTER_PUBLISH]),
  zValidator('json', rosterPublishSchema),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const rosterRows = await db.select().from(rosters).where(eq(rosters.id, id)).limit(1);
    const roster = rosterRows[0];
    if (!roster) throw notFound('Roster not found.');
    if (roster.status === 'archived') throw badRequest('Archived rosters cannot be published.');

    const entries = await db.select().from(rosterEntries).where(eq(rosterEntries.rosterId, id));

    if (body.publishMode === 'schedule') {
      if (!body.scheduledFor) throw badRequest('Choose the date and time for the scheduled publish.');
      await db
        .update(rosters)
        .set({ status: 'scheduled', scheduledFor: body.scheduledFor, updatedAt: new Date().toISOString() })
        .where(eq(rosters.id, id));
      await writeAudit(db, {
        actorId: session.id,
        actorName: session.fullName,
        action: 'roster.scheduled',
        entityType: 'roster',
        entityId: id,
        after: { scheduledFor: body.scheduledFor },
      });
      return ok(c, { status: 'scheduled', scheduledFor: body.scheduledFor });
    }

    const diffs = await diffRosters(
      db,
      entries.map((e) => ({
        employeeId: e.employeeId,
        date: e.date,
        shiftId: e.shiftId,
        isOff: e.isOff,
      })),
    );

    // Archive the previous published roster for the same window.
    await db
      .update(rosters)
      .set({ status: 'archived', updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(rosters.status, 'published'),
          eq(rosters.startDate, roster.startDate),
          eq(rosters.endDate, roster.endDate),
          ne(rosters.id, id),
        ),
      );

    await db
      .update(rosters)
      .set({
        status: 'published',
        publishedAt: new Date().toISOString(),
        scheduledFor: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(rosters.id, id));

    // Record history + notify only the affected employees.
    const affected = new Map<string, { dates: string[]; changed: typeof diffs }>();
    for (const diff of diffs) {
      await recordRosterChange(db, {
        rosterId: id,
        employeeId: diff.employeeId,
        previousShiftId: diff.previousShiftId,
        newShiftId: diff.newShiftId,
        previousIsOff: diff.previousIsOff,
        newIsOff: diff.newIsOff,
        changeType: 'publish',
        changedBy: session.id,
      });
      const bucket = affected.get(diff.employeeId) ?? { dates: [], changed: [] };
      bucket.dates.push(diff.date);
      bucket.changed.push(diff);
      affected.set(diff.employeeId, bucket);
    }

    const shiftRows = await db.select().from(shifts);
    const shiftName = new Map(shiftRows.map((s) => [s.id, s.shortName]));
    const employeeRows = affected.size
      ? await db.select().from(users).where(inArray(users.id, [...affected.keys()]))
      : [];
    const employeeName = new Map(employeeRows.map((e) => [e.id, e.fullName]));

    const notifications = [...affected.entries()].map(([employeeId, bucket]) => {
      const first = bucket.changed[0];
      const kind = first.newIsOff !== first.previousIsOff ? 'off' : first.newShiftId ? 'shift' : 'general';
      const type =
        kind === 'off' ? 'off_day_change' : kind === 'shift' ? 'shift_change' : 'roster_update';
      const title =
        kind === 'off'
          ? 'Your off day has been updated'
          : kind === 'shift'
            ? 'Your shift has been updated'
            : 'Your roster has been updated';

      const detailLines: Array<[string, string]> = bucket.changed.slice(0, 5).map((d) => [
        d.date,
        d.newIsOff
          ? 'Off'
          : `${shiftName.get(d.newShiftId ?? '') ?? 'Shift'} (was ${
              d.previousIsOff ? 'Off' : (shiftName.get(d.previousShiftId ?? '') ?? '—')
            })`,
      ]);

      return {
        employeeId,
        type,
        title,
        body: `Your roster for ${bucket.dates.length} day(s) has changed.`,
        link: '/app/roster',
        createdBy: session.id,
        emailSubject: 'BRONEE HRMS — Your roster has been updated',
        emailHtml: emailShell(
          title,
          `${paragraph(`Hi ${employeeName.get(employeeId) ?? 'there'}, your roster has changed.`)}${detailList(detailLines)}${paragraph('Open the employee portal to review your updated schedule.')}`,
        ),
      };
    });

    if (notifications.length) {
      await createNotifications(db, env, notifications);
      await db
        .update(rosterChanges)
        .set({ notified: true })
        .where(
          and(
            eq(rosterChanges.rosterId, id),
            inArray(rosterChanges.employeeId, [...affected.keys()]),
          ),
        );
    }

    const meta = requestMeta(c);
    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'roster.published',
      entityType: 'roster',
      entityId: id,
      before: { status: roster.status },
      after: { status: 'published', changedEmployees: affected.size, changedEntries: diffs.length },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok(c, {
      status: 'published',
      changedEmployees: affected.size,
      changedEntries: diffs.length,
      notified: notifications.length,
    });
  },
);

/** Send a roster update to a single employee on demand. */
hrRosterRoutes.post(
  '/:id/notify',
  requirePermission([PERMISSIONS.HR_ROSTER_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = (await c.req.json()) as { employeeId: string; message?: string };

    const employeeRows = await db.select().from(users).where(eq(users.id, body.employeeId)).limit(1);
    if (!employeeRows[0]) throw notFound('Employee not found.');

    await createNotifications(db, env, [
      {
        employeeId: body.employeeId,
        type: 'roster_update',
        title: 'Your roster has been updated',
        body: body.message ?? 'HR has shared an updated roster with you.',
        link: '/app/roster',
        createdBy: session.id,
      },
    ]);

    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'roster.notify_employee',
      entityType: 'roster',
      entityId: id,
      after: { employeeId: body.employeeId },
    });

    return ok(c, { sent: true });
  },
);

/** Full change history. */
hrRosterRoutes.get('/:id/history', requirePermission([PERMISSIONS.HR_ROSTER_MANAGE]), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const rows = await db
    .select({
      change: rosterChanges,
      employeeName: users.fullName,
      employeeCode: users.employeeCode,
      newShiftCode: shifts.code,
    })
    .from(rosterChanges)
    .innerJoin(users, eq(rosterChanges.employeeId, users.id))
    .leftJoin(shifts, eq(rosterChanges.newShiftId, shifts.id))
    .where(eq(rosterChanges.rosterId, id))
    .orderBy(desc(rosterChanges.createdAt));

  const previousIds = rows.map((r) => r.change.previousShiftId).filter(Boolean) as string[];
  const previousShifts = previousIds.length
    ? await db.select().from(shifts).where(inArray(shifts.id, previousIds))
    : [];

  return ok(c, {
    items: rows.map((r) => ({
      id: r.change.id,
      rosterId: r.change.rosterId,
      employeeId: r.change.employeeId,
      employeeName: r.employeeName,
      employeeCode: r.employeeCode,
      previousShift:
        previousShifts.find((s) => s.id === r.change.previousShiftId)?.shortName ??
        (r.change.previousIsOff ? 'Off' : '—'),
      newShift: r.change.newIsOff ? 'Off' : (r.newShiftCode ?? '—'),
      changedBy: r.change.changedBy,
      changeType: r.change.changeType,
      notified: r.change.notified,
      createdAt: r.change.createdAt,
    })),
  });
});

/** Scheduled rosters that are due to publish. */
hrRosterRoutes.post(
  '/publish-due',
  requirePermission([PERMISSIONS.HR_ROSTER_PUBLISH]),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const due = await db
      .select()
      .from(rosters)
      .where(and(eq(rosters.status, 'scheduled'), lte(rosters.scheduledFor, new Date().toISOString())));

    for (const roster of due) {
      await db
        .update(rosters)
        .set({ status: 'published', publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(rosters.id, roster.id));
    }

    void env;
    return ok(c, { published: due.length });
  },
);

import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { PERMISSIONS, announcementSchema, dhakaDateKey } from '@bronee/shared';
import { announcementRecipients, announcements, departments, notifications, users } from '../../db/schema.js';
import { badRequest, notFound, ok } from '../../lib/http.js';
import { randomId } from '../../lib/crypto.js';
import { requirePermission } from '../../middleware/auth.js';
import { requestMeta, writeAudit } from '../../lib/audit.js';
import { createNotifications } from '../../lib/notifications.js';
import type { AppEnv } from '../../types.js';
export const hrCommsRoutes = new Hono<AppEnv>();

/** Resolve the audience for an announcement. */
async function resolveAudience(
  db: any,
  targetType: string,
  targetIds: string[],
): Promise<string[]> {
  const active: Array<{ id: string; departmentId: string | null; subDepartmentId: string | null }> =
    await db
      .select({
        id: users.id,
        departmentId: users.departmentId,
        subDepartmentId: users.subDepartmentId,
      })
      .from(users)
      .where(and(eq(users.status, 'active'), eq(users.role, 'employee')));

  if (targetType === 'all') return active.map((a) => a.id);

  if (targetType === 'employees') {
    return active.filter((a) => targetIds.includes(a.id)).map((a) => a.id);
  }

  // A department (or sub-department) audience is addressed by department id.
  if (targetType === 'department') {
    return active
      .filter((a) => a.departmentId && targetIds.includes(a.departmentId))
      .map((a) => a.id);
  }

  if (targetType === 'sub_department') {
    return active
      .filter((a) => a.subDepartmentId && targetIds.includes(a.subDepartmentId))
      .map((a) => a.id);
  }

  return [];
}

hrCommsRoutes.get('/', requirePermission([PERMISSIONS.HR_ANNOUNCEMENT_MANAGE]), async (c) => {
  const db = c.get('db');
  const status = c.req.query('status');

  const rows = await db
    .select({ announcement: announcements, createdByName: users.fullName })
    .from(announcements)
    .leftJoin(users, eq(announcements.createdBy, users.id))
    .where(status ? eq(announcements.status, status as never) : undefined)
    .orderBy(desc(announcements.createdAt));

  const items = await Promise.all(
    rows.map(async (r) => {
      const recipients = await db
        .select({ readAt: announcementRecipients.readAt })
        .from(announcementRecipients)
        .where(eq(announcementRecipients.announcementId, r.announcement.id));
      return {
        id: r.announcement.id,
        title: r.announcement.title,
        body: r.announcement.body,
        type: r.announcement.type,
        targetType: r.announcement.targetType,
        targetIds: r.announcement.targetIds,
        targetLabel: r.announcement.targetLabel,
        attachmentKey: r.announcement.attachmentKey,
        status: r.announcement.status,
        scheduledFor: r.announcement.scheduledFor,
        publishedAt: r.announcement.publishedAt,
        emailNotification: r.announcement.emailNotification,
        createdBy: r.announcement.createdBy,
        createdByName: r.createdByName,
        recipientCount: recipients.length,
        readCount: recipients.filter((x) => x.readAt).length,
        createdAt: r.announcement.createdAt,
      };
    }),
  );

  return ok(c, { items });
});

hrCommsRoutes.post(
  '/',
  requirePermission([PERMISSIONS.HR_ANNOUNCEMENT_MANAGE]),
  zValidator('json', announcementSchema),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const session = c.get('session');
    const body = c.req.valid('json');

    const audience = await resolveAudience(db, body.targetType, body.targetIds);
    if (body.targetType !== 'all' && audience.length === 0) {
      throw badRequest('Select at least one recipient for this notice.');
    }

    let targetLabel: string | null = null;
    if (body.targetType === 'department' || body.targetType === 'sub_department') {
      const deptRows = await db
        .select({ name: departments.name })
        .from(departments)
        .where(inArray(departments.id, body.targetIds));
      targetLabel = deptRows.map((d) => d.name).join(', ');
    } else if (body.targetType === 'employees') {
      const userRows = await db
        .select({ fullName: users.fullName })
        .from(users)
        .where(inArray(users.id, body.targetIds));
      targetLabel = userRows.map((u) => u.fullName).join(', ');
    } else {
      targetLabel = 'All employees';
    }

    const now = new Date().toISOString();
    const status =
      body.publishMode === 'draft'
        ? 'draft'
        : body.publishMode === 'schedule'
          ? 'scheduled'
          : 'published';

    const record = {
      id: randomId(),
      title: body.title,
      body: body.body,
      type: body.type,
      targetType: body.targetType,
      targetIds: body.targetIds,
      targetLabel,
      attachmentKey: body.attachmentKey ?? null,
      status: status as never,
      scheduledFor: body.publishMode === 'schedule' ? (body.scheduledFor ?? null) : null,
      publishedAt: status === 'published' ? now : null,
      emailNotification: body.emailNotification,
      createdBy: session.id,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(announcements).values(record);

    if (status === 'published') {
      await publishAnnouncement(db, env, record, audience, session.id);
    }

    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: `announcement.${status}`,
      entityType: 'announcement',
      entityId: record.id,
      after: { title: record.title, audience: audience.length, targetLabel },
    });

    return ok(c, { announcement: record, recipients: audience.length });
  },
);

/** Publish a scheduled or draft announcement now. */
hrCommsRoutes.post(
  '/:id/publish',
  requirePermission([PERMISSIONS.HR_ANNOUNCEMENT_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const session = c.get('session');
    const id = c.req.param('id');

    const rows = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    const record = rows[0];
    if (!record) throw notFound('Announcement not found.');
    if (record.status === 'published') throw badRequest('This announcement is already published.');

    const audience = await resolveAudience(db, record.targetType, record.targetIds);
    const now = new Date().toISOString();
    await db
      .update(announcements)
      .set({ status: 'published', publishedAt: now, updatedAt: now })
      .where(eq(announcements.id, id));

    await publishAnnouncement(db, env, { ...record, status: 'published', publishedAt: now }, audience, session.id);

    return ok(c, { published: true, recipients: audience.length });
  },
);

hrCommsRoutes.delete('/:id', requirePermission([PERMISSIONS.HR_ANNOUNCEMENT_MANAGE]), async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const id = c.req.param('id');
  const rows = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
  if (!rows[0]) throw notFound('Announcement not found.');
  await db.delete(announcements).where(eq(announcements.id, id));
  await writeAudit(db, {
    actorId: session.id,
    actorName: session.fullName,
    action: 'announcement.deleted',
    entityType: 'announcement',
    entityId: id,
    before: rows[0],
  });
  return ok(c, { deleted: true });
});

/** Publish any announcements whose scheduled time has arrived. */
hrCommsRoutes.post('/publish-due', requirePermission([PERMISSIONS.HR_ANNOUNCEMENT_MANAGE]), async (c) => {
  const db = c.get('db');
  const env = c.get('env');
  const session = c.get('session');
  const now = new Date().toISOString();

  const due = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.status, 'scheduled'),
        isNull(announcements.publishedAt),
      ),
    );

  let published = 0;
  for (const record of due) {
    if (record.scheduledFor && record.scheduledFor > now) continue;
    const audience = await resolveAudience(db, record.targetType, record.targetIds);
    await db
      .update(announcements)
      .set({ status: 'published', publishedAt: now, updatedAt: now })
      .where(eq(announcements.id, record.id));
    await publishAnnouncement(db, env, { ...record, status: 'published', publishedAt: now }, audience, session.id);
    published += 1;
  }

  return ok(c, { published });
});

async function publishAnnouncement(
  db: any,
  env: any,
  record: {
    id: string;
    title: string;
    body: string;
    type: string;
    attachmentKey: string | null;
    emailNotification: boolean;
    publishedAt: string | null;
    status?: string;
  },
  audience: string[],
  createdBy: string,
) {
  if (audience.length === 0) return;

  await db.insert(announcementRecipients).values(
    audience.map((employeeId) => ({
      id: randomId(),
      announcementId: record.id,
      employeeId,
      readAt: null,
      emailStatus: record.emailNotification ? ('pending' as const) : ('not_required' as const),
    })),
  );

  await createNotifications(
    db,
    env,
    audience.map((employeeId) => ({
      employeeId,
      type: record.type,
      title: record.title,
      body: record.body,
      link: '/app/notifications',
      createdBy,
      meta: { announcementId: record.id },
    })),
  );
}

/** Individual employee message — a convenience wrapper over announcements. */
hrCommsRoutes.post(
  '/message/:employeeId',
  requirePermission([PERMISSIONS.HR_ANNOUNCEMENT_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const session = c.get('session');
    const employeeId = c.req.param('employeeId');
    const body = (await c.req.json()) as { title: string; body: string; emailNotification?: boolean };

    if (!body.title?.trim() || !body.body?.trim()) {
      throw badRequest('Both a title and a message are required.');
    }

    const employeeRows = await db.select().from(users).where(eq(users.id, employeeId)).limit(1);
    if (!employeeRows[0]) throw notFound('Employee not found.');

    const now = new Date().toISOString();
    const record = {
      id: randomId(),
      title: body.title,
      body: body.body,
      type: 'individual_message',
      targetType: 'employees' as const,
      targetIds: [employeeId],
      targetLabel: employeeRows[0].fullName,
      attachmentKey: null,
      status: 'published' as const,
      scheduledFor: null,
      publishedAt: now,
      emailNotification: body.emailNotification ?? false,
      createdBy: session.id,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(announcements).values(record);
    await publishAnnouncement(db, env, record, [employeeId], session.id);

    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'announcement.individual_message',
      entityType: 'announcement',
      entityId: record.id,
      after: { employeeId },
    });

    return ok(c, { sent: true });
  },
);

/** Notice history with delivery + read status. */
hrCommsRoutes.get('/history', requirePermission([PERMISSIONS.HR_ANNOUNCEMENT_MANAGE]), async (c) => {
  const db = c.get('db');
  const rows = await db
    .select({ announcement: announcements, createdByName: users.fullName })
    .from(announcements)
    .leftJoin(users, eq(announcements.createdBy, users.id))
    .orderBy(desc(announcements.createdAt))
    .limit(100);

  const items = await Promise.all(
    rows.map(async (r) => {
      const recipients = await db
        .select({
          readAt: announcementRecipients.readAt,
          emailStatus: announcementRecipients.emailStatus,
          employeeName: users.fullName,
        })
        .from(announcementRecipients)
        .innerJoin(users, eq(announcementRecipients.employeeId, users.id))
        .where(eq(announcementRecipients.announcementId, r.announcement.id));

      const emailNotifications = await db
        .select({
          emailSent: notifications.emailSent,
          emailStatus: notifications.emailStatus,
          employeeName: users.fullName,
        })
        .from(notifications)
        .innerJoin(users, eq(notifications.employeeId, users.id))
        .where(eq(notifications.employeeId, r.announcement.id));

      void emailNotifications;

      return {
        id: r.announcement.id,
        title: r.announcement.title,
        status: r.announcement.status,
        targetLabel: r.announcement.targetLabel,
        publishedAt: r.announcement.publishedAt,
        scheduledFor: r.announcement.scheduledFor,
        createdByName: r.createdByName,
        recipients: recipients.map((x) => ({
          employeeName: x.employeeName,
          read: Boolean(x.readAt),
          emailStatus: x.emailStatus,
        })),
        readCount: recipients.filter((x) => x.readAt).length,
        recipientCount: recipients.length,
      };
    }),
  );

  return ok(c, { items });
});

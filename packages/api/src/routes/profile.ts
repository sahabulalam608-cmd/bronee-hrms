import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { profileUpdateRequestSchema } from '@bronee/shared';
import { profileUpdateRequests, users } from '../db/schema.js';
import { badRequest, notFound, ok } from '../lib/http.js';
import { randomId } from '../lib/crypto.js';
import { requireAuth } from '../middleware/auth.js';
import { toPublicUser } from '../lib/mappers.js';
import { findUserById } from '../lib/queries.js';
import { createNotifications } from '../lib/notifications.js';
import type { AppEnv } from '../types.js';
export const profileRoutes = new Hono<AppEnv>();

profileRoutes.use('*', requireAuth);

/** The signed-in employee's profile. */
profileRoutes.get('/', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const user = await findUserById(db, session.id);
  if (!user) throw notFound('Account not found.');

  const pendingRequests = await db
    .select()
    .from(profileUpdateRequests)
    .where(and(eq(profileUpdateRequests.employeeId, session.id), eq(profileUpdateRequests.status, 'pending')))
    .orderBy(desc(profileUpdateRequests.createdAt));

  return ok(c, {
    profile: toPublicUser(user),
    pendingRequests: pendingRequests.map((r) => ({
      id: r.id,
      fields: r.fields,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt,
    })),
  });
});

/**
 * Employees cannot edit protected fields directly. They submit a correction
 * request which HR reviews and applies.
 */
profileRoutes.post('/update-request', zValidator('json', profileUpdateRequestSchema), async (c) => {
  const db = c.get('db');
  const env = c.get('env');
  const session = c.get('session');
  const body = c.req.valid('json');

  const existing = await db
    .select()
    .from(profileUpdateRequests)
    .where(
      and(
        eq(profileUpdateRequests.employeeId, session.id),
        eq(profileUpdateRequests.status, 'pending'),
      ),
    )
    .limit(1);
  if (existing[0]) {
    throw badRequest('You already have a correction request awaiting review.');
  }

  const record = {
    id: randomId(),
    employeeId: session.id,
    fields: body.fields as never,
    reason: body.reason,
    status: 'pending' as const,
    reviewedBy: null,
    reviewNote: null,
    reviewedAt: null,
    createdAt: new Date().toISOString(),
  };
  await db.insert(profileUpdateRequests).values(record);

  const hrUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'hr'), eq(users.status, 'active')));
  await createNotifications(
    db,
    env,
    hrUsers.map((h) => ({
      employeeId: h.id,
      type: 'profile_request',
      title: 'Profile correction request',
      body: `${session.fullName} requested a profile correction.`,
      link: '/hr/employees/requests',
      createdBy: session.id,
    })),
  );

  return ok(c, { request: record, message: 'Your correction request has been sent to HR.' });
});

/** Avatar file key update (after a successful upload). */
profileRoutes.post('/avatar', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const body = (await c.req.json()) as { avatarKey?: string };

  if (!body.avatarKey || !body.avatarKey.startsWith(`${session.id}/`)) {
    throw badRequest('Invalid avatar reference.');
  }

  await db
    .update(users)
    .set({ avatarKey: body.avatarKey, updatedAt: new Date().toISOString() })
    .where(eq(users.id, session.id));

  const user = await findUserById(db, session.id);
  return ok(c, { profile: user ? toPublicUser(user) : null });
});

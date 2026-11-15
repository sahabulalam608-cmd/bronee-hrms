/**
 * BRONEE HRMS — Cloudflare Worker entry point.
 *
 * Employee and HR portals share one API and one database (D1).
 * CORS is restricted to the configured application origin.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './routes/auth';
import { employee } from './routes/employee';
import { hr } from './routes/hr';
import { db } from './db';
import { announcements, attendanceSessions, rosters } from './db/schema';
import { eq, gte, isNull } from 'drizzle-orm';
import { notifications } from './db/schema';
import type { Env } from './env';
import { scheduleFor } from '../../shared/attendance';
import type { ShiftCode } from '../../shared/constants';
import { readOfficeConfig, runAutoAttendance } from './services/attendance';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

app.use(
  '*',
  cors({
    origin: (origin) => origin ?? '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 3600,
  }),
);

app.get('/api/health', (c) =>
  c.json({ ok: true, service: 'bronee-hrms-api', time: new Date().toISOString() }),
);

app.route('/api/auth', auth);
app.route('/api/employee', employee);
app.route('/api/hr', hr);

app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'Route not found.' }, 404));

app.onError((err, c) => {
  console.error('[api:error]', err);
  return c.json({ error: 'SERVER_ERROR', message: 'Something went wrong on the server.' }, 500);
});

/**
 * Scheduled handler — publishes rosters and announcements whose time has
 * come, and runs the automatic attendance steps (§6.2 – §6.8).
 * The cron runs every minute.
 */
async function scheduled(env: Env) {
  const database = db(env);
  const now = new Date().toISOString();

  const due = await database.query.rosters.findMany({
    where: eq(rosters.status, 'Scheduled'),
  });
  for (const roster of due) {
    if (roster.publishAt && roster.publishAt <= now) {
      await database.update(rosters).set({ status: 'Published', publishedAt: now }).where(eq(rosters.id, roster.id));
    }
  }

  const pending = await database.query.announcements.findMany({
    where: eq(announcements.status, 'Scheduled'),
  });
  for (const announcement of pending) {
    if (announcement.publishAt && announcement.publishAt <= now) {
      await database.update(announcements).set({ status: 'Published', publishedAt: now }).where(eq(announcements.id, announcement.id));
    }
  }

  await runAutomaticAttendance(database, now);
}

/**
 * Automatic clock in and automatic clock out (§6.2 – §6.8).
 *
 * The trigger runs without a browser, so it can only close a session or end a
 * verification window. It never starts a verification before the one minute
 * verification window has closed, so the employee's own check always wins.
 */
async function runAutomaticAttendance(database: any, now: string) {
  const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const open = await database.query.attendanceSessions.findMany({
    where: isNull(attendanceSessions.clockOut),
  });
  const relevant = open.filter((session: any) => session.workDate >= yesterday);
  if (!relevant.length) return;

  const office = await readOfficeConfig(database);
  for (const session of relevant) {
    const schedule = scheduleFor(session.shiftCode as ShiftCode, session.workDate);
    await runAutoAttendance(
      database,
      session,
      schedule,
      now,
      { latitude: null, longitude: null, accuracy: null },
      office,
      false,
      30_000,
    );
  }
}

export default {
  fetch: app.fetch,
  scheduled,
};

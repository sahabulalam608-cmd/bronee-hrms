/**
 * BRONEE HRMS — session authentication and role based access control.
 *
 * Session tokens are HMAC-SHA256 signed, opaque to the client and stored in
 * D1 so they can be revoked. Role permissions come from the shared registry
 * so the web app and the API always agree on who may do what.
 */

import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { ROLE_PERMISSIONS, type Permission, type Role } from '../../../shared/constants';
import { randomToken } from '../../../shared/crypto';
import { sessions, users, employees } from '../db/schema';
import { db } from '../db';
import type { Database } from '../db';
import type { Env } from '../env';

const SESSION_HOURS = 12;

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Create a session token and persist it. */
export async function createSession(
  database: Database,
  employeeId: string,
  role: Role,
  env: Env,
): Promise<string> {
  const token = `${randomToken(24)}.${await hmac(env.SESSION_SECRET, randomToken(8))}`;
  const now = new Date();
  await database.insert(sessions).values({
    token,
    employeeId,
    role,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_HOURS * 3600_000).toISOString(),
  });
  return token;
}

/** Resolve the signed-in employee from the Authorization header. */
export async function requireSession(
  c: Context<{ Bindings: Env; Variables: { user: AuthUser } }>,
  next: Next,
) {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return c.json({ error: 'UNAUTHORISED', message: 'Sign in to continue.' }, 401);

  const database = db(c.env);
  const session = await database.query.sessions.findFirst({
    where: eq(sessions.token, token),
  });
  if (!session) return c.json({ error: 'UNAUTHORISED', message: 'Session not found.' }, 401);
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await database.delete(sessions).where(eq(sessions.token, token));
    return c.json({ error: 'SESSION_EXPIRED', message: 'Your session has expired.' }, 401);
  }

  const employee = await database.query.employees.findFirst({
    where: eq(employees.id, session.employeeId),
  });
  if (!employee || employee.status !== 'Active') {
    return c.json({ error: 'FORBIDDEN', message: 'Your account is not active.' }, 403);
  }

  c.set('user', {
    employeeId: employee.id,
    role: employee.role as Role,
    email: employee.email,
    fullName: employee.fullName,
    portal: employee.portal as 'EMPLOYEE' | 'HR',
  } as AuthUser);
  return next();
}

export interface AuthUser {
  employeeId: string;
  role: Role;
  email: string;
  fullName: string;
  portal: 'EMPLOYEE' | 'HR';
}

/** Guard that requires a specific permission from the shared role matrix. */
export function requirePermission(permission: Permission) {
  return async (c: Context<{ Bindings: Env; Variables: { user: AuthUser } }>, next: Next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'UNAUTHORISED', message: 'Sign in to continue.' }, 401);
    const allowed = ROLE_PERMISSIONS[user.role] ?? [];
    if (!allowed.includes(permission)) {
      return c.json(
        { error: 'FORBIDDEN', message: 'Your role does not allow this operation.' },
        403,
      );
    }
    return next();
  };
}

/** Guard that restricts a route to one portal. */
export function requirePortal(portal: 'EMPLOYEE' | 'HR') {
  return async (c: Context<{ Bindings: Env; Variables: { user: AuthUser } }>, next: Next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'UNAUTHORISED', message: 'Sign in to continue.' }, 401);
    if (user.portal !== portal) {
      return c.json({ error: 'FORBIDDEN', message: 'This account cannot use that portal.' }, 403);
    }
    return next();
  };
}

export { users };

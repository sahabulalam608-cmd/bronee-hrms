import { createMiddleware } from 'hono/factory';
import type { Permission } from '@bronee/shared';
import { hasAnyPermission, permissionsForRole } from '@bronee/shared';
import { forbidden, unauthorized } from '../lib/http.js';
import { readSessionToken, verifySessionToken } from '../lib/session.js';
import { createDb, type DB } from '../db/client.js';
import type { AppEnv } from '../types.js';

/**
 * The Drizzle client is created once per environment binding and reused for
 * the lifetime of the isolate.
 */
const dbCache = new WeakMap<object, DB>();

export function dbFor(env: AppEnv['Bindings']): DB {
  const cached = dbCache.get(env as unknown as object);
  if (cached) return cached;
  const db = createDb(env);
  dbCache.set(env as unknown as object, db);
  return db;
}

/** Attaches `c.get('db')` / `c.get('env')` to every request. */
export const withContext = createMiddleware<AppEnv>(async (c, next) => {
  c.set('db', dbFor(c.env));
  c.set('env', c.env);
  await next();
});

/**
 * Resolves the session for the request. Throws (rather than returning) so the
 * error middleware produces a consistent envelope.
 */
export async function authenticate(c: { get: (k: 'db' | 'env') => never; req: unknown }) {
  const env = c.get('env');
  const db = c.get('db');
  const ctx = c as unknown as { req: { header: (k: string) => string | undefined } };
  const token = readSessionToken(ctx as never, env);
  if (!token) throw unauthorized('Please sign in to continue');

  const session = await verifySessionToken(db, env, token);
  if (!session) throw unauthorized('Your session has expired. Please sign in again.');
  return session;
}

/** Requires a valid session. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await authenticate(c as never);
  c.set('session', session);
  c.set('permissions', permissionsForRole(session.role));
  await next();
});

/** Requires an authenticated session plus at least one of the given permissions. */
export const requirePermission = (permissions: Permission[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const session = await authenticate(c as never);
    if (!hasAnyPermission(session.role, permissions)) {
      throw forbidden('Your role does not allow this action');
    }
    c.set('session', session);
    c.set('permissions', permissionsForRole(session.role));
    await next();
  });

/** Requires one of the given roles. */
export const requireRole = (roles: Array<'employee' | 'manager' | 'hr' | 'super_admin'>) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const session = await authenticate(c as never);
    if (!roles.includes(session.role)) {
      throw forbidden('Your role does not allow this action');
    }
    c.set('session', session);
    c.set('permissions', permissionsForRole(session.role));
    await next();
  });

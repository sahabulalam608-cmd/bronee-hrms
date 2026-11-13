/**
 * Session management — signed, httpOnly cookie backed by a D1 session row so
 * sessions can be revoked server-side.
 */
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { SESSION_TTL_DAYS } from '@bronee/shared';
import type { Role, SessionUser, UserStatus } from '@bronee/shared';
import type { DB } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import type { Env } from '../env.js';
import { getSessionSecret } from '../env.js';
import { base64UrlDecode, base64UrlEncode, hmacSign, hmacVerify, randomId } from './crypto.js';

type TokenPayload = {
  sid: string;
  uid: string;
  exp: number;
};

export function cookieName(env: Env): string {
  return env.SESSION_COOKIE_NAME || 'bronee_session';
}

export async function createSession(
  db: DB,
  env: Env,
  user: { id: string; email: string; role: Role; status: UserStatus; fullName: string; employeeCode: string },
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<string> {
  const sid = randomId();
  const exp = Date.now() + SESSION_TTL_DAYS * 86400000;
  await db.insert(sessions).values({
    id: sid,
    userId: user.id,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    expiresAt: new Date(exp).toISOString(),
  });

  const payload: TokenPayload = { sid, uid: user.id, exp };
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSign(encoded, getSessionSecret(env));
  return `${encoded}.${signature}`;
}

export async function verifySessionToken(
  db: DB,
  env: Env,
  token: string,
): Promise<SessionUser | null> {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  if (!(await hmacVerify(encoded, signature, getSessionSecret(env)))) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded))) as TokenPayload;
  } catch {
    return null;
  }
  if (!payload.sid || !payload.uid) return null;
  if (payload.exp < Date.now()) return null;

  const [row] = await db
    .select({
      sessionId: sessions.id,
      revokedAt: sessions.revokedAt,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      fullName: users.fullName,
      employeeCode: users.employeeCode,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, payload.sid), eq(users.id, payload.uid)))
    .limit(1);

  if (!row) return null;
  if (row.revokedAt) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) return null;
  if (row.status !== 'active' && row.status !== 'approved') return null;

  return {
    id: row.userId,
    email: row.email,
    role: row.role,
    status: row.status,
    fullName: row.fullName,
    employeeCode: row.employeeCode,
  };
}

export async function revokeSession(db: DB, sessionId: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeAllSessions(db: DB, userId: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/**
 * The session cookie's SameSite attribute.
 *
 * The API and the web client can live on different origins (Cloudflare Pages
 * and a Worker are different sites), and a cross-site fetch will not carry a
 * `Lax` cookie. In that case the cookie has to be `None`, which browsers
 * accept only together with `Secure`.
 */
function sameSiteFor(c: Context, env: Env): 'Lax' | 'None' {
  const appUrl = env.APP_URL;
  if (!appUrl) return 'Lax';
  try {
    const appOrigin = new URL(appUrl).origin;
    const requestOrigin = new URL(c.req.url).origin;
    return appOrigin === requestOrigin ? 'Lax' : 'None';
  } catch {
    return 'Lax';
  }
}

export function setSessionCookie(c: Context, env: Env, token: string) {
  const secure = new URL(env.APP_URL || 'https://localhost').protocol === 'https:';
  setCookie(c, cookieName(env), token, {
    httpOnly: true,
    sameSite: sameSiteFor(c, env),
    path: '/',
    secure,
    maxAge: SESSION_TTL_DAYS * 86400,
  });
}

export function clearSessionCookie(c: Context, env: Env) {
  deleteCookie(c, cookieName(env), { path: '/' });
}

export function readSessionToken(c: Context, env: Env): string | undefined {
  return getCookie(c, cookieName(env));
}

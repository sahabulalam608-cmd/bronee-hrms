import { Hono } from 'hono';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import {
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  passwordResetSchema,
  signupRequestSchema,
  changePasswordSchema,
  type SessionUser,
} from '@bronee/shared';
import { departments, otpCodes, sessions, signupRequests, users } from '../db/schema.js';
import { badRequest, conflict, created, forbidden, notFound, ok, unauthorized } from '../lib/http.js';
import {
  randomId,
  generateOtp,
  hashPassword,
  verifyPassword,
  sha256,
  base64UrlEncode,
  base64UrlDecode,
} from '../lib/crypto.js';
import { detailList, emailShell, paragraph, sendEmail } from '../lib/email.js';
import { createSession, clearSessionCookie, readSessionToken, setSessionCookie, verifySessionToken, revokeSession } from '../lib/session.js';
import { requestMeta } from '../lib/audit.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimit, otpRateLimit } from '../middleware/rate-limit.js';
import { toPublicUser } from '../lib/mappers.js';
import type { AppEnv } from '../types.js';
export const authRoutes = new Hono<AppEnv>();

/* --------------------------------------------------------------- helpers */

async function loadUserWithRefs(db: any, userId: string) {
  const rows = await db
    .select({ user: users, departmentName: departments.name })
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!rows[0]) return null;
  const sub = rows[0].user.subDepartmentId
    ? await db
        .select({ name: departments.name })
        .from(departments)
        .where(eq(departments.id, rows[0].user.subDepartmentId))
        .limit(1)
    : [];
  const manager = rows[0].user.reportingManagerId
    ? await db
        .select({ fullName: users.fullName })
        .from(users)
        .where(eq(users.id, rows[0].user.reportingManagerId))
        .limit(1)
    : [];
  return {
    ...rows[0].user,
    departmentName: rows[0].departmentName ?? null,
    subDepartmentName: sub[0]?.name ?? null,
    managerName: manager[0]?.fullName ?? null,
  };
}

async function issueOtp(db: any, env: any, email: string, purpose: 'signup' | 'password_reset' | 'login_2fa') {
  const now = new Date();
  // Invalidate any outstanding codes for this email + purpose.
  await db
    .update(otpCodes)
    .set({ consumedAt: now.toISOString() })
    .where(and(eq(otpCodes.email, email), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt)));

  const code = await generateOtp();
  const codeHash = await otpDigest(code, email, purpose);

  await db.insert(otpCodes).values({
    id: randomId(),
    email,
    purpose,
    codeHash,
    expiresAt: new Date(now.getTime() + 10 * 60000).toISOString(),
    attempts: 0,
    consumedAt: null,
  });

  const html = emailShell(
    purpose === 'password_reset' ? 'Reset your password' : 'Verify your email address',
    `${paragraph(
      `Your BRONEE HRMS verification code is <strong style="letter-spacing:3px;font-size:18px;">${code}</strong>`,
    )}${paragraph('This code expires in 10 minutes. If you did not request it, you can safely ignore this email.')}`,
  );

  await sendEmail(db, env, {
    to: email,
    subject:
      purpose === 'password_reset'
        ? 'BRONEE HRMS — Password reset code'
        : 'BRONEE HRMS — Email verification code',
    html,
  });

  return { code };
}

/** Deterministic OTP digest — combined with a per-email attempt counter. */
async function otpDigest(code: string, email: string, purpose: string): Promise<string> {
  return sha256(`${purpose}:${email.toLowerCase()}:${code}`);
}

function otpTokenFor(email: string, purpose: string) {
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ email, purpose, exp: Date.now() + 15 * 60000 })),
  );
  return payload;
}

function readOtpToken(token: string): { email: string; purpose: string; exp: number } | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(token))) as {
      email: string;
      purpose: string;
      exp: number;
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- endpoints */

authRoutes.post('/signup/request-otp', otpRateLimit, zValidator('json', otpRequestSchema), async (c) => {
  const db = c.get('db');
  const env = c.get('env');
  const { email, purpose } = c.req.valid('json');

  const domain = (env.SIGNUP_EMAIL_DOMAIN || 'gmail.com').toLowerCase();
  const emailDomain = email.split('@')[1] ?? '';
  if (purpose === 'signup' && emailDomain !== domain && emailDomain !== `googlemail.com`) {
    throw badRequest(`Use your ${domain} address for the official email.`);
  }

  const existing = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0] && existing[0].status !== 'declined') {
    throw conflict('An account already exists for this email. Please sign in instead.');
  }

  await issueOtp(db, env, email, purpose);
  return ok(c, { sent: true, email });
});

authRoutes.post('/signup/verify-otp', otpRateLimit, zValidator('json', otpVerifySchema), async (c) => {
  const db = c.get('db');
  const { email, code, purpose } = c.req.valid('json');

  const rows = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.email, email),
        eq(otpCodes.purpose, purpose),
        isNull(otpCodes.consumedAt),
      ),
    )
    .orderBy(otpCodes.createdAt)
    .limit(1);

  const record = rows[0];
  if (!record) throw badRequest('Request a new verification code.');
  if (new Date(record.expiresAt).getTime() < Date.now()) throw badRequest('This code has expired. Request a new one.');
  if (record.attempts >= 5) throw badRequest('Too many attempts. Request a new code.');

  const digest = await otpDigest(code, email, purpose);
  if (digest !== record.codeHash) {
    await db.update(otpCodes).set({ attempts: record.attempts + 1 }).where(eq(otpCodes.id, record.id));
    throw badRequest('Incorrect verification code.');
  }

  await db.update(otpCodes).set({ consumedAt: new Date().toISOString() }).where(eq(otpCodes.id, record.id));

  return ok(c, { verified: true, otpToken: otpTokenFor(email, purpose), email });
});

authRoutes.post('/signup', authRateLimit, zValidator('json', signupRequestSchema), async (c) => {
  const db = c.get('db');
  const env = c.get('env');
  const body = c.req.valid('json');

  let tokenPayload: { email: string; purpose: string; exp: number } | null = null;
  tokenPayload = readOtpToken(body.otpToken);
  if (!tokenPayload || tokenPayload.email !== body.email || tokenPayload.exp < Date.now()) {
    throw badRequest('Your email verification has expired. Please verify again.');
  }

  const duplicateCode = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.employeeCode, body.employeeCode))
    .limit(1);
  if (duplicateCode[0]) throw conflict('This Employee ID is already taken.');

  const duplicateEmail = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);
  if (duplicateEmail[0]) throw conflict('An account already exists for this email.');

  const department = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, body.departmentId))
    .limit(1);
  void department;

  const { hash, salt } = await hashPassword(body.password);
  const userId = randomId();

  await db.insert(users).values({
    id: userId,
    email: body.email,
    passwordHash: hash,
    passwordSalt: salt,
    role: 'employee',
    status: 'pending',
    fullName: body.fullName,
    mobile: body.mobile,
    employeeCode: body.employeeCode,
    designationLabel: body.designation,
    departmentId: body.departmentId,
    subDepartmentId: body.subDepartmentId ?? null,
    reportingManagerId: body.reportingManagerId ?? null,
    joiningDate: body.joiningDate,
    mustChangePassword: false,
  });

  await db.insert(signupRequests).values({
    id: randomId(),
    userId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Notify every HR user that a new registration is waiting.
  const hrUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.role, 'hr'), eq(users.status, 'active')));
  void hrUsers;

  return created(c, { userId, status: 'pending', message: 'Registration submitted for HR approval.' });
});

authRoutes.post('/login', authRateLimit, zValidator('json', loginSchema), async (c) => {
  const db = c.get('db');
  const env = c.get('env');
  const { email, password } = c.req.valid('json');

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];

  if (!user) {
    throw unauthorized('Not a registered employee. Please sign up first.');
  }
  if (user.status === 'pending') {
    throw forbidden('Your registration is awaiting HR approval.');
  }
  if (user.status === 'declined') {
    throw forbidden('Your registration was declined. Contact HR for details.');
  }
  if (user.status === 'suspended') {
    throw forbidden('Your account has been suspended. Contact HR.');
  }

  const valid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!valid) {
    throw unauthorized('Incorrect email or password.');
  }

  await db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id));

  const meta = requestMeta(c);
  const token = await createSession(db, env, user, meta);
  setSessionCookie(c, env, token);

  const full = await loadUserWithRefs(db, user.id);
  return ok(c, { user: full ? toPublicUser(full) : null, token });
});

authRoutes.post('/logout', async (c) => {
  const db = c.get('db');
  const env = c.get('env');
  const token = readSessionToken(c, env);
  if (token) {
    const [encoded] = token.split('.');
    try {
      const payload = JSON.parse(
        new TextDecoder().decode(base64UrlDecode(encoded)),
      ) as { sid?: string };
      if (payload.sid) await revokeSession(db, payload.sid);
    } catch {
      /* ignore malformed cookie */
    }
  }
  clearSessionCookie(c, env);
  return ok(c, { signedOut: true });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const db = c.get('db');
  const session = c.get('session') as SessionUser;
  const user = await loadUserWithRefs(db, session.id);
  if (!user) throw unauthorized('Account not found.');
  return ok(c, { user: toPublicUser(user), permissions: c.get('permissions') });
});

authRoutes.post('/forgot-password', otpRateLimit, zValidator('json', otpRequestSchema), async (c) => {
  const db = c.get('db');
  const env = c.get('env');
  const { email } = c.req.valid('json');

  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!rows[0]) {
    // Do not leak account existence.
    return ok(c, { sent: true, email });
  }
  await issueOtp(db, env, email, 'password_reset');
  return ok(c, { sent: true, email });
});

authRoutes.post('/reset-password', authRateLimit, zValidator('json', passwordResetSchema), async (c) => {
  const db = c.get('db');
  const body = c.req.valid('json');

  const rows = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.email, body.email),
        eq(otpCodes.purpose, 'password_reset'),
        isNull(otpCodes.consumedAt),
      ),
    )
    .limit(1);
  const record = rows[0];
  if (!record || new Date(record.expiresAt).getTime() < Date.now()) {
    throw badRequest('This reset code is invalid or has expired.');
  }

  const digest = await otpDigest(body.code, body.email, 'password_reset');
  if (digest !== record.codeHash) {
    await db.update(otpCodes).set({ attempts: record.attempts + 1 }).where(eq(otpCodes.id, record.id));
    throw badRequest('Incorrect verification code.');
  }

  const { hash, salt } = await hashPassword(body.password);
  await db
    .update(users)
    .set({ passwordHash: hash, passwordSalt: salt, mustChangePassword: false, updatedAt: new Date().toISOString() })
    .where(eq(users.email, body.email));
  await db.update(otpCodes).set({ consumedAt: new Date().toISOString() }).where(eq(otpCodes.id, record.id));

  // Invalidate every existing session for this account.
  await db
    .update(sessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(sessions.userId, (await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1))[0].id), isNull(sessions.revokedAt)));

  return ok(c, { reset: true });
});

authRoutes.post('/change-password', requireAuth, zValidator('json', changePasswordSchema), async (c) => {
  const db = c.get('db');
  const session = c.get('session') as SessionUser;
  const body = c.req.valid('json');

  const rows = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
  const user = rows[0];
  if (!user) throw notFound('Account not found.');

  const valid = await verifyPassword(body.currentPassword, user.passwordHash, user.passwordSalt);
  if (!valid) throw badRequest('Current password is incorrect.');

  const { hash, salt } = await hashPassword(body.newPassword);
  await db
    .update(users)
    .set({ passwordHash: hash, passwordSalt: salt, mustChangePassword: false, updatedAt: new Date().toISOString() })
    .where(eq(users.id, session.id));

  return ok(c, { updated: true });
});

/** Housekeeping: clear expired OTP rows. */
authRoutes.post('/cleanup', async (c) => {
  const db = c.get('db');
  const result = await db.delete(otpCodes).where(lt(otpCodes.expiresAt, new Date().toISOString()));
  return ok(c, { removed: result.meta?.changes ?? 0 });
});

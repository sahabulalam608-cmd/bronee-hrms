/**
 * BRONEE HRMS — authentication routes.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { hashPassword, randomOtp, randomToken, verifyPassword } from '../../../shared/crypto';
import { ROLE_PERMISSIONS, type Role } from '../../../shared/constants';
import { isValidBdMobile, normalizeBdMobile } from '../../../shared/mobile';
import { isLatinOnly } from '../../../shared/text';
import { db } from '../db';
import { employees, otpCodes, sessions, signupApplications, users } from '../db/schema';
import { createSession, requireSession } from '../middleware/auth';
import { sendMail } from '../services/email';
import { pushSignupApplication } from '../services/sheets';
import type { Env } from '../env';

const auth = new Hono<{ Bindings: Env }>();

const SESSION_COOKIE = 'bronee_session';

auth.post('/login', async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';

  if (!email || !password) {
    return c.json({ error: 'BAD_REQUEST', message: 'Enter your email address and password.' }, 400);
  }

  const user = await database.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    return c.json(
      { error: 'NOT_REGISTERED', message: 'Not a registered employee. Please sign up first.' },
      404,
    );
  }

  const employee = await database.query.employees.findFirst({
    where: eq(employees.id, user.employeeId),
  });
  if (!employee) {
    return c.json({ error: 'NOT_REGISTERED', message: 'Not a registered employee.' }, 404);
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    return c.json(
      { error: 'BAD_CREDENTIALS', message: 'The email or password you entered is incorrect.' },
      401,
    );
  }

  if (employee.status === 'Pending') {
    return c.json(
      { error: 'PENDING_APPROVAL', message: 'Your registration is awaiting HR approval.' },
      403,
    );
  }
  if (employee.status === 'Declined') {
    return c.json({ error: 'DECLINED', message: 'Contact HR for instructions.' }, 403);
  }
  if (employee.status === 'Suspended') {
    return c.json({ error: 'SUSPENDED', message: 'Your account is suspended. Contact HR.' }, 403);
  }

  const token = await createSession(database, employee.id, employee.role as Role, c.env);
  await database.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id));

  c.header('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`);

  return c.json({ token, user: sessionUser(employee) });
});

auth.post('/signup/otp', async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as {
    email?: string;
    employeeId?: string;
    mobile?: string;
    fullName?: string;
    designation?: string;
    reportingManager?: string;
  };
  const email = (body.email ?? '').trim().toLowerCase();
  const employeeId = (body.employeeId ?? '').trim();
  if (!email) {
    return c.json({ error: 'BAD_REQUEST', message: 'An official email address is required.' }, 400);
  }
  // The mobile number must be eleven digits beginning with 01.
  if (!isValidBdMobile(body.mobile ?? '')) {
    return c.json(
      { error: 'BAD_MOBILE', field: 'mobile', message: 'Enter an 11-digit mobile number starting with 01.' },
      400,
    );
  }
  // Registration details are recorded in English only.
  for (const field of ['fullName', 'employeeId', 'designation', 'reportingManager'] as const) {
    const value = body[field];
    if (value && !isLatinOnly(value)) {
      return c.json(
        { error: 'BAD_REQUEST', field, message: 'This field only accepts English characters.' },
        400,
      );
    }
  }

  const existingEmail = await database.query.employees.findFirst({ where: eq(employees.email, email) });
  if (existingEmail) {
    return c.json(
      { error: 'DUPLICATE', field: 'email', message: 'This email address is already registered.' },
      409,
    );
  }
  if (employeeId) {
    const existingId = await database.query.employees.findFirst({
      where: eq(employees.employeeId, employeeId),
    });
    if (existingId) {
      return c.json(
        { error: 'DUPLICATE', field: 'employeeId', message: 'This employee ID is already registered.' },
        409,
      );
    }
  }

  const code = randomOtp();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await database.insert(otpCodes).values({
    id: `otp-${randomToken(6)}`,
    email,
    codeHash: await hashPassword(code),
    purpose: 'signup',
    expiresAt,
    consumed: 0,
    createdAt: new Date().toISOString(),
  });

  await sendMail(c.env, {
    to: email,
    subject: 'Your BRONEE HRMS verification code',
    text: `Your verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
  });

  return c.json({ email, expiresAt });
});

auth.post('/signup/verify', async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; code?: string };
  const email = (body.email ?? '').trim().toLowerCase();
  const code = (body.code ?? '').trim();

  const entry = await database.query.otpCodes.findFirst({
    where: eq(otpCodes.email, email),
  });
  if (!entry || entry.purpose !== 'signup' || entry.consumed) {
    return c.json({ error: 'NO_CHALLENGE', message: 'No verification is in progress for this email.' }, 400);
  }
  if (new Date(entry.expiresAt).getTime() < Date.now()) {
    return c.json({ error: 'EXPIRED', message: 'The verification code has expired.' }, 400);
  }
  if (!(await verifyPassword(code, entry.codeHash))) {
    return c.json({ error: 'BAD_CODE', message: 'That code is not correct.' }, 400);
  }
  return c.json({ verified: true });
});

auth.post('/signup', async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, string>;
  const email = (body.email ?? '').trim().toLowerCase();

  const entry = await database.query.otpCodes.findFirst({ where: eq(otpCodes.email, email) });
  if (!entry || entry.purpose !== 'signup' || entry.consumed) {
    return c.json(
      { error: 'NO_CHALLENGE', message: 'Verify your email address before submitting.' },
      400,
    );
  }
  if (new Date(entry.expiresAt).getTime() < Date.now()) {
    return c.json({ error: 'EXPIRED', message: 'The verification code has expired.' }, 400);
  }

  const password = body.password ?? '';
  if (password.length < 8) {
    return c.json({ error: 'WEAK_PASSWORD', message: 'Use at least 8 characters.' }, 400);
  }

  if (!isValidBdMobile(body.mobile ?? '')) {
    return c.json(
      { error: 'BAD_MOBILE', field: 'mobile', message: 'Enter an 11-digit mobile number starting with 01.' },
      400,
    );
  }
  for (const field of ['fullName', 'employeeId', 'designation', 'reportingManager'] as const) {
    const value = body[field];
    if (value && !isLatinOnly(value)) {
      return c.json(
        { error: 'BAD_REQUEST', field, message: 'This field only accepts English characters.' },
        400,
      );
    }
  }

  const passwordHash = await hashPassword(password);
  const id = `sg-${randomToken(8)}`;
  const submittedAt = new Date().toISOString();
  const joiningDate = body.joiningDate ?? submittedAt.slice(0, 10);
  const mobile = normalizeBdMobile(body.mobile ?? '') ?? (body.mobile ?? '').trim();

  await database.insert(signupApplications).values({
    id,
    fullName: body.fullName ?? '',
    mobile,
    employeeId: (body.employeeId ?? '').trim(),
    designation: body.designation ?? '',
    email,
    departmentName: body.departmentName ?? '',
    subDepartmentName: body.subDepartmentName ?? null,
    reportingManager: body.reportingManager ?? null,
    joiningDate,
    passwordHash,
    submittedAt,
    status: 'Pending',
  });
  await database.update(otpCodes).set({ consumed: 1 }).where(eq(otpCodes.id, entry.id));

  // Every signup is mirrored to the Employee Signups sheet. A sheet failure
  // must not lose the application, so it is reported but never fatal.
  const existing = await database.query.signupApplications.findMany({ columns: { id: true } });
  let sheetWritten = false;
  try {
    await pushSignupApplication(
      c.env,
      {
        applicationId: id,
        fullName: body.fullName ?? '',
        mobile,
        employeeId: (body.employeeId ?? '').trim(),
        designation: body.designation ?? '',
        email,
        departmentName: body.departmentName ?? '',
        subDepartmentName: body.subDepartmentName ?? null,
        reportingManager: body.reportingManager ?? null,
        joiningDate,
        submittedAt,
        status: 'Pending',
      },
      existing.length + 1,
    );
    sheetWritten = true;
  } catch (error) {
    console.error('[sheets:signup]', error);
  }

  return c.json({ status: 'Pending', applicationId: id, sheetWritten });
});

auth.post('/password/forgot', async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? '').trim().toLowerCase();

  const user = await database.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    return c.json(
      { error: 'NOT_REGISTERED', message: 'Not a registered employee. Please sign up first.' },
      404,
    );
  }

  const code = randomOtp();
  await database.insert(otpCodes).values({
    id: `otp-${randomToken(6)}`,
    email,
    codeHash: await hashPassword(code),
    purpose: 'reset',
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    consumed: 0,
    createdAt: new Date().toISOString(),
  });
  await sendMail(c.env, {
    to: email,
    subject: 'Reset your BRONEE HRMS password',
    text: `Your password reset code is ${code}. It expires in 10 minutes.`,
  });
  return c.json({ sent: true });
});

auth.post('/password/reset', async (c) => {
  const database = db(c.env);
  const body = (await c.req.json().catch(() => ({}))) as {
    email?: string;
    code?: string;
    password?: string;
  };
  const email = (body.email ?? '').trim().toLowerCase();
  const code = (body.code ?? '').trim();
  const password = body.password ?? '';
  if (password.length < 8) {
    return c.json({ error: 'WEAK_PASSWORD', message: 'Use at least 8 characters.' }, 400);
  }

  const entry = await database.query.otpCodes.findFirst({ where: eq(otpCodes.email, email) });
  if (!entry || entry.purpose !== 'reset' || entry.consumed) {
    return c.json({ error: 'NO_CHALLENGE', message: 'No reset is in progress.' }, 400);
  }
  if (new Date(entry.expiresAt).getTime() < Date.now()) {
    return c.json({ error: 'EXPIRED', message: 'The verification code has expired.' }, 400);
  }
  if (!(await verifyPassword(code, entry.codeHash))) {
    return c.json({ error: 'BAD_CODE', message: 'That code is not correct.' }, 400);
  }

  await database
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.email, email));
  await database.update(otpCodes).set({ consumed: 1 }).where(eq(otpCodes.id, entry.id));

  return c.json({ ok: true });
});

auth.get('/me', async (c) => {
  const database = db(c.env);
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return c.json(null);

  const session = await database.query.sessions.findFirst({ where: eq(sessions.token, token) });
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return c.json(null);
  const employee = await database.query.employees.findFirst({
    where: eq(employees.id, session.employeeId),
  });
  if (!employee) return c.json(null);
  return c.json(sessionUser(employee));
});

auth.post('/logout', async (c) => {
  const database = db(c.env);
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) await database.delete(sessions).where(eq(sessions.token, token));
  c.header('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return c.json({ ok: true });
});

export function sessionUser(employee: typeof employees.$inferSelect) {
  const role = employee.role as Role;
  return {
    id: employee.id,
    employeeId: employee.employeeId,
    fullName: employee.fullName,
    email: employee.email,
    designation: employee.designation,
    departmentId: employee.departmentId,
    departmentName: '',
    subDepartmentId: employee.subDepartmentId,
    subDepartmentName: null,
    reportingManager: employee.reportingManager,
    joiningDate: employee.joiningDate,
    shiftCode: employee.shiftCode,
    shiftName: employee.shiftCode,
    status: employee.status,
    portal: employee.portal,
    role,
    permissions: employee.portal === 'HR' ? ROLE_PERMISSIONS[role] : [],
    profilePhotoUrl: null,
    baseSalary: employee.baseSalary ?? undefined,
  };
}

export { auth, requireSession };

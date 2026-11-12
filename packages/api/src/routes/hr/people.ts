import { Hono } from 'hono';
import { and, asc, desc, eq, ne, or, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import {
  PROTECTED_DEPARTMENT_NAMES,
  departmentSchema,
  designationSchema,
  shiftSchema,
  signupReviewSchema,
} from '@bronee/shared';
import {
  departments,
  designations,
  profileUpdateRequests,
  shifts,
  signupRequests,
  users,
} from '../../db/schema.js';
import { badRequest, conflict, forbidden, notFound, ok } from '../../lib/http.js';
import { randomId } from '../../lib/crypto.js';
import { requirePermission } from '../../middleware/auth.js';
import { toDesignation, toPublicUser, toShift } from '../../lib/mappers.js';
import { findUserById, listActiveEmployees, listDepartments, listDesignations, listShifts } from '../../lib/queries.js';
import { requestMeta, writeAudit } from '../../lib/audit.js';
import { createNotifications } from '../../lib/notifications.js';
import { PERMISSIONS } from '@bronee/shared';
import { detailList, emailShell, paragraph } from '../../lib/email.js';
import type { AppEnv } from '../../types.js';
export const hrPeopleRoutes = new Hono<AppEnv>();

/* ================================================================ employees */

hrPeopleRoutes.get('/employees', requirePermission([PERMISSIONS.HR_EMPLOYEE_VIEW]), async (c) => {
  const db = c.get('db');
  const search = c.req.query('search')?.trim().toLowerCase();
  const status = c.req.query('status');

  const rows = await listActiveEmployees(db);
  const filtered = rows.filter((r) => {
    if (status && r.status !== status) return false;
    if (!search) return true;
    return (
      r.fullName.toLowerCase().includes(search) ||
      r.employeeCode.toLowerCase().includes(search) ||
      (r.designationLabel ?? '').toLowerCase().includes(search) ||
      (r.departmentName ?? '').toLowerCase().includes(search)
    );
  });

  return ok(c, { items: filtered });
});

/** Update the parts of an employee record HR is allowed to change. */
hrPeopleRoutes.patch(
  '/employees/:id',
  requirePermission([PERMISSIONS.HR_EMPLOYEE_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = (await c.req.json()) as {
      fullName?: string;
      mobile?: string;
      employeeCode?: string;
      designationLabel?: string;
      departmentId?: string;
      subDepartmentId?: string | null;
      reportingManagerId?: string | null;
      joiningDate?: string;
      role?: string;
      status?: string;
    };

    const before = await findUserById(db, id);
    if (!before) throw notFound('Employee not found.');

    if (body.employeeCode && body.employeeCode !== before.employeeCode) {
      const duplicate = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.employeeCode, body.employeeCode), ne(users.id, id)))
        .limit(1);
      if (duplicate[0]) throw conflict('This Employee ID is already in use.');
    }

    await db
      .update(users)
      .set({
        fullName: body.fullName ?? before.fullName,
        mobile: body.mobile ?? before.mobile,
        employeeCode: body.employeeCode ?? before.employeeCode,
        designationLabel: body.designationLabel ?? before.designationLabel,
        departmentId: body.departmentId ?? before.departmentId,
        subDepartmentId: body.subDepartmentId === undefined ? before.subDepartmentId : body.subDepartmentId,
        reportingManagerId:
          body.reportingManagerId === undefined ? before.reportingManagerId : body.reportingManagerId,
        joiningDate: body.joiningDate ?? before.joiningDate,
        role: (body.role as never) ?? before.role,
        status: (body.status as never) ?? before.status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, id));

    const after = await findUserById(db, id);
    const meta = requestMeta(c);
    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'employee.updated',
      entityType: 'user',
      entityId: id,
      before: { fullName: before.fullName, status: before.status, departmentId: before.departmentId },
      after: { fullName: after?.fullName, status: after?.status, departmentId: after?.departmentId },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok(c, { employee: after ? toPublicUser(after) : null });
  },
);

/** Suspend / reinstate an employee. */
hrPeopleRoutes.post(
  '/employees/:id/status',
  requirePermission([PERMISSIONS.HR_EMPLOYEE_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = (await c.req.json()) as { status: string; note?: string };

    if (!['active', 'approved', 'suspended', 'declined'].includes(body.status)) {
      throw badRequest('Invalid account status.');
    }
    if (id === session.id) throw badRequest('You cannot change your own account status.');

    const before = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!before[0]) throw notFound('Employee not found.');

    await db
      .update(users)
      .set({ status: body.status as never, updatedAt: new Date().toISOString() })
      .where(eq(users.id, id));

    const meta = requestMeta(c);
    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'employee.status_changed',
      entityType: 'user',
      entityId: id,
      before: { status: before[0].status },
      after: { status: body.status, note: body.note ?? null },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok(c, { status: body.status });
  },
);

/* ============================================================== signups */

hrPeopleRoutes.get(
  '/signups',
  requirePermission([PERMISSIONS.HR_SIGNUP_APPROVE]),
  async (c) => {
    const db = c.get('db');
    const status = c.req.query('status') ?? 'pending';

    const rows = await db
      .select({
        request: signupRequests,
        user: users,
        departmentName: departments.name,
      })
      .from(signupRequests)
      .innerJoin(users, eq(signupRequests.userId, users.id))
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(eq(signupRequests.status, status as never))
      .orderBy(asc(signupRequests.createdAt));

    return ok(c, {
      items: rows.map((r) => ({
        requestId: r.request.id,
        status: r.request.status,
        proposedSalary: r.request.proposedSalary,
        reviewNote: r.request.reviewNote,
        createdAt: r.request.createdAt,
        reviewedAt: r.request.reviewedAt,
        employee: {
          id: r.user.id,
          fullName: r.user.fullName,
          email: r.user.email,
          mobile: r.user.mobile,
          employeeCode: r.user.employeeCode,
          designation: r.user.designationLabel,
          departmentId: r.user.departmentId,
          department: r.departmentName,
          subDepartmentId: r.user.subDepartmentId,
          joiningDate: r.user.joiningDate,
          reportingManagerId: r.user.reportingManagerId,
        },
      })),
    });
  },
);

/** Approve or decline a signup request, optionally correcting the details. */
hrPeopleRoutes.post(
  '/signups/:id/review',
  requirePermission([PERMISSIONS.HR_SIGNUP_APPROVE]),
  zValidator('json', signupReviewSchema),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const rows = await db.select().from(signupRequests).where(eq(signupRequests.id, id)).limit(1);
    const request = rows[0];
    if (!request) throw notFound('Signup request not found.');
    if (request.status !== 'pending') throw badRequest('This request has already been reviewed.');

    const userRows = await db.select().from(users).where(eq(users.id, request.userId)).limit(1);
    const applicant = userRows[0];
    if (!applicant) throw notFound('Applicant not found.');

    const correction = body.correction ?? {};
    const now = new Date().toISOString();

    if (body.decision === 'approve') {
      await db
        .update(users)
        .set({
          status: 'active',
          fullName: correction.fullName ?? applicant.fullName,
          mobile: correction.mobile ?? applicant.mobile,
          employeeCode: correction.employeeCode ?? applicant.employeeCode,
          designationLabel: correction.designation ?? applicant.designationLabel,
          departmentId: correction.departmentId ?? applicant.departmentId,
          subDepartmentId:
            correction.subDepartmentId === undefined ? applicant.subDepartmentId : correction.subDepartmentId,
          reportingManagerId:
            correction.reportingManagerId === undefined
              ? applicant.reportingManagerId
              : correction.reportingManagerId,
          joiningDate: correction.joiningDate ?? applicant.joiningDate,
          updatedAt: now,
        })
        .where(eq(users.id, applicant.id));

      await db
        .update(signupRequests)
        .set({
          status: 'approved',
          proposedSalary: body.salary ?? request.proposedSalary,
          reviewedBy: session.id,
          reviewNote: body.note ?? null,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(signupRequests.id, id));

      await createNotifications(db, env, [
        {
          employeeId: applicant.id,
          type: 'account_approved',
          title: 'Your BRONEE HRMS account has been approved',
          body: 'Welcome aboard. You can now sign in and start using the employee portal.',
          link: '/app/dashboard',
          createdBy: session.id,
          emailSubject: 'BRONEE HRMS — Your account has been approved',
          emailHtml: emailShell(
            'Your account has been approved',
            `${paragraph('Hi ' + applicant.fullName + ', your BRONEE HRMS account has been approved by HR.')}${paragraph('You can now sign in and start using the employee portal.')}`,
          ),
        },
      ]);
    } else {
      await db.update(users).set({ status: 'declined', updatedAt: now }).where(eq(users.id, applicant.id));
      await db
        .update(signupRequests)
        .set({
          status: 'declined',
          reviewedBy: session.id,
          reviewNote: body.note ?? null,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(signupRequests.id, id));

      await createNotifications(db, env, [
        {
          employeeId: applicant.id,
          type: 'account_declined',
          title: 'Your BRONEE HRMS registration could not be approved',
          body: body.note ? `Reason: ${body.note}` : 'Please contact HR for more information.',
          link: '/login',
          createdBy: session.id,
        },
      ]);
    }

    const meta = requestMeta(c);
    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: `signup.${body.decision}`,
      entityType: 'signup_request',
      entityId: id,
      before: { status: request.status },
      after: { status: body.decision, note: body.note ?? null, corrections: correction },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok(c, { status: body.decision });
  },
);

/* ======================================================= profile requests */

hrPeopleRoutes.get(
  '/profile-requests',
  requirePermission([PERMISSIONS.HR_EMPLOYEE_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const rows = await db
      .select({ request: profileUpdateRequests, employeeName: users.fullName, employeeCode: users.employeeCode })
      .from(profileUpdateRequests)
      .innerJoin(users, eq(profileUpdateRequests.employeeId, users.id))
      .orderBy(desc(profileUpdateRequests.createdAt));

    return ok(c, {
      items: rows.map((r) => ({
        id: r.request.id,
        employeeId: r.request.employeeId,
        employeeName: r.employeeName,
        employeeCode: r.employeeCode,
        fields: r.request.fields,
        reason: r.request.reason,
        status: r.request.status,
        reviewNote: r.request.reviewNote,
        createdAt: r.request.createdAt,
      })),
    });
  },
);

hrPeopleRoutes.post(
  '/profile-requests/:id/review',
  requirePermission([PERMISSIONS.HR_EMPLOYEE_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = (await c.req.json()) as { decision: 'approve' | 'decline'; note?: string };

    const rows = await db.select().from(profileUpdateRequests).where(eq(profileUpdateRequests.id, id)).limit(1);
    const request = rows[0];
    if (!request) throw notFound('Profile request not found.');
    if (request.status !== 'pending') throw badRequest('This request has already been reviewed.');

    const now = new Date().toISOString();
    if (body.decision === 'approve') {
      const fields = request.fields as Record<string, unknown>;
      await db
        .update(users)
        .set({
          mobile: (fields.mobile as string) ?? undefined,
          reportingManagerId:
            fields.reportingManagerId === undefined
              ? undefined
              : ((fields.reportingManagerId as string) ?? null),
          avatarKey: (fields.avatarKey as string) ?? undefined,
          updatedAt: now,
        })
        .where(eq(users.id, request.employeeId));
    }
    await db
      .update(profileUpdateRequests)
      .set({
        status: body.decision === 'approve' ? 'approved' : 'declined',
        reviewedBy: session.id,
        reviewNote: body.note ?? null,
        reviewedAt: now,
      })
      .where(eq(profileUpdateRequests.id, id));

    return ok(c, { status: body.decision });
  },
);

/* ========================================================== departments */

hrPeopleRoutes.get(
  '/departments',
  requirePermission([PERMISSIONS.HR_EMPLOYEE_VIEW]),
  async (c) => {
    const db = c.get('db');
    const { all, tree } = await listDepartments(db, false);
    const counts = await db
      .select({ departmentId: users.departmentId, count: sql<number>`count(*)` })
      .from(users)
      .where(ne(users.status, 'pending'))
      .groupBy(users.departmentId);

    return ok(c, {
      items: all.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        parentId: d.parentId,
        displayOrder: d.displayOrder,
        isActive: d.isActive,
        employeeCount: counts.find((x) => x.departmentId === d.id)?.count ?? 0,
      })),
      tree: tree.map((d) => ({
        ...d,
        children: d.children.map((c2) => ({
          ...c2,
          employeeCount: counts.find((x) => x.departmentId === c2.id)?.count ?? 0,
        })),
      })),
    });
  },
);

hrPeopleRoutes.post(
  '/departments',
  requirePermission([PERMISSIONS.HR_DEPARTMENT_MANAGE]),
  zValidator('json', departmentSchema),
  async (c) => {
    const db = c.get('db');
    const session = c.get('session');
    const body = c.req.valid('json');

    if (body.parentId) {
      const parent = await db.select().from(departments).where(eq(departments.id, body.parentId)).limit(1);
      if (!parent[0]) throw badRequest('The parent department does not exist.');
    }

    const record = {
      id: randomId(),
      name: body.name,
      type: body.type,
      parentId: body.parentId ?? null,
      displayOrder: body.displayOrder ?? 99,
      isActive: body.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.insert(departments).values(record);

    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'department.created',
      entityType: 'department',
      entityId: record.id,
      after: record,
    });

    return ok(c, { department: record });
  },
);

hrPeopleRoutes.patch(
  '/departments/:id',
  requirePermission([PERMISSIONS.HR_DEPARTMENT_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = (await c.req.json()) as {
      name?: string;
      displayOrder?: number;
      isActive?: boolean;
      type?: string;
      parentId?: string | null;
    };

    const rows = await db.select().from(departments).where(eq(departments.id, id)).limit(1);
    const before = rows[0];
    if (!before) throw notFound('Department not found.');

    const isProtected = PROTECTED_DEPARTMENT_NAMES.includes(before.name as never);
    const wantsProtectedOrderChange =
      body.displayOrder !== undefined &&
      body.displayOrder !== before.displayOrder &&
      (isProtected || PROTECTED_DEPARTMENT_NAMES.includes((body.name ?? before.name) as never));

    if (wantsProtectedOrderChange) {
      const allowed = session.role === 'super_admin';
      if (!allowed) {
        throw forbidden(
          'HR and CEO are protected departments — only a Super Admin can change their display order.',
        );
      }
    }

    await db
      .update(departments)
      .set({
        name: body.name ?? before.name,
        displayOrder: body.displayOrder ?? before.displayOrder,
        isActive: body.isActive ?? before.isActive,
        type: (body.type as never) ?? before.type,
        parentId: body.parentId === undefined ? before.parentId : body.parentId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(departments.id, id));

    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'department.updated',
      entityType: 'department',
      entityId: id,
      before: { name: before.name, displayOrder: before.displayOrder, isActive: before.isActive },
      after: body,
    });

    const after = (await db.select().from(departments).where(eq(departments.id, id)).limit(1))[0];
    return ok(c, { department: after });
  },
);

/**
 * Delete is only allowed when the department has no employees and no
 * historical references. Otherwise it must be deactivated.
 */
hrPeopleRoutes.delete(
  '/departments/:id',
  requirePermission([PERMISSIONS.HR_DEPARTMENT_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const session = c.get('session');
    const id = c.req.param('id');

    const rows = await db.select().from(departments).where(eq(departments.id, id)).limit(1);
    const department = rows[0];
    if (!department) throw notFound('Department not found.');

    const employees = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.departmentId, id), eq(users.subDepartmentId, id)))
      .limit(1);
    if (employees.length) {
      throw conflict(
        'This department still has employees assigned. Deactivate it instead so historical records stay intact.',
      );
    }

    const children = await db.select().from(departments).where(eq(departments.parentId, id)).limit(1);
    if (children.length) {
      throw conflict('Remove or reassign the sub-departments first.');
    }

    await db.delete(departments).where(eq(departments.id, id));
    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'department.deleted',
      entityType: 'department',
      entityId: id,
      before: department,
    });

    return ok(c, { deleted: true });
  },
);

/* ========================================================= designations */

hrPeopleRoutes.get('/designations', requirePermission([PERMISSIONS.HR_EMPLOYEE_VIEW]), async (c) => {
  const db = c.get('db');
  const rows = await listDesignations(db, false);
  return ok(c, { items: rows.map(toDesignation) });
});

hrPeopleRoutes.post(
  '/designations',
  requirePermission([PERMISSIONS.HR_DESIGNATION_MANAGE]),
  zValidator('json', designationSchema),
  async (c) => {
    const db = c.get('db');
    const record = {
      id: randomId(),
      name: c.req.valid('json').name,
      displayOrder: c.req.valid('json').displayOrder ?? 99,
      isActive: c.req.valid('json').isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.insert(designations).values(record);
    return ok(c, { designation: toDesignation(record) });
  },
);

hrPeopleRoutes.patch(
  '/designations/:id',
  requirePermission([PERMISSIONS.HR_DESIGNATION_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    const body = (await c.req.json()) as { name?: string; displayOrder?: number; isActive?: boolean };
    const rows = await db.select().from(designations).where(eq(designations.id, id)).limit(1);
    if (!rows[0]) throw notFound('Designation not found.');
    await db
      .update(designations)
      .set({
        name: body.name ?? rows[0].name,
        displayOrder: body.displayOrder ?? rows[0].displayOrder,
        isActive: body.isActive ?? rows[0].isActive,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(designations.id, id));
    const after = (await db.select().from(designations).where(eq(designations.id, id)).limit(1))[0];
    return ok(c, { designation: toDesignation(after) });
  },
);

/* =============================================================== shifts */

hrPeopleRoutes.get('/shifts', requirePermission([PERMISSIONS.HR_EMPLOYEE_VIEW]), async (c) => {
  const db = c.get('db');
  const rows = await listShifts(db, false);
  return ok(c, { items: rows.map(toShift) });
});

hrPeopleRoutes.post(
  '/shifts',
  requirePermission([PERMISSIONS.HR_SHIFT_MANAGE]),
  zValidator('json', shiftSchema),
  async (c) => {
    const db = c.get('db');
    const body = c.req.valid('json');
    const record = {
      id: randomId(),
      code: body.code.toUpperCase(),
      name: body.name,
      shortName: body.shortName,
      startTime: body.startTime,
      endTime: body.endTime,
      endsNextDay: body.endsNextDay,
      locationPolicy: body.locationPolicy,
      requiresOfficeVerification: body.requiresOfficeVerification,
      segments: null,
      displayOrder: body.displayOrder ?? 99,
      isActive: body.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.insert(shifts).values(record);
    return ok(c, { shift: toShift(record) });
  },
);

hrPeopleRoutes.patch(
  '/shifts/:id',
  requirePermission([PERMISSIONS.HR_SHIFT_MANAGE]),
  async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    const body = (await c.req.json()) as Record<string, unknown>;
    const rows = await db.select().from(shifts).where(eq(shifts.id, id)).limit(1);
    if (!rows[0]) throw notFound('Shift not found.');
    await db
      .update(shifts)
      .set({
        name: (body.name as string) ?? rows[0].name,
        shortName: (body.shortName as string) ?? rows[0].shortName,
        startTime: (body.startTime as string) ?? rows[0].startTime,
        endTime: (body.endTime as string) ?? rows[0].endTime,
        endsNextDay: (body.endsNextDay as boolean) ?? rows[0].endsNextDay,
        locationPolicy: (body.locationPolicy as never) ?? rows[0].locationPolicy,
        requiresOfficeVerification:
          (body.requiresOfficeVerification as boolean) ?? rows[0].requiresOfficeVerification,
        displayOrder: (body.displayOrder as number) ?? rows[0].displayOrder,
        isActive: (body.isActive as boolean) ?? rows[0].isActive,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(shifts.id, id));
    const after = (await db.select().from(shifts).where(eq(shifts.id, id)).limit(1))[0];
    return ok(c, { shift: toShift(after) });
  },
);

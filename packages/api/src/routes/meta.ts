import { Hono } from 'hono';
import { asc, eq, ne } from 'drizzle-orm';
import { departments, designations, users } from '../db/schema.js';
import { ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { listDepartments, listDesignations, listShifts } from '../lib/queries.js';
import { toDepartment, toDesignation, toShift } from '../lib/mappers.js';
import type { AppEnv } from '../types.js';
export const metaRoutes = new Hono<AppEnv>();

metaRoutes.use('*', requireAuth);

/**
 * Reference data used by the signup form and the admin dropdowns.
 * Only active departments / sub-departments are exposed to new signups.
 */
metaRoutes.get('/departments', async (c) => {
  const db = c.get('db');
  const includeInactive = c.req.query('includeInactive') === '1' && c.get('session').role !== 'employee';
  const { all, tree } = await listDepartments(db, !includeInactive);
  return ok(c, {
    items: all.map(toDepartment),
    tree: tree.map((d) => ({ ...toDepartment(d), children: d.children.map(toDepartment) })),
  });
});

metaRoutes.get('/designations', async (c) => {
  const db = c.get('db');
  const includeInactive = c.req.query('includeInactive') === '1' && c.get('session').role !== 'employee';
  const rows = await listDesignations(db, !includeInactive);
  return ok(c, { items: rows.map(toDesignation) });
});

metaRoutes.get('/shifts', async (c) => {
  const db = c.get('db');
  const includeInactive = c.req.query('includeInactive') === '1' && c.get('session').role !== 'employee';
  const rows = await listShifts(db, !includeInactive);
  return ok(c, { items: rows.map(toShift) });
});

/** Minimal employee directory for pickers (no private fields). */
metaRoutes.get('/employees', async (c) => {
  const db = c.get('db');
  const search = c.req.query('search')?.trim().toLowerCase();

  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      employeeCode: users.employeeCode,
      email: users.email,
      mobile: users.mobile,
      designationLabel: users.designationLabel,
      departmentId: users.departmentId,
      subDepartmentId: users.subDepartmentId,
      joiningDate: users.joiningDate,
      role: users.role,
      status: users.status,
      departmentName: departments.name,
    })
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(ne(users.status, 'pending'))
    .orderBy(asc(departments.displayOrder), asc(users.joiningDate), asc(users.fullName));

  const filtered = search
    ? rows.filter(
        (r) =>
          r.fullName.toLowerCase().includes(search) ||
          r.employeeCode.toLowerCase().includes(search) ||
          (r.departmentName ?? '').toLowerCase().includes(search),
      )
    : rows;

  return ok(c, { items: filtered });
});

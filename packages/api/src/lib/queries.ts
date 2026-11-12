/**
 * Shared query helpers used by both the employee and HR route modules.
 */
import { and, asc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';import type { DB } from '../db/client.js';
import {
  departments,
  designations,
  files,
  rosterEntries,
  rosters,
  shifts,
  users,
} from '../db/schema.js';

/** User row joined with department / sub-department / manager names. */
export async function findUserById(db: DB, id: string) {
  const rows = await db
    .select({
      user: users,
      departmentName: departments.name,
    })
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(users.id, id))
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

export async function findUserByEmail(db: DB, email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return rows[0] ?? null;
}

/** Active employees ordered by department display order then joining date. */
export async function listActiveEmployees(db: DB) {
  return db
    .select({
      id: users.id,
      fullName: users.fullName,
      employeeCode: users.employeeCode,
      email: users.email,
      mobile: users.mobile,
      designationLabel: users.designationLabel,
      designationId: users.designationId,
      departmentId: users.departmentId,
      subDepartmentId: users.subDepartmentId,
      reportingManagerId: users.reportingManagerId,
      joiningDate: users.joiningDate,
      role: users.role,
      status: users.status,
      avatarKey: users.avatarKey,
      departmentName: departments.name,
    })
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(and(ne(users.status, 'pending'), ne(users.status, 'declined')))
    .orderBy(asc(departments.displayOrder), asc(users.joiningDate), asc(users.fullName));
}

/** Department tree with children (active only when requested). */
export async function listDepartments(db: DB, onlyActive = true) {
  const rows = await db
    .select()
    .from(departments)
    .orderBy(asc(departments.displayOrder), asc(departments.name));
  const filtered = onlyActive ? rows.filter((d) => d.isActive) : rows;
  const top = filtered
    .filter((d) => !d.parentId)
    .map((d) => ({
      ...d,
      children: filtered
        .filter((c) => c.parentId === d.id)
        .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
    }));
  return { all: filtered, tree: top };
}

export async function listShifts(db: DB, onlyActive = true) {
  const rows = await db.select().from(shifts).orderBy(asc(shifts.displayOrder), asc(shifts.name));
  return onlyActive ? rows.filter((s) => s.isActive) : rows;
}

export async function listDesignations(db: DB, onlyActive = true) {
  const rows = await db.select().from(designations).orderBy(asc(designations.displayOrder), asc(designations.name));
  return onlyActive ? rows.filter((d) => d.isActive) : rows;
}

/** Published roster entry for an employee on a specific date. */
export async function findRosterEntry(db: DB, employeeId: string, date: string) {
  const rows = await db
    .select({
      entry: rosterEntries,
      rosterStatus: rosters.status,
      rosterId: rosters.id,
      rosterName: rosters.name,
    })
    .from(rosterEntries)
    .innerJoin(rosters, eq(rosterEntries.rosterId, rosters.id))
    .where(
      and(
        eq(rosterEntries.employeeId, employeeId),
        eq(rosterEntries.date, date),
        eq(rosters.status, 'published'),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Employees that a given employee may see in a roster (same department). */
export async function rosterAudience(db: DB, employeeId: string) {
  const me = await findUserById(db, employeeId);
  if (!me) return [];
  if (me.role === 'hr' || me.role === 'super_admin') {
    const all = await listActiveEmployees(db);
    return all;
  }
  const peers = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      employeeCode: users.employeeCode,
      departmentId: users.departmentId,
      subDepartmentId: users.subDepartmentId,
      joiningDate: users.joiningDate,
      departmentName: departments.name,
    })
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(
      and(
        ne(users.status, 'pending'),
        ne(users.status, 'declined'),
        or(
          me.departmentId ? eq(users.departmentId, me.departmentId) : isNull(users.departmentId),
          eq(users.id, me.id),
        ),
      ),
    )
    .orderBy(asc(departments.displayOrder), asc(users.joiningDate), asc(users.fullName));
  return peers;
}

/** File metadata for a storage key. */
export async function findFile(db: DB, key: string) {
  const rows = await db.select().from(files).where(eq(files.key, key)).limit(1);
  return rows[0] ?? null;
}

/** Guard: only the owner or an HR/admin role may read a file. */
export function canAccessFile(
  file: { ownerId: string },
  viewer: { id: string; role: string },
): boolean {
  if (file.ownerId === viewer.id) return true;
  return viewer.role === 'hr' || viewer.role === 'super_admin';
}

/** Parse `?page=&pageSize=` style query params. */
export function pagination(c: { req: { query: (k: string) => string | undefined } }) {
  const page = Math.max(1, Number(c.req.query('page') ?? '1') || 1);
  const rawSize = Number(c.req.query('pageSize') ?? '25') || 25;
  const pageSize = Math.min(200, Math.max(1, rawSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Build an `IN (...)` filter safely. */
export function inList<T extends unknown[]>(values: T | null | undefined) {
  if (!values || values.length === 0) return undefined;
  return inArray;
}

export { sql };

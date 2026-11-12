/**
 * Roster engine — creation, change detection, publish workflow and
 * operational conflict warnings.
 */
import { and, asc, eq, gte, inArray, lte, or } from 'drizzle-orm';
import {
  dhakaDateKey,
  type RosterDayCell,
  type StaffingWarning,
} from '@bronee/shared';
import type { DB } from '../db/client.js';
import {
  departments,
  rosterChanges,
  rosterEntries,
  rosters,
  shifts,
  staffingRules,
  users,
} from '../db/schema.js';
import { randomId } from './crypto.js';

export type RosterEntryInput = {
  employeeId: string;
  date: string;
  shiftId: string | null;
  isOff: boolean;
};

export type RosterConflict = StaffingWarning;

/** Load the employee's roster shift for a date (published rosters only). */
export async function publishedEntry(db: DB, employeeId: string, date: string) {
  const rows = await db
    .select({ entry: rosterEntries, roster: rosters })
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

/**
 * Detect conflicts before publishing:
 *  - an employee scheduled twice on the same date (overlapping rosters)
 *  - a department below its minimum staffing on a given day
 *  - a shift assigned to a department below the required headcount
 */
export async function detectConflicts(
  db: DB,
  entries: RosterEntryInput[],
  startDate: string,
  endDate: string,
): Promise<RosterConflict[]> {
  const warnings: RosterConflict[] = [];
  const employeeIds = [...new Set(entries.map((e) => e.employeeId))];

  if (employeeIds.length === 0) return warnings;

  /* ---- duplicate / overlapping assignment for the same employee+date ---- */
  const seen = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.employeeId}:${entry.date}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      const [employeeId, date] = key.split(':');
      warnings.push({
        code: 'CONFLICT',
        severity: 'error',
        message: 'An employee is scheduled more than once on the same day.',
        date,
        departmentId: null,
        employeeId,
      });
    }
  }

  /* ---- existing published entries that overlap this roster window ---- */
  const existing = await db
    .select({ entry: rosterEntries, employeeName: users.fullName })
    .from(rosterEntries)
    .innerJoin(users, eq(rosterEntries.employeeId, users.id))
    .innerJoin(rosters, eq(rosterEntries.rosterId, rosters.id))
    .where(
      and(
        eq(rosters.status, 'published'),
        inArray(rosterEntries.employeeId, employeeIds),
        gte(rosterEntries.date, startDate),
        lte(rosterEntries.date, endDate),
      ),
    );

  const incomingByKey = new Set(entries.map((e) => `${e.employeeId}:${e.date}`));
  for (const row of existing) {
    const key = `${row.entry.employeeId}:${row.entry.date}`;
    if (incomingByKey.has(key)) {
      warnings.push({
        code: 'CONFLICT',
        severity: 'warning',
        message: `${row.employeeName} already has a published roster entry on this date. The newer roster will take precedence.`,
        date: row.entry.date,
        departmentId: null,
        employeeId: row.entry.employeeId,
      });
    }
  }

  /* ---- staffing rules ---- */
  const rules = await db.select().from(staffingRules).where(eq(staffingRules.isActive, true));
  if (rules.length === 0) return warnings;

  const employees = await db
    .select({
      id: users.id,
      departmentId: users.departmentId,
      subDepartmentId: users.subDepartmentId,
      joiningDate: users.joiningDate,
    })
    .from(users)
    .where(inArray(users.id, employeeIds));
  const deptByEmployee = new Map(employees.map((e) => [e.id, e.departmentId]));

  const dates = new Set(entries.map((e) => e.date));
  for (const date of dates) {
    const dayEntries = entries.filter((e) => e.date === date && !e.isOff);
    const countsByDept = new Map<string, number>();
    for (const entry of dayEntries) {
      const dept = deptByEmployee.get(entry.employeeId);
      if (!dept) continue;
      countsByDept.set(dept, (countsByDept.get(dept) ?? 0) + 1);
    }

    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const rule of rules) {
      if (rule.dayOfWeek != null && rule.dayOfWeek !== dayOfWeek) continue;
      const scheduled = countsByDept.get(rule.departmentId) ?? 0;
      if (scheduled < rule.minStaff) {
        const dept = await db
          .select({ name: departments.name })
          .from(departments)
          .where(eq(departments.id, rule.departmentId))
          .limit(1);
        warnings.push({
          code: 'UNDERSTAFFED',
          severity: 'warning',
          message: `${dept[0]?.name ?? 'Department'} has ${scheduled} scheduled on ${date} but requires at least ${rule.minStaff}.`,
          date,
          departmentId: rule.departmentId,
          employeeId: null,
        });
      }
    }
  }

  return warnings;
}

/** Employees ordered by department display order then joining date. */
export async function rosterOrderedEmployees(db: DB) {
  return db
    .select({
      id: users.id,
      fullName: users.fullName,
      employeeCode: users.employeeCode,
      joiningDate: users.joiningDate,
      departmentId: users.departmentId,
      subDepartmentId: users.subDepartmentId,
      departmentName: departments.name,
      departmentOrder: departments.displayOrder,
    })
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(or(eq(users.status, 'active'), eq(users.status, 'approved')))
    .orderBy(
      asc(departments.displayOrder),
      asc(users.joiningDate),
      asc(users.employeeCode),
      asc(users.fullName),
    );
}

/** Snapshot the previous published entry for an employee+date. */
export async function previousPublishedEntry(db: DB, employeeId: string, date: string) {
  const found = await publishedEntry(db, employeeId, date);
  return found?.entry ?? null;
}

/** Build the 7-day style cell view for a set of employees. */
export async function buildRosterCells(
  db: DB,
  rosterId: string,
  dates: string[],
  employeeIds: string[],
): Promise<RosterDayCell[]> {
  const shiftRows = await db.select().from(shifts);
  const shiftById = new Map(shiftRows.map((s) => [s.id, s]));

  const entries = await db
    .select()
    .from(rosterEntries)
    .where(
      and(
        eq(rosterEntries.rosterId, rosterId),
        inArray(rosterEntries.employeeId, employeeIds),
        inArray(rosterEntries.date, dates),
      ),
    );

  const grouped = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = grouped.get(entry.date) ?? [];
    list.push(entry);
    grouped.set(entry.date, list);
  }

  const cells: RosterDayCell[] = dates.map((date) => {
    const dayEntries = grouped.get(date) ?? [];
    const team = dayEntries.map((e) => {
      const shift = e.shiftId ? shiftById.get(e.shiftId) : null;
      return {
        employeeId: e.employeeId,
        employeeName: '',
        shiftCode: shift?.code ?? null,
        isOff: e.isOff,
      };
    });
    const first = dayEntries[0];
    const shift = first?.shiftId ? shiftById.get(first.shiftId) : null;
    return {
      date,
      dayLabel: new Date(`${date}T00:00:00Z`).getUTCDay() === 0 ? 'Sun' : 'Day',
      isOff: first?.isOff ?? true,
      shiftId: first?.shiftId ?? null,
      shiftCode: shift?.code ?? null,
      shiftName: shift?.name ?? null,
      shiftShortName: shift?.shortName ?? null,
      team,
    };
  });

  return cells;
}

/** Record a roster change entry for history + notification tracking. */
export async function recordRosterChange(
  db: DB,
  input: {
    rosterId: string;
    employeeId: string;
    previousShiftId: string | null;
    newShiftId: string | null;
    previousIsOff: boolean | null;
    newIsOff: boolean;
    changeType: 'publish' | 'manual' | 'leave_request';
    changedBy: string | null;
  },
) {
  const record = {
    id: randomId(),
    rosterId: input.rosterId,
    employeeId: input.employeeId,
    previousShiftId: input.previousShiftId,
    newShiftId: input.newShiftId,
    previousIsOff: input.previousIsOff,
    newIsOff: input.newIsOff,
    changeType: input.changeType,
    notified: false,
    changedBy: input.changedBy,
    createdAt: new Date().toISOString(),
  };
  await db.insert(rosterChanges).values(record);
  return record;
}

/** Compare a draft roster against the currently published roster. */
export async function diffRosters(
  db: DB,
  draftEntries: RosterEntryInput[],
): Promise<
  Array<{
    employeeId: string;
    date: string;
    previousShiftId: string | null;
    newShiftId: string | null;
    previousIsOff: boolean | null;
    newIsOff: boolean;
  }>
> {
  const diffs: Array<{
    employeeId: string;
    date: string;
    previousShiftId: string | null;
    newShiftId: string | null;
    previousIsOff: boolean | null;
    newIsOff: boolean;
  }> = [];

  for (const entry of draftEntries) {
    const previous = await previousPublishedEntry(db, entry.employeeId, entry.date);
    const prevShiftId = previous?.shiftId ?? null;
    const prevIsOff = previous ? previous.isOff : null;

    const shiftChanged = prevShiftId !== entry.shiftId;
    const offChanged = prevIsOff !== null && prevIsOff !== entry.isOff;

    if (shiftChanged || offChanged) {
      diffs.push({
        employeeId: entry.employeeId,
        date: entry.date,
        previousShiftId: prevShiftId,
        newShiftId: entry.shiftId,
        previousIsOff: prevIsOff,
        newIsOff: entry.isOff,
      });
    }
  }

  return diffs;
}

export function todayKey(): string {
  return dhakaDateKey(new Date());
}

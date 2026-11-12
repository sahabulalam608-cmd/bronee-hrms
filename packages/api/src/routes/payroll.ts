import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { payrollRecords } from '../db/schema.js';
import { notFound, ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { toPayrollRecord } from '../lib/mappers.js';
import type { AppEnv } from '../types.js';
export const payrollRoutes = new Hono<AppEnv>();

payrollRoutes.use('*', requireAuth);

/**
 * The employee's own published payslips.
 * Draft payroll records are never exposed to the employee portal.
 */
payrollRoutes.get('/my', async (c) => {
  const db = c.get('db');
  const session = c.get('session');

  const rows = await db
    .select()
    .from(payrollRecords)
    .where(and(eq(payrollRecords.employeeId, session.id), eq(payrollRecords.status, 'published')))
    .orderBy(desc(payrollRecords.year), desc(payrollRecords.month));

  /**
   * The attendance bonus amount is confidential: it is never sent to the
   * employee portal. Only the fact that it was applied is exposed.
   */
  const items = rows.map((r) => {
    const record = toPayrollRecord(r);
    return {
      ...record,
      bonusAmount: null,
      attendanceBonusApplied: record.bonusAmount > 0,
    };
  });

  return ok(c, {
    items,
    latest: items[0] ?? null,
    yearToDate: items.reduce((sum, r) => sum + r.netPayable, 0),
  });
});

/** A single published payslip. */
payrollRoutes.get('/my/:id', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const id = c.req.param('id');

  const rows = await db.select().from(payrollRecords).where(eq(payrollRecords.id, id)).limit(1);
  const record = rows[0];
  if (!record) throw notFound('Payslip not found.');
  if (record.employeeId !== session.id) throw notFound('Payslip not found.');
  if (record.status !== 'published') throw notFound('Payslip not found.');

  const mapped = toPayrollRecord(record);
  return ok(c, {
    payslip: { ...mapped, bonusAmount: null, attendanceBonusApplied: mapped.bonusAmount > 0 },
  });
});

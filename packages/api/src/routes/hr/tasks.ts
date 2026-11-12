import { Hono } from 'hono';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { PERMISSIONS, dhakaDateKey, taskCreateSchema, taskReviewSchema, taskUpdateSchema } from '@bronee/shared';
import { departments, taskSubmissions, tasks, users } from '../../db/schema.js';
import { badRequest, forbidden, notFound, ok } from '../../lib/http.js';
import { randomId } from '../../lib/crypto.js';
import { requirePermission } from '../../middleware/auth.js';
import { toTask, toTaskSubmission } from '../../lib/mappers.js';
import { requestMeta, writeAudit } from '../../lib/audit.js';
import { createNotifications } from '../../lib/notifications.js';
import type { AppEnv } from '../../types.js';
export const hrTaskRoutes = new Hono<AppEnv>();

/** Generate the next task code, e.g. BRN-TASK-0007. */
async function nextTaskCode(db: any): Promise<string> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks);
  const next = (rows[0]?.count ?? 0) + 1;
  return `BRN-TASK-${String(next).padStart(4, '0')}`;
}

/* --------------------------------------------------------------- listing */

hrTaskRoutes.get('/', requirePermission([PERMISSIONS.HR_TASK_MANAGE]), async (c) => {
  const db = c.get('db');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const status = c.req.query('status');
  const priority = c.req.query('priority');
  const departmentId = c.req.query('departmentId');
  const employeeId = c.req.query('employeeId');

  const rows = await db
    .select({
      task: tasks,
      department: departments.name,
      assignedEmployeeName: users.fullName,
      reviewerName: users.fullName,
    })
    .from(tasks)
    .leftJoin(departments, eq(tasks.departmentId, departments.id))
    .leftJoin(users, eq(tasks.assignedEmployeeId, users.id))
    .where(
      and(
        from ? gte(tasks.startDate, from) : undefined,
        to ? lte(tasks.dueDate, to) : undefined,
        status ? eq(tasks.status, status as never) : undefined,
        priority ? eq(tasks.priority, priority as never) : undefined,
        departmentId ? eq(tasks.departmentId, departmentId) : undefined,
        employeeId ? eq(tasks.assignedEmployeeId, employeeId) : undefined,
      ),
    )
    .orderBy(asc(tasks.dueDate));

  const today = dhakaDateKey(new Date());
  const items = rows.map((r) => {
    const pendingDays =
      r.task.status !== 'complete' && r.task.dueDate && r.task.dueDate < today
        ? daysBetween(r.task.dueDate, today)
        : r.task.status !== 'complete' && r.task.dueDate
          ? Math.max(0, daysBetween(today, r.task.dueDate))
          : 0;
    return {
      ...toTask({
        ...r.task,
        department: r.department,
        assignedEmployeeName: r.assignedEmployeeName,
        reviewerName: r.reviewerName,
      }),
      pendingDays,
      overdue: r.task.status !== 'complete' && r.task.dueDate != null && r.task.dueDate < today,
    };
  });

  const prioritySummary = ['low', 'medium', 'high', 'urgent'].map((p) => ({
    priority: p,
    count: items.filter((i) => i.priority === p).length,
  }));

  const departmentSummary = [...new Set(items.map((i) => i.department ?? 'Unassigned'))].map((d) => ({
    department: d,
    count: items.filter((i) => (i.department ?? 'Unassigned') === d).length,
  }));

  const statusSummary = ['yet_to_start', 'in_progress', 'pending', 'complete'].map((s) => ({
    status: s,
    count: items.filter((i) => i.status === s).length,
  }));

  const byDate = new Map<string, number>();
  for (const item of items) {
    const key = item.dueDate ?? item.assignedDate ?? item.startDate;
    if (!key) continue;
    byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }

  return ok(c, {
    items,
    summary: {
      total: items.length,
      yetToStart: items.filter((i) => i.status === 'yet_to_start').length,
      inProgress: items.filter((i) => i.status === 'in_progress').length,
      pending: items.filter((i) => i.status === 'pending').length,
      complete: items.filter((i) => i.status === 'complete').length,
      overdue: items.filter((i) => i.overdue).length,
    },
    prioritySummary,
    departmentSummary,
    statusSummary,
    dateSummary: [...byDate.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
  });
});

/* ------------------------------------------------------------------ CRUD */

hrTaskRoutes.post('/', requirePermission([PERMISSIONS.HR_TASK_MANAGE]), zValidator('json', taskCreateSchema), async (c) => {
  const db = c.get('db');
  const env = c.get('env');
  const session = c.get('session');
  const body = c.req.valid('json');

  const record = {
    id: randomId(),
    taskCode: await nextTaskCode(db),
    name: body.name,
    description: body.description ?? null,
    departmentId: body.departmentId ?? null,
    assignedEmployeeId: body.assignedEmployeeId ?? null,
    reviewerId: body.reviewerId ?? null,
    priority: body.priority,
    assignedDate: body.assignedDate ?? dhakaDateKey(new Date()),
    startDate: body.startDate ?? null,
    dueDate: body.dueDate ?? null,
    completedAt: null,
    status: 'yet_to_start' as const,
    referenceLink: body.referenceLink ?? null,
    notes: body.notes ?? null,
    createdBy: session.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.insert(tasks).values(record);

  if (body.assignedEmployeeId) {
    await createNotifications(db, env, [
      {
        employeeId: body.assignedEmployeeId,
        type: 'task_assigned',
        title: `New task assigned: ${record.name}`,
        body: body.description ?? 'A new task has been assigned to you.',
        link: '/app/tasks',
        createdBy: session.id,
      },
    ]);
  }

  await writeAudit(db, {
    actorId: session.id,
    actorName: session.fullName,
    action: 'task.created',
    entityType: 'task',
    entityId: record.id,
    after: { name: record.name, taskCode: record.taskCode, priority: record.priority },
  });

  return ok(c, { task: toTask(record) });
});

hrTaskRoutes.patch(
  '/:id',
  requirePermission([PERMISSIONS.HR_TASK_MANAGE]),
  zValidator('json', taskUpdateSchema),
  async (c) => {
    const db = c.get('db');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    const before = rows[0];
    if (!before) throw notFound('Task not found.');

    const completedAt = body.status === 'complete' ? new Date().toISOString() : before.completedAt;

    await db
      .update(tasks)
      .set({
        name: body.name ?? before.name,
        description: body.description ?? before.description,
        departmentId: body.departmentId === undefined ? before.departmentId : body.departmentId,
        assignedEmployeeId:
          body.assignedEmployeeId === undefined ? before.assignedEmployeeId : body.assignedEmployeeId,
        reviewerId: body.reviewerId === undefined ? before.reviewerId : body.reviewerId,
        priority: body.priority ?? before.priority,
        assignedDate: body.assignedDate ?? before.assignedDate,
        startDate: body.startDate ?? before.startDate,
        dueDate: body.dueDate ?? before.dueDate,
        status: (body.status as never) ?? before.status,
        referenceLink: body.referenceLink === undefined ? before.referenceLink : body.referenceLink,
        notes: body.notes ?? before.notes,
        completedAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tasks.id, id));

    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: 'task.updated',
      entityType: 'task',
      entityId: id,
      before: { name: before.name, status: before.status, priority: before.priority },
      after: body,
    });

    const after = (await db.select().from(tasks).where(eq(tasks.id, id)).limit(1))[0];
    return ok(c, { task: toTask(after) });
  },
);

hrTaskRoutes.delete('/:id', requirePermission([PERMISSIONS.HR_TASK_MANAGE]), async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const id = c.req.param('id');
  const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!rows[0]) throw notFound('Task not found.');
  await db.delete(tasks).where(eq(tasks.id, id));
  await writeAudit(db, {
    actorId: session.id,
    actorName: session.fullName,
    action: 'task.deleted',
    entityType: 'task',
    entityId: id,
    before: rows[0],
  });
  return ok(c, { deleted: true });
});

/** Review a submitted task. */
hrTaskRoutes.post(
  '/:id/review',
  requirePermission([PERMISSIONS.HR_TASK_REVIEW]),
  zValidator('json', taskReviewSchema),
  async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const session = c.get('session');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    const task = rows[0];
    if (!task) throw notFound('Task not found.');

    const submissionRows = await db
      .select()
      .from(taskSubmissions)
      .where(eq(taskSubmissions.taskId, id))
      .orderBy(desc(taskSubmissions.createdAt))
      .limit(1);
    const submission = submissionRows[0];
    if (!submission) throw badRequest('There is no submission to review yet.');

    await db
      .update(taskSubmissions)
      .set({
        status: body.decision === 'approve' ? 'approved' : 'rejected',
        feedback: body.feedback ?? null,
      })
      .where(eq(taskSubmissions.id, submission.id));

    await db
      .update(tasks)
      .set({
        status: body.decision === 'approve' ? 'complete' : 'in_progress',
        completedAt: body.decision === 'approve' ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tasks.id, id));

    await createNotifications(db, env, [
      {
        employeeId: task.assignedEmployeeId ?? '',
        type: 'task_feedback',
        title:
          body.decision === 'approve'
            ? `Task approved: ${task.name}`
            : `Task needs changes: ${task.name}`,
        body: body.feedback ?? 'Your submission has been reviewed.',
        link: '/app/tasks',
        createdBy: session.id,
      },
    ]);

    await writeAudit(db, {
      actorId: session.id,
      actorName: session.fullName,
      action: `task.${body.decision}`,
      entityType: 'task',
      entityId: id,
      after: { feedback: body.feedback ?? null },
    });

    return ok(c, { status: body.decision });
  },
);

/** Submissions awaiting review. */
hrTaskRoutes.get('/submissions/pending', requirePermission([PERMISSIONS.HR_TASK_REVIEW]), async (c) => {
  const db = c.get('db');
  const rows = await db
    .select({
      submission: taskSubmissions,
      taskName: tasks.name,
      taskCode: tasks.taskCode,
      employeeName: users.fullName,
    })
    .from(taskSubmissions)
    .innerJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
    .innerJoin(users, eq(taskSubmissions.employeeId, users.id))
    .where(eq(taskSubmissions.status, 'submitted'))
    .orderBy(desc(taskSubmissions.createdAt));

  return ok(c, {
    items: rows.map((r) => ({
      ...toTaskSubmission({ ...r.submission, employeeName: r.employeeName }),
      taskName: r.taskName,
      taskCode: r.taskCode,
    })),
  });
});

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((b - a) / 86400000);
}

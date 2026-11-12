import { Hono } from 'hono';
import { and, asc, desc, eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { dhakaDateKey, taskSubmitSchema } from '@bronee/shared';
import { z } from 'zod';

const taskStatusSchema = z.object({
  status: z.enum(['yet_to_start', 'in_progress', 'pending']).optional(),
});
import { departments, taskSubmissions, tasks, users } from '../db/schema.js';
import { badRequest, forbidden, notFound, ok } from '../lib/http.js';
import { randomId } from '../lib/crypto.js';
import { requireAuth } from '../middleware/auth.js';
import { toTask, toTaskSubmission } from '../lib/mappers.js';
import { requestMeta, writeAudit } from '../lib/audit.js';
import type { AppEnv } from '../types.js';
export const taskRoutes = new Hono<AppEnv>();

taskRoutes.use('*', requireAuth);

/** Employee: tasks assigned to the signed-in user. */
taskRoutes.get('/my', async (c) => {
  const db = c.get('db');
  const session = c.get('session');

  const rows = await db
    .select({
      task: tasks,
      department: departments.name,
      reviewerName: users.fullName,
    })
    .from(tasks)
    .leftJoin(departments, eq(tasks.departmentId, departments.id))
    .leftJoin(users, eq(tasks.reviewerId, users.id))
    .where(eq(tasks.assignedEmployeeId, session.id))
    .orderBy(asc(tasks.dueDate));

  const submissions = await db
    .select()
    .from(taskSubmissions)
    .where(eq(taskSubmissions.employeeId, session.id));

  const today = dhakaDateKey(new Date());
  const items = rows.map((r) => ({
    ...toTask({
      ...r.task,
      department: r.department,
      assignedEmployeeName: session.fullName,
      reviewerName: r.reviewerName,
    }),
    overdue:
      r.task.status !== 'complete' && r.task.dueDate != null && r.task.dueDate < today,
    submissions: submissions
      .filter((s) => s.taskId === r.task.id)
      .map((s) => toTaskSubmission({ ...s, employeeName: session.fullName })),
  }));

  return ok(c, {
    items,
    summary: {
      yetToStart: items.filter((i) => i.status === 'yet_to_start').length,
      inProgress: items.filter((i) => i.status === 'in_progress').length,
      pending: items.filter((i) => i.status === 'pending').length,
      complete: items.filter((i) => i.status === 'complete').length,
      overdue: items.filter((i) => i.overdue).length,
    },
  });
});

/** Employee: a single task with its submission history. */
taskRoutes.get('/:id', async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const id = c.req.param('id');

  const rows = await db
    .select({ task: tasks, department: departments.name, reviewerName: users.fullName })
    .from(tasks)
    .leftJoin(departments, eq(tasks.departmentId, departments.id))
    .leftJoin(users, eq(tasks.reviewerId, users.id))
    .where(eq(tasks.id, id))
    .limit(1);

  if (!rows[0]) throw notFound('Task not found.');
  const task = rows[0].task;
  const isOwner = task.assignedEmployeeId === session.id;
  const isReviewer = task.reviewerId === session.id;
  const isHr = session.role === 'hr' || session.role === 'super_admin';
  if (!isOwner && !isReviewer && !isHr) throw notFound('Task not found.');

  const submissions = await db
    .select({
      submission: taskSubmissions,
      employeeName: users.fullName,
    })
    .from(taskSubmissions)
    .innerJoin(users, eq(taskSubmissions.employeeId, users.id))
    .where(eq(taskSubmissions.taskId, id))
    .orderBy(desc(taskSubmissions.createdAt));

  return ok(c, {
    task: toTask({
      ...task,
      department: rows[0].department,
      reviewerName: rows[0].reviewerName,
    }),
    submissions: submissions.map((s) => toTaskSubmission({ ...s.submission, employeeName: s.employeeName })),
  });
});

/** Employee: update their own task status. */
taskRoutes.post('/:id/status', zValidator('json', taskStatusSchema), async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  const task = rows[0];
  if (!task) throw notFound('Task not found.');
  if (task.assignedEmployeeId !== session.id) throw forbidden('You can only update your own tasks.');
  if (task.status === 'complete') throw badRequest('This task is already complete.');

  const next = body.status ?? task.status;
  await db
    .update(tasks)
    .set({
      status: next as never,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tasks.id, id));

  return ok(c, { status: next });
});

/** Employee: submit work for review. */
taskRoutes.post('/:id/submit', zValidator('json', taskSubmitSchema), async (c) => {
  const db = c.get('db');
  const session = c.get('session');
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const now = new Date();

  const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  const task = rows[0];
  if (!task) throw notFound('Task not found.');
  if (task.assignedEmployeeId !== session.id) throw forbidden('You can only submit your own tasks.');

  if (!body.submissionLink && !body.attachmentKey && !body.notes) {
    throw badRequest('Add a submission link, an attachment, or a note before submitting.');
  }

  const submission = {
    id: randomId(),
    taskId: id,
    employeeId: session.id,
    submissionLink: body.submissionLink ?? null,
    notes: body.notes ?? null,
    attachmentKey: body.attachmentKey ?? null,
    attachmentName: null,
    status: 'submitted' as const,
    feedback: null,
    createdAt: now.toISOString(),
  };

  await db.insert(taskSubmissions).values(submission);
  await db
    .update(tasks)
    .set({ status: 'pending', updatedAt: now.toISOString() })
    .where(eq(tasks.id, id));

  const meta = requestMeta(c);
  await writeAudit(db, {
    actorId: session.id,
    actorName: session.fullName,
    action: 'task.submitted',
    entityType: 'task',
    entityId: id,
    after: { submissionId: submission.id },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return ok(c, { submission: toTaskSubmission(submission), message: 'Submission sent for review.' });
});

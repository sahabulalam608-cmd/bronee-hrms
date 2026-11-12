/**
 * Notification fan-out. Portal notifications are the source of truth; email is
 * an additional delivery channel for the types listed in the policy.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  EMAIL_NOTIFICATION_TYPES,
  ROSTER_NOTIFICATION_TYPES,
  type AppNotification,
} from '@bronee/shared';
import type { DB } from '../db/client.js';
import { notifications, users } from '../db/schema.js';
import type { Env } from '../env.js';
import { randomId } from './crypto.js';
import { detailList, emailShell, paragraph, sendEmail } from './email.js';

export type CreateNotificationInput = {
  employeeId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  createdBy?: string | null;
  meta?: Record<string, unknown> | null;
  emailSubject?: string;
  emailHtml?: string;
};

export async function createNotifications(
  db: DB,
  env: Env,
  inputs: CreateNotificationInput[],
): Promise<AppNotification[]> {
  if (inputs.length === 0) return [];

  const recipientIds = [...new Set(inputs.map((i) => i.employeeId))];
  const recipients = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName })
    .from(users)
    .where(inArray(users.id, recipientIds));
  const emailById = new Map(recipients.map((r) => [r.id, r.email]));

  const wantsEmail = inputs.some((i) => EMAIL_NOTIFICATION_TYPES.includes(i.type));

  const rows = inputs.map((i) => {
    const shouldEmail = wantsEmail || Boolean(i.emailSubject);
    return {
      id: randomId(),
      employeeId: i.employeeId,
      type: i.type,
      title: i.title,
      body: i.body,
      link: i.link ?? null,
      emailSent: false,
      emailStatus: shouldEmail ? ('pending' as const) : ('not_required' as const),
      emailError: null,
      readAt: null,
      publishedAt: new Date().toISOString(),
      createdBy: i.createdBy ?? null,
      meta: i.meta ?? null,
    };
  });

  await db.insert(notifications).values(rows);

  if (wantsEmail) {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const input = inputs[index];
      if (row.emailStatus === 'not_required') continue;
      const to = emailById.get(row.employeeId);
      if (!to) continue;

      const html =
        input.emailHtml ??
        emailShell(
          row.title,
          `${paragraph(row.body)}${
            row.link
              ? `<p style="margin:8px 0 0;"><a href="${env.APP_URL}${row.link}" style="color:${'#7A63E8'};font-weight:600;">Open in BRONEE HRMS →</a></p>`
              : ''
          }`,
        );

      const result = await sendEmail(db, env, {
        to,
        subject: input.emailSubject ?? row.title,
        html,
      });

      await db
        .update(notifications)
        .set({
          emailSent: result.status === 'sent',
          emailStatus: result.status === 'skipped' ? 'not_required' : result.status,
          emailError: result.error ?? null,
        })
        .where(eq(notifications.id, row.id));
    }
  }

  return rows.map((r, i) => ({ ...r, emailStatus: r.emailStatus })) as AppNotification[];
}

/** Count of unread notifications of any type. */
export async function unreadCount(db: DB, employeeId: string): Promise<number> {
  const result = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.employeeId, employeeId), isNull(notifications.readAt)));
  return result.length;
}

/** Count of unread roster notifications (drives the Roster menu badge). */
export async function unreadRosterCount(db: DB, employeeId: string): Promise<number> {
  const result = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.employeeId, employeeId),
        isNull(notifications.readAt),
        inArray(notifications.type, ROSTER_NOTIFICATION_TYPES),
      ),
    );
  return result.length;
}

export function rosterNotificationTitle(kind: 'shift' | 'off' | 'general'): { title: string; type: string } {
  if (kind === 'shift') return { title: 'Your shift has been updated', type: 'shift_change' };
  if (kind === 'off') return { title: 'Your off day has been updated', type: 'off_day_change' };
  return { title: 'Your roster has been updated', type: 'roster_update' };
}

export function buildRosterEmail(name: string, details: Array<[string, string]>, link: string): string {
  return emailShell(
    'Roster update',
    `${paragraph(`Hi ${name}, your published roster has changed.`)}${detailList(details)}<p style="margin:4px 0 0;"><a href="${link}" style="color:#7A63E8;font-weight:600;">View roster →</a></p>`,
  );
}

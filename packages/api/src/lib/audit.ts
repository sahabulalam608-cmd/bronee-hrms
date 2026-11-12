/**
 * Audit trail — every sensitive administrative action is recorded with the
 * actor, the before/after state and the request context.
 */
import type { Context } from 'hono';
import { auditLogs } from '../db/schema.js';
import type { DB } from '../db/client.js';
import { randomId } from './crypto.js';

export type AuditInput = {
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeAudit(db: DB, input: AuditInput) {
  await db.insert(auditLogs).values({
    id: randomId(),
    actorId: input.actorId ?? null,
    actorName: input.actorName ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export function requestMeta(c: Context) {
  const raw = c.req.raw as Request & { cf?: { connectingIp?: string } };
  const env = c.get('env') as { CLIENT_IP_FALLBACK?: string } | undefined;

  const ip =
    c.req.header('cf-connecting-ip') ??
    raw.cf?.connectingIp ??
    c.req.header('x-real-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    // Local development only — Cloudflare always sets cf-connecting-ip in
    // production, and this variable is never deployed.
    env?.CLIENT_IP_FALLBACK ??
    null;

  return {
    ip,
    userAgent: c.req.header('user-agent') ?? null,
  };
}

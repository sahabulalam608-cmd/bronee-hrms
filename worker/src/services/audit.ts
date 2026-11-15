/**
 * BRONEE HRMS — audit trail.
 * Every privileged action writes a row here. Records are never deleted.
 */

import type { Database } from '../db';
import { auditLogs } from '../db/schema';
import type { Role } from '../../../shared/constants';

export async function writeAudit(
  database: Database,
  entry: {
    actor: string;
    actorRole: Role;
    action: string;
    entity: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    note?: string | null;
  },
): Promise<void> {
  await database.insert(auditLogs).values({
    id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    actor: entry.actor,
    actorRole: entry.actorRole,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: entry.before === undefined || entry.before === null ? null : String(entry.before),
    after: entry.after === undefined || entry.after === null ? null : String(entry.after),
    note: entry.note ?? null,
    createdAt: new Date().toISOString(),
  });
}

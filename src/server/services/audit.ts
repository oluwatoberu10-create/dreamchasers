import "server-only";
import { db, type DbOrTx } from "@/db";
import { auditLogs } from "@/db/schema";

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
};

/**
 * Records a significant action. Pass the transaction when the action itself is
 * transactional, so the audit row commits (or rolls back) with it.
 */
export async function audit(entry: AuditEntry, conn: DbOrTx = db): Promise<void> {
  await conn.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    metadata: entry.metadata ?? {},
  });
}

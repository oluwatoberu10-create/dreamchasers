import "server-only";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { notifications, users } from "@/db/schema";

export type NotificationType = (typeof notifications.$inferInsert)["type"];

export type NewNotification = {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string | null;
  resourceType?: string;
  resourceId?: string;
  /**
   * Identifies the underlying event. Processing the same event twice yields
   * the same key and therefore a single row (unique on recipient + key).
   */
  dedupeKey: string;
};

/**
 * Writes notifications. Always call this with the transaction that wrote the
 * event itself, so a notification can never exist for work that failed to save
 * (and vice versa). Callers are responsible for only passing recipients who
 * are allowed to see the linked resource; the linked page re-checks too.
 */
export async function notify(conn: DbOrTx, items: NewNotification[]): Promise<number> {
  if (items.length === 0) return 0;
  const rows = await conn.insert(notifications).values(items.map((n) => ({
    recipientId: n.recipientId,
    type: n.type,
    title: n.title.slice(0, 200),
    body: (n.body ?? "").slice(0, 1000),
    link: n.link ?? null,
    resourceType: n.resourceType ?? null,
    resourceId: n.resourceId ?? null,
    dedupeKey: n.dedupeKey,
  }))).onConflictDoNothing().returning({ id: notifications.id });
  return rows.length;
}

/** Active super admins — recipients for platform-level activity. */
export async function adminIds(conn: DbOrTx = db): Promise<string[]> {
  const rows = await conn.select({ id: users.id }).from(users)
    .where(and(eq(users.role, "super_admin"), eq(users.status, "active")));
  return rows.map((r) => r.id);
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications)
    .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export const PAGE_SIZE = 20;

/** Keyset pagination on createdAt — stable while new rows arrive. */
export async function listNotifications(userId: string, opts: { before?: Date; unreadOnly?: boolean } = {}) {
  const conds = [eq(notifications.recipientId, userId)];
  if (opts.before) conds.push(lt(notifications.createdAt, opts.before));
  if (opts.unreadOnly) conds.push(isNull(notifications.readAt));
  const rows = await db.select().from(notifications).where(and(...conds))
    .orderBy(desc(notifications.createdAt)).limit(PAGE_SIZE + 1);
  return { items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

export async function markRead(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // The recipient filter is what stops one user marking another's rows.
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.recipientId, userId), inArray(notifications.id, ids), isNull(notifications.readAt)));
}

export async function markAllRead(userId: string): Promise<void> {
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)));
}

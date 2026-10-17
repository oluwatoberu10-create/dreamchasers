import "server-only";
import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db, transaction } from "@/db";
import { conversationParticipants, conversations, messages, users } from "@/db/schema";
import { forbidden, notFound, validationError } from "@/lib/errors";
import { fullName, truncate } from "@/lib/utils";
import type { SessionUser } from "@/server/auth";
import { canMessage } from "@/server/policy";
import { notify } from "./notifications";

type Actor = Pick<SessionUser, "id" | "role">;

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

/** Finds or creates the one-to-one thread between two people. */
export async function openConversation(actor: Actor, recipientId: string): Promise<string> {
  if (!(await canMessage(actor, recipientId))) throw forbidden("You can't message that person.");
  const key = pairKey(actor.id, recipientId);
  return transaction(async (tx) => {
    const [created] = await tx.insert(conversations).values({ pairKey: key }).onConflictDoNothing().returning();
    if (created) {
      await tx.insert(conversationParticipants).values([
        { conversationId: created.id, userId: actor.id, lastReadAt: new Date() },
        { conversationId: created.id, userId: recipientId },
      ]);
      return created.id;
    }
    const [existing] = await tx.select().from(conversations).where(eq(conversations.pairKey, key));
    return existing.id;
  });
}

async function assertParticipant(userId: string, conversationId: string) {
  const [p] = await db.select().from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)));
  if (!p) throw notFound("That conversation does not exist.");
  return p;
}

export async function sendMessage(actor: Actor, conversationId: string, body: string) {
  const text = body.trim();
  if (!text) throw validationError("Write a message.");
  if (text.length > 5000) throw validationError("Messages are limited to 5,000 characters.");
  await assertParticipant(actor.id, conversationId);

  return transaction(async (tx) => {
    const others = await tx.select({ id: users.id, status: users.status }).from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .where(and(eq(conversationParticipants.conversationId, conversationId), ne(conversationParticipants.userId, actor.id)));
    // Permissions are re-checked on every send: a demoted or deactivated
    // account cannot keep using an old thread.
    for (const o of others) if (!(await canMessage(actor, o.id, tx))) throw forbidden("You can no longer message this person.");

    const [msg] = await tx.insert(messages).values({ conversationId, senderId: actor.id, body: text }).returning();
    await tx.update(conversations).set({ lastMessageAt: msg.createdAt }).where(eq(conversations.id, conversationId));
    await tx.update(conversationParticipants).set({ lastReadAt: msg.createdAt })
      .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, actor.id)));

    const [me] = await tx.select().from(users).where(eq(users.id, actor.id));
    await notify(tx, others.map((o) => ({
      recipientId: o.id, type: "message_received", title: `New message from ${fullName(me)}`,
      body: truncate(text, 140), link: `/messages/${conversationId}`, resourceType: "conversation", resourceId: conversationId,
      dedupeKey: `message:${msg.id}`,
    })));
    return msg;
  });
}

export async function listConversations(userId: string) {
  const mine = await db.select({ c: conversations, lastReadAt: conversationParticipants.lastReadAt }).from(conversationParticipants)
    .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
    .where(eq(conversationParticipants.userId, userId))
    .orderBy(desc(conversations.lastMessageAt));
  if (mine.length === 0) return [];
  const ids = mine.map((m) => m.c.id);

  const others = await db.select({ conversationId: conversationParticipants.conversationId, id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role })
    .from(conversationParticipants).innerJoin(users, eq(users.id, conversationParticipants.userId))
    .where(and(inArray(conversationParticipants.conversationId, ids), ne(conversationParticipants.userId, userId)));

  const last = await db.execute<{ conversation_id: string; body: string; sender_id: string; created_at: Date }>(sql`
    select distinct on (conversation_id) conversation_id, body, sender_id, created_at
    from ${messages} where conversation_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    order by conversation_id, created_at desc`);

  const unread = await db.execute<{ conversation_id: string; n: number }>(sql`
    select m.conversation_id, count(*)::int as n from ${messages} m
    join ${conversationParticipants} p on p.conversation_id = m.conversation_id and p.user_id = ${userId}
    where m.sender_id <> ${userId} and (p.last_read_at is null or m.created_at > p.last_read_at)
      and m.conversation_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    group by m.conversation_id`);

  return mine.map((m) => ({
    id: m.c.id,
    lastMessageAt: m.c.lastMessageAt,
    other: others.find((o) => o.conversationId === m.c.id) ?? null,
    last: last.rows.find((l) => l.conversation_id === m.c.id) ?? null,
    unread: unread.rows.find((u) => u.conversation_id === m.c.id)?.n ?? 0,
  }));
}

export async function readConversation(userId: string, conversationId: string) {
  await assertParticipant(userId, conversationId);
  const rows = await db.select({ m: messages, firstName: users.firstName, lastName: users.lastName }).from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt)).limit(500);
  const others = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role })
    .from(conversationParticipants).innerJoin(users, eq(users.id, conversationParticipants.userId))
    .where(and(eq(conversationParticipants.conversationId, conversationId), ne(conversationParticipants.userId, userId)));
  await db.update(conversationParticipants).set({ lastReadAt: new Date() })
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)));
  return { messages: rows, others };
}

export async function unreadMessageCount(userId: string): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from ${messages} m
    join ${conversationParticipants} p on p.conversation_id = m.conversation_id and p.user_id = ${userId}
    where m.sender_id <> ${userId} and (p.last_read_at is null or m.created_at > p.last_read_at)`);
  return r.rows[0]?.n ?? 0;
}

/** Messages newer than `after` — the thread view polls this. */
export async function messagesSince(userId: string, conversationId: string, after: Date) {
  await assertParticipant(userId, conversationId);
  return db.select({ m: messages, firstName: users.firstName, lastName: users.lastName }).from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(and(eq(messages.conversationId, conversationId), gt(messages.createdAt, after)))
    .orderBy(asc(messages.createdAt));
}

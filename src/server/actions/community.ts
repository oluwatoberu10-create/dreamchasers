"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { messageSchema, uuidField } from "@/lib/validation";
import { requireUser } from "@/server/auth";
import { openConversation, sendMessage } from "@/server/services/messaging";
import { markAllRead, markRead } from "@/server/services/notifications";
import { enforce } from "@/server/services/rate-limit";
import { parse, run } from "./run";

export async function startConversationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await run(async () => {
    const me = await requireUser();
    const { recipientId, body } = parse(z.object({ recipientId: uuidField, body: z.string().max(5000).optional() }), fd);
    id = await openConversation(me, recipientId);
    if (body?.trim()) {
      await enforce(`msg:${me.id}`, 40, 600, "You're sending messages very quickly. Wait a moment.");
      await sendMessage(me, id, body);
    }
  });
  if (r.ok) redirect(`/messages/${id}`);
  return r;
}

export async function sendMessageAction(conversationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const me = await requireUser();
    await enforce(`msg:${me.id}`, 40, 600, "You're sending messages very quickly. Wait a moment.");
    const { body } = parse(messageSchema, fd);
    await sendMessage(me, conversationId, body);
  });
}

export async function markReadAction(ids: string[], _: ActionState): Promise<ActionState> {
  return run(async () => {
    const me = await requireUser();
    await markRead(me.id, ids.filter((i) => uuidField.safeParse(i).success).slice(0, 100));
  });
}

export async function markAllReadAction(_: ActionState): Promise<ActionState> {
  return run(async () => {
    const me = await requireUser();
    await markAllRead(me.id);
    return "All caught up.";
  });
}

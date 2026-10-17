import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { listNotifications, markAllRead, markRead, unreadCount } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

/** Polled by the header bell: unread count + the eight newest notifications. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const [unread, page] = await Promise.all([unreadCount(user.id), listNotifications(user.id)]);
  return Response.json({ unread, items: page.items.slice(0, 8) }, { headers: { "Cache-Control": "no-store" } });
}

const body = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.uuid()).max(100) })]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 422 });
  if ("all" in parsed.data) await markAllRead(user.id);
  else await markRead(user.id, parsed.data.ids);
  return Response.json({ ok: true, unread: await unreadCount(user.id) });
}

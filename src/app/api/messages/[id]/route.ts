import { getCurrentUser } from "@/server/auth";
import { messagesSince } from "@/server/services/messaging";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** New messages in a thread since `after` — polled by the open conversation. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  const after = new Date(new URL(req.url).searchParams.get("after") ?? 0);
  if (!/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(after.getTime())) return Response.json({ error: "Invalid request" }, { status: 422 });
  try {
    const rows = await messagesSince(user.id, id, after);
    return Response.json({
      items: rows.map((r) => ({ id: r.m.id, body: r.m.body, senderId: r.m.senderId, createdAt: r.m.createdAt, firstName: r.firstName, lastName: r.lastName })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

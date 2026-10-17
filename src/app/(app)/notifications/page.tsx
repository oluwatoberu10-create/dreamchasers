import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import { pageUser } from "@/server/auth";
import { listNotifications, unreadCount } from "@/server/services/notifications";
import { MarkAll, MarkOne } from "./client";

export const metadata = { title: "Notifications" };

const ICON: Record<string, IconName> = {
  course_published: "book", course_scheduled: "clock", resource_added: "folder", assignment_submitted: "inbox",
  assignment_graded: "checkCircle", revision_requested: "repeat", repeat_required: "repeat", deadline_approaching: "clock",
  assignment_overdue: "alert", message_received: "message", role_changed: "shield", system: "star",
};

export default async function Notifications({ searchParams }: { searchParams: Promise<{ before?: string; unread?: string }> }) {
  const me = await pageUser();
  const sp = await searchParams;
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : undefined;
  const unreadOnly = sp.unread === "1";
  const [page, unread] = await Promise.all([listNotifications(me.id, { before, unreadOnly }), unreadCount(me.id)]);
  const last = page.items[page.items.length - 1];
  const tz = me.timezone;

  return (
    <>
      <PageHeader title="Notifications" description={unread ? `${unread} unread` : "You're all caught up."} actions={unread > 0 && <MarkAll />} />
      <div className="mb-4 flex gap-2">
        <Link href="/notifications" className={cn("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold", !unreadOnly ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] text-[var(--text-muted)]")}>All</Link>
        <Link href="/notifications?unread=1" className={cn("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold", unreadOnly ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] text-[var(--text-muted)]")}>Unread</Link>
      </div>
      <Card>
        {page.items.length === 0 ? <EmptyState icon="bell" title={unreadOnly ? "No unread notifications" : "No notifications yet"} description="Course releases, grades, messages and deadlines will show up here." /> : (
          <ul className="divide-y divide-[var(--border)]">
            {page.items.map((n) => (
              <li key={n.id} className={cn("flex items-start gap-3 px-5 py-4", !n.readAt && "bg-[var(--brand-soft)]/40")}>
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", n.readAt ? "bg-[var(--surface-2)] text-[var(--text-subtle)]" : "bg-[var(--brand-soft)] text-[var(--brand)]")}>
                  <Icon name={ICON[n.type] ?? "bell"} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  {n.link ? <Link href={n.link} className={cn("text-[14px] hover:text-[var(--brand)]", n.readAt ? "font-semibold" : "font-extrabold")}>{n.title}</Link>
                    : <span className={cn("text-[14px]", n.readAt ? "font-semibold" : "font-extrabold")}>{n.title}</span>}
                  {n.body && <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{n.body}</p>}
                  <p className="mt-1 text-[12px] text-[var(--text-subtle)]" title={formatDateTime(n.createdAt, tz)}>{relativeTime(n.createdAt)}</p>
                </div>
                {!n.readAt && <MarkOne id={n.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {page.hasMore && last && (
        <div className="mt-4 text-center">
          <Link href={`/notifications?before=${encodeURIComponent(last.createdAt.toISOString())}${unreadOnly ? "&unread=1" : ""}`} className="inline-flex h-10 items-center rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold hover:bg-[var(--surface-2)]">Load older</Link>
        </div>
      )}
    </>
  );
}

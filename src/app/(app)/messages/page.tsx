import Link from "next/link";
import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, users } from "@/db/schema";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/badge";
import { Avatar, EmptyState } from "@/components/ui/feedback";
import { cn, relativeTime, truncate } from "@/lib/utils";
import { pageUser } from "@/server/auth";
import { teacherProgramIds } from "@/server/policy";
import { listConversations } from "@/server/services/messaging";
import { NewMessage } from "./new-message";

export const metadata = { title: "Messages" };

export default async function Messages() {
  const me = await pageUser();
  const threads = await listConversations(me.id);
  const programIds = me.role === "teacher" ? await teacherProgramIds(me) : [];

  // Who this person may start a conversation with. Learners see staff only;
  // contact details are never shown, just names and roles.
  const contacts = me.role === "student"
    ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role }).from(users)
      .where(and(inArray(users.role, ["teacher", "super_admin"]), eq(users.status, "active"))).orderBy(asc(users.firstName))
    : await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role }).from(users)
      .where(and(eq(users.status, "active"), ne(users.id, me.id), me.role === "super_admin" ? undefined : or(
        inArray(users.role, ["teacher", "super_admin"]),
        // Teachers: only learners enrolled in a programme they teach in.
        inArray(users.id, db.select({ id: enrollments.studentId }).from(enrollments).where(inArray(enrollments.programId, programIds.length ? programIds : ["00000000-0000-0000-0000-000000000000"]))),
      ))).orderBy(asc(users.role), asc(users.firstName)).limit(500);

  return (
    <>
      <PageHeader title="Messages" description={me.role === "student" ? "Talk to your teachers. Conversations are private between you and them." : "Follow up with learners and colleagues."}
        actions={<NewMessage contacts={contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, role: c.role }))} />} />
      <Card>
        <CardHeader title="Conversations" />
        {threads.length === 0 ? (
          <EmptyState icon="message" title="No conversations yet" description={me.role === "student" ? "Start one with a teacher if you have a question about a course or assignment." : "Start one from a learner's profile or the button above."} />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {threads.map((t) => t.other && (
              <li key={t.id}>
                <Link href={`/messages/${t.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[var(--surface-2)]">
                  <Avatar firstName={t.other.firstName} lastName={t.other.lastName} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("truncate text-[14px]", t.unread ? "font-extrabold" : "font-semibold")}>{t.other.firstName} {t.other.lastName}</span>
                      <RoleBadge role={t.other.role} />
                    </div>
                    <div className={cn("truncate text-[13px]", t.unread ? "text-[var(--text)]" : "text-[var(--text-muted)]")}>
                      {t.last ? `${t.last.sender_id === me.id ? "You: " : ""}${truncate(t.last.body, 90)}` : "No messages yet"}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[12px] text-[var(--text-subtle)]">{relativeTime(t.lastMessageAt)}</span>
                    {t.unread > 0 && <span className="tnum rounded-full bg-[var(--brand)] px-2 text-[11px] font-bold leading-5 text-[var(--on-brand)]">{t.unread}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

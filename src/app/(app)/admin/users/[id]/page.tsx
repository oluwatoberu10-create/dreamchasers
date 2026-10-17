import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, courses, grades, submissions, trackTeachers, tracks, users } from "@/db/schema";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge, RoleBadge, TrackDot } from "@/components/ui/badge";
import { Avatar, EmptyState } from "@/components/ui/feedback";
import { formatDateTime, formatPct, relativeTime } from "@/lib/utils";
import { summarize } from "@/lib/progress";
import { isEnrolled } from "@/server/policy";
import { journalHistory } from "@/server/services/journal";
import { studentRecord, toProgressItems } from "@/server/services/learner";
import { adminContext } from "../../data";
import { AccountControls, DetailsForm, EnrollmentToggle, JournalReveal, RoleForm, TrackAssign } from "./client";

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await adminContext();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) notFound();
  const tz = ctx.program?.timezone ?? "UTC";
  const isSelf = u.id === ctx.user.id;

  const [allTracks, mine, log, counts] = await Promise.all([
    ctx.program ? db.select().from(tracks).where(eq(tracks.programId, ctx.program.id)).orderBy(asc(tracks.name)) : Promise.resolve([]),
    db.select({ trackId: trackTeachers.trackId }).from(trackTeachers).where(eq(trackTeachers.teacherId, id)),
    db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "user"), eq(auditLogs.entityId, id))).orderBy(desc(auditLogs.createdAt)).limit(10),
    db.execute<{ subs: number; graded: number; taught: number }>(sql`select
      (select count(*)::int from ${submissions} where student_id = ${id}) as subs,
      (select count(*)::int from ${grades} where graded_by_id = ${id}) as graded,
      (select count(*)::int from ${courses} where teacher_id = ${id}) as taught`),
  ]);
  const c = counts.rows[0];
  const hasRecords = c.subs + c.graded + c.taught > 0;
  const enrolled = ctx.program && u.role === "student" ? await isEnrolled(u.id, ctx.program.id) : false;
  const record = enrolled && ctx.program ? await studentRecord(u.id, ctx.program, ctx.weeks) : null;
  const summary = record ? summarize(toProgressItems(record.work)) : null;
  const journals = ctx.program && u.role === "student" ? await journalHistory(u.id, ctx.program.id) : [];

  return (
    <>
      <PageHeader back={{ href: "/admin/users", label: "Users" }}
        title={<span className="inline-flex items-center gap-3"><Avatar firstName={u.firstName} lastName={u.lastName} size={44} />{u.firstName} {u.lastName}</span>}
        description={<>{u.email} · joined {formatDateTime(u.createdAt, tz, { day: "numeric", month: "short", year: "numeric" })} · last sign-in {u.lastLoginAt ? relativeTime(u.lastLoginAt) : "never"}</>}
        actions={<><RoleBadge role={u.role} />{u.status === "active" ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {summary && record && (
            <Card>
              <CardHeader title="Learning" action={<Link href={`/teach/students/${u.id}`} className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">Full progress</Link>} />
              <CardBody className="grid grid-cols-2 gap-4 text-[13.5px] sm:grid-cols-4">
                <div><div className="tnum text-[22px] font-extrabold">{summary.submitted}/{summary.assigned}</div><div className="text-[var(--text-muted)]">Handed in</div></div>
                <div><div className="tnum text-[22px] font-extrabold">{summary.missing}</div><div className="text-[var(--text-muted)]">Missing</div></div>
                <div><div className="tnum text-[22px] font-extrabold">{summary.passed}/{summary.graded}</div><div className="text-[var(--text-muted)]">Passed</div></div>
                <div><div className="tnum text-[22px] font-extrabold">{formatPct(summary.averagePct)}</div><div className="text-[var(--text-muted)]">Average</div></div>
              </CardBody>
            </Card>
          )}
          {u.role !== "student" && (
            <Card>
              <CardHeader title="Teaching responsibilities" description="Teachers publish one course per week for each track they're assigned." />
              <CardBody>
                {allTracks.length === 0 ? <p className="text-[13.5px] text-[var(--text-muted)]">No tracks in the current programme. Create them in Settings.</p> : (
                  <ul className="space-y-2">
                    {allTracks.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-[13.5px]">
                        <TrackDot color={t.color} /><span className="flex-1 font-semibold">{t.name}</span><span className="text-[12px] text-[var(--text-muted)]">Weeks {t.weekFrom}–{t.weekTo}</span>
                        <TrackAssign trackId={t.id} teacherId={u.id} assigned={mine.some((m) => m.trackId === t.id)} disabled={u.status !== "active"} />
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[12.5px] text-[var(--text-muted)]">{c.taught} course{c.taught === 1 ? "" : "s"} presented · {c.graded} grade{c.graded === 1 ? "" : "s"} given</p>
              </CardBody>
            </Card>
          )}
          {u.role === "student" && (
            <Card>
              <CardHeader title="Journal" description="Status is always visible. Reading an entry's text is recorded in the activity log." />
              {journals.length === 0 ? <EmptyState compact icon="journal" title="No journal entries" /> : (
                <ul className="divide-y divide-[var(--border)]">
                  {journals.map((j) => (
                    <li key={j.entry.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13.5px]">
                      <span className="font-semibold">Week {j.week.weekNumber}</span>
                      <Badge tone={j.entry.status === "submitted" ? "success" : "neutral"}>{j.entry.status === "submitted" ? "Completed" : "Draft"}</Badge>
                      <span className="flex-1 text-[12.5px] text-[var(--text-subtle)]">Updated {relativeTime(j.entry.updatedAt)}</span>
                      <JournalReveal entryId={j.entry.id} week={j.week.weekNumber} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card>
            <CardHeader title="Account history" />
            {log.length === 0 ? <EmptyState compact icon="activity" title="No administrative changes recorded" /> : (
              <ul className="divide-y divide-[var(--border)]">{log.map((l) => <li key={l.id} className="px-5 py-3 text-[13.5px]">{l.summary}<span className="block text-[12px] text-[var(--text-subtle)]">{formatDateTime(l.createdAt, tz)}</span></li>)}</ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card><CardHeader title="Details" /><CardBody><DetailsForm userId={u.id} firstName={u.firstName} lastName={u.lastName} email={u.email} /></CardBody></Card>
          <Card><CardHeader title="Role" description="Takes effect on their next page load." /><CardBody><RoleForm userId={u.id} role={u.role} isSelf={isSelf} /></CardBody></Card>
          {u.role === "student" && ctx.program && <Card><CardHeader title="Programme enrolment" /><CardBody><EnrollmentToggle programId={ctx.program.id} studentId={u.id} enrolled={enrolled} programName={ctx.program.name} /></CardBody></Card>}
          {!isSelf && <Card><CardHeader title="Access" /><CardBody><AccountControls userId={u.id} active={u.status === "active"} hasRecords={hasRecords} /></CardBody></Card>}
        </div>
      </div>
    </>
  );
}

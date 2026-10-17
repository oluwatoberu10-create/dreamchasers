import Link from "next/link";
import { desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, jobRuns, programWeeks, teacherReminders, tracks, users } from "@/db/schema";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { cn, formatDateTime } from "@/lib/utils";
import { adminContext } from "../data";
import { RunJobs } from "./run-jobs";

export const metadata = { title: "Activity" };

export default async function Activity({ searchParams }: { searchParams: Promise<{ tab?: string; before?: string }> }) {
  const ctx = await adminContext();
  const sp = await searchParams;
  const tab = ["audit", "reminders", "jobs"].includes(sp.tab ?? "") ? sp.tab! : "audit";
  const tz = ctx.program?.timezone ?? "UTC";
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : null;

  const audit = tab === "audit" ? await db.select({ a: auditLogs, first: users.firstName, last: users.lastName }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(before ? lt(auditLogs.createdAt, before) : undefined).orderBy(desc(auditLogs.createdAt)).limit(51) : [];
  const reminders = tab === "reminders" ? await db.select({ r: teacherReminders, week: programWeeks.weekNumber, track: tracks.name, first: users.firstName, last: users.lastName, email: users.email })
    .from(teacherReminders).innerJoin(programWeeks, eq(programWeeks.id, teacherReminders.weekId)).innerJoin(tracks, eq(tracks.id, teacherReminders.trackId)).innerJoin(users, eq(users.id, teacherReminders.teacherId))
    .orderBy(desc(teacherReminders.updatedAt)).limit(100) : [];
  const jobs = tab === "jobs" ? await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(50) : [];
  const [lastRun] = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(1);

  const TABS = [{ k: "audit", l: "Audit log" }, { k: "reminders", l: "Teacher reminders" }, { k: "jobs", l: "Background jobs" }];

  return (
    <>
      <PageHeader title="Activity" description="Administrative actions, teacher reminders and background jobs."
        actions={<RunJobs />} />
      <div className="mb-5 max-w-md">
        <Notice tone={lastRun?.ok === false ? "danger" : "info"} icon="clock" title="Last job run">{lastRun ? `${formatDateTime(lastRun.startedAt, tz)} (${lastRun.trigger})${lastRun.ok === false ? " — failed" : ""}` : "Jobs have never run."}</Notice>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => <Link key={t.k} href={`/admin/activity?tab=${t.k}`} className={cn("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold", tab === t.k ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{t.l}</Link>)}
      </div>

      <Card>
        {tab === "audit" && (audit.length === 0 ? <EmptyState icon="activity" title="Nothing recorded yet" /> : (
          <>
            <CardHeader title="Audit log" description="Role changes, deactivations, publications, archival, programme and assignment configuration changes, journal access." />
            <div className="table-wrap"><table className="table-dt min-w-[720px]">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
              <tbody>{audit.slice(0, 50).map(({ a, first, last }) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-[12.5px] text-[var(--text-muted)]">{formatDateTime(a.createdAt, tz)}</td>
                  <td className="whitespace-nowrap">{first ? `${first} ${last}` : <span className="text-[var(--text-subtle)]">System</span>}</td>
                  <td><code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[12px]">{a.action}</code></td>
                  <td className="text-[13px]">{a.summary}{Object.keys(a.metadata).length > 0 && <details className="mt-1"><summary className="cursor-pointer text-[12px] text-[var(--text-subtle)]">Details</summary><pre className="mt-1 overflow-x-auto rounded bg-[var(--surface-2)] p-2 text-[11.5px]">{JSON.stringify(a.metadata, null, 2)}</pre></details>}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {audit.length > 50 && <div className="border-t border-[var(--border)] p-3 text-center"><Link href={`/admin/activity?tab=audit&before=${encodeURIComponent(audit[49].a.createdAt.toISOString())}`} className="text-[13px] font-semibold text-[var(--brand)]">Older entries</Link></div>}
          </>
        ))}

        {tab === "reminders" && (reminders.length === 0 ? <EmptyState icon="bell" title="No reminders yet" description="Teachers get an in-app reminder when a week is about to start and their course isn't published." /> : (
          <>
            <CardHeader title="Course-upload reminders" description="In-app notifications to teachers. One per teacher, track and week." />
            <div className="table-wrap"><table className="table-dt min-w-[600px]">
              <thead><tr><th>Teacher</th><th>For</th><th>Status</th><th>Sent</th></tr></thead>
              <tbody>{reminders.map(({ r, week, track, first, last, email }) => (
                <tr key={r.id}>
                  <td><div className="font-semibold">{first} {last}</div><div className="text-[12px] text-[var(--text-muted)]">{email}</div></td>
                  <td>{track} · week {week}</td>
                  <td><Badge tone="success">Notified</Badge></td>
                  <td className="whitespace-nowrap text-[12.5px]">{formatDateTime(r.sentAt ?? r.updatedAt, tz)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </>
        ))}

        {tab === "jobs" && (jobs.length === 0 ? <EmptyState icon="clock" title="No job runs yet" description="Jobs run automatically as people use the app, or press Run jobs now." /> : (
          <>
            <CardHeader title="Background job runs" description="Each run publishes due courses, sends course-upload reminders and creates deadline notifications." />
            <div className="table-wrap"><table className="table-dt min-w-[760px]">
              <thead><tr><th>Started</th><th>Trigger</th><th>Result</th><th>Summary</th></tr></thead>
              <tbody>{jobs.map((j) => {
                const s = j.summary as { coursesPublished?: number; reminders?: { sent: number; alreadyHandled: number; weeksInWindow: number[]; skipped?: string }; deadlines?: { dueSoon: number; overdue: number }; error?: string };
                return (
                  <tr key={j.id}>
                    <td className="whitespace-nowrap text-[12.5px]">{formatDateTime(j.startedAt, tz)}</td>
                    <td><code className="text-[12px]">{j.trigger.startsWith("manual:") ? "manual" : j.trigger}</code></td>
                    <td>{j.ok === null ? <Badge>Running</Badge> : j.ok ? <Badge tone="success">OK</Badge> : <Badge tone="danger">Failed</Badge>}</td>
                    <td className="text-[12.5px]">{s.error ? <span className="text-[var(--danger)]">{s.error}</span> : <>
                      {s.coursesPublished ?? 0} published · reminders: {s.reminders?.skipped ?? `weeks [${s.reminders?.weeksInWindow?.join(", ") ?? ""}] — ${s.reminders?.sent ?? 0} sent, ${s.reminders?.alreadyHandled ?? 0} already sent`} · deadlines: {(s.deadlines?.dueSoon ?? 0) + (s.deadlines?.overdue ?? 0)}
                    </>}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          </>
        ))}
      </Card>
    </>
  );
}

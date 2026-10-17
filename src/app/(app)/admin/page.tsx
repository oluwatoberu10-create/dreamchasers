import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { Card, CardBody, CardHeader, PageHeader, StatCard } from "@/components/ui/card";
import { Badge, RoleBadge, TrackDot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, EmptyState, Notice, ProgressBar } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { formatDateOnly, formatNumber, formatPct, pct, relativeTime } from "@/lib/utils";
import { platformMetrics, publicationByWeek } from "@/server/services/analytics";
import { courseSlots } from "@/server/services/teaching";
import { adminContext } from "./data";

export const metadata = { title: "Admin overview" };

export default async function AdminOverview() {
  const ctx = await adminContext();
  if (!ctx.program) {
    return <><PageHeader title="Overview" /><Card><EmptyState icon="settings" title="Create your first programme" description="Set the start date, number of weeks and timezone, then add tracks and assign teachers." action={<ButtonLink href="/admin/settings">Go to settings</ButtonLink>} /></Card></>;
  }
  const { program, weeks, clock } = ctx;
  const focusWeek = clock.currentWeek ?? weeks.find((w) => w.startsOn > clock.today) ?? weeks[weeks.length - 1];
  const [m, slots, pubs, recentUsers, activity] = await Promise.all([
    platformMetrics(program.id),
    focusWeek ? courseSlots(program, weeks, { weekIds: [focusWeek.id] }) : Promise.resolve([]),
    publicationByWeek(program, weeks),
    db.select().from(users).orderBy(desc(users.createdAt)).limit(6),
    db.select({ a: auditLogs, first: users.firstName, last: users.lastName }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorId)).orderBy(desc(auditLogs.createdAt)).limit(8),
  ]);
  const missingNow = slots.filter((s) => !s.fulfilled);
  const started = pubs.filter((p) => p.startsOn <= clock.today);
  const expected = started.reduce((a, p) => a + p.expected, 0);
  const published = started.reduce((a, p) => a + p.published, 0);

  return (
    <>
      <PageHeader eyebrow={program.name} title="Overview"
        description={`${clock.phase.phase === "running" ? `Week ${clock.phase.weekNumber} of ${program.weeksCount}` : clock.phase.phase === "before" ? `Starts in ${clock.phase.daysUntilStart} days` : "Programme finished"} · ${formatDateOnly(program.startDate)} – ${formatDateOnly(clock.endDate)} · ${program.timezone}`}
        actions={<><ButtonLink href="/admin/analytics" variant="secondary"><Icon name="chart" className="h-4 w-4" />Analytics</ButtonLink><ButtonLink href="/admin/settings"><Icon name="settings" className="h-4 w-4" />Programme settings</ButtonLink></>} />

      {missingNow.length > 0 && focusWeek && (
        <div className="mb-6"><Notice tone="danger" title={`${missingNow.length} course${missingNow.length === 1 ? "" : "s"} missing for week ${focusWeek.weekNumber}`}>
          {missingNow.map((s) => `${s.track.name} (${s.teachers.map((t) => t.firstName).join(", ") || "no teacher"}${s.scheduled ? " — scheduled" : s.courses.length ? " — draft only" : ""})`).join(" · ")}. <Link href="/admin/courses" className="font-semibold underline">Review courses</Link>
        </Notice></div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Users" value={formatNumber(m.users)} hint={`${m.deactivated} deactivated`} icon="users" href="/admin/users" definition="Every account, any role or status." />
        <StatCard label="Learners" value={formatNumber(m.students)} hint={`${m.activeLearners} active in 14 days`} icon="team" href="/admin/users?role=student" definition="Active learner accounts. 'Active' = opened a course or worked on an assignment in the last 14 days." delay={30} />
        <StatCard label="Teachers" value={formatNumber(m.teachers)} hint={`+ ${m.admins} super admin${m.admins === 1 ? "" : "s"}`} icon="graduation" href="/admin/users?role=teacher" delay={60} />
        <StatCard label="Courses" value={m.courses} hint={`${m.publishedCourses} published · ${m.draftCourses} draft · ${m.scheduledCourses} scheduled`} icon="book" href="/admin/courses" definition="Course records in this programme. Published includes scheduled courses whose time has passed." delay={90} />
        <StatCard label="Assignments" value={m.assignments} hint={`${m.publishedAssignments} live`} icon="edit" href="/admin/assignments" definition="Assignment definitions — one per task, however many learners it has." delay={120} />
        <StatCard label="Submissions" value={m.submissions} hint={`of ${m.expectedPairs} due so far`} icon="send" definition="Learner/assignment pairs where something has been handed in." delay={150} />
        <StatCard label="Awaiting grading" value={m.awaitingGrading} icon="inbox" tone={m.awaitingGrading ? "brand" : "default"} href="/admin/assignments?filter=grading" definition="Submissions whose newest attempt is handed in but not graded." />
        <StatCard label="Graded" value={m.graded} icon="checkCircle" tone="success" definition="Submissions whose newest attempt has a grade." delay={30} />
        <StatCard label="Overdue (missing)" value={m.overduePairs} icon="alert" tone={m.overduePairs ? "danger" : "default"} href="/admin/assignments?filter=missing" definition="Learner/assignment pairs past the deadline with nothing handed in." delay={60} />
        <StatCard label="Submission rate" value={formatPct(pct(m.handedInPairs, m.expectedPairs))} icon="trend" definition="Handed-in pairs ÷ expected pairs, for assignments whose deadline has passed." delay={90} />
        <StatCard label="Pass rate" value={formatPct(m.passRate)} hint={`Average score ${formatPct(m.averageScore)}`} icon="star" tone="success" definition="Passing latest grades ÷ all latest grades. Average = mean latest-grade percentage; ungraded work excluded." delay={120} />
        <StatCard label="Need extra learning" value={m.needingSupport} icon="repeat" tone={m.needingSupport ? "warning" : "default"} definition="Learners with a latest grade below the pass mark, a revision request, or an active repeat." delay={150} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Course publication by week" description={`Teacher publication rate: ${formatPct(pct(published, expected))} of expected courses in weeks that have started`} action={<Link href="/admin/courses" className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">All courses</Link>} />
          <CardBody>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
              {pubs.map((p) => {
                const full = p.expected > 0 && p.published >= p.expected;
                const past = p.startsOn <= clock.today;
                return (
                  <div key={p.week} className="text-center" title={`Week ${p.week}: ${p.published} of ${p.expected} published`}>
                    <div className={`flex h-14 flex-col items-center justify-center rounded-lg text-[12px] font-bold ${full ? "bg-[var(--success-soft)] text-[var(--success)]" : past ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]"}`}>
                      <span className="tnum text-[15px]">{p.published}/{p.expected}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--text-subtle)]">W{p.week}</div>
                  </div>
                );
              })}
            </div>
            {focusWeek && (
              <div className="mt-5 space-y-2">
                <div className="text-[13px] font-bold">Week {focusWeek.weekNumber} by track</div>
                {slots.map((s) => (
                  <div key={s.track.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-[13px]">
                    <TrackDot color={s.track.color} /><span className="min-w-28 font-semibold">{s.track.name}</span>
                    <span className="flex-1 truncate text-[var(--text-muted)]">{s.courses[0]?.title ?? "No course yet"} · {s.teachers.map((t) => `${t.firstName} ${t.lastName}`).join(", ") || "no teacher assigned"}</span>
                    {s.fulfilled ? <Badge tone="success">Published</Badge> : s.scheduled ? <Badge tone="info">Scheduled</Badge> : s.courses.length ? <Badge tone="warning">Draft only</Badge> : <Badge tone="danger">Missing</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Course completion" />
          <CardBody className="space-y-4 text-[13.5px]">
            <div><div className="mb-1 flex justify-between"><span>Completion rate</span><span className="tnum font-semibold">{formatPct(m.completionRate)}</span></div><ProgressBar value={m.completionRate ?? 0} tone="success" /></div>
            <div><div className="mb-1 flex justify-between"><span>Submission rate</span><span className="tnum font-semibold">{formatPct(pct(m.handedInPairs, m.expectedPairs))}</span></div><ProgressBar value={pct(m.handedInPairs, m.expectedPairs) ?? 0} /></div>
            <div><div className="mb-1 flex justify-between"><span>Pass rate</span><span className="tnum font-semibold">{formatPct(m.passRate)}</span></div><ProgressBar value={m.passRate ?? 0} tone="star" /></div>
            <p className="text-[12px] text-[var(--text-subtle)]">Completion = courses learners marked complete ÷ (live courses × enrolled learners).</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent registrations" action={<Link href="/admin/users" className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">Users</Link>} />
          <ul className="divide-y divide-[var(--border)]">
            {recentUsers.map((u) => (
              <li key={u.id}><Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--surface-2)]">
                <Avatar firstName={u.firstName} lastName={u.lastName} size={30} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold">{u.firstName} {u.lastName}</span><span className="text-[12px] text-[var(--text-subtle)]">{relativeTime(u.createdAt)}</span></span>
                <RoleBadge role={u.role} />
              </Link></li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Recent platform activity" action={<Link href="/admin/activity" className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">Activity log</Link>} />
          {activity.length === 0 ? <EmptyState compact icon="activity" title="No activity recorded yet" /> : (
            <ul className="divide-y divide-[var(--border)]">
              {activity.map(({ a, first, last }) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3 text-[13.5px]">
                  <Icon name="activity" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
                  <span className="min-w-0 flex-1"><span className="block">{a.summary}</span><span className="text-[12px] text-[var(--text-subtle)]">{first ? `${first} ${last}` : "System"} · {relativeTime(a.createdAt)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

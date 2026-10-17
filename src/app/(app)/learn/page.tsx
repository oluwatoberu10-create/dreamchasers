import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { journalEntries, programWeeks } from "@/db/schema";
import { Card, CardBody, CardHeader, PageHeader, StatCard } from "@/components/ui/card";
import { Badge, TrackDot, WeekResultBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Notice, ProgressBar, ProgressRing } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { WorkRow } from "@/components/learning";
import { Prose } from "@/components/prose";
import { summarize, weekResult } from "@/lib/progress";
import { formatDateOnly, formatDateTime, formatPct, relativeTime, truncate } from "@/lib/utils";
import { toProgressItems } from "@/server/services/learner";
import { listNotifications } from "@/server/services/notifications";
import { learnerContext, NOT_ENROLLED } from "./data";

export const metadata = { title: "Dashboard" };

export default async function LearnerDashboard() {
  const ctx = await learnerContext();
  const { user } = ctx;
  if (!ctx.program) {
    return (
      <>
        <PageHeader title={`Welcome, ${user.firstName}`} />
        <Card><EmptyState icon="graduation" title="No programme yet" description={NOT_ENROLLED} /></Card>
      </>
    );
  }
  const { program, weeks, clock, record } = ctx;
  const tz = program.timezone;
  const now = Date.now();
  const work = record.work;
  const overall = summarize(toProgressItems(work));

  const current = clock.currentWeek;
  const nextWeek = weeks.find((w) => w.startsOn > clock.today);
  const thisWeekCourses = record.courses.filter((c) => current && c.week.id === current.id);
  const upNext = thisWeekCourses.find((c) => !c.progress?.completedAt) ?? record.courses.find((c) => c.repeat) ?? null;
  const recent = [...record.courses].sort((a, b) => (b.course.publishedAt?.getTime() ?? 0) - (a.course.publishedAt?.getTime() ?? 0)).slice(0, 3);

  const todo = work.filter((w) => ["to_start", "in_progress", "needs_action"].includes(w.status.bucket));
  const dueSoon = todo.filter((w) => !w.status.isPastDue && w.assignment.dueAt.getTime() - now < 7 * 864e5).sort((a, b) => +a.assignment.dueAt - +b.assignment.dueAt);
  const overdue = work.filter((w) => w.status.key === "overdue");
  const graded = work.filter((w) => w.lastGrade).sort((a, b) => +b.lastGrade!.gradedAt - +a.lastGrade!.gradedAt);
  const latestFeedback = graded.find((w) => w.lastGrade!.feedback.trim());

  const evalWeek = current ?? weeks[weeks.length - 1];
  const evalSummary = summarize(toProgressItems(work.filter((w) => evalWeek && w.week.id === evalWeek.id)));
  const coursesDone = record.courses.filter((c) => c.progress?.completedAt).length;

  const [journal, notes] = await Promise.all([
    db.select({ e: journalEntries, n: programWeeks.weekNumber }).from(journalEntries).innerJoin(programWeeks, eq(programWeeks.id, journalEntries.weekId))
      .where(eq(journalEntries.studentId, user.id)).orderBy(desc(programWeeks.weekNumber)).limit(3),
    listNotifications(user.id, { unreadOnly: true }),
  ]);

  const phaseText = clock.phase.phase === "before" ? `Starts in ${clock.phase.daysUntilStart} day${clock.phase.daysUntilStart === 1 ? "" : "s"}`
    : clock.phase.phase === "after" ? "Programme complete" : `Week ${clock.phase.weekNumber} of ${program.weeksCount}`;

  return (
    <>
      <PageHeader
        eyebrow={program.name}
        title={`Welcome back, ${user.firstName}`}
        description={current ? `${current.title} · ${formatDateOnly(current.startsOn, { day: "numeric", month: "short" })} – ${formatDateOnly(current.endsOn, { day: "numeric", month: "short" })}` : phaseText}
        actions={<ButtonLink href="/learn/planner" variant="secondary"><Icon name="calendar" className="h-4 w-4" />Open planner</ButtonLink>}
      />

      {overdue.length > 0 && (
        <div className="mb-6"><Notice tone="danger" title={`${overdue.length} assignment${overdue.length === 1 ? " is" : "s are"} overdue`}>
          {overdue.some((o) => o.assignment.acceptLate) ? "You can still hand late work in — it will be marked as late. " : ""}<Link href="/learn/assignments?show=overdue" className="font-semibold underline">See what's outstanding</Link>
        </Notice></div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 1. What should I learn next? */}
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
            <ProgressRing value={clock.weeksElapsed} max={program.weeksCount} label={clock.phase.phase === "running" ? clock.phase.weekNumber : clock.weeksElapsed} sublabel={`of ${program.weeksCount} wks`} />
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-[var(--brand)]">What to learn next</div>
              {upNext ? (
                <>
                  <h2 className="mt-1 text-[19px] font-extrabold leading-snug tracking-tight">{upNext.course.title}</h2>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[var(--text-muted)]">
                    <TrackDot color={upNext.track.color} />{upNext.track.name} · Week {upNext.week.weekNumber} · {upNext.teacher.firstName} {upNext.teacher.lastName}
                    {upNext.repeat && <Badge tone="info">Ready for another attempt</Badge>}
                  </p>
                  {upNext.course.summary && <p className="mt-2 text-[14px]">{upNext.course.summary}</p>}
                  <ButtonLink href={`/learn/courses/${upNext.course.id}`} className="mt-4" size="sm">{upNext.progress ? "Continue course" : "Start course"}<Icon name="chevronRight" className="h-4 w-4" /></ButtonLink>
                </>
              ) : thisWeekCourses.length > 0 ? (
                <>
                  <h2 className="mt-1 text-[19px] font-extrabold tracking-tight">You've finished this week's courses 🎉</h2>
                  <p className="mt-1 text-[14px] text-[var(--text-muted)]">{nextWeek ? `Week ${nextWeek.weekNumber} begins ${formatDateOnly(nextWeek.startsOn, { weekday: "long", day: "numeric", month: "short" })}.` : "That's the last week of the programme."} Take a moment to write your weekly reflection.</p>
                  <ButtonLink href={`/learn/journal/${current?.weekNumber ?? 1}`} className="mt-4" size="sm" variant="star">Write this week's reflection</ButtonLink>
                </>
              ) : (
                <>
                  <h2 className="mt-1 text-[19px] font-extrabold tracking-tight">{clock.phase.phase === "before" ? "Your programme starts soon" : "This week's course isn't published yet"}</h2>
                  <p className="mt-1 text-[14px] text-[var(--text-muted)]">You'll get a notification the moment it opens. Meanwhile, revisit earlier courses or check your planner.</p>
                </>
              )}
            </div>
          </div>
          <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/50 px-5 py-3">
            <div className="mb-1.5 flex justify-between text-[12px] font-semibold text-[var(--text-muted)]"><span>Programme progress</span><span className="tnum">{phaseText}</span></div>
            <ProgressBar value={clock.weeksElapsed} max={program.weeksCount} tone="star" label="Programme weeks elapsed" />
          </div>
        </Card>

        {/* 4. How am I performing? */}
        <Card>
          <CardHeader title="How you're doing" action={<Link href="/learn/progress" className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">Full progress</Link>} />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><div className="tnum text-[24px] font-extrabold">{formatPct(overall.averagePct)}</div><div className="text-[12px] text-[var(--text-muted)]" title="Mean of your latest grades as percentages. Ungraded work isn't counted.">Average score{overall.graded ? ` · ${overall.graded} graded` : ""}</div></div>
              <div><div className="tnum text-[24px] font-extrabold">{overall.passed}<span className="text-[15px] text-[var(--text-subtle)]">/{overall.graded}</span></div><div className="text-[12px] text-[var(--text-muted)]">Passed of graded</div></div>
              <div><div className="tnum text-[24px] font-extrabold">{overall.submitted}<span className="text-[15px] text-[var(--text-subtle)]">/{overall.assigned}</span></div><div className="text-[12px] text-[var(--text-muted)]">Assignments handed in</div></div>
              <div><div className="tnum text-[24px] font-extrabold">{coursesDone}<span className="text-[15px] text-[var(--text-subtle)]">/{record.courses.length}</span></div><div className="text-[12px] text-[var(--text-muted)]">Courses completed</div></div>
            </div>
            {evalWeek && (
              <div className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2.5 text-[13px]">
                <span className="font-semibold">Week {evalWeek.weekNumber} evaluation</span>
                <WeekResultBadge result={weekResult(evalSummary)} />
              </div>
            )}
          </CardBody>
        </Card>

        {/* 2 & 3. What do I need to do, and what's due? */}
        <Card className="lg:col-span-2">
          <CardHeader title="Due soon" description="Assignments due in the next seven days" action={<Link href="/learn/assignments" className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">All assignments</Link>} />
          {dueSoon.length === 0 ? (
            <EmptyState compact icon="checkCircle" title="Nothing due this week" description={todo.length ? `You still have ${todo.length} open item${todo.length === 1 ? "" : "s"} on your to-do list.` : "You're on top of everything."} />
          ) : (
            <div className="divide-y divide-[var(--border)]">{dueSoon.slice(0, 6).map((w) => <WorkRow key={w.assignment.id} item={w} tz={tz} />)}</div>
          )}
          {todo.filter((w) => w.status.bucket === "needs_action").length > 0 && (
            <div className="border-t border-[var(--border)]">
              <div className="px-5 pb-1 pt-3 text-[11.5px] font-bold uppercase tracking-[0.08em] text-[var(--warning)]">Needs your attention</div>
              <div className="divide-y divide-[var(--border)]">{todo.filter((w) => w.status.bucket === "needs_action").map((w) => <WorkRow key={w.assignment.id} item={w} tz={tz} />)}</div>
            </div>
          )}
        </Card>

        {/* Latest feedback */}
        <Card>
          <CardHeader title="Latest feedback" />
          {latestFeedback ? (
            <CardBody>
              <Link href={`/learn/assignments/${latestFeedback.assignment.id}`} className="text-[14px] font-bold hover:text-[var(--brand)]">{latestFeedback.assignment.title}</Link>
              <div className="mt-1 text-[12.5px] text-[var(--text-muted)]">{latestFeedback.lastGrade!.score}/{latestFeedback.lastGrade!.maxScore} · graded {relativeTime(latestFeedback.lastGrade!.gradedAt)}</div>
              <div className="mt-3 rounded-lg border-l-[3px] border-[var(--star-strong)] bg-[var(--star-soft)] px-3 py-2.5"><Prose source={truncate(latestFeedback.lastGrade!.feedback, 300)} small /></div>
              <div className="mt-4 space-y-2">
                {graded.slice(0, 4).map((g) => (
                  <Link key={g.assignment.id} href={`/learn/assignments/${g.assignment.id}`} className="flex items-center justify-between gap-2 text-[13px] hover:text-[var(--brand)]">
                    <span className="truncate">{g.assignment.title}</span>
                    <span className="tnum shrink-0 font-semibold">{g.lastGrade!.score}/{g.lastGrade!.maxScore}</span>
                  </Link>
                ))}
              </div>
            </CardBody>
          ) : <EmptyState compact icon="message" title="No feedback yet" description="When a teacher grades your work, their comments will appear here." />}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Recently published" action={<Link href="/learn/courses" className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">Course library</Link>} />
          {recent.length === 0 ? <EmptyState compact icon="book" title="No courses yet" description="Published courses will appear here." /> : (
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              {recent.map((c) => (
                <Link key={c.course.id} href={`/learn/courses/${c.course.id}`} className="lift rounded-xl border border-[var(--border)] p-4">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-[var(--text-subtle)]"><TrackDot color={c.track.color} />Week {c.week.weekNumber}</div>
                  <div className="mt-1.5 line-clamp-2 text-[14px] font-bold leading-snug">{c.course.title}</div>
                  <div className="mt-2 text-[12px] text-[var(--text-muted)]">{c.progress?.completedAt ? "✓ Completed" : c.progress ? "In progress" : `Published ${relativeTime(c.course.publishedAt)}`}</div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Journal" action={<Link href="/learn/journal" className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">Open</Link>} />
            {journal.length === 0 ? <EmptyState compact icon="journal" title="Start your reflection journal" description="A few minutes at the end of each week makes a real difference." action={current && <ButtonLink href={`/learn/journal/${current.weekNumber}`} size="sm" variant="star">Write week {current.weekNumber}</ButtonLink>} /> : (
              <ul className="divide-y divide-[var(--border)]">
                {journal.map(({ e, n }) => (
                  <li key={e.id}><Link href={`/learn/journal/${n}`} className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-[var(--surface-2)]">
                    <span className="min-w-0"><span className="block text-[13.5px] font-semibold">Week {n}</span><span className="block truncate text-[12.5px] text-[var(--text-muted)]">{e.responses.learned || "No answer yet"}</span></span>
                    <Badge tone={e.status === "submitted" ? "success" : "neutral"}>{e.status === "submitted" ? "Completed" : "Draft"}</Badge>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Unread notifications" action={<Link href="/notifications" className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">All</Link>} />
            {notes.items.length === 0 ? <EmptyState compact icon="bell" title="You're all caught up" /> : (
              <ul className="divide-y divide-[var(--border)]">
                {notes.items.slice(0, 4).map((n) => (
                  <li key={n.id}><Link href={n.link ?? "/notifications"} className="block px-5 py-3 hover:bg-[var(--surface-2)]">
                    <span className="block text-[13.5px] font-semibold">{n.title}</span>
                    <span className="block text-[12px] text-[var(--text-subtle)]">{formatDateTime(n.createdAt, tz)}</span>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="To start" value={work.filter((w) => w.status.bucket === "to_start").length} icon="edit" href="/learn/assignments" />
        <StatCard label="In progress" value={work.filter((w) => w.status.bucket === "in_progress").length} icon="clock" tone="brand" href="/learn/assignments" delay={40} />
        <StatCard label="Awaiting grading" value={overall.awaitingGrading} icon="inbox" href="/learn/assignments" delay={80} />
        <StatCard label="Overdue" value={overdue.length} icon="alert" tone={overdue.length ? "danger" : "default"} href="/learn/assignments?show=overdue" delay={120} />
      </div>
    </>
  );
}

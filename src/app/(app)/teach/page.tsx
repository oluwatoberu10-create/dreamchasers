import Link from "next/link";
import { Card, CardBody, CardHeader, PageHeader, StatCard } from "@/components/ui/card";
import { Badge, CourseStatusBadge, TrackDot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, EmptyState, Notice, ProgressBar } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { cn, formatDateOnly, relativeTime, truncate } from "@/lib/utils";
import { listConversations } from "@/server/services/messaging";
import { listNotifications } from "@/server/services/notifications";
import { courseSlots, gradingQueue, managedCourses, studentStats, teachingChecklist } from "@/server/services/teaching";
import { teacherContext, NO_PROGRAM } from "./data";

export const metadata = { title: "Teaching dashboard" };

export default async function TeacherDashboard() {
  const ctx = await teacherContext();
  if (!ctx.program) return <><PageHeader title="Teaching" /><Card><EmptyState icon="calendar" title="No programme" description={NO_PROGRAM} /></Card></>;
  const { user, program, weeks, clock, tracks } = ctx;
  const teacherScope = user.role === "super_admin" ? user.id : user.id;

  const upcomingWeeks = weeks.filter((w) => w.endsOn >= clock.today).slice(0, 3);
  const checklistWeek = clock.currentWeek ?? upcomingWeeks[0] ?? weeks[weeks.length - 1];

  const [courses, queue, slots, stats, checklist, threads, notes] = await Promise.all([
    managedCourses(user, program.id),
    gradingQueue(user, program.id, "awaiting", 50),
    courseSlots(program, weeks, { weekIds: upcomingWeeks.map((w) => w.id), teacherId: teacherScope }),
    studentStats(program.id),
    checklistWeek ? teachingChecklist(user, program, weeks, checklistWeek) : Promise.resolve([]),
    listConversations(user.id),
    listNotifications(user.id),
  ]);

  const published = courses.filter((c) => c.course.status === "published" || (c.course.status === "scheduled" && c.course.publishAt && c.course.publishAt <= new Date())).length;
  const drafts = courses.filter((c) => c.course.status === "draft").length;
  const missingStudents = stats.filter((s) => s.missing > 0);
  const struggling = stats.filter((s) => s.belowPass > 0 || s.revision > 0 || s.repeats > 0);
  const totalSubmissions = stats.reduce((a, s) => a + s.submitted, 0);
  const needed = slots.filter((s) => !s.fulfilled && !s.scheduled);
  const done = checklist.filter((c) => c.done).length;

  return (
    <>
      <PageHeader eyebrow={`${program.name}${clock.currentWeek ? ` · Week ${clock.currentWeek.weekNumber}` : ""}`} title={`Good to see you, ${user.firstName}`}
        description={tracks.length ? <>You teach {tracks.map((t, i) => <span key={t.id}>{i > 0 && ", "}<span className="inline-flex items-center gap-1"><TrackDot color={t.color} />{t.name}</span></span>)}.</> : "Courses the super admin assigns to you show up here. You can also create your own."}
        actions={<><ButtonLink href="/teach/courses/new"><Icon name="plus" className="h-4 w-4" />New course</ButtonLink><ButtonLink href="/teach/grading" variant="secondary">Grade work{queue.length ? ` (${queue.length})` : ""}</ButtonLink></>} />

      {needed.length > 0 && (
        <div className="mb-6"><Notice tone="warning" title={`${needed.length} course${needed.length === 1 ? "" : "s"} still to publish`}>
          {needed.map((s) => `${s.track.name} — week ${s.week.weekNumber} (starts ${formatDateOnly(s.week.startsOn, { weekday: "short", day: "numeric", month: "short" })})`).join(" · ")}.{" "}
          <Link href={needed[0].courses[0] ? `/teach/courses/${needed[0].courses[0].id}` : "/teach/courses/new"} className="font-semibold underline">{needed[0].courses[0] ? "Open the draft" : "Create it now"}</Link>
        </Notice></div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Courses managed" value={courses.length} hint={`${published} published · ${drafts} draft`} icon="book" href="/teach/courses" />
        <StatCard label="Awaiting grading" value={queue.length} hint={queue[0] ? `Oldest ${relativeTime(queue[0].attempt.submittedAt)}` : "All caught up"} icon="inbox" tone={queue.length ? "brand" : "success"} href="/teach/grading" delay={40} />
        <StatCard label="Missing work" value={missingStudents.reduce((a, s) => a + s.missing, 0)} hint={`${missingStudents.length} learner${missingStudents.length === 1 ? "" : "s"}`} icon="alert" tone={missingStudents.length ? "danger" : "default"} href="/teach/students?filter=missing" delay={80} />
        <StatCard label="Need support" value={struggling.length} hint="Below pass mark or revising" icon="repeat" tone={struggling.length ? "warning" : "default"} href="/teach/students?filter=support" delay={120} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Waiting for your grade" description={`${totalSubmissions} submissions received this programme`} action={<Link href="/teach/grading" className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">Grading queue</Link>} />
          {queue.length === 0 ? <EmptyState compact icon="checkCircle" title="Nothing to grade" description="New submissions will appear here — you'll get a notification too." /> : (
            <ul className="divide-y divide-[var(--border)]">
              {queue.slice(0, 6).map((q) => (
                <li key={q.attempt.id}><Link href={`/teach/grading/${q.attempt.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--surface-2)]">
                  <Avatar firstName={q.student.firstName} lastName={q.student.lastName} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{q.student.firstName} {q.student.lastName} · {q.assignment.title}</span>
                    <span className="text-[12.5px] text-[var(--text-muted)]">Week {q.week.weekNumber} · submitted {relativeTime(q.attempt.submittedAt)}</span>
                  </span>
                  {q.attempt.attemptNumber > 1 ? <Badge tone="info">Attempt {q.attempt.attemptNumber}</Badge> : q.attempt.isLate ? <Badge tone="warning">Late</Badge> : <Badge tone="brand">On time</Badge>}
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={checklistWeek ? `Week ${checklistWeek.weekNumber} checklist` : "Weekly checklist"} description={`${done} of ${checklist.length} done`} />
          <div className="px-5 pt-3"><ProgressBar value={done} max={checklist.length || 1} tone="success" label="Checklist progress" /></div>
          <ul className="space-y-1 p-3">
            {checklist.map((c) => (
              <li key={c.key}><Link href={c.href ?? "#"} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-[var(--surface-2)]">
                <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", c.done ? "border-[var(--success)] bg-[var(--success)] text-white" : "border-[var(--border-strong)]")}>{c.done && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}</span>
                <span className="min-w-0"><span className={cn("block text-[13.5px] font-semibold", c.done && "text-[var(--text-muted)]")}>{c.label}</span><span className="text-[12px] text-[var(--text-muted)]">{c.detail}</span></span>
              </Link></li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Upcoming course deadlines" description="One course per track per week" action={<Link href="/teach/calendar" className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">Calendar</Link>} />
          {slots.length === 0 ? <EmptyState compact icon="calendar" title="No upcoming weeks" /> : (
            <ul className="divide-y divide-[var(--border)]">
              {slots.map((s) => {
                const c = s.courses[0];
                return (
                  <li key={`${s.track.id}-${s.week.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="w-20 shrink-0 text-[12.5px] font-bold text-[var(--text-muted)]">Week {s.week.weekNumber}<span className="block font-normal">{formatDateOnly(s.week.startsOn, { day: "numeric", month: "short" })}</span></span>
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-muted)]"><TrackDot color={s.track.color} />{s.track.name}</span><span className="block truncate text-[14px] font-semibold">{c ? c.title : "No course yet"}</span></span>
                    {c ? <CourseStatusBadge status={c.status} publishAt={c.publishAt} /> : <Badge tone="danger">Needed</Badge>}
                    <ButtonLink href={c ? `/teach/courses/${c.id}` : `/teach/courses/new?track=${s.track.id}&week=${s.week.id}`} size="sm" variant={c ? "secondary" : "primary"}>{c ? "Open" : "Create"}</ButtonLink>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Learners who need you" action={<Link href="/teach/students" className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">All</Link>} />
          {missingStudents.length + struggling.length === 0 ? <EmptyState compact icon="team" title="Everyone's on track" /> : (
            <ul className="divide-y divide-[var(--border)]">
              {[...new Map([...missingStudents, ...struggling].map((s) => [s.id, s])).values()].slice(0, 6).map((s) => (
                <li key={s.id}><Link href={`/teach/students/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--surface-2)]">
                  <Avatar firstName={s.firstName} lastName={s.lastName} size={30} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{s.firstName} {s.lastName}</span>
                  {s.missing > 0 && <Badge tone="danger">{s.missing} missing</Badge>}
                  {s.belowPass + s.revision > 0 && <Badge tone="warning">{s.belowPass + s.revision} below</Badge>}
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Recent activity" />
          <ul className="divide-y divide-[var(--border)]">
            {notes.items.slice(0, 6).map((n) => (
              <li key={n.id}><Link href={n.link ?? "/notifications"} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--surface-2)]">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-[var(--border-strong)]" : "bg-[var(--brand)]")} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold">{n.title}</span><span className="block truncate text-[12.5px] text-[var(--text-muted)]">{n.body}</span></span>
                <span className="shrink-0 text-[12px] text-[var(--text-subtle)]">{relativeTime(n.createdAt)}</span>
              </Link></li>
            ))}
            {notes.items.length === 0 && <li><EmptyState compact icon="activity" title="No activity yet" /></li>}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Recent messages" action={<Link href="/messages" className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">Inbox</Link>} />
          {threads.length === 0 ? <CardBody className="text-[13px] text-[var(--text-muted)]">No conversations yet.</CardBody> : (
            <ul className="divide-y divide-[var(--border)]">
              {threads.slice(0, 4).map((t) => t.other && (
                <li key={t.id}><Link href={`/messages/${t.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--surface-2)]">
                  <Avatar firstName={t.other.firstName} lastName={t.other.lastName} size={30} />
                  <span className="min-w-0 flex-1"><span className={cn("block truncate text-[13.5px]", t.unread ? "font-extrabold" : "font-semibold")}>{t.other.firstName} {t.other.lastName}</span><span className="block truncate text-[12px] text-[var(--text-muted)]">{t.last ? truncate(t.last.body, 60) : ""}</span></span>
                  {t.unread > 0 && <span className="h-2 w-2 rounded-full bg-[var(--brand)]" />}
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

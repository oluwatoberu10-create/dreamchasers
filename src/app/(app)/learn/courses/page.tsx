import Link from "next/link";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { courses, tracks } from "@/db/schema";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge, TrackDot } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { formatDateOnly, formatDateTime } from "@/lib/utils";
import { learnerContext, NOT_ENROLLED } from "../data";

export const metadata = { title: "My Courses" };

export default async function CourseLibrary() {
  const ctx = await learnerContext();
  if (!ctx.program) return <><PageHeader title="My Courses" /><Card><EmptyState icon="book" title="No programme yet" description={NOT_ENROLLED} /></Card></>;
  const { program, weeks, clock, record } = ctx;

  // Upcoming scheduled courses are shown as "coming soon" — titles only, no content.
  const upcoming = await db.select({ id: courses.id, title: courses.title, weekId: courses.weekId, publishAt: courses.publishAt, color: tracks.color, track: tracks.name })
    .from(courses).innerJoin(tracks, eq(tracks.id, courses.trackId))
    .where(and(eq(courses.programId, program.id), eq(courses.status, "scheduled"), gt(courses.publishAt, new Date())));

  const workByCourse = new Map<string, { total: number; done: number }>();
  for (const w of record.work) {
    const e = workByCourse.get(w.course.id) ?? { total: 0, done: 0 };
    e.total++;
    if (w.status.key === "passed") e.done++;
    workByCourse.set(w.course.id, e);
  }

  const shownWeeks = weeks.filter((w) => record.courses.some((c) => c.week.id === w.id) || upcoming.some((u) => u.weekId === w.id));

  return (
    <>
      <PageHeader title="My Courses" description={`Every published course in ${program.name}, week by week.`} />
      {shownWeeks.length === 0 ? (
        <Card><EmptyState icon="book" title="No courses have been published yet" description="Your first course will appear here as soon as your teacher publishes it. You'll get a notification too." /></Card>
      ) : (
        <div className="space-y-8">
          {[...shownWeeks].reverse().map((week) => {
            const items = record.courses.filter((c) => c.week.id === week.id);
            const soon = upcoming.filter((u) => u.weekId === week.id);
            const isCurrent = clock.currentWeek?.id === week.id;
            return (
              <section key={week.id} aria-labelledby={`wk-${week.weekNumber}`}>
                <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 id={`wk-${week.weekNumber}`} className="text-[17px] font-extrabold tracking-tight">{week.title}</h2>
                  <span className="text-[12.5px] text-[var(--text-muted)]">{formatDateOnly(week.startsOn, { day: "numeric", month: "short" })} – {formatDateOnly(week.endsOn, { day: "numeric", month: "short" })}</span>
                  {isCurrent && <Badge tone="brand">This week</Badge>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((c) => {
                    const w = workByCourse.get(c.course.id);
                    return (
                      <Link key={c.course.id} href={`/learn/courses/${c.course.id}`} className="card lift flex flex-col p-5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[var(--text-muted)]"><TrackDot color={c.track.color} />{c.track.name}</span>
                          {c.repeat ? <Badge tone="info">Keep learning</Badge> : c.progress?.completedAt ? <Badge tone="success">Completed</Badge> : c.progress ? <Badge tone="brand">In progress</Badge> : <Badge>New</Badge>}
                        </div>
                        <h3 className="mt-2 text-[16px] font-bold leading-snug">{c.course.title}</h3>
                        {c.course.summary && <p className="mt-1 line-clamp-2 text-[13.5px] text-[var(--text-muted)]">{c.course.summary}</p>}
                        <div className="mt-auto flex items-center justify-between pt-4 text-[12.5px] text-[var(--text-muted)]">
                          <span>{c.teacher.firstName} {c.teacher.lastName}</span>
                          {w && <span className="tnum font-semibold">{w.done}/{w.total} passed</span>}
                        </div>
                      </Link>
                    );
                  })}
                  {soon.map((u) => (
                    <div key={u.id} className="flex flex-col rounded-[var(--radius-card)] border border-dashed border-[var(--border-strong)] p-5">
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[var(--text-muted)]"><TrackDot color={u.color} />{u.track}</span>
                      <h3 className="mt-2 text-[16px] font-bold leading-snug text-[var(--text-muted)]">{u.title}</h3>
                      <p className="mt-auto flex items-center gap-1.5 pt-4 text-[12.5px] font-semibold text-[var(--info)]"><Icon name="clock" className="h-3.5 w-3.5" />Opens {formatDateTime(u.publishAt, program.timezone)}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

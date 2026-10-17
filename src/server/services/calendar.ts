import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { assignments, courses, tracks } from "@/db/schema";
import { addDays, localDate } from "@/lib/dates";
import type { SessionUser } from "@/server/auth";
import { isCourseLive, managedCoursesWhere, studentVisibleCourse } from "@/server/policy";
import type { Program, Week } from "./program";
import { courseSlots } from "./teaching";

export type CalendarEvent = {
  id: string;
  /** Local date in the programme zone. */
  date: string;
  /** Local "HH:mm", if the event has a time. */
  time?: string;
  title: string;
  subtitle?: string;
  kind: "course" | "upcoming" | "deadline" | "assessment" | "milestone" | "reflection" | "missing" | "draft";
  href?: string;
  color?: string;
};

const hhmm = (d: Date, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

function milestones(program: Program, weeks: Week[], withReflection: boolean): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const w of weeks) {
    out.push({ id: `wk-${w.id}`, date: w.startsOn, title: w.weekNumber === 1 ? "Programme starts — Week 1" : `Week ${w.weekNumber} begins`, subtitle: w.theme ?? undefined, kind: "milestone" });
    if (withReflection) out.push({ id: `jr-${w.id}`, date: w.endsOn, title: `Weekly reflection — week ${w.weekNumber}`, subtitle: "Journal + weekly evaluation", kind: "reflection", href: `/learn/journal/${w.weekNumber}` });
  }
  const last = weeks[weeks.length - 1];
  if (last) out.push({ id: "end", date: last.endsOn, title: "Programme ends", kind: "milestone" });
  return out;
}

/**
 * Calendar events for a viewer, straight from the publication and deadline
 * records — so the calendar can never disagree with what learners can open.
 */
export async function calendarEvents(viewer: Pick<SessionUser, "id" | "role">, program: Program, weeks: Week[]): Promise<CalendarEvent[]> {
  const tz = program.timezone;
  const weekById = new Map(weeks.map((w) => [w.id, w]));
  const events: CalendarEvent[] = milestones(program, weeks, viewer.role === "student");

  const scope = viewer.role === "student"
    ? and(eq(courses.programId, program.id), sql`(${studentVisibleCourse} or (${courses.status} = 'scheduled'))`)
    : and(eq(courses.programId, program.id), sql`${courses.status} <> 'archived'`, managedCoursesWhere(viewer));

  const rows = await db.select({ c: courses, color: tracks.color, track: tracks.name }).from(courses)
    .innerJoin(tracks, eq(tracks.id, courses.trackId)).where(scope);

  for (const { c, color, track } of rows) {
    const week = weekById.get(c.weekId);
    const live = isCourseLive(c);
    if (live) {
      const at = c.publishedAt ?? c.publishAt ?? new Date();
      events.push({ id: `c-${c.id}`, date: localDate(at, tz), time: hhmm(at, tz), title: c.title, subtitle: `${track} · Week ${week?.weekNumber ?? "?"} course published`, kind: "course", color,
        href: viewer.role === "student" ? `/learn/courses/${c.id}` : `/teach/courses/${c.id}` });
    } else if (c.status === "scheduled" && c.publishAt) {
      events.push({ id: `c-${c.id}`, date: localDate(c.publishAt, tz), time: hhmm(c.publishAt, tz), title: viewer.role === "student" ? `Opens: ${c.title}` : `Scheduled: ${c.title}`,
        subtitle: `${track} · Week ${week?.weekNumber ?? "?"}`, kind: "upcoming", color, href: viewer.role === "student" ? undefined : `/teach/courses/${c.id}` });
    } else if (viewer.role !== "student" && week) {
      events.push({ id: `c-${c.id}`, date: week.startsOn, title: `Draft: ${c.title}`, subtitle: `${track} · publish for week ${week.weekNumber}`, kind: "draft", color, href: `/teach/courses/${c.id}` });
    }
  }

  const courseIds = rows.filter((r) => viewer.role !== "student" || isCourseLive(r.c)).map((r) => r.c.id);
  if (courseIds.length) {
    const as = await db.select({ a: assignments, courseTitle: courses.title, color: tracks.color }).from(assignments)
      .innerJoin(courses, eq(courses.id, assignments.courseId)).innerJoin(tracks, eq(tracks.id, courses.trackId))
      .where(and(sql`${assignments.courseId} in (${sql.join(courseIds.map((id) => sql`${id}`), sql`, `)})`,
        viewer.role === "student" ? eq(assignments.status, "published") : sql`${assignments.status} <> 'archived'`));
    for (const { a, courseTitle, color } of as) {
      events.push({
        id: `a-${a.id}`, date: localDate(a.dueAt, tz), time: hhmm(a.dueAt, tz), title: `${a.kind === "assessment" ? "Assessment" : "Due"}: ${a.title}`,
        subtitle: courseTitle, kind: a.kind === "assessment" ? "assessment" : "deadline", color,
        href: viewer.role === "student" ? `/learn/assignments/${a.id}` : `/teach/assignments/${a.id}`,
      });
    }
  }

  if (viewer.role !== "student") {
    // Course slots nobody has filled yet — what the reminder emails are about.
    const slots = await courseSlots(program, weeks, { teacherId: viewer.role === "super_admin" ? undefined : viewer.id });
    const today = localDate(new Date(), tz);
    for (const s of slots) {
      if (s.fulfilled || s.scheduled || s.courses.length > 0) continue;
      if (s.week.endsOn < addDays(today, -7)) continue;
      events.push({ id: `m-${s.track.id}-${s.week.id}`, date: s.week.startsOn, title: `Course needed: ${s.track.name}`, subtitle: `Week ${s.week.weekNumber} · ${s.teachers.map((t) => t.firstName).join(", ") || "no teacher assigned"}`,
        kind: "missing", color: s.track.color, href: viewer.role === "super_admin" ? "/admin/courses" : "/teach/courses/new" });
    }
  }

  return events.sort((x, y) => (x.date + (x.time ?? "00:00")).localeCompare(y.date + (y.time ?? "00:00")));
}

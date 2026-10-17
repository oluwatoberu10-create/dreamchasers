import "server-only";
import { and, eq } from "drizzle-orm";
import { db, transaction } from "@/db";
import { programs, teacherReminders } from "@/db/schema";
import { daysBetween, localDate, localHour } from "@/lib/dates";
import { formatDateOnly } from "@/lib/utils";
import { notify } from "./notifications";
import { getWeeks, type Program, type Week } from "./program";
import { courseSlots } from "./teaching";

/**
 * Weekly course-upload reminders, delivered as in-app notifications.
 *
 * For the current programme, find weeks starting within `reminderDaysBefore`
 * days (in the programme's timezone), find each track/week slot that has no
 * live or scheduled course, and notify the teachers responsible for it.
 *
 * Exactly-once per (week, track, teacher) is enforced by a unique row in
 * `teacher_reminders`, written in the same transaction as the notification.
 * Once a course is published or scheduled the slot is fulfilled and no
 * reminder is created.
 */

export type ReminderRunSummary = {
  program: string | null;
  today: string | null;
  weeksInWindow: number[];
  slotsChecked: number;
  slotsMissing: number;
  sent: number;
  alreadyHandled: number;
  skipped?: string;
};

/** Weeks whose reminder window is open at `now`. */
export function weeksInReminderWindow(program: Program, weeks: Week[], now: Date): Week[] {
  const today = localDate(now, program.timezone);
  const hour = localHour(now, program.timezone);
  const lead = program.reminderDaysBefore;
  return weeks.filter((w) => {
    const daysUntil = daysBetween(today, w.startsOn);
    const minDays = lead === 0 ? 0 : 1;
    if (daysUntil < minDays || daysUntil > lead) return false;
    // On the first day of the window, wait for the configured local hour.
    return daysUntil < lead || hour >= program.reminderHour;
  });
}

export async function runCourseReminders(now = new Date()): Promise<ReminderRunSummary> {
  const empty: ReminderRunSummary = { program: null, today: null, weeksInWindow: [], slotsChecked: 0, slotsMissing: 0, sent: 0, alreadyHandled: 0 };
  const [program] = await db.select().from(programs).where(and(eq(programs.isCurrent, true), eq(programs.status, "active"))).limit(1);
  if (!program) return { ...empty, skipped: "No active current programme." };

  const weeks = await getWeeks(program.id);
  const due = weeksInReminderWindow(program, weeks, now);
  const summary: ReminderRunSummary = { ...empty, program: program.name, today: localDate(now, program.timezone), weeksInWindow: due.map((w) => w.weekNumber) };
  if (due.length === 0) return summary;

  const slots = await courseSlots(program, weeks, { weekIds: due.map((w) => w.id) });
  summary.slotsChecked = slots.length;

  for (const slot of slots) {
    // Published, or scheduled to publish: the teacher's responsibility is met.
    if (slot.fulfilled || slot.scheduled) continue;
    summary.slotsMissing++;
    const drafted = slot.courses.length > 0;
    const starts = formatDateOnly(slot.week.startsOn, { weekday: "long", day: "numeric", month: "long" });

    for (const teacher of slot.teachers) {
      const created = await transaction(async (tx) => {
        const [row] = await tx.insert(teacherReminders)
          .values({ programId: program.id, weekId: slot.week.id, trackId: slot.track.id, teacherId: teacher.id, status: "sent", attempts: 1, sentAt: now })
          .onConflictDoNothing()
          .returning({ id: teacherReminders.id });
        if (!row) return false;
        await notify(tx, [{
          recipientId: teacher.id,
          type: "system",
          title: `Publish your ${slot.track.name} course for week ${slot.week.weekNumber}`,
          body: `Week ${slot.week.weekNumber} starts ${starts}. ${drafted ? "Your draft is ready — check it and publish or schedule it." : "Create the course and publish or schedule it."}`,
          link: drafted ? `/teach/courses/${slot.courses[0].id}` : "/teach/courses/new",
          dedupeKey: `course-reminder:${slot.week.id}:${slot.track.id}`,
        }]);
        return true;
      });
      if (created) summary.sent++;
      else summary.alreadyHandled++;
    }
  }
  return summary;
}

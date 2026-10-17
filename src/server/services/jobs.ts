import "server-only";
import { and, eq, gt, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { assignments, courses, enrollments, jobRuns, programs, submissionAttempts, submissions, users } from "@/db/schema";
import { studentVisibleCourse } from "@/server/policy";
import { publishDueCourses } from "./courses";
import { notify } from "./notifications";
import { runCourseReminders, type ReminderRunSummary } from "./reminders";
import { getSettings } from "./settings";

/**
 * The background job runner. Triggered by:
 *   - signed-in page views, at most every 15 minutes (maybeRunJobs below);
 *   - `npm run jobs:run` (e.g. from a server crontab);
 *   - the admin "Run jobs now" button.
 *
 * Every step is idempotent, so overlapping or repeated runs are harmless.
 */

/** Students enrolled in the course's programme who have not handed anything in. */
async function studentsWithoutWork(assignmentId: string, programId: string, dueAt: Date): Promise<string[]> {
  // Only learners who were enrolled before the deadline are expected to hand it in.
  const enrolled = (await db.select({ id: enrollments.studentId }).from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(and(eq(enrollments.programId, programId), lte(enrollments.enrolledAt, dueAt), eq(users.status, "active"), eq(users.role, "student"))))
    .map((r) => r.id);
  if (enrolled.length === 0) return [];
  const handedIn = await db.selectDistinct({ id: submissions.studentId }).from(submissions)
    .innerJoin(submissionAttempts, eq(submissionAttempts.submissionId, submissions.id))
    .where(and(eq(submissions.assignmentId, assignmentId), sql`${submissionAttempts.status} <> 'draft'`));
  const done = new Set(handedIn.map((r) => r.id));
  return enrolled.filter((id) => !done.has(id));
}

async function liveAssignments(where: ReturnType<typeof and>) {
  return db.select({ a: assignments, programId: courses.programId, courseTitle: courses.title }).from(assignments)
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .innerJoin(programs, eq(programs.id, courses.programId))
    .where(and(eq(assignments.status, "published"), studentVisibleCourse, eq(programs.isCurrent, true), where));
}

export async function notifyDeadlines(now = new Date()): Promise<{ dueSoon: number; overdue: number }> {
  const { deadlineReminderHours } = await getSettings();
  let dueSoon = 0;
  let overdue = 0;

  const soon = await liveAssignments(and(gt(assignments.dueAt, now), lt(assignments.dueAt, new Date(now.getTime() + deadlineReminderHours * 3600_000))));
  for (const { a, programId, courseTitle } of soon) {
    const ids = await studentsWithoutWork(a.id, programId, a.dueAt);
    dueSoon += await notify(db, ids.map((id) => ({
      recipientId: id, type: "deadline_approaching", title: `Due soon: ${a.title}`,
      body: `${courseTitle} — due ${a.dueAt.toISOString()}.`, link: `/learn/assignments/${a.id}`,
      resourceType: "assignment", resourceId: a.id, dedupeKey: `due_soon:${a.id}`,
    })));
  }

  // Look back a week so a missed cron run still catches up.
  const late = await liveAssignments(and(lt(assignments.dueAt, now), gt(assignments.dueAt, new Date(now.getTime() - 7 * 864e5))));
  for (const { a, programId, courseTitle } of late) {
    const ids = await studentsWithoutWork(a.id, programId, a.dueAt);
    overdue += await notify(db, ids.map((id) => ({
      recipientId: id, type: "assignment_overdue", title: `Overdue: ${a.title}`,
      body: a.acceptLate ? `${courseTitle} — the deadline has passed, but you can still hand it in.` : `${courseTitle} — the deadline has passed.`,
      link: `/learn/assignments/${a.id}`, resourceType: "assignment", resourceId: a.id, dedupeKey: `overdue:${a.id}`,
    })));
  }
  return { dueSoon, overdue };
}

export type JobSummary = {
  coursesPublished: number;
  reminders: ReminderRunSummary;
  deadlines: { dueSoon: number; overdue: number };
};

export async function runJobs(trigger: string, now = new Date()): Promise<JobSummary & { runId: string }> {
  const [run] = await db.insert(jobRuns).values({ job: "all", trigger }).returning();
  try {
    const coursesPublished = await publishDueCourses(now);
    const reminders = await runCourseReminders(now);
    const deadlines = await notifyDeadlines(now);
    const summary = { coursesPublished, reminders, deadlines };
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary }).where(eq(jobRuns.id, run.id));
    return { ...summary, runId: run.id };
  } catch (err) {
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: false, summary: { error: err instanceof Error ? err.message : String(err) } })
      .where(eq(jobRuns.id, run.id));
    throw err;
  }
}

/**
 * Runs after page responses are sent (via `after()`), so it never slows a page
 * down: one indexed lookup, and the jobs only if nothing ran in 15 minutes.
 */
export async function maybeRunJobs(): Promise<void> {
  const [recent] = await db.select({ id: jobRuns.id }).from(jobRuns)
    .where(gt(jobRuns.startedAt, sql`now() - interval '15 minutes'`)).limit(1);
  if (recent) return;
  await runJobs("opportunistic").catch((e) => console.error("[jobs] opportunistic run failed", e));
}

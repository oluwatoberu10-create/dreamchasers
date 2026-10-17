import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments, courseProgress, courses, enrollments, grades, programWeeks, repeatRequirements, submissionAttempts,
  submissions, tracks, users, weeklyEvaluations,
} from "@/db/schema";
import { deriveStatus, type DerivedStatus } from "@/lib/status";
import {
  learningStatus, summarize, weekResult, type LearningStatus, type ProgressItem, type ProgressSummary, type WeekResult,
} from "@/lib/progress";
import { studentVisibleCourse } from "@/server/policy";
import type { Program, Week } from "./program";

export type AttemptWithGrade = typeof submissionAttempts.$inferSelect & { grade: typeof grades.$inferSelect | null };

export type WorkItem = {
  assignment: typeof assignments.$inferSelect;
  course: typeof courses.$inferSelect;
  track: typeof tracks.$inferSelect;
  week: Week;
  submission: typeof submissions.$inferSelect | null;
  attempts: AttemptWithGrade[];
  latest: AttemptWithGrade | null;
  lastGrade: (typeof grades.$inferSelect & { attemptNumber: number }) | null;
  repeatActive: boolean;
  status: DerivedStatus;
  everSubmitted: boolean;
};

export type CourseItem = {
  course: typeof courses.$inferSelect;
  track: typeof tracks.$inferSelect;
  week: Week;
  teacher: { id: string; firstName: string; lastName: string };
  progress: typeof courseProgress.$inferSelect | null;
  repeat: typeof repeatRequirements.$inferSelect | null;
};

export type StudentRecord = {
  courses: CourseItem[];
  work: WorkItem[];
  repeats: (typeof repeatRequirements.$inferSelect)[];
};

/**
 * Everything a learner has in a programme, assembled from the database in a
 * handful of queries and run through the shared status rules. Both the
 * learner's own pages and the teacher's view of that learner read this, so
 * they always agree.
 */
export async function studentRecord(studentId: string, program: Program, weeks: Week[], now = new Date()): Promise<StudentRecord> {
  const weekById = new Map(weeks.map((w) => [w.id, w]));

  const courseRows = await db.select({ course: courses, track: tracks, teacher: { id: users.id, firstName: users.firstName, lastName: users.lastName } })
    .from(courses)
    .innerJoin(tracks, eq(tracks.id, courses.trackId))
    .innerJoin(users, eq(users.id, courses.teacherId))
    .where(and(eq(courses.programId, program.id), studentVisibleCourse))
    .orderBy(asc(courses.publishAt));
  const courseIds = courseRows.map((r) => r.course.id);

  // Work is only expected from a learner if its deadline is after they enrolled.
  // Earlier courses stay readable, but their deadlines never count as missing.
  const [enrollment] = await db.select({ at: enrollments.enrolledAt }).from(enrollments)
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.programId, program.id)));
  const enrolledAt = enrollment?.at ?? new Date(0);

  const [progressRows, repeatRows, allAssignments] = await Promise.all([
    courseIds.length ? db.select().from(courseProgress).where(and(eq(courseProgress.studentId, studentId), inArray(courseProgress.courseId, courseIds))) : [],
    db.select().from(repeatRequirements).where(eq(repeatRequirements.studentId, studentId)).orderBy(asc(repeatRequirements.createdAt)),
    courseIds.length ? db.select().from(assignments).where(and(inArray(assignments.courseId, courseIds), eq(assignments.status, "published"))).orderBy(asc(assignments.dueAt)) : [],
  ]);

  const submissionRows = allAssignments.length
    ? await db.select().from(submissions).where(and(eq(submissions.studentId, studentId), inArray(submissions.assignmentId, allAssignments.map((a) => a.id))))
    : [];
  // Keep pre-enrolment work only if the learner chose to start it anyway.
  const assignmentRows = allAssignments.filter((a) => a.dueAt >= enrolledAt || submissionRows.some((s) => s.assignmentId === a.id));
  const attemptRows = submissionRows.length
    ? await db.select({ attempt: submissionAttempts, grade: grades }).from(submissionAttempts)
      .leftJoin(grades, eq(grades.attemptId, submissionAttempts.id))
      .where(inArray(submissionAttempts.submissionId, submissionRows.map((s) => s.id)))
      .orderBy(asc(submissionAttempts.attemptNumber))
    : [];

  const activeRepeatCourses = new Set(repeatRows.filter((r) => r.status === "active").map((r) => r.courseId));
  const courseItems: CourseItem[] = courseRows
    .filter((r) => weekById.has(r.course.weekId))
    .map((r) => ({
      ...r,
      week: weekById.get(r.course.weekId)!,
      progress: progressRows.find((p) => p.courseId === r.course.id) ?? null,
      repeat: [...repeatRows].reverse().find((x) => x.courseId === r.course.id && x.status === "active") ?? null,
    }))
    .sort((a, b) => a.week.weekNumber - b.week.weekNumber || a.track.name.localeCompare(b.track.name));
  const courseById = new Map(courseItems.map((c) => [c.course.id, c]));

  const work: WorkItem[] = [];
  for (const a of assignmentRows) {
    const c = courseById.get(a.courseId);
    if (!c) continue;
    const submission = submissionRows.find((s) => s.assignmentId === a.id) ?? null;
    const attempts: AttemptWithGrade[] = submission
      ? attemptRows.filter((r) => r.attempt.submissionId === submission.id).map((r) => ({ ...r.attempt, grade: r.grade }))
      : [];
    const latest = attempts.find((x) => x.attemptNumber === submission?.currentAttempt) ?? null;
    const gradedOnes = attempts.filter((x) => x.grade);
    const lg = gradedOnes[gradedOnes.length - 1];
    const lastGrade = lg ? { ...lg.grade!, attemptNumber: lg.attemptNumber } : null;
    const repeatActive = activeRepeatCourses.has(a.courseId);
    const status = deriveStatus({
      dueAt: a.dueAt, acceptLate: a.acceptLate, resubmissionPolicy: a.resubmissionPolicy, maxAttempts: a.maxAttempts,
      latest: latest ? { attemptNumber: latest.attemptNumber, status: latest.status, isLate: latest.isLate, submittedAt: latest.submittedAt } : null,
      lastGrade, repeatActive, now,
    });
    work.push({
      assignment: a, course: c.course, track: c.track, week: c.week, submission, attempts, latest, lastGrade,
      repeatActive, status, everSubmitted: attempts.some((x) => x.status !== "draft"),
    });
  }

  return { courses: courseItems, work, repeats: repeatRows };
}

export function toProgressItems(work: WorkItem[]): ProgressItem[] {
  return work.map((w) => ({
    assignmentId: w.assignment.id,
    dueAt: w.assignment.dueAt,
    statusKey: w.status.key,
    bucket: w.status.bucket,
    everSubmitted: w.everSubmitted,
    lastGrade: w.lastGrade ? { score: w.lastGrade.score, maxScore: w.lastGrade.maxScore, passMark: w.lastGrade.passMark, outcome: w.lastGrade.outcome } : null,
  }));
}

export type WeekEvaluation = {
  week: Week;
  courses: CourseItem[];
  work: WorkItem[];
  summary: ProgressSummary;
  result: WeekResult;
  learningStatus: LearningStatus;
  comment: (typeof weeklyEvaluations.$inferSelect & { evaluatorName: string }) | null;
  /** The week has started (in the programme's zone). */
  started: boolean;
};

export async function buildWeekEvaluations(studentId: string, record: StudentRecord, weeks: Week[], today: string, now = new Date()): Promise<WeekEvaluation[]> {
  const comments = await db.select({ e: weeklyEvaluations, first: users.firstName, last: users.lastName }).from(weeklyEvaluations)
    .innerJoin(users, eq(users.id, weeklyEvaluations.evaluatedById))
    .where(eq(weeklyEvaluations.studentId, studentId));

  return weeks.map((week) => {
    const wc = record.courses.filter((c) => c.week.id === week.id);
    const ww = record.work.filter((w) => w.week.id === week.id);
    const summary = summarize(toProgressItems(ww), now);
    const comment = comments.find((c) => c.e.weekId === week.id);
    return {
      week,
      courses: wc,
      work: ww,
      summary,
      result: weekResult(summary),
      learningStatus: learningStatus(summary, {
        coursesInWeek: wc.length,
        coursesCompleted: wc.filter((c) => c.progress?.completedAt).length,
        coursesViewed: wc.filter((c) => c.progress).length,
        repeatActive: wc.some((c) => c.repeat),
      }),
      comment: comment ? { ...comment.e, evaluatorName: `${comment.first} ${comment.last}` } : null,
      started: week.startsOn <= today,
    };
  });
}

/** All weeks of a programme (helper for callers that only have the id). */
export async function weeksOf(programId: string): Promise<Week[]> {
  return db.select().from(programWeeks).where(eq(programWeeks.programId, programId)).orderBy(asc(programWeeks.weekNumber));
}

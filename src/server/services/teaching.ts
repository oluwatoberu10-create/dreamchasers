import "server-only";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import {
  assignments, courses, enrollments, grades, programWeeks, repeatRequirements, submissionAttempts, submissions,
  trackTeachers, tracks, users, weeklyEvaluations,
} from "@/db/schema";
import type { SessionUser } from "@/server/auth";
import { managedCoursesWhere, studentVisibleCourse } from "@/server/policy";
import type { Program, Week } from "./program";

type Actor = Pick<SessionUser, "id" | "role">;

const and_ = (...c: (SQL | undefined)[]) => and(...c.filter((x): x is SQL => Boolean(x)));

/* ── courses ─────────────────────────────────────────────────────────── */

export async function managedCourses(actor: Actor, programId: string) {
  return db.select({
    course: courses, track: tracks, week: programWeeks,
    teacher: { id: users.id, firstName: users.firstName, lastName: users.lastName },
    assignmentCount: sql<number>`(select count(*)::int from ${assignments} a where a.course_id = ${courses.id} and a.status <> 'archived')`,
  }).from(courses)
    .innerJoin(tracks, eq(tracks.id, courses.trackId))
    .innerJoin(programWeeks, eq(programWeeks.id, courses.weekId))
    .innerJoin(users, eq(users.id, courses.teacherId))
    .where(and_(eq(courses.programId, programId), managedCoursesWhere(actor)))
    .orderBy(asc(programWeeks.weekNumber), asc(tracks.name));
}

/* ── grading ─────────────────────────────────────────────────────────── */

export type QueueFilter = "awaiting" | "graded" | "revision" | "all";

/** Latest attempts in the actor's courses, newest submissions first. */
export async function gradingQueue(actor: Actor, programId: string, filter: QueueFilter = "awaiting", limit = 100) {
  const statusCond: SQL | undefined =
    filter === "awaiting" ? eq(submissions.status, "submitted")
    : filter === "graded" ? eq(submissions.status, "graded")
    : filter === "revision" ? eq(submissions.status, "revision_requested")
    : inArray(submissions.status, ["submitted", "graded", "revision_requested"]);

  return db.select({
    attempt: submissionAttempts, submission: submissions, assignment: assignments, course: courses, week: programWeeks, grade: grades,
    student: { id: users.id, firstName: users.firstName, lastName: users.lastName },
  }).from(submissions)
    .innerJoin(submissionAttempts, and(eq(submissionAttempts.submissionId, submissions.id), eq(submissionAttempts.attemptNumber, submissions.currentAttempt)))
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .innerJoin(programWeeks, eq(programWeeks.id, courses.weekId))
    .innerJoin(users, eq(users.id, submissions.studentId))
    .leftJoin(grades, eq(grades.attemptId, submissionAttempts.id))
    .where(and_(eq(courses.programId, programId), managedCoursesWhere(actor), statusCond))
    .orderBy(filter === "awaiting" ? asc(submissionAttempts.submittedAt) : desc(submissionAttempts.updatedAt))
    .limit(limit);
}

/**
 * Every enrolled learner against one assignment: what they have handed in, or
 * that they haven't. This is how teachers find missing work.
 */
export async function assignmentRoster(assignment: typeof assignments.$inferSelect, programId: string) {
  const rows = await db.select({
    student: { id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email },
    enrolledAt: enrollments.enrolledAt,
    submission: submissions,
  }).from(enrollments)
    .innerJoin(users, and(eq(users.id, enrollments.studentId), eq(users.status, "active"), eq(users.role, "student")))
    .leftJoin(submissions, and(eq(submissions.studentId, users.id), eq(submissions.assignmentId, assignment.id)))
    .where(eq(enrollments.programId, programId))
    .orderBy(asc(users.lastName), asc(users.firstName));

  const subIds = rows.flatMap((r) => (r.submission ? [r.submission.id] : []));
  const attempts = subIds.length
    ? await db.select({ attempt: submissionAttempts, grade: grades }).from(submissionAttempts)
      .leftJoin(grades, eq(grades.attemptId, submissionAttempts.id))
      .where(inArray(submissionAttempts.submissionId, subIds)).orderBy(asc(submissionAttempts.attemptNumber))
    : [];

  const now = Date.now();
  return rows.map((r) => {
    const mine = r.submission ? attempts.filter((a) => a.attempt.submissionId === r.submission!.id) : [];
    const latest = mine.find((a) => a.attempt.attemptNumber === r.submission?.currentAttempt) ?? null;
    const handedIn = mine.some((a) => a.attempt.status !== "draft");
    const lastGraded = [...mine].reverse().find((a) => a.grade);
    let state: "missing" | "joined_later" | "not_started" | "in_progress" | "awaiting" | "passed" | "not_passed" | "revision";
    if (r.submission?.status === "submitted") state = "awaiting";
    else if (r.submission?.status === "revision_requested") state = "revision";
    else if (r.submission?.status === "graded") state = lastGraded?.grade?.outcome === "passed" ? "passed" : "not_passed";
    else if (!handedIn && assignment.dueAt.getTime() < now) state = assignment.dueAt < r.enrolledAt ? "joined_later" : "missing";
    else state = r.submission ? "in_progress" : "not_started";
    return { student: r.student, submission: r.submission, attempts: mine, latest, lastGrade: lastGraded?.grade ?? null, state };
  });
}

/* ── students ────────────────────────────────────────────────────────── */

export type StudentStats = {
  id: string; firstName: string; lastName: string; email: string; createdAt: Date;
  submitted: number; missing: number; awaiting: number; belowPass: number; revision: number; repeats: number;
  avgPct: number | null;
};

/**
 * Per-learner counts across a programme, computed in SQL so the student list
 * stays fast with hundreds of learners. Definitions match src/lib/progress.ts.
 */
export async function studentStats(programId: string, conn: DbOrTx = db): Promise<StudentStats[]> {
  const result = await conn.execute<StudentStats & { avg_pct: string | null }>(sql`
    with live_assignments as (
      select a.id, a.due_at from ${assignments} a
      join ${courses} c on c.id = a.course_id
      where c.program_id = ${programId} and a.status = 'published'
        and (c.status = 'published' or (c.status = 'scheduled' and c.publish_at <= now()))
    ),
    roster as (
      select u.id, u.first_name, u.last_name, u.email, u.created_at, e.enrolled_at from ${enrollments} e
      join ${users} u on u.id = e.student_id
      where e.program_id = ${programId} and u.role = 'student' and u.status = 'active'
    ),
    latest as (
      select s.student_id, s.assignment_id, s.status,
        exists (select 1 from ${submissionAttempts} x where x.submission_id = s.id and x.status <> 'draft') as handed_in,
        (select g.outcome from ${grades} g join ${submissionAttempts} x on x.id = g.attempt_id
          where x.submission_id = s.id order by x.attempt_number desc limit 1) as outcome,
        (select g.score::float / g.max_score from ${grades} g join ${submissionAttempts} x on x.id = g.attempt_id
          where x.submission_id = s.id order by x.attempt_number desc limit 1) as pct
      from ${submissions} s where s.assignment_id in (select id from live_assignments)
    )
    select r.id, r.first_name as "firstName", r.last_name as "lastName", r.email, r.created_at as "createdAt",
      (select count(*)::int from latest l where l.student_id = r.id and l.handed_in) as submitted,
      (select count(*)::int from live_assignments la where la.due_at < now() and la.due_at >= r.enrolled_at
        and not exists (select 1 from latest l where l.student_id = r.id and l.assignment_id = la.id and l.handed_in)) as missing,
      (select count(*)::int from latest l where l.student_id = r.id and l.status = 'submitted') as awaiting,
      (select count(*)::int from latest l where l.student_id = r.id and l.status = 'graded' and l.outcome = 'not_passed') as "belowPass",
      (select count(*)::int from latest l where l.student_id = r.id and l.status = 'revision_requested') as revision,
      (select count(*)::int from ${repeatRequirements} rr join ${courses} c on c.id = rr.course_id
        where rr.student_id = r.id and rr.status = 'active' and c.program_id = ${programId}) as repeats,
      (select round(avg(l.pct) * 100) from latest l where l.student_id = r.id and l.pct is not null) as avg_pct
    from roster r
    order by r.last_name, r.first_name
  `);
  return result.rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt), avgPct: r.avg_pct === null ? null : Number(r.avg_pct) }));
}

/* ── weekly responsibilities ─────────────────────────────────────────── */

export type CourseSlot = {
  track: typeof tracks.$inferSelect;
  week: Week;
  teachers: { id: string; firstName: string; lastName: string; email: string }[];
  courses: (typeof courses.$inferSelect)[];
  /** At least one course in this slot is live for learners. */
  fulfilled: boolean;
  /** A course is scheduled to publish later — the teacher has done their part. */
  scheduled: boolean;
};

/**
 * Every (track, week) slot where a course is expected, and whether it has been
 * published. A track expects one course per week between weekFrom and weekTo.
 */
export async function courseSlots(program: Program, weeks: Week[], opts: { weekIds?: string[]; teacherId?: string } = {}): Promise<CourseSlot[]> {
  const allTracks = await db.select().from(tracks).where(eq(tracks.programId, program.id)).orderBy(asc(tracks.name));
  const tt = await db.select({ trackId: trackTeachers.trackId, id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, status: users.status })
    .from(trackTeachers).innerJoin(users, eq(users.id, trackTeachers.teacherId))
    .where(inArray(trackTeachers.trackId, allTracks.length ? allTracks.map((t) => t.id) : ["00000000-0000-0000-0000-000000000000"]));
  const cs = await db.select().from(courses).where(and(eq(courses.programId, program.id), sql`${courses.status} <> 'archived'`));

  const wanted = opts.weekIds ? weeks.filter((w) => opts.weekIds!.includes(w.id)) : weeks;
  const slots: CourseSlot[] = [];
  for (const track of allTracks) {
    const teachers = tt.filter((t) => t.trackId === track.id && t.status === "active").map(({ id, firstName, lastName, email }) => ({ id, firstName, lastName, email }));
    if (opts.teacherId && !teachers.some((t) => t.id === opts.teacherId)) continue;
    for (const week of wanted) {
      if (week.weekNumber < track.weekFrom || week.weekNumber > track.weekTo) continue;
      const inSlot = cs.filter((c) => c.trackId === track.id && c.weekId === week.id);
      const now = new Date();
      slots.push({
        track, week, teachers, courses: inSlot,
        fulfilled: inSlot.some((c) => c.status === "published" || (c.status === "scheduled" && c.publishAt !== null && c.publishAt <= now)),
        scheduled: inSlot.some((c) => c.status === "scheduled" && c.publishAt !== null && c.publishAt > now),
      });
    }
  }
  return slots;
}

export type ChecklistItem = { key: string; label: string; done: boolean; detail: string; href?: string };

/** The teacher's to-do list for one week, derived from real records. */
export async function teachingChecklist(actor: Actor, program: Program, weeks: Week[], week: Week): Promise<ChecklistItem[]> {
  const slots = await courseSlots(program, weeks, { weekIds: [week.id], teacherId: actor.role === "super_admin" ? undefined : actor.id });
  const weekCourses = slots.flatMap((s) => s.courses);
  const ids = weekCourses.map((c) => c.id);

  const [assignCount] = ids.length
    ? await db.select({ n: sql<number>`count(*)::int` }).from(assignments).where(and(inArray(assignments.courseId, ids), eq(assignments.status, "published")))
    : [{ n: 0 }];
  const [awaiting] = ids.length
    ? await db.select({ n: sql<number>`count(*)::int` }).from(submissions).innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .where(and(inArray(assignments.courseId, ids), eq(submissions.status, "submitted")))
    : [{ n: 0 }];
  const [received] = ids.length
    ? await db.select({ n: sql<number>`count(distinct ${submissions.id})::int` }).from(submissions).innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .innerJoin(submissionAttempts, eq(submissionAttempts.submissionId, submissions.id))
      .where(and(inArray(assignments.courseId, ids), sql`${submissionAttempts.status} <> 'draft'`))
    : [{ n: 0 }];

  const weekAssignments = ids.length
    ? await db.select().from(assignments).where(and(inArray(assignments.courseId, ids), eq(assignments.status, "published"), sql`${assignments.dueAt} < now()`))
    : [];
  let missing = 0;
  for (const a of weekAssignments) {
    const roster = await assignmentRoster(a, program.id);
    missing += roster.filter((r) => r.state === "missing").length;
  }

  const [enrolled] = await db.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(eq(enrollments.programId, program.id));
  const [evaluated] = await db.select({ n: sql<number>`count(*)::int` }).from(weeklyEvaluations).where(eq(weeklyEvaluations.weekId, week.id));

  const totalSlots = slots.length;
  const prepared = slots.filter((s) => s.courses.length > 0).length;
  const published = slots.filter((s) => s.fulfilled).length;

  return [
    { key: "prepare", label: "Prepare course materials", done: totalSlots > 0 && prepared === totalSlots, detail: `${prepared} of ${totalSlots} courses drafted`, href: "/teach/courses" },
    { key: "publish", label: "Publish the weekly course", done: totalSlots > 0 && published === totalSlots, detail: `${published} of ${totalSlots} live for learners`, href: "/teach/courses" },
    { key: "assign", label: "Create assignments", done: (assignCount?.n ?? 0) > 0, detail: `${assignCount?.n ?? 0} published this week`, href: "/teach/assignments" },
    { key: "review", label: "Review incoming submissions", done: (received?.n ?? 0) > 0 && (awaiting?.n ?? 0) === 0, detail: `${received?.n ?? 0} received`, href: "/teach/grading" },
    { key: "grade", label: "Grade submitted work", done: (awaiting?.n ?? 0) === 0, detail: (awaiting?.n ?? 0) === 0 ? "Nothing waiting" : `${awaiting?.n} awaiting grading`, href: "/teach/grading" },
    { key: "follow", label: "Follow up on missed assignments", done: missing === 0, detail: missing === 0 ? "No missing work" : `${missing} missing submissions`, href: "/teach/students?filter=missing" },
    { key: "evaluate", label: "Complete weekly evaluations", done: (enrolled?.n ?? 0) > 0 && (evaluated?.n ?? 0) >= (enrolled?.n ?? 0), detail: `${evaluated?.n ?? 0} of ${enrolled?.n ?? 0} learners`, href: "/teach/students" },
  ];
}

/** Visible courses in a programme, used by the shared calendar. */
export async function liveCourseCount(programId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(courses).where(and(eq(courses.programId, programId), studentVisibleCourse));
  return r?.n ?? 0;
}

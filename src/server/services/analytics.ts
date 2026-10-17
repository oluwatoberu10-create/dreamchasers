import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Program, Week } from "./program";
import { courseSlots } from "./teaching";

/**
 * Platform metrics. Every figure is a query against real records; nothing is
 * cached or hard-coded. Definitions (also shown in the UI as tooltips):
 *
 *  - Assignments: assignment definitions (one per task, however many learners).
 *  - Submissions: learner/assignment pairs where something has been handed in.
 *  - Awaiting grading: submissions whose newest attempt is handed in, ungraded.
 *  - Graded: submissions whose newest attempt has a grade.
 *  - Overdue (missing): learner/assignment pairs past the deadline with nothing
 *    handed in, for published assignments in live courses.
 *  - Submission rate: handed-in pairs ÷ expected pairs, for assignments whose
 *    deadline has passed.
 *  - Pass rate: passing latest grades ÷ all latest grades.
 *  - Average score: mean of latest-grade percentages (ungraded work excluded).
 *  - Active learners: learners who opened a course or worked on an assignment
 *    in the last 14 days.
 *  - Course completion: courses a learner marked complete ÷ (live courses ×
 *    enrolled learners).
 *  - Teacher publication rate: course slots with a live course ÷ all slots in
 *    weeks that have started.
 */

const LIVE = sql`(c.status = 'published' or (c.status = 'scheduled' and c.publish_at <= now()))`;

export type PlatformMetrics = {
  users: number; students: number; teachers: number; admins: number; deactivated: number; activeLearners: number;
  courses: number; publishedCourses: number; draftCourses: number; scheduledCourses: number; archivedCourses: number;
  assignments: number; publishedAssignments: number;
  submissions: number; awaitingGrading: number; graded: number; overduePairs: number;
  expectedPairs: number; handedInPairs: number;
  passRate: number | null; averageScore: number | null; needingSupport: number;
  completionRate: number | null;
};

export async function platformMetrics(programId: string): Promise<PlatformMetrics> {
  const r = await db.execute<Record<string, string | number | null>>(sql`
    with live_a as (
      select a.id, a.due_at from assignments a join courses c on c.id = a.course_id
      where c.program_id = ${programId} and a.status = 'published' and ${LIVE}
    ),
    roster as (
      select e.student_id, e.enrolled_at from enrollments e join users u on u.id = e.student_id
      where e.program_id = ${programId} and u.role = 'student' and u.status = 'active'
    ),
    handed as (
      select distinct s.student_id, s.assignment_id from submissions s
      join submission_attempts x on x.submission_id = s.id and x.status <> 'draft'
    ),
    latest_grade as (
      select distinct on (s.id) s.id, s.student_id, g.outcome, g.score::float / g.max_score as pct
      from submissions s join submission_attempts x on x.submission_id = s.id join grades g on g.attempt_id = x.id
      where s.assignment_id in (select id from live_a)
      order by s.id, x.attempt_number desc
    )
    select
      (select count(*) from users) as users,
      (select count(*) from users where role = 'student' and status = 'active') as students,
      (select count(*) from users where role = 'teacher' and status = 'active') as teachers,
      (select count(*) from users where role = 'super_admin' and status = 'active') as admins,
      (select count(*) from users where status = 'deactivated') as deactivated,
      (select count(distinct sid) from (
        select cp.student_id as sid from course_progress cp where cp.last_viewed_at > now() - interval '14 days'
        union select s.student_id from submissions s where s.updated_at > now() - interval '14 days') t) as active_learners,
      (select count(*) from courses where program_id = ${programId}) as courses,
      (select count(*) from courses c where c.program_id = ${programId} and ${LIVE}) as published_courses,
      (select count(*) from courses where program_id = ${programId} and status = 'draft') as draft_courses,
      (select count(*) from courses where program_id = ${programId} and status = 'scheduled' and publish_at > now()) as scheduled_courses,
      (select count(*) from courses where program_id = ${programId} and status = 'archived') as archived_courses,
      (select count(*) from assignments a join courses c on c.id = a.course_id where c.program_id = ${programId} and a.status <> 'archived') as assignments,
      (select count(*) from live_a) as published_assignments,
      (select count(*) from handed h where h.assignment_id in (select id from live_a)) as submissions,
      (select count(*) from submissions s where s.status = 'submitted' and s.assignment_id in (select id from live_a)) as awaiting_grading,
      (select count(*) from submissions s where s.status in ('graded','revision_requested') and s.assignment_id in (select id from live_a)) as graded,
      (select count(*) from live_a la cross join roster r where la.due_at < now() and la.due_at >= r.enrolled_at
        and not exists (select 1 from handed h where h.student_id = r.student_id and h.assignment_id = la.id)) as overdue_pairs,
      (select count(*) from live_a la cross join roster r where la.due_at < now() and la.due_at >= r.enrolled_at) as expected_pairs,
      (select count(*) from live_a la cross join roster r where la.due_at < now() and la.due_at >= r.enrolled_at
        and exists (select 1 from handed h where h.student_id = r.student_id and h.assignment_id = la.id)) as handed_in_pairs,
      (select round(100.0 * count(*) filter (where outcome = 'passed') / nullif(count(*), 0)) from latest_grade) as pass_rate,
      (select round(100 * avg(pct)) from latest_grade) as average_score,
      (select count(distinct sid) from (
        select student_id as sid from latest_grade where outcome <> 'passed'
        union select rr.student_id from repeat_requirements rr join courses c on c.id = rr.course_id
          where rr.status = 'active' and c.program_id = ${programId}) t) as needing_support,
      (select round(100.0 * count(*) filter (where cp.completed_at is not null)
        / nullif((select count(*) from courses c where c.program_id = ${programId} and ${LIVE}) * (select count(*) from roster), 0))
        from course_progress cp join courses c on c.id = cp.course_id where c.program_id = ${programId}) as completion_rate
  `);
  const row = r.rows[0];
  const n = (k: string) => Number(row[k] ?? 0);
  const nn = (k: string) => (row[k] === null || row[k] === undefined ? null : Number(row[k]));
  return {
    users: n("users"), students: n("students"), teachers: n("teachers"), admins: n("admins"), deactivated: n("deactivated"),
    activeLearners: n("active_learners"), courses: n("courses"), publishedCourses: n("published_courses"),
    draftCourses: n("draft_courses"), scheduledCourses: n("scheduled_courses"), archivedCourses: n("archived_courses"),
    assignments: n("assignments"), publishedAssignments: n("published_assignments"), submissions: n("submissions"),
    awaitingGrading: n("awaiting_grading"), graded: n("graded"), overduePairs: n("overdue_pairs"),
    expectedPairs: n("expected_pairs"), handedInPairs: n("handed_in_pairs"),
    passRate: nn("pass_rate"), averageScore: nn("average_score"), needingSupport: n("needing_support"), completionRate: nn("completion_rate"),
  };
}

/** Registrations per ISO week, last `weeks` weeks (zero-filled). */
export async function registrationsByWeek(weeks = 12) {
  const r = await db.execute<{ wk: string; n: number }>(sql`
    select to_char(g.wk, 'YYYY-MM-DD') as wk, count(u.id)::int as n
    from generate_series(date_trunc('week', now()) - make_interval(weeks => ${weeks - 1}), date_trunc('week', now()), interval '1 week') g(wk)
    left join users u on date_trunc('week', u.created_at) = g.wk
    group by g.wk order by g.wk`);
  return r.rows;
}

/** Hand-ins per day, last 30 days (zero-filled). */
export async function submissionsByDay(days = 30) {
  const r = await db.execute<{ day: string; n: number; late: number }>(sql`
    select to_char(g.d, 'YYYY-MM-DD') as day, count(x.id)::int as n, count(x.id) filter (where x.is_late)::int as late
    from generate_series(date_trunc('day', now()) - make_interval(days => ${days - 1}), date_trunc('day', now()), interval '1 day') g(d)
    left join submission_attempts x on x.submitted_at >= g.d and x.submitted_at < g.d + interval '1 day'
    group by g.d order by g.d`);
  return r.rows;
}

/** Ungraded hand-ins by how long they have waited. */
export async function gradingBacklog(programId: string) {
  const r = await db.execute<{ bucket: string; n: number }>(sql`
    with waiting as (
      select now() - x.submitted_at as age from submissions s
      join submission_attempts x on x.submission_id = s.id and x.attempt_number = s.current_attempt
      join assignments a on a.id = s.assignment_id join courses c on c.id = a.course_id
      where s.status = 'submitted' and c.program_id = ${programId}
    )
    select b.bucket, (select count(*)::int from waiting w where
      case b.bucket when 'Under 1 day' then w.age < interval '1 day'
                    when '1–3 days' then w.age >= interval '1 day' and w.age < interval '3 days'
                    when '3–7 days' then w.age >= interval '3 days' and w.age < interval '7 days'
                    else w.age >= interval '7 days' end) as n
    from (values (1, 'Under 1 day'), (2, '1–3 days'), (3, '3–7 days'), (4, 'Over 7 days')) b(o, bucket) order by b.o`);
  return r.rows;
}

/** Average latest-grade percentage and pass rate per programme week. */
export async function performanceByWeek(programId: string, teacherId?: string) {
  const r = await db.execute<{ week: number; avg: number | null; pass_rate: number | null; graded: number }>(sql`
    with lg as (
      select distinct on (s.id) w.week_number, g.outcome, g.score::float / g.max_score as pct
      from submissions s join submission_attempts x on x.submission_id = s.id join grades g on g.attempt_id = x.id
      join assignments a on a.id = s.assignment_id join courses c on c.id = a.course_id join program_weeks w on w.id = c.week_id
      where c.program_id = ${programId} ${teacherId ? sql`and c.teacher_id = ${teacherId}` : sql``}
      order by s.id, x.attempt_number desc
    )
    select w.week_number as week, round(100 * avg(lg.pct))::int as avg,
      round(100.0 * count(*) filter (where lg.outcome = 'passed') / nullif(count(lg.pct), 0))::int as pass_rate,
      count(lg.pct)::int as graded
    from program_weeks w left join lg on lg.week_number = w.week_number
    where w.program_id = ${programId} group by w.week_number order by w.week_number`);
  return r.rows;
}

/** Expected vs published course slots per week, from the same rules reminders use. */
export async function publicationByWeek(program: Program, weeks: Week[], teacherId?: string) {
  const slots = await courseSlots(program, weeks, { teacherId });
  return weeks.map((w) => {
    const s = slots.filter((x) => x.week.id === w.id);
    return { week: w.weekNumber, expected: s.length, published: s.filter((x) => x.fulfilled).length, startsOn: w.startsOn };
  });
}

/** Per-teacher output over the programme. */
export async function teacherActivity(programId: string) {
  const r = await db.execute<{ id: string; name: string; tracks: number; published: number; drafts: number; graded: number; graded_30d: number; awaiting: number }>(sql`
    select u.id, u.first_name || ' ' || u.last_name as name,
      (select count(*)::int from track_teachers tt join tracks t on t.id = tt.track_id where tt.teacher_id = u.id and t.program_id = ${programId}) as tracks,
      (select count(*)::int from courses c where c.teacher_id = u.id and c.program_id = ${programId} and ${LIVE}) as published,
      (select count(*)::int from courses c where c.teacher_id = u.id and c.program_id = ${programId} and c.status = 'draft') as drafts,
      (select count(*)::int from grades g where g.graded_by_id = u.id) as graded,
      (select count(*)::int from grades g where g.graded_by_id = u.id and g.graded_at > now() - interval '30 days') as graded_30d,
      (select count(*)::int from submissions s join assignments a on a.id = s.assignment_id join courses c on c.id = a.course_id
        where s.status = 'submitted' and c.program_id = ${programId}
          and (c.teacher_id = u.id or c.track_id in (select track_id from track_teachers where teacher_id = u.id))) as awaiting
    from users u where u.role in ('teacher', 'super_admin') and u.status = 'active'
    order by name`);
  return r.rows;
}

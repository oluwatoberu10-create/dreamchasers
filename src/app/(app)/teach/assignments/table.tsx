import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { assignments, courses, enrollments, programWeeks, submissions, submissionAttempts, tracks, users } from "@/db/schema";
import { Badge, TrackDot } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
import { managedCoursesWhere } from "@/server/policy";

/** Shared by the teacher list and the admin list (admin passes scope=all). */
export async function assignmentTable(viewer: { id: string; role: "student" | "teacher" | "super_admin" }, programId: string, filter: string) {
  const enrolled = sql<number>`(select count(*)::int from ${enrollments} e join ${users} u on u.id = e.student_id where e.program_id = ${programId} and u.role = 'student' and u.status = 'active')`;
  const handed = sql<number>`(select count(distinct s.id)::int from ${submissions} s join ${submissionAttempts} x on x.submission_id = s.id and x.status <> 'draft' where s.assignment_id = ${assignments.id})`;
  const awaiting = sql<number>`(select count(*)::int from ${submissions} s where s.assignment_id = ${assignments.id} and s.status = 'submitted')`;
  const graded = sql<number>`(select count(*)::int from ${submissions} s where s.assignment_id = ${assignments.id} and s.status in ('graded','revision_requested'))`;
  const rows = await db.select({ a: assignments, course: courses, week: programWeeks, track: tracks, enrolled, handed, awaiting, graded })
    .from(assignments).innerJoin(courses, eq(courses.id, assignments.courseId)).innerJoin(programWeeks, eq(programWeeks.id, courses.weekId)).innerJoin(tracks, eq(tracks.id, courses.trackId))
    .where(and(eq(courses.programId, programId), managedCoursesWhere(viewer)))
    .orderBy(asc(assignments.dueAt));
  const now = Date.now();
  return rows.filter((r) =>
    filter === "draft" ? r.a.status === "draft"
    : filter === "archived" ? r.a.status === "archived"
    : filter === "grading" ? r.awaiting > 0
    : filter === "missing" ? r.a.status === "published" && r.a.dueAt.getTime() < now && r.handed < r.enrolled
    : filter === "upcoming" ? r.a.status === "published" && r.a.dueAt.getTime() >= now
    : r.a.status !== "archived");
}

export function AssignmentTable({ rows, tz, base }: { rows: Awaited<ReturnType<typeof assignmentTable>>; tz: string; base: string }) {
  const now = Date.now();
  return (
    <div className="table-wrap">
      <table className="table-dt min-w-[860px]">
        <thead><tr><th>Assignment</th><th>Course</th><th>Due</th><th className="text-right">Pass / max</th><th className="text-right">Handed in</th><th className="text-right">Missing</th><th className="text-right">To grade</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const missing = r.a.status === "published" && r.a.dueAt.getTime() < now ? Math.max(0, r.enrolled - r.handed) : 0;
            return (
              <tr key={r.a.id}>
                <td><Link href={`${base}/${r.a.id}`} className="font-semibold hover:text-[var(--brand)]">{r.a.title}</Link>{r.a.kind === "assessment" && <Badge tone="warning" className="ml-2">Assessment</Badge>}</td>
                <td><span className="inline-flex items-center gap-1.5 whitespace-nowrap"><TrackDot color={r.track.color} />W{r.week.weekNumber} · {r.course.title}</span></td>
                <td className="whitespace-nowrap text-[13px]">{formatDateTime(r.a.dueAt, tz)}</td>
                <td className="tnum text-right">{r.a.passMark}/{r.a.maxScore}</td>
                <td className="tnum text-right">{r.handed}/{r.enrolled}</td>
                <td className={cn("tnum text-right", missing > 0 && "font-bold text-[var(--danger)]")}>{missing || "—"}</td>
                <td className="tnum text-right">{r.awaiting ? <Badge tone="brand">{r.awaiting}</Badge> : "—"}</td>
                <td><Badge tone={r.a.status === "published" ? "success" : "neutral"}>{r.a.status === "published" ? "Published" : r.a.status === "draft" ? "Draft" : "Archived"}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

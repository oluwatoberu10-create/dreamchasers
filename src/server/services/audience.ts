import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { enrollments, trackTeachers, users } from "@/db/schema";

/** Active learners enrolled in a programme — the audience for its course notifications. */
export async function enrolledStudentIds(programId: string, conn: DbOrTx = db): Promise<string[]> {
  const rows = await conn.select({ id: users.id }).from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(and(eq(enrollments.programId, programId), eq(users.status, "active"), eq(users.role, "student")));
  return rows.map((r) => r.id);
}

/** Staff responsible for a course: its presenter plus every teacher on its track. */
export async function courseStaffIds(course: { teacherId: string; trackId: string }, conn: DbOrTx = db): Promise<string[]> {
  const rows = await conn.select({ id: users.id }).from(trackTeachers)
    .innerJoin(users, eq(users.id, trackTeachers.teacherId))
    .where(and(eq(trackTeachers.trackId, course.trackId), eq(users.status, "active")));
  const [presenter] = await conn.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, course.teacherId));
  const ids = new Set(rows.map((r) => r.id));
  if (presenter?.status === "active") ids.add(presenter.id);
  return [...ids];
}

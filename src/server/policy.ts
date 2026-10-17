import "server-only";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import {
  assignments, courses, enrollments, journalEntries, programWeeks, programs, repeatRequirements,
  submissions, trackTeachers, tracks, users,
} from "@/db/schema";
import { forbidden, notFound } from "@/lib/errors";
import { localDate } from "@/lib/dates";
import type { SessionUser } from "./auth";
import { getSettings } from "./services/settings";

/**
 * Authorization — every access decision in the app is made here.
 *
 * Pages and server actions call these functions with the user resolved from
 * the session. Nothing takes a role, a teacher id or a student id from the
 * request as proof of anything: those come from the database.
 */

type Course = typeof courses.$inferSelect;
type Actor = Pick<SessionUser, "id" | "role">;

/* ── course visibility ───────────────────────────────────────────────── */

/**
 * The one definition of "a learner can see this course": published, or
 * scheduled with its publication time already reached. Drafts and archived
 * courses are never visible to learners. (Scheduled courses are flipped to
 * "published" by the job runner; this clause means a late job never delays
 * access.)
 */
export const studentVisibleCourse: SQL = sql`(${courses.status} = 'published' or (${courses.status} = 'scheduled' and ${courses.publishAt} <= now()))`;

export function isCourseLive(c: Pick<Course, "status" | "publishAt">, now = new Date()): boolean {
  return c.status === "published" || (c.status === "scheduled" && c.publishAt !== null && c.publishAt <= now);
}

export async function isEnrolled(studentId: string, programId: string, conn: DbOrTx = db): Promise<boolean> {
  const [row] = await conn.select({ s: enrollments.studentId }).from(enrollments)
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.programId, programId))).limit(1);
  return Boolean(row);
}

/** Whether a learner may open a course's materials and assignments. */
export async function studentCanViewCourse(student: Actor, course: Course, conn: DbOrTx = db): Promise<boolean> {
  if (student.role !== "student") return false;
  if (!isCourseLive(course)) return false;
  if (!(await isEnrolled(student.id, course.programId, conn))) return false;

  const settings = await getSettings(conn);
  if (settings.allowRevisitPastCourses) return true;

  // Revisiting disabled: only the running week's courses — or any course the
  // learner has been asked to repeat.
  const [row] = await conn.select({ week: programWeeks, timezone: programs.timezone }).from(programWeeks)
    .innerJoin(programs, eq(programs.id, programWeeks.programId))
    .where(eq(programWeeks.id, course.weekId)).limit(1);
  if (row && row.week.endsOn >= localDate(new Date(), row.timezone)) return true;
  const [repeat] = await conn.select({ id: repeatRequirements.id }).from(repeatRequirements)
    .where(and(eq(repeatRequirements.courseId, course.id), eq(repeatRequirements.studentId, student.id), eq(repeatRequirements.status, "active")))
    .limit(1);
  return Boolean(repeat);
}

/* ── teaching scope ──────────────────────────────────────────────────── */

/** Teachers manage a course if they present it or are assigned to its track. Admins manage all. */
export async function canManageCourse(actor: Actor, course: Pick<Course, "teacherId" | "trackId">, conn: DbOrTx = db): Promise<boolean> {
  if (actor.role === "super_admin") return true;
  if (actor.role !== "teacher") return false;
  if (course.teacherId === actor.id) return true;
  return canManageTrack(actor, course.trackId, conn);
}

export async function canManageTrack(actor: Actor, trackId: string, conn: DbOrTx = db): Promise<boolean> {
  if (actor.role === "super_admin") return true;
  if (actor.role !== "teacher") return false;
  const [row] = await conn.select({ t: trackTeachers.trackId }).from(trackTeachers)
    .where(and(eq(trackTeachers.trackId, trackId), eq(trackTeachers.teacherId, actor.id))).limit(1);
  return Boolean(row);
}

/** Loads a course and asserts the actor may manage it (edit, grade, follow up). */
export async function loadManagedCourse(actor: Actor, courseId: string, conn: DbOrTx = db): Promise<Course> {
  const [course] = await conn.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) throw notFound("That course does not exist.");
  if (!(await canManageCourse(actor, course, conn))) throw forbidden("You are not assigned to this course.");
  return course;
}

export async function loadManagedAssignment(actor: Actor, assignmentId: string, conn: DbOrTx = db) {
  const [row] = await conn.select({ assignment: assignments, course: courses }).from(assignments)
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .where(eq(assignments.id, assignmentId)).limit(1);
  if (!row) throw notFound("That assignment does not exist.");
  if (!(await canManageCourse(actor, row.course, conn))) throw forbidden("You are not assigned to this course.");
  return row;
}

/** SQL condition restricting `courses` to those the actor manages. */
export function managedCoursesWhere(actor: Actor): SQL | undefined {
  if (actor.role === "super_admin") return undefined;
  return or(
    eq(courses.teacherId, actor.id),
    inArray(courses.trackId, db.select({ id: trackTeachers.trackId }).from(trackTeachers).where(eq(trackTeachers.teacherId, actor.id))),
  );
}

/** Program ids in which a teacher has any track. */
export async function teacherProgramIds(actor: Actor, conn: DbOrTx = db): Promise<string[]> {
  const rows = await conn.selectDistinct({ id: tracks.programId }).from(trackTeachers)
    .innerJoin(tracks, eq(tracks.id, trackTeachers.trackId))
    .where(eq(trackTeachers.teacherId, actor.id));
  const presented = await conn.selectDistinct({ id: courses.programId }).from(courses).where(eq(courses.teacherId, actor.id));
  return [...new Set([...rows, ...presented].map((r) => r.id))];
}

/**
 * Whether a teacher may see a learner's record: the learner must be enrolled
 * in a programme the teacher teaches in. Admins see everyone.
 */
export async function canViewStudent(actor: Actor, studentId: string, conn: DbOrTx = db): Promise<boolean> {
  if (actor.role === "super_admin") return true;
  if (actor.role === "student") return actor.id === studentId;
  const programIds = await teacherProgramIds(actor, conn);
  if (programIds.length === 0) return false;
  const [row] = await conn.select({ s: enrollments.studentId }).from(enrollments)
    .where(and(eq(enrollments.studentId, studentId), inArray(enrollments.programId, programIds))).limit(1);
  return Boolean(row);
}

/* ── submissions ─────────────────────────────────────────────────────── */

export async function loadViewableSubmission(actor: Actor, submissionId: string, conn: DbOrTx = db) {
  const [row] = await conn.select({ submission: submissions, assignment: assignments, course: courses })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .where(eq(submissions.id, submissionId)).limit(1);
  if (!row) throw notFound("That submission does not exist.");
  const own = actor.role === "student" && row.submission.studentId === actor.id;
  if (!own && !(await canManageCourse(actor, row.course, conn))) throw forbidden("You cannot view this submission.");
  return row;
}

/* ── journals ────────────────────────────────────────────────────────── */

export type JournalAccess = "owner" | "teacher_review" | "admin_metadata" | "none";

/**
 * Journals are personal. The learner sees everything they wrote. Teachers may
 * read SUBMITTED entries of learners they teach, only while the platform
 * setting allows it. Super admins see that an entry exists and its status, but
 * opening the text is a separate, audit-logged action (see journal actions).
 */
export async function journalAccess(actor: Actor, entry: typeof journalEntries.$inferSelect, conn: DbOrTx = db): Promise<JournalAccess> {
  if (actor.id === entry.studentId) return "owner";
  if (actor.role === "super_admin") return "admin_metadata";
  if (actor.role !== "teacher" || entry.status !== "submitted") return "none";
  const settings = await getSettings(conn);
  if (!settings.teacherJournalAccess) return "none";
  return (await canViewStudent(actor, entry.studentId, conn)) ? "teacher_review" : "none";
}

/* ── messaging ───────────────────────────────────────────────────────── */

/**
 * Learners message staff (teachers and admins), not each other — this keeps
 * contact details and conversations within the learning relationship.
 * Teachers may message learners they teach and other staff; admins anyone.
 */
export async function canMessage(sender: Actor, recipientId: string, conn: DbOrTx = db): Promise<boolean> {
  if (sender.id === recipientId) return false;
  const [recipient] = await conn.select({ id: users.id, role: users.role, status: users.status }).from(users)
    .where(eq(users.id, recipientId)).limit(1);
  if (!recipient || recipient.status !== "active") return false;
  if (sender.role === "super_admin") return true;
  if (sender.role === "student") return recipient.role !== "student";
  // teacher
  if (recipient.role !== "student") return true;
  return canViewStudent(sender, recipientId, conn);
}

import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { db, transaction, type DbOrTx } from "@/db";
import {
  assignments, courseProgress, courseResources, courses, files, programWeeks, programs, submissions, trackTeachers, tracks, users,
} from "@/db/schema";
import { conflict, forbidden, notFound, validationError } from "@/lib/errors";
import { zonedTimeToUtc } from "@/lib/dates";
import type { SessionUser } from "@/server/auth";
import { canManageTrack, isCourseLive, loadManagedCourse, studentCanViewCourse } from "@/server/policy";
import { audit } from "./audit";
import { enrolledStudentIds } from "./audience";
import { notify } from "./notifications";
import { deleteStoredObject, storeUpload } from "./storage";

type Actor = Pick<SessionUser, "id" | "role">;
export type Course = typeof courses.$inferSelect;

export type CourseInput = {
  title: string;
  summary?: string;
  content: string;
  objectives: string[];
  evaluationCriteria?: string;
  /** Optional: without one, the course gets its own track (see ownTrackFor). */
  trackId?: string;
  weekId: string;
  teacherId?: string;
};

/** The teacher who presents the course: the actor, or for admins any active teacher they pick. */
async function resolveTeacher(actor: Actor, teacherId: string | undefined, conn: DbOrTx): Promise<string> {
  if (actor.role !== "super_admin" || !teacherId) return actor.id;
  const [t] = await conn.select().from(users).where(eq(users.id, teacherId)).limit(1);
  if (!t || t.status !== "active" || (t.role !== "teacher" && t.role !== "super_admin")) {
    throw validationError("The presenting teacher must be an active teacher.");
  }
  return t.id;
}

/**
 * A track of its own for a course created without one, named after the course,
 * covering just its week, with the presenting teacher assigned (so they can
 * manage it and get the upload reminder). Name clashes get a numeric suffix.
 */
async function ownTrackFor(conn: DbOrTx, programId: string, title: string, weekNumber: number, teacherId: string) {
  const base = title.slice(0, 72);
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base} (${n})`;
    const [track] = await conn.insert(tracks).values({ programId, name, weekFrom: weekNumber, weekTo: weekNumber })
      .onConflictDoNothing().returning();
    if (track) {
      await conn.insert(trackTeachers).values({ trackId: track.id, teacherId }).onConflictDoNothing();
      return track;
    }
  }
}

/** Checks the track, week and presenting teacher fit together and that the actor may use them. */
async function resolvePlacement(actor: Actor, input: CourseInput, conn: DbOrTx) {
  const [week] = await conn.select().from(programWeeks).where(eq(programWeeks.id, input.weekId)).limit(1);
  if (!week) throw validationError("Choose a programme week.");
  const teacherId = await resolveTeacher(actor, input.teacherId, conn);

  if (!input.trackId) {
    const track = await ownTrackFor(conn, week.programId, input.title, week.weekNumber, teacherId);
    return { track, week, teacherId };
  }
  const [track] = await conn.select().from(tracks).where(eq(tracks.id, input.trackId)).limit(1);
  if (!track) throw validationError("Choose a track.");
  if (!(await canManageTrack(actor, track.id, conn))) throw forbidden("You are not assigned to that track.");
  if (week.programId !== track.programId) throw validationError("That week is not part of this track's programme.");
  return { track, week, teacherId };
}

export async function createCourse(actor: Actor, input: CourseInput): Promise<Course> {
  return transaction(async (tx) => {
    const { track, week, teacherId } = await resolvePlacement(actor, input, tx);
    const [course] = await tx.insert(courses).values({
      programId: track.programId, trackId: track.id, weekId: week.id, teacherId, createdById: actor.id,
      title: input.title, summary: input.summary ?? null, content: input.content,
      objectives: input.objectives, evaluationCriteria: input.evaluationCriteria ?? null, status: "draft",
    }).returning();
    await audit({ actorId: actor.id, action: "course.created", entityType: "course", entityId: course.id, summary: `Created draft course "${course.title}" (week ${week.weekNumber}, ${track.name})` }, tx);
    if (teacherId !== actor.id) {
      await notify(tx, [{
        recipientId: teacherId, type: "system",
        title: `New course assigned to you: ${course.title}`,
        body: `Week ${week.weekNumber}. Add the lesson, videos, files and assignments, then publish it.`,
        link: `/teach/courses/${course.id}`, resourceType: "course", resourceId: course.id,
        dedupeKey: `course_assigned:${course.id}:${teacherId}`,
      }]);
    }
    return course;
  });
}

export async function updateCourse(actor: Actor, courseId: string, input: CourseInput): Promise<Course> {
  return transaction(async (tx) => {
    const existing = await loadManagedCourse(actor, courseId, tx);
    const { track, week, teacherId } = await resolvePlacement(actor, {
      ...input, trackId: input.trackId ?? existing.trackId, teacherId: input.teacherId ?? existing.teacherId,
    }, tx);
    const [course] = await tx.update(courses).set({
      trackId: track.id, weekId: week.id, programId: track.programId,
      teacherId: actor.role === "super_admin" ? teacherId : existing.teacherId,
      title: input.title, summary: input.summary ?? null, content: input.content,
      objectives: input.objectives, evaluationCriteria: input.evaluationCriteria ?? null, updatedAt: new Date(),
    }).where(eq(courses.id, courseId)).returning();

    // A course's own track (see ownTrackFor) follows the course's week and presenter.
    const [{ n }] = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${courses} where track_id = ${track.id}`)).rows;
    if (n === 1 && track.weekFrom === track.weekTo) {
      if (track.weekFrom !== week.weekNumber) {
        await tx.update(tracks).set({ weekFrom: week.weekNumber, weekTo: week.weekNumber }).where(eq(tracks.id, track.id));
      }
      if (course.teacherId !== existing.teacherId) {
        await tx.delete(trackTeachers).where(and(eq(trackTeachers.trackId, track.id), eq(trackTeachers.teacherId, existing.teacherId)));
        await tx.insert(trackTeachers).values({ trackId: track.id, teacherId: course.teacherId }).onConflictDoNothing();
      }
    }
    if (course.teacherId !== existing.teacherId && course.teacherId !== actor.id) {
      await notify(tx, [{
        recipientId: course.teacherId, type: "system",
        title: `New course assigned to you: ${course.title}`,
        body: `Week ${week.weekNumber}. Add the lesson, videos, files and assignments, then publish it.`,
        link: `/teach/courses/${course.id}`, resourceType: "course", resourceId: course.id,
        dedupeKey: `course_assigned:${course.id}:${course.teacherId}`,
      }]);
    }
    return course;
  });
}

async function weekNumberOf(weekId: string, conn: DbOrTx): Promise<number> {
  const [w] = await conn.select({ n: programWeeks.weekNumber }).from(programWeeks).where(eq(programWeeks.id, weekId));
  return w?.n ?? 0;
}

/** Notifies enrolled learners that a course is live. Idempotent per course. */
async function announceCourse(course: Course, conn: DbOrTx): Promise<number> {
  const weekNumber = await weekNumberOf(course.weekId, conn);
  const students = await enrolledStudentIds(course.programId, conn);
  return notify(conn, students.map((id) => ({
    recipientId: id,
    type: "course_published",
    title: `New course: ${course.title}`,
    body: `Week ${weekNumber} is ready for you.`,
    link: `/learn/courses/${course.id}`,
    resourceType: "course",
    resourceId: course.id,
    dedupeKey: `course_published:${course.id}`,
  })));
}

export type PublishMode = { mode: "now" } | { mode: "draft" } | { mode: "schedule"; publishAtLocal: string };

/**
 * Moves a course between draft, scheduled and published. Publishing notifies
 * learners in the same transaction; scheduling tells them what is coming.
 */
export async function setPublication(actor: Actor, courseId: string, mode: PublishMode): Promise<Course> {
  return transaction(async (tx) => {
    const course = await loadManagedCourse(actor, courseId, tx);
    if (course.status === "archived") throw conflict("Restore this course before publishing it.");
    const [program] = await tx.select().from(programs).where(eq(programs.id, course.programId));

    if (mode.mode === "draft") {
      if (course.status === "published") throw conflict("A published course cannot go back to draft. Archive it instead.");
      const [c] = await tx.update(courses).set({ status: "draft", publishAt: null, updatedAt: new Date() }).where(eq(courses.id, courseId)).returning();
      return c;
    }

    if (mode.mode === "schedule") {
      const [d, t] = mode.publishAtLocal.split("T");
      const [hh, mm] = t.split(":").map(Number);
      const publishAt = zonedTimeToUtc(d, hh, mm, program.timezone);
      if (publishAt.getTime() <= Date.now()) throw validationError("Choose a publication time in the future, or publish now.");
      if (course.status === "published") throw conflict("This course is already published.");
      const [c] = await tx.update(courses).set({ status: "scheduled", publishAt, updatedAt: new Date() }).where(eq(courses.id, courseId)).returning();
      const weekNumber = await weekNumberOf(c.weekId, tx);
      const students = await enrolledStudentIds(c.programId, tx);
      await notify(tx, students.map((id) => ({
        recipientId: id, type: "course_scheduled",
        title: `Coming up: ${c.title}`,
        body: `Week ${weekNumber} course opens ${new Intl.DateTimeFormat("en-GB", { timeZone: program.timezone, weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(publishAt)}.`,
        link: `/learn/planner`, resourceType: "course", resourceId: c.id,
        dedupeKey: `course_scheduled:${c.id}:${publishAt.toISOString()}`,
      })));
      await audit({ actorId: actor.id, action: "course.scheduled", entityType: "course", entityId: c.id, summary: `Scheduled "${c.title}" for ${publishAt.toISOString()}` }, tx);
      return c;
    }

    if (course.status === "published") return course;
    const now = new Date();
    const [c] = await tx.update(courses).set({ status: "published", publishedAt: now, publishAt: course.publishAt ?? now, updatedAt: now })
      .where(eq(courses.id, courseId)).returning();
    await announceCourse(c, tx);
    await audit({ actorId: actor.id, action: "course.published", entityType: "course", entityId: c.id, summary: `Published "${c.title}"` }, tx);
    return c;
  });
}

/** Job: flips due scheduled courses to published and notifies learners. */
export async function publishDueCourses(now = new Date()): Promise<number> {
  const due = await db.select({ id: courses.id }).from(courses)
    .where(and(eq(courses.status, "scheduled"), lte(courses.publishAt, now)));
  let published = 0;
  for (const { id } of due) {
    await transaction(async (tx) => {
      // Re-check under lock: another runner may have got here first.
      const [locked] = await tx.select().from(courses).where(eq(courses.id, id)).for("update");
      if (!locked || locked.status !== "scheduled") return;
      const [c] = await tx.update(courses).set({ status: "published", publishedAt: locked.publishAt ?? now, updatedAt: now })
        .where(eq(courses.id, id)).returning();
      await announceCourse(c, tx);
      await audit({ actorId: null, action: "course.published", entityType: "course", entityId: c.id, summary: `Published "${c.title}" on schedule` }, tx);
      published++;
    });
  }
  return published;
}

export async function archiveCourse(actor: Actor, courseId: string, restore = false): Promise<void> {
  await transaction(async (tx) => {
    const course = await loadManagedCourse(actor, courseId, tx);
    if (restore) {
      if (course.status !== "archived") return;
      await tx.update(courses).set({ status: course.publishedAt ? "published" : "draft", archivedAt: null, updatedAt: new Date() }).where(eq(courses.id, courseId));
      await audit({ actorId: actor.id, action: "course.restored", entityType: "course", entityId: courseId, summary: `Restored "${course.title}"` }, tx);
      return;
    }
    await tx.update(courses).set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() }).where(eq(courses.id, courseId));
    await audit({ actorId: actor.id, action: "course.archived", entityType: "course", entityId: courseId, summary: `Archived "${course.title}"` }, tx);
  });
}

/**
 * Permanent removal — admins only, and only for courses that hold no learner
 * work. Anything with submissions must be archived so records survive.
 */
export async function deleteCourse(actor: Actor, courseId: string): Promise<void> {
  if (actor.role !== "super_admin") throw forbidden("Only super admins can delete courses.");
  await transaction(async (tx) => {
    const [course] = await tx.select().from(courses).where(eq(courses.id, courseId));
    if (!course) throw notFound();
    const [work] = await tx.select({ n: sql<number>`count(*)::int` }).from(submissions)
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .where(eq(assignments.courseId, courseId));
    if ((work?.n ?? 0) > 0) throw conflict("Learners have submitted work for this course. Archive it instead so their records are kept.");
    await tx.delete(courses).where(eq(courses.id, courseId));
    await audit({ actorId: actor.id, action: "course.deleted", entityType: "course", entityId: courseId, summary: `Deleted course "${course.title}"` }, tx);
  });
}

/* ── resources ───────────────────────────────────────────────────────── */

async function announceResource(course: Course, title: string, resourceId: string, conn: DbOrTx) {
  if (!isCourseLive(course)) return; // learners will hear about it when the course publishes
  const students = await enrolledStudentIds(course.programId, conn);
  await notify(conn, students.map((id) => ({
    recipientId: id, type: "resource_added", title: `New material in ${course.title}`, body: title,
    link: `/learn/courses/${course.id}`, resourceType: "course", resourceId: course.id,
    dedupeKey: `resource_added:${resourceId}`,
  })));
}

async function nextPosition(courseId: string, conn: DbOrTx): Promise<number> {
  const [row] = await conn.select({ n: sql<number>`coalesce(max(${courseResources.position}), -1)::int` }).from(courseResources).where(eq(courseResources.courseId, courseId));
  return (row?.n ?? -1) + 1;
}

export async function addLinkResource(actor: Actor, input: { courseId: string; kind: "link" | "video"; title: string; url: string }) {
  return transaction(async (tx) => {
    const course = await loadManagedCourse(actor, input.courseId, tx);
    const [r] = await tx.insert(courseResources).values({
      courseId: course.id, kind: input.kind, title: input.title, url: input.url, position: await nextPosition(course.id, tx),
    }).returning();
    await announceResource(course, input.title, r.id, tx);
    return r;
  });
}

export async function addFileResources(actor: Actor, courseId: string, uploads: File[], opts: { downloadable: boolean; title?: string }) {
  if (uploads.length === 0) throw validationError("Choose at least one file.");
  if (uploads.length > 10) throw validationError("Upload up to 10 files at a time.");
  return transaction(async (tx) => {
    const course = await loadManagedCourse(actor, courseId, tx);
    let pos = await nextPosition(course.id, tx);
    const created = [];
    for (const f of uploads) {
      const stored = await storeUpload(f, actor.id, "course_resource", tx);
      const kind = stored.mimeType.startsWith("video/") ? "video" : "file";
      const [r] = await tx.insert(courseResources).values({
        courseId: course.id, kind, title: (uploads.length === 1 && opts.title) || stored.originalName,
        fileId: stored.id, downloadable: opts.downloadable, position: pos++,
      }).returning();
      created.push(r);
    }
    await announceResource(course, created.length === 1 ? created[0].title : `${created.length} new files`, created[0].id, tx);
    return created;
  });
}

export async function removeResource(actor: Actor, resourceId: string): Promise<void> {
  const file = await transaction(async (tx) => {
    const [r] = await tx.select().from(courseResources).where(eq(courseResources.id, resourceId));
    if (!r) throw notFound();
    await loadManagedCourse(actor, r.courseId, tx);
    await tx.delete(courseResources).where(eq(courseResources.id, resourceId));
    if (!r.fileId) return null;
    const [f] = await tx.delete(files).where(eq(files.id, r.fileId)).returning();
    return f ?? null;
  });
  if (file) await deleteStoredObject(file).catch((e) => console.error("[storage] remove failed", e));
}

/* ── learner activity ────────────────────────────────────────────────── */

export async function recordCourseView(student: Actor, course: Course): Promise<void> {
  await db.insert(courseProgress).values({ courseId: course.id, studentId: student.id })
    .onConflictDoUpdate({ target: [courseProgress.courseId, courseProgress.studentId], set: { lastViewedAt: new Date() } });
}

export async function setCourseComplete(student: Actor, courseId: string, complete: boolean): Promise<void> {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
  if (!course || !(await studentCanViewCourse(student, course))) throw notFound("That course is not available.");
  await db.insert(courseProgress).values({ courseId, studentId: student.id, completedAt: complete ? new Date() : null })
    .onConflictDoUpdate({ target: [courseProgress.courseId, courseProgress.studentId], set: { completedAt: complete ? new Date() : null, lastViewedAt: new Date() } });
}

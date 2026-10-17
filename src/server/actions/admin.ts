"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, transaction } from "@/db";
import { courses, journalEntries, programWeeks, programs, tracks, users } from "@/db/schema";
import { AppError, conflict, notFound } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { programEndDate, weekdayOf, WEEKDAYS } from "@/lib/dates";
import { adminUserSchema, checkbox, intField, programSchema, reqText, trackSchema, uuidField, optText } from "@/lib/validation";
import { requireAdmin } from "@/server/auth";
import { audit } from "@/server/services/audit";
import { createCourse } from "@/server/services/courses";
import { runJobs } from "@/server/services/jobs";
import { syncWeeks } from "@/server/services/program";
import { saveSettings } from "@/server/services/settings";
import {
  adminCreateUser, adminResetLink, assignTeacher, changeRole, deleteUser, setAccountStatus, setEnrollment, updateUserDetails,
} from "@/server/services/users";
import { parse, run } from "./run";

/* ── programme ───────────────────────────────────────────────────────── */

export async function saveProgramAction(programId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    const v = parse(programSchema, fd);
    if (weekdayOf(v.startDate) !== v.weekStartDay) {
      throw new AppError("VALIDATION_ERROR", `The start date must be a ${WEEKDAYS[v.weekStartDay]}, the configured first day of each week.`, { startDate: `Pick a ${WEEKDAYS[v.weekStartDay]}.` });
    }
    const status = fd.get("status") === "draft" ? "draft" : fd.get("status") === "completed" ? "completed" : "active";
    await transaction(async (tx) => {
      let program: typeof programs.$inferSelect;
      if (programId) {
        const [before] = await tx.select().from(programs).where(eq(programs.id, programId)).for("update");
        if (!before) throw notFound();
        [program] = await tx.update(programs).set({ ...v, description: v.description ?? null, status, updatedAt: new Date() }).where(eq(programs.id, programId)).returning();
        const changed = (["startDate", "weeksCount", "timezone", "weekStartDay", "reminderDaysBefore", "reminderHour"] as const)
          .filter((k) => before[k] !== program[k]);
        if (changed.length) {
          await audit({
            actorId: actor.id, action: "program.configured", entityType: "program", entityId: program.id,
            summary: `Changed ${changed.join(", ")} for "${program.name}" (now ${program.startDate} → ${programEndDate(program.startDate, program.weeksCount)})`,
            metadata: Object.fromEntries(changed.map((k) => [k, [before[k], program[k]]])),
          }, tx);
        }
      } else {
        // A new programme becomes the current one.
        await tx.update(programs).set({ isCurrent: false }).where(eq(programs.isCurrent, true));
        [program] = await tx.insert(programs).values({ ...v, description: v.description ?? null, status, isCurrent: true }).returning();
        await audit({ actorId: actor.id, action: "program.created", entityType: "program", entityId: program.id, summary: `Created programme "${program.name}" (${program.weeksCount} weeks from ${program.startDate})` }, tx);
      }
      await syncWeeks(tx, program);
    });
    return "Programme saved. Week dates have been updated.";
  });
}

export async function makeCurrentProgramAction(programId: string, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    await transaction(async (tx) => {
      await tx.update(programs).set({ isCurrent: false }).where(and(eq(programs.isCurrent, true), ne(programs.id, programId)));
      const [p] = await tx.update(programs).set({ isCurrent: true }).where(eq(programs.id, programId)).returning();
      if (!p) throw notFound();
      await audit({ actorId: actor.id, action: "program.made_current", entityType: "program", entityId: p.id, summary: `Made "${p.name}" the current programme` }, tx);
    });
    return "Current programme changed.";
  });
}

export async function saveWeekAction(weekId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await requireAdmin();
    const v = parse(z.object({ title: reqText(120), theme: optText(200) }), fd);
    await transaction(async (tx) => {
      const [w] = await tx.update(programWeeks).set({ title: v.title, theme: v.theme ?? null }).where(eq(programWeeks.id, weekId)).returning();
      if (!w) throw notFound();
    });
    return "Week saved.";
  });
}

export async function saveTrackAction(programId: string, trackId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    const v = parse(trackSchema, fd);
    await transaction(async (tx) => {
      const [p] = await tx.select().from(programs).where(eq(programs.id, programId));
      if (!p) throw notFound();
      if (v.weekTo > p.weeksCount) throw new AppError("VALIDATION_ERROR", `This programme only has ${p.weeksCount} weeks.`, { weekTo: `At most ${p.weeksCount}.` });
      if (trackId) {
        await tx.update(tracks).set({ ...v, description: v.description ?? null }).where(and(eq(tracks.id, trackId), eq(tracks.programId, programId)));
      } else {
        const [t] = await tx.insert(tracks).values({ ...v, description: v.description ?? null, programId }).returning();
        await audit({ actorId: actor.id, action: "track.created", entityType: "track", entityId: t.id, summary: `Created track "${t.name}"` }, tx);
      }
    });
    return trackId ? "Track saved." : "Track created. Assign a teacher next.";
  });
}

export async function deleteTrackAction(trackId: string, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    await transaction(async (tx) => {
      const [{ n }] = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${courses} where track_id = ${trackId}`)).rows;
      if (n > 0) throw conflict("This track has courses. Archive them, or keep the track.");
      const [t] = await tx.delete(tracks).where(eq(tracks.id, trackId)).returning();
      if (t) await audit({ actorId: actor.id, action: "track.deleted", entityType: "track", entityId: trackId, summary: `Deleted track "${t.name}"` }, tx);
    });
    return "Track deleted.";
  });
}

export async function assignTeacherAction(trackId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    const { teacherId } = parse(z.object({ teacherId: uuidField }), fd);
    await assignTeacher(actor, trackId, teacherId, true);
    return "Teacher assigned.";
  });
}

export async function unassignTeacherAction(trackId: string, teacherId: string, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    await assignTeacher(actor, trackId, teacherId, false);
    return "Teacher removed from track.";
  });
}

/* ── courses ─────────────────────────────────────────────────────────── */

/**
 * Admin hand-off: the admin names the course and picks the teacher and week;
 * the teacher writes the lesson, adds videos, files and assignments, and publishes.
 */
export async function assignCourseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    const v = parse(z.object({ title: reqText(160), teacherId: uuidField, weekId: uuidField }), fd);
    const course = await createCourse(actor, { title: v.title, content: "", objectives: [], teacherId: v.teacherId, weekId: v.weekId });
    const [t] = await db.select({ first: users.firstName }).from(users).where(eq(users.id, course.teacherId));
    revalidatePath("/admin/courses");
    return { message: `"${course.title}" is assigned to ${t?.first ?? "the teacher"}. They've been notified and can now add everything else.`, data: { courseId: course.id } };
  });
}

/* ── users ───────────────────────────────────────────────────────────── */

export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    const { user, invitePath } = await adminCreateUser(actor, parse(adminUserSchema, fd));
    return {
      message: `Account created for ${user.firstName}. Share the set-password link below with them (valid for 7 days).`,
      data: { invitePath, userId: user.id },
    };
  });
}

export async function resetLinkAction(userId: string, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    const resetPath = await adminResetLink(actor, userId);
    return { message: "Share this link with them. It works once and expires in 24 hours.", data: { resetPath } };
  });
}

export async function updateUserAction(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    const v = parse(adminUserSchema.pick({ firstName: true, lastName: true, email: true }), fd);
    await updateUserDetails(actor, userId, v);
    return "Details saved.";
  });
}

export async function changeRoleAction(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    const { role } = parse(z.object({ role: z.enum(["student", "teacher", "super_admin"]) }), fd);
    await changeRole(actor, userId, role);
    return "Role updated. It takes effect on their next page load.";
  });
}

export async function setStatusAction(userId: string, status: "active" | "deactivated", _: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    await setAccountStatus(actor, userId, status);
    return status === "deactivated" ? "Account deactivated and signed out. Their records are kept." : "Account reactivated.";
  });
}

export async function deleteUserAction(userId: string, _: ActionState): Promise<ActionState> {
  const r = await run(async () => {
    const actor = await requireAdmin();
    await deleteUser(actor, userId);
  });
  if (r.ok) redirect("/admin/users?deleted=1");
  return r;
}

export async function enrollmentAction(programId: string, studentId: string, enrolled: boolean, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    await setEnrollment(actor, programId, studentId, enrolled);
    return enrolled ? "Enrolled in the programme." : "Removed from the programme.";
  });
}

/**
 * Journals are personal. A super admin sees status by default; reading the
 * text is a deliberate act that is recorded in the audit log every time.
 */
export async function revealJournalAction(entryId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    const { reason } = parse(z.object({ reason: reqText(300, "Say why you need to read this entry.") }), fd);
    const [row] = await db.select({ e: journalEntries, w: programWeeks.weekNumber, first: users.firstName, last: users.lastName })
      .from(journalEntries).innerJoin(programWeeks, eq(programWeeks.id, journalEntries.weekId)).innerJoin(users, eq(users.id, journalEntries.studentId))
      .where(eq(journalEntries.id, entryId));
    if (!row) throw notFound();
    await audit({ actorId: actor.id, action: "journal.viewed", entityType: "journal_entry", entityId: entryId, summary: `Viewed ${row.first} ${row.last}'s week ${row.w} journal`, metadata: { reason } });
    return { data: { content: JSON.stringify(row.e.responses) } };
  });
}

/* ── settings & jobs ─────────────────────────────────────────────────── */

export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    const v = parse(z.object({
      notifyAdminsOnSubmission: checkbox, teacherJournalAccess: checkbox, autoEnrollNewStudents: checkbox,
      allowRevisitPastCourses: checkbox, deadlineReminderHours: intField(1, 168),
    }), fd);
    await saveSettings(v, actor.id);
    await audit({ actorId: actor.id, action: "settings.updated", entityType: "settings", summary: "Updated platform settings", metadata: v });
    return "Settings saved.";
  });
}

export async function runJobsAction(_: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireAdmin();
    const r = await runJobs(`manual:${actor.id}`);
    const rem = r.reminders;
    return `Jobs finished: ${r.coursesPublished} course(s) published, ${rem.sent} teacher reminder(s) sent, ${rem.alreadyHandled} already sent; ${r.deadlines.dueSoon + r.deadlines.overdue} deadline notification(s).`;
  });
}

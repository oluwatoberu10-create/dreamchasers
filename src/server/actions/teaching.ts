"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { programWeeks, weeklyEvaluations, users } from "@/db/schema";
import { AppError, forbidden } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import {
  assignmentSchema, courseSchema, gradeSchema, lines, publishSchema, repeatSchema, resourceLinkSchema, rubricSchema, uuidField,
} from "@/lib/validation";
import { requireTeacher } from "@/server/auth";
import { canViewStudent } from "@/server/policy";
import { createAssignment, setAssignmentStatus, updateAssignment, type AssignmentInput } from "@/server/services/assignments";
import {
  addFileResources, addLinkResource, archiveCourse, createCourse, deleteCourse, removeResource, setPublication, updateCourse,
} from "@/server/services/courses";
import { filesFrom } from "@/server/services/storage";
import { gradeAttempt, requireRepeat, resolveRepeat } from "@/server/services/submissions";
import { parse, run } from "./run";

/* ── courses ─────────────────────────────────────────────────────────── */

function courseInput(fd: FormData) {
  const v = parse(courseSchema, fd);
  return { ...v, objectives: lines(v.objectives) };
}

export async function createCourseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await run(async () => {
    const actor = await requireTeacher();
    id = (await createCourse(actor, courseInput(fd))).id;
  });
  if (r.ok) redirect(`/teach/courses/${id}?created=1`);
  return r;
}

export async function updateCourseAction(courseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireTeacher();
    await updateCourse(actor, courseId, courseInput(fd));
    revalidatePath(`/teach/courses/${courseId}`);
    return "Course saved.";
  });
}

export async function publicationAction(courseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireTeacher();
    const mode = parse(publishSchema, fd);
    const c = await setPublication(actor, courseId, mode.mode === "schedule" ? { mode: "schedule", publishAtLocal: mode.publishAt } : mode);
    return c.status === "published" ? "Published — learners have been notified." : c.status === "scheduled" ? "Scheduled. Learners can see it's coming up." : "Moved back to draft.";
  });
}

export async function archiveCourseAction(courseId: string, restore: boolean, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireTeacher();
    await archiveCourse(actor, courseId, restore);
    return restore ? "Course restored." : "Course archived. Learner records are kept.";
  });
}

export async function deleteCourseAction(courseId: string, _: ActionState): Promise<ActionState> {
  const r = await run(async () => {
    const actor = await requireTeacher();
    await deleteCourse(actor, courseId);
  });
  if (r.ok) redirect("/admin/courses?deleted=1");
  return r;
}

export async function addLinkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireTeacher();
    await addLinkResource(actor, parse(resourceLinkSchema, fd));
    return "Link added.";
  });
}

export async function uploadResourcesAction(courseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireTeacher();
    const created = await addFileResources(actor, courseId, filesFrom(fd, "files"), {
      downloadable: fd.get("downloadable") === "on", title: String(fd.get("title") ?? "").trim().slice(0, 160) || undefined,
    });
    return `${created.length} file${created.length === 1 ? "" : "s"} uploaded.`;
  });
}

export async function removeResourceAction(resourceId: string, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireTeacher();
    await removeResource(actor, resourceId);
    return "Removed.";
  });
}

/* ── assignments ─────────────────────────────────────────────────────── */

function assignmentInput(fd: FormData): AssignmentInput {
  const v = parse(assignmentSchema, fd);
  let rubric: AssignmentInput["rubric"] = [];
  try {
    const parsed = rubricSchema.safeParse(JSON.parse(v.rubric || "[]"));
    if (!parsed.success) throw new Error();
    rubric = parsed.data.filter((r) => r.criterion.trim());
  } catch {
    throw new AppError("VALIDATION_ERROR", "The rubric couldn't be read. Check each row has a name and points.", { rubric: "Invalid rubric." });
  }
  return {
    courseId: v.courseId, kind: v.kind, title: v.title, instructions: v.instructions, maxScore: v.maxScore, passMark: v.passMark,
    dueAtLocal: v.dueAt, allowText: v.allowText, allowFiles: v.allowFiles, requiredFilesNote: v.requiredFilesNote,
    acceptLate: v.acceptLate, resubmissionPolicy: v.resubmissionPolicy, maxAttempts: v.maxAttempts, rubric, publish: v.publish,
  };
}

export async function createAssignmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await run(async () => {
    const actor = await requireTeacher();
    id = (await createAssignment(actor, assignmentInput(fd))).id;
  });
  if (r.ok) redirect(`/teach/assignments/${id}?created=1`);
  return r;
}

export async function updateAssignmentAction(assignmentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireTeacher();
    await updateAssignment(actor, assignmentId, assignmentInput(fd));
    return "Assignment saved.";
  });
}

export async function assignmentStatusAction(assignmentId: string, status: "published" | "archived", _: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireTeacher();
    await setAssignmentStatus(actor, assignmentId, status);
    return status === "published" ? "Published — learners have been notified." : "Archived.";
  });
}

/* ── grading ─────────────────────────────────────────────────────────── */

export async function gradeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireTeacher();
    const v = parse(gradeSchema, fd);
    let rubricScores: Record<string, number> = {};
    try {
      const raw = JSON.parse(v.rubricScores || "{}") as Record<string, unknown>;
      rubricScores = Object.fromEntries(Object.entries(raw).filter(([, n]) => typeof n === "number" && Number.isFinite(n)).map(([k, n]) => [k.slice(0, 120), n as number]));
    } catch { /* rubric scores are optional detail */ }
    const g = await gradeAttempt(actor, { attemptId: v.attemptId, score: v.score, feedback: v.feedback, requestRevision: v.requestRevision, rubricScores });
    const label = g.outcome === "passed" ? "Passed" : g.outcome === "revision_requested" ? "Revision requested" : "Below the pass mark";
    return `Grade saved: ${g.score}/${g.maxScore} — ${label}. The learner has been notified.`;
  });
}

export async function requireRepeatAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireTeacher();
    await requireRepeat(actor, parse(repeatSchema, fd));
    return "The learner can now revisit this course. Their earlier work is kept.";
  });
}

export async function resolveRepeatAction(repeatId: string, status: "completed" | "cancelled", _: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireTeacher();
    await resolveRepeat(actor, repeatId, status);
    return status === "completed" ? "Marked complete." : "Repeat cancelled.";
  });
}

export async function saveEvaluationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireTeacher();
    const v = parse(z.object({ weekId: uuidField, studentId: uuidField, comment: z.string().trim().min(1, "Write a comment.").max(4000) }), fd);
    if (!(await canViewStudent(actor, v.studentId))) throw forbidden("You don't teach this learner.");
    const [student] = await db.select().from(users).where(eq(users.id, v.studentId));
    const [week] = await db.select().from(programWeeks).where(eq(programWeeks.id, v.weekId));
    if (!student || student.role !== "student" || !week) throw new AppError("NOT_FOUND", "Not found.");
    await db.insert(weeklyEvaluations).values({ weekId: v.weekId, studentId: v.studentId, comment: v.comment, evaluatedById: actor.id })
      .onConflictDoUpdate({ target: [weeklyEvaluations.weekId, weeklyEvaluations.studentId], set: { comment: v.comment, evaluatedById: actor.id, updatedAt: new Date() } });
    return `Week ${week.weekNumber} evaluation saved.`;
  });
}

export async function deleteEvaluationAction(weekId: string, studentId: string, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireTeacher();
    if (!(await canViewStudent(actor, studentId))) throw forbidden();
    await db.delete(weeklyEvaluations).where(and(eq(weeklyEvaluations.weekId, weekId), eq(weeklyEvaluations.studentId, studentId)));
    return "Evaluation removed.";
  });
}

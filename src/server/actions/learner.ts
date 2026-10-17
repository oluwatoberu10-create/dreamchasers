"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { personalTasks } from "@/db/schema";
import { notFound } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { journalSchema, taskSchema, uuidField } from "@/lib/validation";
import { requireStudent } from "@/server/auth";
import { setCourseComplete } from "@/server/services/courses";
import { reopenJournal, saveJournal, submitJournal } from "@/server/services/journal";
import { enforce } from "@/server/services/rate-limit";
import { filesFrom } from "@/server/services/storage";
import { removeDraftFile, saveDraft, startAttempt, submitWork } from "@/server/services/submissions";
import { parse, run } from "./run";

/* ── assignments ─────────────────────────────────────────────────────── */

const bodyOf = (fd: FormData) => String(fd.get("body") ?? "").slice(0, 100_000);

export async function saveDraftAction(assignmentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const me = await requireStudent();
    await saveDraft(me, assignmentId, bodyOf(fd), filesFrom(fd, "files"));
    return "Draft saved.";
  });
}

export async function submitWorkAction(assignmentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const me = await requireStudent();
    await enforce(`submit:${me.id}`, 30, 600);
    const { attempt, duplicate } = await submitWork(me, assignmentId, bodyOf(fd), filesFrom(fd, "files"));
    if (duplicate) return "Already handed in — nothing changed.";
    return attempt.isLate ? "Handed in (after the deadline). Your teacher has been notified." : "Handed in! Your teacher has been notified.";
  });
}

/** One form, two buttons: intent=draft saves, intent=submit hands in. */
export async function workAction(assignmentId: string, prev: ActionState, fd: FormData): Promise<ActionState> {
  return fd.get("intent") === "submit" ? submitWorkAction(assignmentId, prev, fd) : saveDraftAction(assignmentId, prev, fd);
}

export async function startAttemptAction(assignmentId: string, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const me = await requireStudent();
    const { draft } = await startAttempt(me, assignmentId);
    return draft.attemptNumber > 1 ? `Attempt ${draft.attemptNumber} started — your previous work is copied in to edit.` : "Started.";
  });
}

export async function removeDraftFileAction(attemptId: string, fileId: string, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const me = await requireStudent();
    await removeDraftFile(me, attemptId, fileId);
    return "File removed.";
  });
}

export async function courseCompleteAction(courseId: string, complete: boolean, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const me = await requireStudent();
    await setCourseComplete(me, courseId, complete);
    return complete ? "Nice work — course marked complete." : "Marked as not complete.";
  });
}

/* ── journal ─────────────────────────────────────────────────────────── */

export async function saveJournalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const me = await requireStudent();
    const { weekId, ...responses } = parse(journalSchema, fd);
    const intent = fd.get("intent");
    if (intent === "submit") {
      await submitJournal(me, weekId, responses);
      return "Reflection completed. Well done for taking the time.";
    }
    const saved = await saveJournal(me, weekId, responses);
    return { message: intent === "autosave" ? undefined : "Draft saved.", data: { savedAt: saved.updatedAt.toISOString() } };
  });
}

export async function reopenJournalAction(weekId: string, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const me = await requireStudent();
    await reopenJournal(me, weekId);
    return "Moved back to a private draft.";
  });
}

/* ── personal tasks ──────────────────────────────────────────────────── */

export async function addTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const me = await requireStudent();
    const v = parse(taskSchema, fd);
    await db.insert(personalTasks).values({ userId: me.id, title: v.title, notes: v.notes ?? null, dueOn: v.dueOn ?? null });
    return "Task added.";
  });
}

export async function updateTaskAction(taskId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const me = await requireStudent();
    const v = parse(taskSchema, fd);
    const rows = await db.update(personalTasks).set({ title: v.title, notes: v.notes ?? null, dueOn: v.dueOn ?? null })
      .where(and(eq(personalTasks.id, taskId), eq(personalTasks.userId, me.id))).returning();
    if (rows.length === 0) throw notFound();
    return "Task updated.";
  });
}

export async function toggleTaskAction(taskId: string, done: boolean, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const me = await requireStudent();
    await db.update(personalTasks).set({ completedAt: done ? new Date() : null }).where(and(eq(personalTasks.id, taskId), eq(personalTasks.userId, me.id)));
  });
}

export async function deleteTaskAction(taskId: string, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const me = await requireStudent();
    parse(z.object({ id: uuidField }), { id: taskId });
    await db.delete(personalTasks).where(and(eq(personalTasks.id, taskId), eq(personalTasks.userId, me.id)));
    return "Task deleted.";
  });
}

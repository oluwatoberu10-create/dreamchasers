import "server-only";
import { eq } from "drizzle-orm";
import { transaction } from "@/db";
import { assignments, programs, type RubricItem } from "@/db/schema";
import { conflict, validationError } from "@/lib/errors";
import { zonedTimeToUtc } from "@/lib/dates";
import type { SessionUser } from "@/server/auth";
import { isCourseLive, loadManagedAssignment, loadManagedCourse } from "@/server/policy";
import { audit } from "./audit";
import { enrolledStudentIds } from "./audience";
import { notify } from "./notifications";

type Actor = Pick<SessionUser, "id" | "role">;
export type Assignment = typeof assignments.$inferSelect;

export type AssignmentInput = {
  courseId: string;
  kind: "assignment" | "assessment";
  title: string;
  instructions: string;
  maxScore: number;
  passMark: number;
  /** "YYYY-MM-DDTHH:mm" in the programme's timezone. */
  dueAtLocal: string;
  allowText: boolean;
  allowFiles: boolean;
  requiredFilesNote?: string;
  acceptLate: boolean;
  resubmissionPolicy: "none" | "on_request" | "until_passed";
  maxAttempts?: number;
  rubric: RubricItem[];
  publish: boolean;
};

function checkNumbers(input: AssignmentInput) {
  if (input.passMark > input.maxScore) throw validationError("The pass mark cannot be higher than the maximum score.");
  if (!input.allowText && !input.allowFiles) throw validationError("Allow a written response, file uploads, or both.");
  const rubricTotal = input.rubric.reduce((a, r) => a + r.points, 0);
  if (input.rubric.length > 0 && rubricTotal !== input.maxScore) {
    throw validationError(`Rubric points add up to ${rubricTotal}, but the maximum score is ${input.maxScore}.`);
  }
}

async function dueInstant(programId: string, local: string, conn: Parameters<Parameters<typeof transaction>[0]>[0]) {
  const [program] = await conn.select().from(programs).where(eq(programs.id, programId));
  const [d, t] = local.split("T");
  const [hh, mm] = t.split(":").map(Number);
  return zonedTimeToUtc(d, hh, mm, program.timezone);
}

async function announceAssignment(a: Assignment, course: { id: string; title: string; programId: string; status: string; publishAt: Date | null }, conn: Parameters<Parameters<typeof transaction>[0]>[0]) {
  if (a.status !== "published" || !isCourseLive(course as never)) return;
  const students = await enrolledStudentIds(course.programId, conn);
  await notify(conn, students.map((id) => ({
    recipientId: id, type: "resource_added",
    title: `New ${a.kind === "assessment" ? "assessment" : "assignment"}: ${a.title}`,
    body: `Part of ${course.title}.`,
    link: `/learn/assignments/${a.id}`, resourceType: "assignment", resourceId: a.id,
    dedupeKey: `assignment_published:${a.id}`,
  })));
}

export async function createAssignment(actor: Actor, input: AssignmentInput): Promise<Assignment> {
  checkNumbers(input);
  return transaction(async (tx) => {
    const course = await loadManagedCourse(actor, input.courseId, tx);
    if (course.status === "archived") throw conflict("This course is archived.");
    const dueAt = await dueInstant(course.programId, input.dueAtLocal, tx);
    const [a] = await tx.insert(assignments).values({
      courseId: course.id, createdById: actor.id, kind: input.kind, title: input.title,
      instructions: input.instructions, maxScore: input.maxScore, passMark: input.passMark, dueAt,
      allowText: input.allowText, allowFiles: input.allowFiles, requiredFilesNote: input.requiredFilesNote ?? null,
      acceptLate: input.acceptLate, resubmissionPolicy: input.resubmissionPolicy, maxAttempts: input.maxAttempts ?? null,
      rubric: input.rubric, status: input.publish ? "published" : "draft", publishedAt: input.publish ? new Date() : null,
    }).returning();
    await audit({ actorId: actor.id, action: "assignment.created", entityType: "assignment", entityId: a.id, summary: `Created "${a.title}" (max ${a.maxScore}, pass ${a.passMark})` }, tx);
    await announceAssignment(a, course, tx);
    return a;
  });
}

export async function updateAssignment(actor: Actor, assignmentId: string, input: AssignmentInput): Promise<Assignment> {
  checkNumbers(input);
  return transaction(async (tx) => {
    const { assignment: before, course } = await loadManagedAssignment(actor, assignmentId, tx);
    if (input.courseId !== before.courseId) throw validationError("An assignment cannot move to another course.");
    const dueAt = await dueInstant(course.programId, input.dueAtLocal, tx);
    const publishNow = input.publish && before.status === "draft";
    const [a] = await tx.update(assignments).set({
      kind: input.kind, title: input.title, instructions: input.instructions, maxScore: input.maxScore,
      passMark: input.passMark, dueAt, allowText: input.allowText, allowFiles: input.allowFiles,
      requiredFilesNote: input.requiredFilesNote ?? null, acceptLate: input.acceptLate,
      resubmissionPolicy: input.resubmissionPolicy, maxAttempts: input.maxAttempts ?? null, rubric: input.rubric,
      status: publishNow ? "published" : before.status, publishedAt: publishNow ? new Date() : before.publishedAt,
      updatedAt: new Date(),
    }).where(eq(assignments.id, assignmentId)).returning();

    const changes: Record<string, [unknown, unknown]> = {};
    if (before.passMark !== a.passMark) changes.passMark = [before.passMark, a.passMark];
    if (before.maxScore !== a.maxScore) changes.maxScore = [before.maxScore, a.maxScore];
    if (before.dueAt.getTime() !== a.dueAt.getTime()) changes.dueAt = [before.dueAt.toISOString(), a.dueAt.toISOString()];
    if (before.resubmissionPolicy !== a.resubmissionPolicy) changes.resubmissionPolicy = [before.resubmissionPolicy, a.resubmissionPolicy];
    if (Object.keys(changes).length > 0) {
      await audit({
        actorId: actor.id, action: "assignment.configured", entityType: "assignment", entityId: a.id,
        summary: `Changed ${Object.keys(changes).join(", ")} on "${a.title}"`, metadata: { changes },
      }, tx);
    }
    if (publishNow) await announceAssignment(a, course, tx);
    return a;
  });
}

export async function setAssignmentStatus(actor: Actor, assignmentId: string, status: "published" | "archived" | "draft"): Promise<void> {
  await transaction(async (tx) => {
    const { assignment, course } = await loadManagedAssignment(actor, assignmentId, tx);
    if (status === "draft" && assignment.status !== "draft") throw conflict("A published assignment cannot return to draft. Archive it instead.");
    const [a] = await tx.update(assignments).set({
      status, publishedAt: status === "published" ? assignment.publishedAt ?? new Date() : assignment.publishedAt, updatedAt: new Date(),
    }).where(eq(assignments.id, assignmentId)).returning();
    await audit({ actorId: actor.id, action: `assignment.${status}`, entityType: "assignment", entityId: a.id, summary: `${status === "archived" ? "Archived" : "Published"} "${a.title}"` }, tx);
    if (status === "published" && assignment.status !== "published") await announceAssignment(a, course, tx);
  });
}

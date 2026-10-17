import "server-only";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, transaction, type DbOrTx, type Tx } from "@/db";
import {
  assignments, attemptFiles, courses, files, grades, repeatRequirements, submissionAttempts, submissions, users,
} from "@/db/schema";
import { conflict, forbidden, notFound, validationError } from "@/lib/errors";
import { deriveStatus, outcomeFor, validateScore, type DerivedStatus } from "@/lib/status";
import { fullName } from "@/lib/utils";
import type { SessionUser } from "@/server/auth";
import { canManageCourse, studentCanViewCourse } from "@/server/policy";
import { audit } from "./audit";
import { courseStaffIds } from "./audience";
import { adminIds, notify } from "./notifications";
import { getSettings } from "./settings";
import { MAX_SUBMISSION_FILES, storeUpload } from "./storage";

type Actor = Pick<SessionUser, "id" | "role">;
type Assignment = typeof assignments.$inferSelect;
type Course = typeof courses.$inferSelect;
type Submission = typeof submissions.$inferSelect;
type Attempt = typeof submissionAttempts.$inferSelect;

/* ── shared loading ──────────────────────────────────────────────────── */

/** Loads an assignment a learner is allowed to work on (published, course visible, enrolled). */
async function loadStudentAssignment(student: Actor, assignmentId: string, tx: Tx) {
  if (student.role !== "student") throw forbidden("Only learners submit work.");
  const [row] = await tx.select({ assignment: assignments, course: courses }).from(assignments)
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .where(eq(assignments.id, assignmentId)).limit(1);
  if (!row || row.assignment.status !== "published") throw notFound("That assignment is not available.");
  if (!(await studentCanViewCourse(student, row.course, tx))) throw notFound("That assignment is not available.");
  return row;
}

async function repeatIsActive(studentId: string, courseId: string, tx: Tx): Promise<boolean> {
  const [r] = await tx.select({ id: repeatRequirements.id }).from(repeatRequirements)
    .where(and(eq(repeatRequirements.studentId, studentId), eq(repeatRequirements.courseId, courseId), eq(repeatRequirements.status, "active")))
    .limit(1);
  return Boolean(r);
}

/** The submission row, locked for the rest of the transaction, with its newest attempt. */
async function lockSubmission(assignmentId: string, studentId: string, tx: Tx) {
  const [submission] = await tx.select().from(submissions)
    .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.studentId, studentId)))
    .for("update");
  if (!submission) return { submission: null, latest: null };
  const [latest] = await tx.select().from(submissionAttempts)
    .where(and(eq(submissionAttempts.submissionId, submission.id), eq(submissionAttempts.attemptNumber, submission.currentAttempt)));
  return { submission, latest: latest ?? null };
}

async function lastGradeFor(submissionId: string, tx: Tx) {
  const [g] = await tx.select({ grade: grades, attemptNumber: submissionAttempts.attemptNumber }).from(grades)
    .innerJoin(submissionAttempts, eq(submissionAttempts.id, grades.attemptId))
    .where(eq(submissionAttempts.submissionId, submissionId))
    .orderBy(desc(submissionAttempts.attemptNumber)).limit(1);
  return g ? { ...g.grade, attemptNumber: g.attemptNumber } : null;
}

async function statusOf(a: Assignment, course: Course, studentId: string, submission: Submission | null, latest: Attempt | null, tx: Tx): Promise<DerivedStatus> {
  const lastGrade = submission ? await lastGradeFor(submission.id, tx) : null;
  return deriveStatus({
    dueAt: a.dueAt, acceptLate: a.acceptLate, resubmissionPolicy: a.resubmissionPolicy, maxAttempts: a.maxAttempts,
    latest: latest ? { attemptNumber: latest.attemptNumber, status: latest.status, isLate: latest.isLate, submittedAt: latest.submittedAt } : null,
    lastGrade, repeatActive: await repeatIsActive(studentId, course.id, tx), now: new Date(),
  });
}

/* ── learner: drafts, attempts, submission ───────────────────────────── */

/**
 * Returns a draft attempt the learner can write into, creating the submission
 * and/or a new attempt when the rules allow it. Never touches graded attempts.
 */
async function ensureDraft(student: Actor, a: Assignment, course: Course, tx: Tx): Promise<{ submission: Submission; draft: Attempt }> {
  const locked = await lockSubmission(a.id, student.id, tx);
  const status = await statusOf(a, course, student.id, locked.submission, locked.latest, tx);

  if (locked.latest?.status === "draft") {
    if (!status.canEditDraft) throw conflict("The deadline has passed and this assignment no longer accepts work.");
    return { submission: locked.submission!, draft: locked.latest };
  }
  if (locked.latest?.status === "submitted") throw conflict("This work has been handed in and is waiting to be graded.");
  if (!status.canStartNewAttempt) {
    throw conflict(status.key === "overdue"
      ? "The deadline has passed and this assignment no longer accepts work."
      : "Another attempt is not available for this assignment.");
  }

  if (!locked.submission) {
    // Unique (assignment, student) + the row lock below make concurrent
    // first opens converge on one row.
    const [created] = await tx.insert(submissions).values({ assignmentId: a.id, studentId: student.id, status: "in_progress", currentAttempt: 1 })
      .onConflictDoNothing().returning();
    const submission = created ?? (await lockSubmission(a.id, student.id, tx)).submission!;
    const [draft] = await tx.insert(submissionAttempts).values({ submissionId: submission.id, attemptNumber: 1 })
      .onConflictDoNothing().returning();
    if (!draft) return ensureDraft(student, a, course, tx);
    return { submission, draft };
  }

  // A new attempt after grading: start from the previous text and files so a
  // revision is an edit, not a rewrite. The previous attempt is untouched.
  const prev = locked.latest!;
  const lastGrade = await lastGradeFor(locked.submission.id, tx);
  const reason = lastGrade?.outcome === "revision_requested" ? "Revision requested by teacher"
    : (await repeatIsActive(student.id, course.id, tx)) ? "Repeat learning — another attempt" : "Resubmission";
  const n = locked.submission.currentAttempt + 1;
  const [draft] = await tx.insert(submissionAttempts).values({ submissionId: locked.submission.id, attemptNumber: n, body: prev.body, reason }).returning();
  const prevFiles = await tx.select().from(attemptFiles).where(eq(attemptFiles.attemptId, prev.id));
  if (prevFiles.length > 0) await tx.insert(attemptFiles).values(prevFiles.map((f) => ({ attemptId: draft.id, fileId: f.fileId })));
  const [submission] = await tx.update(submissions).set({ currentAttempt: n, status: "in_progress", updatedAt: new Date() })
    .where(eq(submissions.id, locked.submission.id)).returning();
  return { submission, draft };
}

async function attachFiles(student: Actor, a: Assignment, draft: Attempt, uploads: File[], tx: Tx) {
  if (uploads.length === 0) return;
  if (!a.allowFiles) throw validationError("This assignment does not accept file uploads.");
  const [existing] = await tx.select({ n: sql<number>`count(*)::int` }).from(attemptFiles).where(eq(attemptFiles.attemptId, draft.id));
  if ((existing?.n ?? 0) + uploads.length > MAX_SUBMISSION_FILES) throw validationError(`Attach up to ${MAX_SUBMISSION_FILES} files.`);
  for (const f of uploads) {
    const stored = await storeUpload(f, student.id, "submission", tx);
    await tx.insert(attemptFiles).values({ attemptId: draft.id, fileId: stored.id });
  }
}

export async function startAttempt(student: Actor, assignmentId: string) {
  return transaction(async (tx) => {
    const { assignment, course } = await loadStudentAssignment(student, assignmentId, tx);
    return ensureDraft(student, assignment, course, tx);
  });
}

export async function saveDraft(student: Actor, assignmentId: string, body: string, uploads: File[] = []) {
  return transaction(async (tx) => {
    const { assignment, course } = await loadStudentAssignment(student, assignmentId, tx);
    const { draft } = await ensureDraft(student, assignment, course, tx);
    if (!assignment.allowText && body.trim()) throw validationError("This assignment takes file uploads only.");
    await attachFiles(student, assignment, draft, uploads, tx);
    const [saved] = await tx.update(submissionAttempts).set({ body, updatedAt: new Date() }).where(eq(submissionAttempts.id, draft.id)).returning();
    return saved;
  });
}

export async function removeDraftFile(student: Actor, attemptId: string, fileId: string): Promise<void> {
  await transaction(async (tx) => {
    const [row] = await tx.select({ attempt: submissionAttempts, submission: submissions }).from(submissionAttempts)
      .innerJoin(submissions, eq(submissions.id, submissionAttempts.submissionId))
      .where(eq(submissionAttempts.id, attemptId));
    if (!row || row.submission.studentId !== student.id) throw notFound();
    if (row.attempt.status !== "draft") throw conflict("Files on handed-in work cannot be changed.");
    await tx.delete(attemptFiles).where(and(eq(attemptFiles.attemptId, attemptId), eq(attemptFiles.fileId, fileId)));
  });
}

/**
 * Hands in the current draft. Validation, the status change and the teacher
 * (and optional admin) notifications commit together or not at all.
 *
 * Idempotent: a double-click or retried request finds the attempt already
 * submitted and returns it without creating anything new.
 */
export async function submitWork(student: Actor, assignmentId: string, body: string, uploads: File[] = []) {
  return transaction(async (tx) => {
    const { assignment, course } = await loadStudentAssignment(student, assignmentId, tx);

    const pre = await lockSubmission(assignment.id, student.id, tx);
    if (pre.latest?.status === "submitted" && uploads.length === 0 && pre.latest.body === body) {
      return { attempt: pre.latest, duplicate: true };
    }

    const { submission, draft } = await ensureDraft(student, assignment, course, tx);
    if (!assignment.allowText && body.trim()) throw validationError("This assignment takes file uploads only.");
    await attachFiles(student, assignment, draft, uploads, tx);

    const [fileCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(attemptFiles).where(eq(attemptFiles.attemptId, draft.id));
    const hasText = assignment.allowText && body.trim().length > 0;
    const hasFiles = (fileCount?.n ?? 0) > 0;
    if (!hasText && !hasFiles) {
      throw validationError(assignment.allowFiles && !assignment.allowText ? "Attach your file before submitting." : "Write your response before submitting.");
    }

    const now = new Date();
    // Lateness is measured for the first attempt only. A revision the teacher
    // asked for after the deadline is not "late".
    const isLate = draft.attemptNumber === 1 && now.getTime() > assignment.dueAt.getTime();
    const [attempt] = await tx.update(submissionAttempts)
      .set({ body, status: "submitted", submittedAt: now, isLate, updatedAt: now })
      .where(and(eq(submissionAttempts.id, draft.id), eq(submissionAttempts.status, "draft")))
      .returning();
    if (!attempt) throw conflict("This attempt was already submitted.");
    await tx.update(submissions).set({ status: "submitted", updatedAt: now }).where(eq(submissions.id, submission.id));

    // Notify the responsible staff (and admins, if configured).
    const [me] = await tx.select().from(users).where(eq(users.id, student.id));
    const staff = await courseStaffIds(course, tx);
    const settings = await getSettings(tx);
    const admins = settings.notifyAdminsOnSubmission ? await adminIds(tx) : [];
    const recipients = [...new Set([...staff, ...admins])];
    const label = attempt.attemptNumber > 1 ? "Resubmission" : isLate ? "Late submission" : "Submission";
    await notify(tx, recipients.map((id) => ({
      recipientId: id, type: "assignment_submitted",
      title: `${label}: ${assignment.title}`,
      body: `${fullName(me)} handed in attempt ${attempt.attemptNumber} at ${now.toISOString()}.`,
      link: `/teach/grading/${attempt.id}`, resourceType: "attempt", resourceId: attempt.id,
      dedupeKey: `submitted:${attempt.id}`,
    })));

    return { attempt, duplicate: false };
  });
}

/* ── teacher: grading ────────────────────────────────────────────────── */

export type GradeInput = {
  attemptId: string;
  score: number;
  feedback: string;
  requestRevision: boolean;
  rubricScores?: Record<string, number>;
};

/**
 * Records (or corrects) the grade on a submitted attempt. Only the newest
 * attempt can be graded; earlier attempts and their grades are history.
 */
export async function gradeAttempt(actor: Actor, input: GradeInput) {
  return transaction(async (tx) => {
    const [row] = await tx.select({ attempt: submissionAttempts, submission: submissions, assignment: assignments, course: courses })
      .from(submissionAttempts)
      .innerJoin(submissions, eq(submissions.id, submissionAttempts.submissionId))
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .innerJoin(courses, eq(courses.id, assignments.courseId))
      .where(eq(submissionAttempts.id, input.attemptId)).limit(1);
    if (!row) throw notFound("That submission does not exist.");
    if (!(await canManageCourse(actor, row.course, tx))) throw forbidden("You are not assigned to grade this course.");

    const { submission } = await lockSubmission(row.assignment.id, row.submission.studentId, tx);
    if (!submission || submission.currentAttempt !== row.attempt.attemptNumber) {
      throw conflict("A newer attempt exists. Grade the latest attempt instead.");
    }
    if (row.attempt.status === "draft") throw conflict("This attempt has not been submitted yet.");

    const check = validateScore(input.score, row.assignment.maxScore);
    if (!check.ok) throw validationError(check.error);
    const outcome = outcomeFor(check.score, row.assignment.passMark, input.requestRevision);
    const now = new Date();

    const [existing] = await tx.select().from(grades).where(eq(grades.attemptId, row.attempt.id));
    const values = {
      score: check.score, maxScore: row.assignment.maxScore, passMark: row.assignment.passMark,
      outcome, feedback: input.feedback, rubricScores: input.rubricScores ?? {}, gradedById: actor.id, gradedAt: now,
    };
    const [grade] = existing
      ? await tx.update(grades).set(values).where(eq(grades.id, existing.id)).returning()
      : await tx.insert(grades).values({ attemptId: row.attempt.id, ...values }).returning();

    await tx.update(submissionAttempts).set({ status: "graded", updatedAt: now }).where(eq(submissionAttempts.id, row.attempt.id));
    await tx.update(submissions).set({ status: outcome === "revision_requested" ? "revision_requested" : "graded", updatedAt: now })
      .where(eq(submissions.id, submission.id));

    if (existing && (existing.score !== grade.score || existing.outcome !== grade.outcome)) {
      await audit({
        actorId: actor.id, action: "grade.changed", entityType: "attempt", entityId: row.attempt.id,
        summary: `Regraded "${row.assignment.title}" attempt ${row.attempt.attemptNumber}: ${existing.score} → ${grade.score} (${grade.outcome})`,
        metadata: { from: { score: existing.score, outcome: existing.outcome }, to: { score: grade.score, outcome: grade.outcome } },
      }, tx);
    }

    const resultText = outcome === "passed" ? "Passed" : outcome === "revision_requested" ? "Revision requested" : "Keep learning";
    await notify(tx, [{
      recipientId: row.submission.studentId,
      type: outcome === "revision_requested" ? "revision_requested" : "assignment_graded",
      title: outcome === "revision_requested" ? `Revision requested: ${row.assignment.title}` : `Graded: ${row.assignment.title}`,
      body: `${grade.score}/${grade.maxScore} — ${resultText}. Pass mark ${grade.passMark}.`,
      link: `/learn/assignments/${row.assignment.id}`, resourceType: "assignment", resourceId: row.assignment.id,
      dedupeKey: existing ? `graded:${row.attempt.id}:${now.getTime()}` : `graded:${row.attempt.id}`,
    }]);

    if (outcome === "passed") await maybeCompleteRepeat(row.course.id, row.submission.studentId, actor.id, tx);
    return grade;
  });
}

/**
 * An active repeat requirement completes itself once every published
 * assignment in the course has a passing latest grade.
 */
async function maybeCompleteRepeat(courseId: string, studentId: string, actorId: string, tx: Tx) {
  const [repeat] = await tx.select().from(repeatRequirements)
    .where(and(eq(repeatRequirements.courseId, courseId), eq(repeatRequirements.studentId, studentId), eq(repeatRequirements.status, "active")));
  if (!repeat) return;
  const published = await tx.select({ id: assignments.id }).from(assignments)
    .where(and(eq(assignments.courseId, courseId), eq(assignments.status, "published")));
  if (published.length === 0) return;
  const subs = await tx.select({ s: submissions }).from(submissions)
    .where(and(eq(submissions.studentId, studentId), inArray(submissions.assignmentId, published.map((p) => p.id))));
  for (const p of published) {
    const s = subs.find((x) => x.s.assignmentId === p.id)?.s;
    if (!s) return;
    const g = await lastGradeFor(s.id, tx);
    if (!g || g.outcome !== "passed" || g.attemptNumber !== s.currentAttempt) return;
  }
  await tx.update(repeatRequirements).set({ status: "completed", resolvedAt: new Date(), resolvedById: actorId })
    .where(eq(repeatRequirements.id, repeat.id));
}

/* ── teacher: repeat learning ────────────────────────────────────────── */

export async function requireRepeat(actor: Actor, input: { courseId: string; studentId: string; reason: string; guidance?: string }) {
  return transaction(async (tx) => {
    const [course] = await tx.select().from(courses).where(eq(courses.id, input.courseId));
    if (!course) throw notFound();
    if (!(await canManageCourse(actor, course, tx))) throw forbidden("You are not assigned to this course.");
    const [student] = await tx.select().from(users).where(eq(users.id, input.studentId));
    if (!student || student.role !== "student") throw validationError("Choose a learner.");

    const [created] = await tx.insert(repeatRequirements).values({
      courseId: course.id, studentId: student.id, requiredById: actor.id, reason: input.reason, guidance: input.guidance ?? null,
    }).onConflictDoNothing().returning();
    if (!created) throw conflict(`${fullName(student)} is already revisiting this course.`);

    await notify(tx, [{
      recipientId: student.id, type: "repeat_required",
      title: `Keep learning: ${course.title}`,
      body: "Your teacher has opened this course for another go. Review the materials, then try the assessment again.",
      link: `/learn/courses/${course.id}`, resourceType: "course", resourceId: course.id,
      dedupeKey: `repeat:${created.id}`,
    }]);
    await audit({ actorId: actor.id, action: "repeat.required", entityType: "course", entityId: course.id, summary: `Asked ${fullName(student)} to revisit "${course.title}"`, metadata: { studentId: student.id } }, tx);
    return created;
  });
}

export async function resolveRepeat(actor: Actor, repeatId: string, status: "completed" | "cancelled") {
  await transaction(async (tx) => {
    const [r] = await tx.select({ repeat: repeatRequirements, course: courses }).from(repeatRequirements)
      .innerJoin(courses, eq(courses.id, repeatRequirements.courseId)).where(eq(repeatRequirements.id, repeatId));
    if (!r) throw notFound();
    if (!(await canManageCourse(actor, r.course, tx))) throw forbidden();
    if (r.repeat.status !== "active") return;
    await tx.update(repeatRequirements).set({ status, resolvedAt: new Date(), resolvedById: actor.id }).where(eq(repeatRequirements.id, repeatId));
  });
}

/* ── reading attempts & files ────────────────────────────────────────── */

export async function attemptFilesFor(attemptIds: string[], conn: DbOrTx = db) {
  if (attemptIds.length === 0) return [];
  return conn.select({ attemptId: attemptFiles.attemptId, file: files }).from(attemptFiles)
    .innerJoin(files, eq(files.id, attemptFiles.fileId))
    .where(inArray(attemptFiles.attemptId, attemptIds));
}

export async function gradedAttemptCount(submissionId: string, conn: Tx) {
  const [r] = await conn.select({ n: sql<number>`count(*)::int` }).from(grades)
    .innerJoin(submissionAttempts, eq(submissionAttempts.id, grades.attemptId))
    .where(and(eq(submissionAttempts.submissionId, submissionId), isNotNull(grades.score)));
  return r?.n ?? 0;
}

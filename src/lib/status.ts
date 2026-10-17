/**
 * The single source of truth for what an assignment's state means to a learner.
 *
 * The database stores a small set of underlying facts (attempt status, the
 * grade outcome, timestamps). Every label the UI shows — "Late submission",
 * "Revision required", "Ready for another attempt" — is derived here, so two
 * screens can never disagree about the same piece of work.
 */

export type ResubmissionPolicy = "none" | "on_request" | "until_passed";
export type GradeOutcome = "passed" | "not_passed" | "revision_requested";

export type StatusInput = {
  dueAt: Date;
  acceptLate: boolean;
  resubmissionPolicy: ResubmissionPolicy;
  maxAttempts: number | null;
  /** The newest attempt, or null if the learner has never opened it. */
  latest: {
    attemptNumber: number;
    status: "draft" | "submitted" | "graded";
    isLate: boolean;
    submittedAt: Date | null;
  } | null;
  /** Grade on the newest graded attempt (may be an earlier attempt than `latest`). */
  lastGrade: { outcome: GradeOutcome; score: number; maxScore: number; passMark: number; attemptNumber: number } | null;
  /** An active "keep learning" requirement on this assignment's course. */
  repeatActive: boolean;
  now: Date;
};

export type StatusKey =
  | "not_started"
  | "in_progress"
  | "overdue"
  | "submitted"
  | "late_submission"
  | "resubmitted"
  | "passed"
  | "not_passed"
  | "revision_required"
  | "ready_for_retry";

export type Tone = "neutral" | "info" | "brand" | "success" | "warning" | "danger";

export const STATUS_META: Record<StatusKey, { label: string; tone: Tone; hint: string }> = {
  not_started: { label: "Not started", tone: "neutral", hint: "Open the assignment to begin." },
  in_progress: { label: "In progress", tone: "info", hint: "Draft saved — submit when you're ready." },
  overdue: { label: "Overdue", tone: "danger", hint: "The deadline has passed and nothing has been handed in." },
  submitted: { label: "Awaiting grading", tone: "brand", hint: "Submitted on time. Your teacher will grade it soon." },
  late_submission: { label: "Late submission", tone: "warning", hint: "Submitted after the deadline. Awaiting grading." },
  resubmitted: { label: "Resubmission submitted", tone: "brand", hint: "Your new attempt is awaiting grading." },
  passed: { label: "Passed", tone: "success", hint: "You met the pass mark. Well done." },
  not_passed: { label: "Keep learning", tone: "warning", hint: "Below the pass mark this time — review the feedback." },
  revision_required: { label: "Revision required", tone: "warning", hint: "Your teacher asked for a revised attempt." },
  ready_for_retry: { label: "Ready for another attempt", tone: "info", hint: "You can revisit the course and try again." },
};

/** Coarse groups used by the to-do list and dashboards. */
export type Bucket = "to_start" | "in_progress" | "overdue" | "awaiting_grading" | "needs_action" | "done";

export const BUCKET_OF: Record<StatusKey, Bucket> = {
  not_started: "to_start",
  in_progress: "in_progress",
  overdue: "overdue",
  submitted: "awaiting_grading",
  late_submission: "awaiting_grading",
  resubmitted: "awaiting_grading",
  passed: "done",
  not_passed: "needs_action",
  revision_required: "needs_action",
  ready_for_retry: "needs_action",
};

export type DerivedStatus = {
  key: StatusKey;
  label: string;
  tone: Tone;
  hint: string;
  bucket: Bucket;
  /** The learner may type into / upload to the current draft and submit it. */
  canEditDraft: boolean;
  /** The learner may open a fresh attempt (revision, retry, repeat). */
  canStartNewAttempt: boolean;
  /** Attempts left under maxAttempts, or null if uncapped. */
  attemptsRemaining: number | null;
  isPastDue: boolean;
};

export function attemptsRemaining(maxAttempts: number | null, used: number): number | null {
  return maxAttempts === null ? null : Math.max(0, maxAttempts - used);
}

/** May a new attempt be opened after the newest graded one? */
export function retryAllowed(input: StatusInput): boolean {
  const { latest, lastGrade } = input;
  if (!latest || latest.status !== "graded" || !lastGrade) return false;
  const remaining = attemptsRemaining(input.maxAttempts, latest.attemptNumber);
  if (remaining !== null && remaining <= 0) return false;

  // An explicit teacher request always unlocks another attempt.
  if (lastGrade.outcome === "revision_requested") return true;
  // So does an active repeat-the-course requirement. Work already passed stays
  // passed — only the assessments the learner fell short on reopen.
  if (input.repeatActive && lastGrade.outcome !== "passed") return true;
  // Otherwise it depends on the assignment's policy.
  return input.resubmissionPolicy === "until_passed" && lastGrade.outcome === "not_passed";
}

export function deriveStatus(input: StatusInput): DerivedStatus {
  const { latest, lastGrade, now } = input;
  const isPastDue = now.getTime() > input.dueAt.getTime();
  const openForWork = !isPastDue || input.acceptLate;
  const remaining = attemptsRemaining(input.maxAttempts, latest?.attemptNumber ?? 0);

  let key: StatusKey;
  let canEditDraft = false;
  let canStartNewAttempt = false;

  if (!latest) {
    key = isPastDue ? "overdue" : "not_started";
    canStartNewAttempt = openForWork;
  } else if (latest.status === "draft") {
    if (latest.attemptNumber > 1 && lastGrade) {
      // A revision in progress: keep showing why the learner is working on it.
      key = lastGrade.outcome === "revision_requested" ? "revision_required" : "ready_for_retry";
      canEditDraft = true; // a teacher-opened retry is not blocked by the original deadline
    } else {
      key = isPastDue ? "overdue" : "in_progress";
      canEditDraft = openForWork;
    }
  } else if (latest.status === "submitted") {
    key = latest.attemptNumber > 1 ? "resubmitted" : latest.isLate ? "late_submission" : "submitted";
  } else {
    // graded
    const outcome = lastGrade?.outcome ?? "not_passed";
    canStartNewAttempt = retryAllowed(input);
    if (outcome === "revision_requested") key = "revision_required";
    else if (outcome === "passed") key = "passed";
    else key = input.repeatActive && canStartNewAttempt ? "ready_for_retry" : "not_passed";
  }

  const meta = STATUS_META[key];
  return {
    key,
    ...meta,
    bucket: BUCKET_OF[key],
    canEditDraft,
    canStartNewAttempt,
    attemptsRemaining: remaining,
    isPastDue,
  };
}

/** Outcome a teacher's score implies, unless they explicitly ask for a revision. */
export function outcomeFor(score: number, passMark: number, requestRevision: boolean): GradeOutcome {
  if (requestRevision) return "revision_requested";
  return score >= passMark ? "passed" : "not_passed";
}

/** Server-side score validation; mirrored by a CHECK constraint on `grades`. */
export function validateScore(score: unknown, maxScore: number): { ok: true; score: number } | { ok: false; error: string } {
  if (typeof score !== "number" || !Number.isFinite(score)) return { ok: false, error: "Enter a score." };
  if (!Number.isInteger(score)) return { ok: false, error: "Scores are whole numbers." };
  if (score < 0) return { ok: false, error: "A score cannot be negative." };
  if (score > maxScore) return { ok: false, error: `A score cannot exceed the maximum of ${maxScore}.` };
  return { ok: true, score };
}

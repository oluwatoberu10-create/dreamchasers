/**
 * Progress rules. Documented in README § "How progress is calculated".
 *
 *  1. The grade that counts for an assignment is the grade on its most recent
 *     graded attempt. Earlier attempts are kept and shown as history, but the
 *     learner's current standing is their latest assessed work.
 *  2. Ungraded work is never treated as zero. An assignment contributes to a
 *     score only once a teacher has graded it.
 *  3. Missing work (past the deadline, nothing handed in) is counted and shown
 *     as "outstanding" — it is not silently scored as zero either.
 *  4. The overall score is the mean of per-assignment percentages
 *     (score / max score) across graded assignments, and is always reported
 *     with how many assignments it is based on. With nothing graded there is
 *     no overall score at all, rather than a misleading 0%.
 */
import type { Bucket, GradeOutcome, StatusKey } from "./status";

export type ProgressItem = {
  assignmentId: string;
  dueAt: Date;
  statusKey: StatusKey;
  bucket: Bucket;
  /** Handed in at least once (any attempt submitted or graded). */
  everSubmitted: boolean;
  lastGrade: { score: number; maxScore: number; passMark: number; outcome: GradeOutcome } | null;
};

export type ProgressSummary = {
  assigned: number;
  submitted: number;
  outstanding: number;
  /** Past the deadline with nothing handed in. Subset of outstanding. */
  missing: number;
  awaitingGrading: number;
  graded: number;
  passed: number;
  notPassed: number;
  revisionRequired: number;
  /** Mean percentage across graded assignments, or null when nothing is graded. */
  averagePct: number | null;
  /** Sum of points across graded assignments (for "x / y" displays). */
  pointsEarned: number;
  pointsPossible: number;
};

export function summarize(items: ProgressItem[], now = new Date()): ProgressSummary {
  let submitted = 0, missing = 0, awaiting = 0, graded = 0, passed = 0, notPassed = 0, revision = 0;
  let pctSum = 0, earned = 0, possible = 0;

  for (const item of items) {
    if (item.everSubmitted) submitted++;
    else if (item.dueAt.getTime() < now.getTime()) missing++;
    if (item.bucket === "awaiting_grading") awaiting++;
    if (item.lastGrade) {
      graded++;
      pctSum += item.lastGrade.score / item.lastGrade.maxScore;
      earned += item.lastGrade.score;
      possible += item.lastGrade.maxScore;
      if (item.lastGrade.outcome === "passed") passed++;
      else if (item.lastGrade.outcome === "revision_requested") revision++;
      else notPassed++;
    }
  }

  return {
    assigned: items.length,
    submitted,
    outstanding: items.length - submitted,
    missing,
    awaitingGrading: awaiting,
    graded,
    passed,
    notPassed,
    revisionRequired: revision,
    averagePct: graded === 0 ? null : Math.round((pctSum / graded) * 100),
    pointsEarned: earned,
    pointsPossible: possible,
  };
}

export type WeekResult = "no_assessed_work" | "awaiting_evaluation" | "passed" | "not_passed" | "outstanding";
export type LearningStatus = "not_started" | "in_progress" | "completed" | "needs_revision";

export const WEEK_RESULT_LABEL: Record<WeekResult, string> = {
  no_assessed_work: "No assessed work",
  awaiting_evaluation: "Awaiting evaluation",
  passed: "Passed",
  not_passed: "Keep learning",
  outstanding: "Work outstanding",
};

export const LEARNING_STATUS_LABEL: Record<LearningStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  needs_revision: "Needs revision",
};

/**
 * Result for one week's assessed work. Distinguishes the three cases the spec
 * cares about: nothing handed in (outstanding), handed in but not graded
 * (awaiting evaluation), and graded below the mark (keep learning).
 */
export function weekResult(s: ProgressSummary): WeekResult {
  if (s.assigned === 0) return "no_assessed_work";
  if (s.notPassed > 0 || s.revisionRequired > 0) return "not_passed";
  if (s.missing > 0) return "outstanding";
  if (s.graded < s.assigned) return "awaiting_evaluation";
  return "passed";
}

export function learningStatus(
  s: ProgressSummary,
  opts: { coursesInWeek: number; coursesCompleted: number; coursesViewed: number; repeatActive: boolean },
): LearningStatus {
  if (opts.repeatActive || s.revisionRequired > 0 || s.notPassed > 0) return "needs_revision";
  const allWorkPassed = s.assigned === 0 ? true : s.passed === s.assigned;
  const allCoursesDone = opts.coursesInWeek === 0 ? true : opts.coursesCompleted >= opts.coursesInWeek;
  if (opts.coursesInWeek + s.assigned === 0) return "not_started";
  if (allWorkPassed && allCoursesDone) return "completed";
  if (opts.coursesViewed === 0 && s.submitted === 0) return "not_started";
  return "in_progress";
}

/** Improvement between first and latest graded attempt, in percentage points. */
export function improvement(attempts: { score: number; maxScore: number }[]): number | null {
  if (attempts.length < 2) return null;
  const first = attempts[0];
  const last = attempts[attempts.length - 1];
  return Math.round((last.score / last.maxScore - first.score / first.maxScore) * 100);
}

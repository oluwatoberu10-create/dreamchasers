import { describe, expect, it } from "vitest";
import { deriveStatus, outcomeFor, validateScore, type StatusInput } from "./status";

const due = new Date("2026-09-20T22:59:00Z");
const before = new Date("2026-09-19T10:00:00Z");
const after = new Date("2026-09-22T10:00:00Z");

function input(over: Partial<StatusInput>): StatusInput {
  return {
    dueAt: due, acceptLate: true, resubmissionPolicy: "on_request", maxAttempts: null,
    latest: null, lastGrade: null, repeatActive: false, now: before, ...over,
  };
}

const graded = (n: number) => ({ attemptNumber: n, status: "graded" as const, isLate: false, submittedAt: before });
const grade = (outcome: "passed" | "not_passed" | "revision_requested", score = 60) =>
  ({ outcome, score, maxScore: 100, passMark: 70, attemptNumber: 1 });

describe("deriveStatus", () => {
  it("not started vs overdue depends only on the deadline", () => {
    expect(deriveStatus(input({})).key).toBe("not_started");
    expect(deriveStatus(input({ now: after })).key).toBe("overdue");
    expect(deriveStatus(input({ now: after })).bucket).toBe("overdue");
  });

  it("blocks late work only when the teacher disallows it", () => {
    expect(deriveStatus(input({ now: after, acceptLate: true })).canStartNewAttempt).toBe(true);
    expect(deriveStatus(input({ now: after, acceptLate: false })).canStartNewAttempt).toBe(false);
    const draft = { attemptNumber: 1, status: "draft" as const, isLate: false, submittedAt: null };
    expect(deriveStatus(input({ now: after, acceptLate: false, latest: draft })).canEditDraft).toBe(false);
  });

  it("labels on-time, late and resubmitted work distinctly", () => {
    const sub = (n: number, isLate: boolean) => ({ attemptNumber: n, status: "submitted" as const, isLate, submittedAt: before });
    expect(deriveStatus(input({ latest: sub(1, false) })).key).toBe("submitted");
    expect(deriveStatus(input({ latest: sub(1, true) })).key).toBe("late_submission");
    expect(deriveStatus(input({ latest: sub(2, false), lastGrade: grade("revision_requested") })).key).toBe("resubmitted");
    expect(deriveStatus(input({ latest: sub(1, true) })).bucket).toBe("awaiting_grading");
  });

  it("passed work cannot be reopened, even during a repeat", () => {
    const s = deriveStatus(input({ latest: graded(1), lastGrade: grade("passed", 85), repeatActive: true, resubmissionPolicy: "until_passed" }));
    expect(s.key).toBe("passed");
    expect(s.canStartNewAttempt).toBe(false);
  });

  it("a revision request always unlocks a new attempt", () => {
    const s = deriveStatus(input({ latest: graded(1), lastGrade: grade("revision_requested"), resubmissionPolicy: "none" }));
    expect(s.key).toBe("revision_required");
    expect(s.canStartNewAttempt).toBe(true);
  });

  it("not passed reopens only under until_passed or an active repeat", () => {
    expect(deriveStatus(input({ latest: graded(1), lastGrade: grade("not_passed"), resubmissionPolicy: "on_request" })).canStartNewAttempt).toBe(false);
    expect(deriveStatus(input({ latest: graded(1), lastGrade: grade("not_passed"), resubmissionPolicy: "until_passed" })).canStartNewAttempt).toBe(true);
    const repeat = deriveStatus(input({ latest: graded(1), lastGrade: grade("not_passed"), repeatActive: true }));
    expect(repeat.key).toBe("ready_for_retry");
    expect(repeat.canStartNewAttempt).toBe(true);
  });

  it("respects the attempt cap", () => {
    const s = deriveStatus(input({ latest: graded(2), lastGrade: grade("revision_requested"), maxAttempts: 2 }));
    expect(s.canStartNewAttempt).toBe(false);
    expect(s.attemptsRemaining).toBe(0);
  });

  it("a revision draft keeps its reason and ignores the original deadline", () => {
    const draft2 = { attemptNumber: 2, status: "draft" as const, isLate: false, submittedAt: null };
    const s = deriveStatus(input({ now: after, acceptLate: false, latest: draft2, lastGrade: grade("revision_requested") }));
    expect(s.key).toBe("revision_required");
    expect(s.canEditDraft).toBe(true);
  });
});

describe("grading rules", () => {
  it("compares against the configured pass mark", () => {
    expect(outcomeFor(85, 70, false)).toBe("passed");
    expect(outcomeFor(70, 70, false)).toBe("passed");
    expect(outcomeFor(55, 70, false)).toBe("not_passed");
    expect(outcomeFor(95, 70, true)).toBe("revision_requested");
  });

  it("rejects out-of-range scores", () => {
    expect(validateScore(-1, 100).ok).toBe(false);
    expect(validateScore(101, 100).ok).toBe(false);
    expect(validateScore(12.5, 100).ok).toBe(false);
    expect(validateScore(Number.NaN, 100).ok).toBe(false);
    expect(validateScore(0, 100)).toEqual({ ok: true, score: 0 });
    expect(validateScore(100, 100)).toEqual({ ok: true, score: 100 });
  });
});

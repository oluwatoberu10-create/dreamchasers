import { describe, expect, it } from "vitest";
import { improvement, learningStatus, summarize, weekResult, type ProgressItem } from "./progress";

const now = new Date("2026-09-25T12:00:00Z");
const past = new Date("2026-09-20T12:00:00Z");
const future = new Date("2026-09-30T12:00:00Z");

function item(over: Partial<ProgressItem>): ProgressItem {
  return { assignmentId: "a", dueAt: future, statusKey: "not_started", bucket: "to_start", everSubmitted: false, lastGrade: null, ...over };
}

describe("summarize", () => {
  it("never scores ungraded or missing work as zero", () => {
    const s = summarize([
      item({ everSubmitted: true, bucket: "awaiting_grading", statusKey: "submitted" }),
      item({ dueAt: past, statusKey: "overdue", bucket: "overdue" }),
      item({ everSubmitted: true, bucket: "done", lastGrade: { score: 80, maxScore: 100, passMark: 70, outcome: "passed" } }),
    ], now);
    expect(s.averagePct).toBe(80);
    expect(s.graded).toBe(1);
    expect(s.awaitingGrading).toBe(1);
    expect(s.missing).toBe(1);
    expect(s.outstanding).toBe(1);
  });

  it("has no average at all when nothing is graded", () => {
    expect(summarize([item({})], now).averagePct).toBeNull();
    expect(summarize([], now).averagePct).toBeNull();
  });

  it("averages percentages, not raw points", () => {
    const s = summarize([
      item({ everSubmitted: true, lastGrade: { score: 10, maxScore: 10, passMark: 5, outcome: "passed" } }),
      item({ everSubmitted: true, lastGrade: { score: 50, maxScore: 100, passMark: 70, outcome: "not_passed" } }),
    ], now);
    expect(s.averagePct).toBe(75);
    expect(s.pointsEarned).toBe(60);
    expect(s.passed).toBe(1);
    expect(s.notPassed).toBe(1);
  });
});

describe("weekResult", () => {
  const base = summarize([], now);
  it("distinguishes missing, ungraded and failed", () => {
    expect(weekResult(base)).toBe("no_assessed_work");
    expect(weekResult({ ...base, assigned: 2, submitted: 1, missing: 1, outstanding: 1, graded: 1, passed: 1 })).toBe("outstanding");
    expect(weekResult({ ...base, assigned: 2, submitted: 2, graded: 1, passed: 1, awaitingGrading: 1 })).toBe("awaiting_evaluation");
    expect(weekResult({ ...base, assigned: 2, submitted: 2, graded: 2, passed: 1, notPassed: 1 })).toBe("not_passed");
    expect(weekResult({ ...base, assigned: 2, submitted: 2, graded: 2, passed: 2 })).toBe("passed");
  });
});

describe("learningStatus", () => {
  const s = summarize([], now);
  it("flags revision whenever a repeat is active", () => {
    expect(learningStatus({ ...s, assigned: 1, passed: 1, graded: 1 }, { coursesInWeek: 1, coursesCompleted: 1, coursesViewed: 1, repeatActive: true })).toBe("needs_revision");
  });
  it("is completed only when work is passed and courses are done", () => {
    expect(learningStatus({ ...s, assigned: 1, passed: 1, graded: 1, submitted: 1 }, { coursesInWeek: 1, coursesCompleted: 1, coursesViewed: 1, repeatActive: false })).toBe("completed");
    expect(learningStatus({ ...s, assigned: 1, passed: 1, graded: 1, submitted: 1 }, { coursesInWeek: 1, coursesCompleted: 0, coursesViewed: 1, repeatActive: false })).toBe("in_progress");
    expect(learningStatus({ ...s, assigned: 1 }, { coursesInWeek: 1, coursesCompleted: 0, coursesViewed: 0, repeatActive: false })).toBe("not_started");
  });
});

describe("improvement", () => {
  it("compares first and latest graded attempt", () => {
    expect(improvement([{ score: 55, maxScore: 100 }, { score: 82, maxScore: 100 }])).toBe(27);
    expect(improvement([{ score: 55, maxScore: 100 }])).toBeNull();
  });
});

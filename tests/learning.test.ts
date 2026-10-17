import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { closePool } from "@/db/migrate";
import { improvement, summarize } from "@/lib/progress";
import { loadViewableSubmission, studentCanViewCourse } from "@/server/policy";
import { createAssignment } from "@/server/services/assignments";
import { createCourse, publishDueCourses, setPublication, updateCourse } from "@/server/services/courses";
import { studentRecord, toProgressItems } from "@/server/services/learner";
import { gradeAttempt, requireRepeat, saveDraft, startAttempt, submitWork } from "@/server/services/submissions";
import { assignmentRoster, gradingQueue } from "@/server/services/teaching";
import { localInput, notificationsFor, wipe, world } from "./helpers";

beforeAll(wipe);
afterAll(closePool);

type W = Awaited<ReturnType<typeof world>>;

async function liveCourse(w: W, weekIndex = 1) {
  const course = await createCourse(w.teacher, {
    title: "Fractions", content: "# Hi", objectives: ["one"], trackId: w.track.id, weekId: w.weeks[weekIndex].id,
  });
  await setPublication(w.teacher, course.id, { mode: "now" });
  return course;
}

const assignmentInput = (courseId: string, today: string, over: Partial<Parameters<typeof createAssignment>[1]> = {}) => ({
  courseId, kind: "assessment" as const, title: "Test 1", instructions: "Answer all", maxScore: 100, passMark: 70,
  dueAtLocal: localInput(today, 3), allowText: true, allowFiles: false, acceptLate: true,
  resubmissionPolicy: "on_request" as const, rubric: [], publish: true, ...over,
});

describe("weekly courses", () => {
  it("drafts are invisible to learners; publishing reveals and announces them", async () => {
    const w = await world();
    const course = await createCourse(w.teacher, { title: "Draft course", content: "", objectives: [], trackId: w.track.id, weekId: w.weeks[1].id });
    expect(course.status).toBe("draft");
    expect(await studentCanViewCourse(w.alice, course)).toBe(false);
    expect((await studentRecord(w.alice.id, w.program, w.weeks)).courses).toHaveLength(0);

    const published = await setPublication(w.teacher, course.id, { mode: "now" });
    expect(published.status).toBe("published");
    expect(await studentCanViewCourse(w.alice, published)).toBe(true);
    const n = await notificationsFor(w.alice.id);
    expect(n.filter((x) => x.type === "course_published" && x.resourceId === course.id)).toHaveLength(1);
    expect(n[0].link).toBe(`/learn/courses/${course.id}`);
    // Publishing again does not notify twice.
    await setPublication(w.teacher, course.id, { mode: "now" });
    expect((await notificationsFor(w.alice.id)).filter((x) => x.type === "course_published")).toHaveLength(1);
  });

  it("a teacher cannot create courses on a track they are not assigned to", async () => {
    const w = await world();
    await expect(createCourse(w.teacher, { title: "X", content: "", objectives: [], trackId: w.otherTrack.id, weekId: w.weeks[0].id })).rejects.toThrow(/not assigned/);
    await expect(createCourse(w.alice, { title: "X", content: "", objectives: [], trackId: w.track.id, weekId: w.weeks[0].id })).rejects.toThrow();
  });

  it("a super admin can teach without a separate account", async () => {
    const w = await world();
    const c = await createCourse(w.admin, { title: "Admin-taught", content: "", objectives: [], trackId: w.otherTrack.id, weekId: w.weeks[0].id, teacherId: w.admin.id });
    expect(c.teacherId).toBe(w.admin.id);
  });

  it("a super admin can name a course and hand it to a teacher, who then builds it", async () => {
    const w = await world();
    const c = await createCourse(w.admin, { title: "Public speaking", content: "", objectives: [], teacherId: w.otherTeacher.id, weekId: w.weeks[2].id });
    expect(c.teacherId).toBe(w.otherTeacher.id);
    const [track] = await db.select().from(s.tracks).where(eq(s.tracks.id, c.trackId));
    expect([track.name, track.weekFrom, track.weekTo]).toEqual(["Public speaking", 3, 3]);
    const assigned = (await notificationsFor(w.otherTeacher.id)).filter((n) => n.resourceId === c.id);
    expect(assigned).toHaveLength(1);
    expect(assigned[0].link).toBe(`/teach/courses/${c.id}`);

    // The teacher fills it in and moves it to another week; its own track follows.
    const edited = await updateCourse(w.otherTeacher, c.id, { title: "Public speaking", content: "# Week one", objectives: ["Speak clearly"], weekId: w.weeks[4].id });
    expect(edited.content).toBe("# Week one");
    const [moved] = await db.select().from(s.tracks).where(eq(s.tracks.id, c.trackId));
    expect([moved.weekFrom, moved.weekTo]).toEqual([5, 5]);
    // Others still can't touch it, and a same-named course gets its own track.
    await expect(updateCourse(w.teacher, c.id, { title: "Hijack", content: "", objectives: [], weekId: w.weeks[0].id })).rejects.toThrow(/not assigned/);
    const twin = await createCourse(w.admin, { title: "Public speaking", content: "", objectives: [], teacherId: w.teacher.id, weekId: w.weeks[1].id });
    expect(twin.trackId).not.toBe(c.trackId);
  });

  it("scheduled courses publish on time and notify exactly once", async () => {
    const w = await world();
    const course = await createCourse(w.teacher, { title: "Later", content: "", objectives: [], trackId: w.track.id, weekId: w.weeks[2].id });
    await setPublication(w.teacher, course.id, { mode: "schedule", publishAtLocal: localInput(w.today, 2, "09:00") });
    const [row] = await db.select().from(s.courses).where(eq(s.courses.id, course.id));
    expect(row.status).toBe("scheduled");
    expect(await studentCanViewCourse(w.alice, row)).toBe(false);

    const future = new Date(row.publishAt!.getTime() + 60_000);
    await db.update(s.courses).set({ publishAt: new Date(Date.now() - 1000) }).where(eq(s.courses.id, course.id));
    expect(await publishDueCourses(future)).toBe(1);
    expect(await publishDueCourses(future)).toBe(0);
    const published = (await notificationsFor(w.bob.id)).filter((x) => x.type === "course_published" && x.resourceId === course.id);
    expect(published).toHaveLength(1);
  });
});

describe("assignments, submission and grading", () => {
  it("rejects a pass mark above the maximum", async () => {
    const w = await world();
    const c = await liveCourse(w);
    await expect(createAssignment(w.teacher, assignmentInput(c.id, w.today, { passMark: 120 }))).rejects.toThrow(/pass mark/);
  });

  it("a written submission persists, notifies staff, and is idempotent", async () => {
    const w = await world();
    const c = await liveCourse(w);
    const a = await createAssignment(w.teacher, assignmentInput(c.id, w.today));
    await saveDraft(w.alice, a.id, "draft text");
    const first = await submitWork(w.alice, a.id, "final answer");
    const again = await submitWork(w.alice, a.id, "final answer");
    expect(first.duplicate).toBe(false);
    expect(again.duplicate).toBe(true);

    const attempts = await db.select().from(s.submissionAttempts);
    expect(attempts.filter((x) => x.body === "final answer")).toHaveLength(1);
    expect(first.attempt.status).toBe("submitted");
    expect(first.attempt.isLate).toBe(false);

    const teacherN = (await notificationsFor(w.teacher.id)).filter((x) => x.type === "assignment_submitted");
    const adminN = (await notificationsFor(w.admin.id)).filter((x) => x.type === "assignment_submitted");
    expect(teacherN).toHaveLength(1);
    expect(adminN).toHaveLength(1);
    expect(teacherN[0].link).toBe(`/teach/grading/${first.attempt.id}`);
    // Learners cannot submit empty work.
    await expect(submitWork(w.bob, a.id, "   ")).rejects.toThrow(/Write your response/);
  });

  it("validates scores, computes pass/fail against the configured mark, and notifies the learner", async () => {
    const w = await world();
    const c = await liveCourse(w);
    const a = await createAssignment(w.teacher, assignmentInput(c.id, w.today));
    const { attempt } = await submitWork(w.alice, a.id, "work");

    await expect(gradeAttempt(w.teacher, { attemptId: attempt.id, score: 101, feedback: "", requestRevision: false })).rejects.toThrow(/exceed/);
    await expect(gradeAttempt(w.teacher, { attemptId: attempt.id, score: -5, feedback: "", requestRevision: false })).rejects.toThrow(/negative/);
    await expect(gradeAttempt(w.otherTeacher, { attemptId: attempt.id, score: 80, feedback: "", requestRevision: false })).rejects.toThrow(/not assigned/);
    await expect(gradeAttempt(w.bob, { attemptId: attempt.id, score: 80, feedback: "", requestRevision: false })).rejects.toThrow();

    const g = await gradeAttempt(w.teacher, { attemptId: attempt.id, score: 85, feedback: "Great", requestRevision: false });
    expect(g.outcome).toBe("passed");
    expect(g.gradedById).toBe(w.teacher.id);
    const rec = await studentRecord(w.alice.id, w.program, w.weeks);
    expect(rec.work[0].status.key).toBe("passed");
    expect((await notificationsFor(w.alice.id)).some((n) => n.type === "assignment_graded" && n.body.includes("85/100"))).toBe(true);

    // The database refuses an out-of-range grade even if application code is bypassed.
    await expect(db.execute(sql`update grades set score = 500 where id = ${g.id}`)).rejects.toThrow();
    await expect(db.execute(sql`update grades set outcome = 'passed', score = 10 where id = ${g.id}`)).rejects.toThrow();
  });

  it("55 against a pass mark of 70 is not passed", async () => {
    const w = await world();
    const c = await liveCourse(w);
    const a = await createAssignment(w.teacher, assignmentInput(c.id, w.today));
    const { attempt } = await submitWork(w.alice, a.id, "work");
    const g = await gradeAttempt(w.teacher, { attemptId: attempt.id, score: 55, feedback: "", requestRevision: false });
    expect(g.outcome).toBe("not_passed");
    const rec = await studentRecord(w.alice.id, w.program, w.weeks);
    expect(rec.work[0].status.key).toBe("not_passed");
    expect(rec.work[0].status.label).toBe("Keep learning");
  });

  it("a learner cannot open another learner's submission", async () => {
    const w = await world();
    const c = await liveCourse(w);
    const a = await createAssignment(w.teacher, assignmentInput(c.id, w.today));
    await submitWork(w.alice, a.id, "mine");
    const [sub] = await db.select().from(s.submissions).where(eq(s.submissions.studentId, w.alice.id));
    await expect(loadViewableSubmission(w.bob, sub.id)).rejects.toThrow(/cannot view/);
    await expect(loadViewableSubmission(w.otherTeacher, sub.id)).rejects.toThrow(/cannot view/);
    expect((await loadViewableSubmission(w.alice, sub.id)).submission.id).toBe(sub.id);
    expect((await loadViewableSubmission(w.teacher, sub.id)).submission.id).toBe(sub.id);
  });

  it("revisions keep every earlier attempt and grade", async () => {
    const w = await world();
    const c = await liveCourse(w);
    const a = await createAssignment(w.teacher, assignmentInput(c.id, w.today, { resubmissionPolicy: "none" }));
    const first = await submitWork(w.alice, a.id, "v1");
    await gradeAttempt(w.teacher, { attemptId: first.attempt.id, score: 60, feedback: "Add evidence", requestRevision: true });
    expect((await notificationsFor(w.alice.id)).some((n) => n.type === "revision_requested")).toBe(true);

    const { draft } = await startAttempt(w.alice, a.id);
    expect(draft.attemptNumber).toBe(2);
    expect(draft.body).toBe("v1"); // starts from the previous text
    const second = await submitWork(w.alice, a.id, "v2 with evidence");
    // The old attempt can no longer be graded once a newer one exists.
    await expect(gradeAttempt(w.teacher, { attemptId: first.attempt.id, score: 90, feedback: "", requestRevision: false })).rejects.toThrow(/newer attempt/);
    await gradeAttempt(w.teacher, { attemptId: second.attempt.id, score: 88, feedback: "Much better", requestRevision: false });

    const rec = await studentRecord(w.alice.id, w.program, w.weeks);
    const item = rec.work[0];
    expect(item.attempts).toHaveLength(2);
    expect(item.attempts[0].grade?.score).toBe(60);
    expect(item.attempts[0].grade?.feedback).toBe("Add evidence");
    expect(item.attempts[1].grade?.score).toBe(88);
    expect(improvement(item.attempts.map((x) => x.grade!))).toBe(28);
    // With policy "none" and a pass, no further attempt is offered.
    expect(item.status.canStartNewAttempt).toBe(false);
    await expect(startAttempt(w.alice, a.id)).rejects.toThrow(/not available/);
  });

  it("repeating a course reopens it without losing work, and completes itself on a pass", async () => {
    const w = await world();
    const c = await liveCourse(w);
    const a = await createAssignment(w.teacher, assignmentInput(c.id, w.today));
    const first = await submitWork(w.alice, a.id, "attempt one");
    await gradeAttempt(w.teacher, { attemptId: first.attempt.id, score: 40, feedback: "Revisit section 2", requestRevision: false });
    await expect(startAttempt(w.alice, a.id)).rejects.toThrow(); // on_request + not passed: closed…

    const repeat = await requireRepeat(w.teacher, { courseId: c.id, studentId: w.alice.id, reason: "Below the pass mark", guidance: "Watch the video again" });
    await expect(requireRepeat(w.teacher, { courseId: c.id, studentId: w.alice.id, reason: "again" })).rejects.toThrow(/already/);
    expect((await notificationsFor(w.alice.id)).some((n) => n.type === "repeat_required")).toBe(true);

    let rec = await studentRecord(w.alice.id, w.program, w.weeks);
    expect(rec.work[0].status.key).toBe("ready_for_retry"); // …until the teacher reopens it

    await startAttempt(w.alice, a.id);
    const second = await submitWork(w.alice, a.id, "attempt two");
    await gradeAttempt(w.teacher, { attemptId: second.attempt.id, score: 75, feedback: "Passed now", requestRevision: false });

    const [after] = await db.select().from(s.repeatRequirements).where(eq(s.repeatRequirements.id, repeat.id));
    expect(after.status).toBe("completed");
    rec = await studentRecord(w.alice.id, w.program, w.weeks);
    expect(rec.work[0].attempts.map((x) => x.grade?.score)).toEqual([40, 75]);
    expect(rec.work[0].status.key).toBe("passed");
  });

  it("missing work is identifiable, and ungraded work is not counted as a fail", async () => {
    const w = await world();
    const c = await liveCourse(w, 0);
    const a = await createAssignment(w.teacher, assignmentInput(c.id, w.today, { dueAtLocal: localInput(w.today, -2) }));
    const late = await submitWork(w.alice, a.id, "late but here");
    expect(late.attempt.isLate).toBe(true);

    const roster = await assignmentRoster(a, w.program.id);
    expect(roster.find((r) => r.student.id === w.bob.id)?.state).toBe("missing");
    expect(roster.find((r) => r.student.id === w.alice.id)?.state).toBe("awaiting");

    const queue = await gradingQueue(w.teacher, w.program.id, "awaiting");
    expect(queue.map((q) => q.attempt.id)).toContain(late.attempt.id);
    expect(await gradingQueue(w.otherTeacher, w.program.id, "awaiting")).toHaveLength(0);

    const recA = await studentRecord(w.alice.id, w.program, w.weeks);
    const sumA = summarize(toProgressItems(recA.work));
    expect(sumA.awaitingGrading).toBe(1);
    expect(sumA.averagePct).toBeNull();
    expect(sumA.notPassed).toBe(0);
    const sumB = summarize(toProgressItems((await studentRecord(w.bob.id, w.program, w.weeks)).work));
    expect(sumB.missing).toBe(1);
    expect(recA.work[0].status.key).toBe("late_submission");
  });

  it("a learner who joins later is not marked missing for earlier deadlines", async () => {
    const w = await world();
    const c = await liveCourse(w, 0);
    const a = await createAssignment(w.teacher, assignmentInput(c.id, w.today, { dueAtLocal: localInput(w.today, -2) }));
    const [late] = await db.insert(s.users).values({ email: `late-${Date.now()}@test.local`, passwordHash: "x", firstName: "Late", lastName: "Joiner" }).returning();
    await db.insert(s.enrollments).values({ programId: w.program.id, studentId: late.id }); // enrolled now, after the deadline

    const rec = await studentRecord(late.id, w.program, w.weeks);
    expect(rec.courses.map((x) => x.course.id)).toContain(c.id); // the course is still readable
    expect(rec.work).toHaveLength(0);                             // …but its past deadline isn't expected
    const roster = await assignmentRoster(a, w.program.id);
    expect(roster.find((r) => r.student.id === late.id)?.state).toBe("joined_later");
    expect(roster.find((r) => r.student.id === w.bob.id)?.state).toBe("missing");
  });

  it("late work is refused when the teacher disallows it", async () => {
    const w = await world();
    const c = await liveCourse(w, 0);
    const a = await createAssignment(w.teacher, assignmentInput(c.id, w.today, { dueAtLocal: localInput(w.today, -1), acceptLate: false }));
    await expect(submitWork(w.alice, a.id, "too late")).rejects.toThrow(/deadline has passed/);
    const subs = await db.select().from(s.submissions).where(and(eq(s.submissions.assignmentId, a.id), eq(s.submissions.studentId, w.alice.id)));
    expect(subs).toHaveLength(0);
  });

  it("learners cannot work on draft assignments or unpublished courses", async () => {
    const w = await world();
    const draftCourse = await createCourse(w.teacher, { title: "Hidden", content: "", objectives: [], trackId: w.track.id, weekId: w.weeks[1].id });
    const a = await createAssignment(w.teacher, assignmentInput(draftCourse.id, w.today));
    await expect(submitWork(w.alice, a.id, "sneaky")).rejects.toThrow(/not available/);
  });
});

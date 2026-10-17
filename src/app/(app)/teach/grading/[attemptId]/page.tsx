import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assignments, courses, grades, repeatRequirements, submissionAttempts, submissions, users } from "@/db/schema";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, Notice } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { Prose } from "@/components/prose";
import { improvement } from "@/lib/progress";
import { formatDateTime, relativeTime } from "@/lib/utils";
import { canManageCourse } from "@/server/policy";
import { attemptFilesFor, } from "@/server/services/submissions";
import { gradingQueue } from "@/server/services/teaching";
import { teacherContext } from "../../data";
import { GradeForm, RepeatForm } from "./client";
import { FollowUp } from "../../assignments/[id]/client";

export const metadata = { title: "Grade submission" };

export default async function GradeWorkspace({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const ctx = await teacherContext();
  if (!ctx.program || !/^[0-9a-f-]{36}$/i.test(attemptId)) notFound();

  const [row] = await db.select({ attempt: submissionAttempts, submission: submissions, assignment: assignments, course: courses, student: users })
    .from(submissionAttempts)
    .innerJoin(submissions, eq(submissions.id, submissionAttempts.submissionId))
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .innerJoin(users, eq(users.id, submissions.studentId))
    .where(eq(submissionAttempts.id, attemptId)).limit(1);
  // Only staff who manage the course can open a submission. Others get a 404.
  if (!row || !(await canManageCourse(ctx.user, row.course))) notFound();
  const { attempt, submission, assignment: a, course, student } = row;
  const tz = ctx.program.timezone;

  const history = await db.select({ attempt: submissionAttempts, grade: grades, grader: { firstName: users.firstName, lastName: users.lastName } })
    .from(submissionAttempts).leftJoin(grades, eq(grades.attemptId, submissionAttempts.id)).leftJoin(users, eq(users.id, grades.gradedById))
    .where(eq(submissionAttempts.submissionId, submission.id)).orderBy(asc(submissionAttempts.attemptNumber));
  const files = await attemptFilesFor(history.map((h) => h.attempt.id));
  const current = history.find((h) => h.attempt.id === attemptId)!;
  const isLatest = attempt.attemptNumber === submission.currentAttempt;
  const latest = history.find((h) => h.attempt.attemptNumber === submission.currentAttempt);
  const gain = improvement(history.filter((h) => h.grade).map((h) => h.grade!));
  const [repeat] = await db.select().from(repeatRequirements)
    .where(and(eq(repeatRequirements.courseId, course.id), eq(repeatRequirements.studentId, student.id), eq(repeatRequirements.status, "active")));
  const queue = (await gradingQueue(ctx.user, ctx.program.id, "awaiting", 50)).filter((q) => q.attempt.id !== attemptId);
  const deadlineNote = attempt.isLate ? "Submitted after the deadline" : attempt.attemptNumber > 1 ? "Resubmission" : "Submitted on time";

  return (
    <>
      <PageHeader back={{ href: "/teach/grading", label: "Grading queue" }} eyebrow={`${course.title} · attempt ${attempt.attemptNumber}`}
        title={a.title}
        description={<span className="inline-flex items-center gap-2"><Avatar firstName={student.firstName} lastName={student.lastName} size={22} /><Link href={`/teach/students/${student.id}`} className="font-semibold hover:underline">{student.firstName} {student.lastName}</Link></span>}
        actions={queue[0] && <Link href={`/teach/grading/${queue[0].attempt.id}`} className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold hover:bg-[var(--surface-2)]">Next in queue<Icon name="chevronRight" className="h-4 w-4" /></Link>} />

      {!isLatest && latest && <div className="mb-6"><Notice tone="info" title="This is an earlier attempt">It's kept for history and can't be regraded. <Link href={`/teach/grading/${latest.attempt.id}`} className="font-semibold underline">Open attempt {latest.attempt.attemptNumber}</Link></Notice></div>}
      {attempt.status === "draft" && <div className="mb-6"><Notice tone="warning" title="Not handed in yet">The learner is still working on this attempt.</Notice></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Submission" description={<>{deadlineNote} · {formatDateTime(attempt.submittedAt, tz)} · deadline {formatDateTime(a.dueAt, tz)}</>}
              action={attempt.isLate ? <Badge tone="warning">Late</Badge> : <Badge tone="success">On time</Badge>} />
            <CardBody className="space-y-4">
              {attempt.reason && <p className="text-[13px] text-[var(--text-muted)]">{attempt.reason}</p>}
              {attempt.body.trim() ? <div className="whitespace-pre-wrap rounded-lg bg-[var(--surface-2)] px-4 py-3.5 text-[14.5px] leading-relaxed">{attempt.body}</div> : <p className="text-[13.5px] text-[var(--text-muted)]">No written response.</p>}
              {files.filter((f) => f.attemptId === attemptId).length > 0 && (
                <div>
                  <div className="mb-1.5 text-[13px] font-semibold">Files</div>
                  <ul className="flex flex-wrap gap-2">{files.filter((f) => f.attemptId === attemptId).map((f) => (
                    <li key={f.file.id} className="flex overflow-hidden rounded-lg border border-[var(--border)] text-[12.5px] font-semibold">
                      <a href={`/api/files/${f.file.id}?inline=1`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-[var(--surface-2)]"><Icon name="paperclip" className="h-3.5 w-3.5" />{f.file.originalName}</a>
                      <a href={`/api/files/${f.file.id}`} className="border-l border-[var(--border)] px-2 py-1.5 hover:bg-[var(--surface-2)]" aria-label={`Download ${f.file.originalName}`}><Icon name="download" className="h-3.5 w-3.5" /></a>
                    </li>
                  ))}</ul>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Instructions" />
            <CardBody><Prose source={a.instructions} small /></CardBody>
          </Card>

          {history.length > 1 && (
            <Card>
              <CardHeader title="All attempts" description={gain !== null ? `${gain >= 0 ? "+" : ""}${gain} points between first and latest graded attempt` : "Every attempt is preserved."} />
              <ol className="divide-y divide-[var(--border)]">
                {history.map((h) => (
                  <li key={h.attempt.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13.5px]">
                    <Link href={`/teach/grading/${h.attempt.id}`} className={h.attempt.id === attemptId ? "font-extrabold" : "font-semibold hover:underline"}>Attempt {h.attempt.attemptNumber}</Link>
                    <span className="text-[var(--text-muted)]">{h.attempt.submittedAt ? formatDateTime(h.attempt.submittedAt, tz) : "Draft"}</span>
                    <span className="flex-1" />
                    {h.grade ? <Badge tone={h.grade.outcome === "passed" ? "success" : "warning"}>{h.grade.score}/{h.grade.maxScore}{h.grader ? ` · ${h.grader.firstName}` : ""}</Badge> : <Badge>{h.attempt.status === "draft" ? "In progress" : "Ungraded"}</Badge>}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={current.grade ? "Grade (edit)" : "Grade"} description={`Maximum ${a.maxScore} · pass mark ${a.passMark}`} />
            <CardBody>
              {isLatest && attempt.status !== "draft" ? (
                <GradeForm attemptId={attemptId} maxScore={a.maxScore} passMark={a.passMark} rubric={a.rubric}
                  initial={current.grade ? { score: current.grade.score, feedback: current.grade.feedback, revision: current.grade.outcome === "revision_requested", rubricScores: current.grade.rubricScores } : null} />
              ) : current.grade ? (
                <div className="space-y-2 text-[13.5px]"><div className="tnum text-[24px] font-extrabold">{current.grade.score}/{current.grade.maxScore}</div><Prose source={current.grade.feedback} small /></div>
              ) : <p className="text-[13.5px] text-[var(--text-muted)]">Nothing to grade yet.</p>}
              {current.grade && <p className="mt-3 text-[12px] text-[var(--text-subtle)]">Graded by {current.grader?.firstName} {current.grader?.lastName} {relativeTime(current.grade.gradedAt)}. Learner has been notified.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Keep learning" description="Ask the learner to revisit the whole course. Nothing is deleted." />
            <CardBody>
              {repeat ? (
                <Notice tone="info" icon="repeat" title="Revisiting this course">{repeat.reason}</Notice>
              ) : <RepeatForm courseId={course.id} studentId={student.id} firstName={student.firstName} />}
            </CardBody>
          </Card>

          <Card><CardBody className="flex items-center justify-between gap-3">
            <span className="text-[13.5px]">Need to talk it through?</span>
            <FollowUpMessage studentId={student.id} firstName={student.firstName} title={a.title} />
          </CardBody></Card>
        </div>
      </div>
    </>
  );
}

function FollowUpMessage({ studentId, firstName, title }: { studentId: string; firstName: string; title: string }) {
  return <FollowUp studentId={studentId} firstName={firstName} assignmentTitle={title} late={false} />;
}

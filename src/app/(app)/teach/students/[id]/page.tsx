import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, Notice } from "@/components/ui/feedback";
import { ProgressReport } from "@/components/progress-report";
import { formatDateTime } from "@/lib/utils";
import { canViewStudent, isEnrolled, journalAccess } from "@/server/policy";
import { journalHistory, JOURNAL_PROMPTS } from "@/server/services/journal";
import { buildWeekEvaluations, studentRecord } from "@/server/services/learner";
import { teacherContext } from "../../data";
import { FollowUp } from "../../assignments/[id]/client";
import { EvaluationForm } from "./client";

export default async function StudentProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await teacherContext();
  if (!ctx.program || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [student] = await db.select().from(users).where(eq(users.id, id));
  if (!student || student.role !== "student" || !(await canViewStudent(ctx.user, id))) notFound();
  if (!(await isEnrolled(id, ctx.program.id))) {
    return <><PageHeader back={{ href: "/teach/students", label: "Students" }} title={`${student.firstName} ${student.lastName}`} /><Card><EmptyState icon="team" title="Not enrolled in the current programme" /></Card></>;
  }

  const record = await studentRecord(id, ctx.program, ctx.weeks);
  const evaluations = await buildWeekEvaluations(id, record, ctx.weeks, ctx.clock.today);
  const journals = await journalHistory(id, ctx.program.id);
  const access = await Promise.all(journals.map(async (j) => ({ ...j, access: await journalAccess(ctx.user, j.entry) })));
  const readable = access.filter((j) => j.access === "teacher_review" || j.access === "owner");
  const evalWeek = ctx.clock.currentWeek ?? ctx.weeks[ctx.weeks.length - 1];
  const existingComment = evaluations.find((e) => e.week.id === evalWeek?.id)?.comment;

  return (
    <>
      <PageHeader back={{ href: "/teach/students", label: "Students" }}
        title={<span className="inline-flex items-center gap-3"><Avatar firstName={student.firstName} lastName={student.lastName} size={44} />{student.firstName} {student.lastName}</span>}
        description={student.bio ?? `Joined ${formatDateTime(student.createdAt, ctx.program.timezone, { day: "numeric", month: "short", year: "numeric" })}`}
        actions={<FollowUp studentId={id} firstName={student.firstName} assignmentTitle="your recent work" late />} />

      <ProgressReport program={ctx.program} weeks={ctx.weeks} clock={ctx.clock} record={record} evaluations={evaluations} linkBase="teacher" />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Submission history" description="Every attempt, newest first" />
          {record.work.filter((w) => w.attempts.some((a) => a.status !== "draft")).length === 0 ? <EmptyState compact icon="inbox" title="Nothing handed in yet" /> : (
            <ul className="max-h-[480px] divide-y divide-[var(--border)] overflow-y-auto">
              {record.work.flatMap((w) => w.attempts.filter((a) => a.status !== "draft").map((a) => ({ w, a })))
                .sort((x, y) => +(y.a.submittedAt ?? 0) - +(x.a.submittedAt ?? 0))
                .map(({ w, a }) => (
                  <li key={a.id}><a href={`/teach/grading/${a.id}`} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13.5px] hover:bg-[var(--surface-2)]">
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{w.assignment.title}</span><span className="text-[12px] text-[var(--text-muted)]">Week {w.week.weekNumber} · attempt {a.attemptNumber} · {formatDateTime(a.submittedAt, ctx.program!.timezone)}</span></span>
                    {a.isLate && <Badge tone="warning">Late</Badge>}
                    {a.grade ? <Badge tone={a.grade.outcome === "passed" ? "success" : "warning"}>{a.grade.score}/{a.grade.maxScore}</Badge> : <Badge tone="brand">Ungraded</Badge>}
                  </a></li>
                ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          {evalWeek && (
            <Card>
              <CardHeader title={`Week ${evalWeek.weekNumber} evaluation`} description="Your comment appears in the learner's weekly evaluation table." />
              <CardBody><EvaluationForm weekId={evalWeek.id} studentId={id} initial={existingComment?.comment ?? ""} weeks={ctx.weeks.filter((w) => w.startsOn <= ctx.clock.today).map((w) => ({ id: w.id, label: `Week ${w.weekNumber}`, comment: evaluations.find((e) => e.week.id === w.id)?.comment?.comment ?? "" }))} /></CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Weekly reflections" description="Only reflections the learner has marked complete are shown to teachers." />
            {access.some((j) => j.access === "admin_metadata") ? (
              <CardBody><Notice tone="info" icon="lock" title={`${journals.filter((j) => j.entry.status === "submitted").length} completed, ${journals.filter((j) => j.entry.status === "draft").length} in draft`}>
                As a super admin you see journal status only. Opening the text is a separate, audit-logged action on the learner's page under Users.
              </Notice></CardBody>
            ) : access.some((j) => j.access === "none") && readable.length === 0 ? (
              <CardBody><Notice tone="info" icon="lock">Journal access for teachers is switched off, or there are no completed reflections yet.</Notice></CardBody>
            ) : null}
            {access.some((j) => j.access === "admin_metadata") ? null : readable.length === 0 && !access.some((j) => j.access === "none") ? <EmptyState compact icon="journal" title="No completed reflections yet" /> : (
              <div className="max-h-[520px] divide-y divide-[var(--border)] overflow-y-auto">
                {readable.map((j) => (
                  <details key={j.entry.id} className="group px-5 py-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-semibold">Week {j.week.weekNumber}<span className="text-[12px] font-normal text-[var(--text-subtle)]">{formatDateTime(j.entry.submittedAt, ctx.program!.timezone, { day: "numeric", month: "short" })}</span></summary>
                    <dl className="mt-3 space-y-3 text-[13.5px]">
                      {JOURNAL_PROMPTS.filter((p) => j.entry.responses[p.key]?.trim()).map((p) => <div key={p.key}><dt className="font-semibold">{p.label}</dt><dd className="mt-0.5 whitespace-pre-wrap text-[var(--text-muted)]">{j.entry.responses[p.key]}</dd></div>)}
                    </dl>
                  </details>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader, PageHeader, StatCard } from "@/components/ui/card";
import { Badge, TrackDot } from "@/components/ui/badge";
import { Avatar, EmptyState, Notice } from "@/components/ui/feedback";
import { cn, formatDateTime } from "@/lib/utils";
import { updateAssignmentAction } from "@/server/actions/teaching";
import { loadManagedAssignment } from "@/server/policy";
import { AppError } from "@/lib/errors";
import { assignmentRoster, managedCourses } from "@/server/services/teaching";
import { teacherContext } from "../../data";
import { AssignmentForm } from "../assignment-form";
import { AssignmentStatusControl, FollowUp } from "./client";

const STATE: Record<string, { label: string; tone: "neutral" | "info" | "brand" | "success" | "warning" | "danger" }> = {
  missing: { label: "Missing", tone: "danger" }, joined_later: { label: "Joined after deadline", tone: "neutral" }, not_started: { label: "Not started", tone: "neutral" }, in_progress: { label: "In progress", tone: "info" },
  awaiting: { label: "Awaiting grading", tone: "brand" }, passed: { label: "Passed", tone: "success" }, not_passed: { label: "Below pass mark", tone: "warning" },
  revision: { label: "Revision requested", tone: "warning" },
};

function localInput(d: Date, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export default async function TeacherAssignment({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; show?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await teacherContext();
  if (!ctx.program || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let row;
  try { row = await loadManagedAssignment(ctx.user, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  const { assignment: a, course } = row;
  const tz = ctx.program.timezone;
  const [roster, courses] = await Promise.all([assignmentRoster(a, course.programId), managedCourses(ctx.user, ctx.program.id)]);
  const count = (s: string) => roster.filter((r) => r.state === s).length;
  const shown = sp.show ? roster.filter((r) => r.state === sp.show) : roster;
  const handedIn = roster.filter((r) => r.attempts.some((x) => x.attempt.status !== "draft")).length;
  const week = ctx.weeks.find((w) => w.id === course.weekId);
  const track = courses.find((c) => c.course.id === course.id)?.track;

  return (
    <>
      <PageHeader back={{ href: `/teach/courses/${course.id}`, label: course.title }}
        eyebrow={<span className="inline-flex items-center gap-1.5">{track && <TrackDot color={track.color} />}{track?.name} · Week {week?.weekNumber} · {a.kind === "assessment" ? "Assessment" : "Assignment"}</span>}
        title={a.title} description={`Due ${formatDateTime(a.dueAt, tz)} · pass mark ${a.passMark} of ${a.maxScore}`}
        actions={<AssignmentStatusControl assignmentId={a.id} status={a.status} />} />
      {sp.created && <div className="mb-6"><Notice tone="success" title="Assignment created">{a.status === "published" ? "It's live for learners in this course." : "It's a draft — publish it when you're ready."}</Notice></div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Handed in" value={`${handedIn}/${roster.length}`} icon="send" />
        <StatCard label="Awaiting grading" value={count("awaiting")} icon="inbox" tone={count("awaiting") ? "brand" : "default"} href={`/teach/assignments/${a.id}?show=awaiting`} />
        <StatCard label="Missing" value={count("missing")} icon="alert" tone={count("missing") ? "danger" : "default"} href={`/teach/assignments/${a.id}?show=missing`} />
        <StatCard label="Passed" value={count("passed")} icon="checkCircle" tone="success" href={`/teach/assignments/${a.id}?show=passed`} />
        <StatCard label="Below / revising" value={count("not_passed") + count("revision")} icon="repeat" tone="warning" href={`/teach/assignments/${a.id}?show=not_passed`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card>
          <CardHeader title="Learners" description={sp.show ? `Showing: ${STATE[sp.show]?.label ?? sp.show}` : "Every enrolled learner"} action={sp.show && <Link href={`/teach/assignments/${a.id}`} className="text-[12.5px] font-semibold text-[var(--brand)]">Show all</Link>} />
          {shown.length === 0 ? <EmptyState compact icon="team" title="Nobody in this group" /> : (
            <ul className="divide-y divide-[var(--border)]">
              {shown.map((r) => {
                const st = STATE[r.state];
                const latest = r.latest?.attempt;
                return (
                  <li key={r.student.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <Avatar firstName={r.student.firstName} lastName={r.student.lastName} size={34} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/teach/students/${r.student.id}`} className="block truncate text-[14px] font-semibold hover:text-[var(--brand)]">{r.student.firstName} {r.student.lastName}</Link>
                      <div className="text-[12.5px] text-[var(--text-muted)]">
                        {latest?.submittedAt ? `Attempt ${latest.attemptNumber} · ${formatDateTime(latest.submittedAt, tz)}${latest.isLate ? " · late" : ""}` : r.state === "missing" ? "Nothing handed in" : "—"}
                        {r.lastGrade && <> · <span className="tnum font-semibold text-[var(--text)]">{r.lastGrade.score}/{r.lastGrade.maxScore}</span></>}
                      </div>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {latest && latest.status !== "draft" ? (
                      <Link href={`/teach/grading/${latest.id}`} className={cn("inline-flex h-8 items-center rounded-[var(--radius-field)] px-3 text-[13px] font-semibold", r.state === "awaiting" ? "bg-[var(--brand)] text-[var(--on-brand)]" : "border border-[var(--border)] hover:bg-[var(--surface-2)]")}>
                        {r.state === "awaiting" ? "Grade" : "Review"}
                      </Link>
                    ) : r.state === "missing" ? (
                      <FollowUp studentId={r.student.id} firstName={r.student.firstName} assignmentTitle={a.title} late={a.acceptLate} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Settings" />
          <CardBody>
            <AssignmentForm action={updateAssignmentAction.bind(null, a.id)} isNew={false} hasSubmissions={handedIn > 0}
              courses={courses.map((c) => ({ id: c.course.id, label: `Week ${c.week.weekNumber} · ${c.course.title}` }))}
              initial={{ courseId: a.courseId, kind: a.kind, title: a.title, instructions: a.instructions, maxScore: a.maxScore, passMark: a.passMark, dueAt: localInput(a.dueAt, tz),
                allowText: a.allowText, allowFiles: a.allowFiles, requiredFilesNote: a.requiredFilesNote ?? "", acceptLate: a.acceptLate,
                resubmissionPolicy: a.resubmissionPolicy, maxAttempts: a.maxAttempts, rubric: a.rubric, status: a.status }} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

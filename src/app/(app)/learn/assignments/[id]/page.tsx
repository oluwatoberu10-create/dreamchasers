import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge, TrackDot, WorkStatusBadge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { Prose } from "@/components/prose";
import { improvement } from "@/lib/progress";
import { cn, formatBytes, formatDateTime, relativeTime } from "@/lib/utils";
import { attemptFilesFor } from "@/server/services/submissions";
import { learnerContext } from "../../data";
import { StartAttempt, WorkEditor } from "./client";

const RESUBMIT_COPY = {
  none: "One attempt, unless your teacher asks for a revision.",
  on_request: "Your teacher may ask for a revision.",
  until_passed: "You can resubmit until you reach the pass mark.",
} as const;

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await learnerContext();
  if (!ctx.program) notFound();
  // Only assignments in the learner's own record are reachable: published, in a
  // visible course, in their programme. Everything else is a 404.
  const item = ctx.record.work.find((w) => w.assignment.id === id);
  if (!item) notFound();

  const tz = ctx.program.timezone;
  const a = item.assignment;
  const st = item.status;
  const fileRows = await attemptFilesFor(item.attempts.map((x) => x.id));
  const filesOf = (attemptId: string) => fileRows.filter((f) => f.attemptId === attemptId).map((f) => f.file);
  const draft = item.latest?.status === "draft" ? item.latest : null;
  const gradedAttempts = item.attempts.filter((x) => x.grade);
  const gain = improvement(gradedAttempts.map((x) => x.grade!));
  const lg = item.lastGrade;

  return (
    <>
      <PageHeader
        back={{ href: "/learn/assignments", label: "Assignments" }}
        eyebrow={<span className="inline-flex items-center gap-1.5"><TrackDot color={item.track.color} />{item.track.name} · Week {item.week.weekNumber} · {a.kind === "assessment" ? "Assessment" : "Assignment"}</span>}
        title={a.title}
        description={<Link href={`/learn/courses/${item.course.id}`} className="hover:underline">{item.course.title}</Link>}
        actions={<WorkStatusBadge status={st.key} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Result, in supportive language */}
          {lg && (
            <Card className={cn("overflow-hidden", lg.outcome === "passed" ? "border-[var(--success)]/40" : "border-[var(--star-strong)]/50")}>
              <div className={cn("flex flex-wrap items-center gap-4 px-5 py-4", lg.outcome === "passed" ? "bg-[var(--success-soft)]" : "bg-[var(--star-soft)]")}>
                <div className="tnum text-[32px] font-extrabold leading-none">{lg.score}<span className="text-[18px] text-[var(--text-subtle)]">/{lg.maxScore}</span></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold">
                    {lg.outcome === "passed" ? "You passed — well done!" : lg.outcome === "revision_requested" ? "Revision required — you're nearly there" : "Keep learning — not quite at the pass mark yet"}
                  </div>
                  <div className="text-[13px] text-[var(--text-muted)]">Pass mark {lg.passMark} · attempt {lg.attemptNumber} · graded {relativeTime(lg.gradedAt)}{gain !== null && gain > 0 ? ` · up ${gain} points from your first attempt` : ""}</div>
                </div>
              </div>
              {lg.feedback.trim() && <CardBody><div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">Teacher feedback</div><Prose source={lg.feedback} /></CardBody>}
            </Card>
          )}

          {st.key === "ready_for_retry" && item.repeatActive && (
            <Notice tone="info" icon="repeat" title="Ready for another attempt">Your teacher has reopened this course. Revisit the <Link href={`/learn/courses/${item.course.id}`} className="font-semibold underline">course materials</Link>, then start a new attempt — your earlier work and feedback stay in your history.</Notice>
          )}

          {/* Work area */}
          {draft && st.canEditDraft ? (
            <Card>
              <CardHeader title={draft.attemptNumber > 1 ? `Attempt ${draft.attemptNumber}` : "Your work"} description={draft.reason ?? (st.isPastDue ? "The deadline has passed — this will be marked as a late submission." : `Due ${formatDateTime(a.dueAt, tz)}`)} />
              <CardBody>
                <WorkEditor assignmentId={a.id} attemptId={draft.id} body={draft.body} allowText={a.allowText} allowFiles={a.allowFiles}
                  requiredFilesNote={a.requiredFilesNote} files={filesOf(draft.id).map((f) => ({ id: f.id, name: f.originalName, size: formatBytes(f.sizeBytes) }))}
                  late={st.isPastDue && draft.attemptNumber === 1} savedAt={draft.updatedAt.toISOString()} />
              </CardBody>
            </Card>
          ) : !item.latest && st.canStartNewAttempt ? (
            <Card>
              <CardHeader title="Your work" description={st.isPastDue ? "The deadline has passed, but late work is accepted — it will be marked as late." : `Due ${formatDateTime(a.dueAt, tz)}`} />
              <CardBody>
                <WorkEditor assignmentId={a.id} attemptId={null} body="" allowText={a.allowText} allowFiles={a.allowFiles} requiredFilesNote={a.requiredFilesNote} files={[]} late={st.isPastDue} savedAt={null} />
              </CardBody>
            </Card>
          ) : st.canStartNewAttempt ? (
            <Card><CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[15px] font-bold">Ready for attempt {(item.latest?.attemptNumber ?? 0) + 1}?</div>
                <div className="text-[13px] text-[var(--text-muted)]">We'll copy in your last answer so you can improve it.{st.attemptsRemaining !== null ? ` ${st.attemptsRemaining} attempt${st.attemptsRemaining === 1 ? "" : "s"} left.` : ""}</div>
              </div>
              <StartAttempt assignmentId={a.id} />
            </CardBody></Card>
          ) : st.key === "overdue" ? (
            <Notice tone="danger" title="This assignment is closed">The deadline has passed and your teacher isn't accepting late work for it. <Link href="/messages" className="font-semibold underline">Message your teacher</Link> if something got in the way.</Notice>
          ) : item.latest?.status === "submitted" ? (
            <Notice tone="brand" icon="inbox" title="Handed in — waiting for your teacher">Submitted {formatDateTime(item.latest.submittedAt, tz)}{item.latest.isLate ? " (after the deadline)" : ""}. You'll get a notification when it's graded.</Notice>
          ) : null}

          <Card>
            <CardHeader title="Instructions" />
            <CardBody className="space-y-4">
              {a.instructions.trim() ? <Prose source={a.instructions} /> : <p className="text-[14px] text-[var(--text-muted)]">See the course materials.</p>}
              {a.rubric.length > 0 && (
                <div>
                  <div className="mb-2 text-[13px] font-bold">How it's marked</div>
                  <div className="table-wrap rounded-lg border border-[var(--border)]">
                    <table className="table-dt"><thead><tr><th>Criterion</th><th className="text-right">Points</th></tr></thead>
                      <tbody>{a.rubric.map((r, i) => <tr key={i}><td><div className="font-semibold">{r.criterion}</div>{r.description && <div className="text-[12.5px] text-[var(--text-muted)]">{r.description}</div>}</td><td className="tnum text-right">{r.points}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {item.attempts.some((x) => x.status !== "draft") && (
            <Card>
              <CardHeader title="Your attempts" description="Every attempt and its feedback is kept." />
              <ol className="divide-y divide-[var(--border)]">
                {[...item.attempts].reverse().filter((x) => x.status !== "draft").map((x) => (
                  <li key={x.id} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold">Attempt {x.attemptNumber}</span>
                      {x.isLate && <Badge tone="warning">Late</Badge>}
                      {x.grade ? <Badge tone={x.grade.outcome === "passed" ? "success" : "warning"}>{x.grade.score}/{x.grade.maxScore} · {x.grade.outcome === "passed" ? "Passed" : x.grade.outcome === "revision_requested" ? "Revision requested" : "Keep learning"}</Badge> : <Badge tone="brand">Awaiting grading</Badge>}
                      <span className="text-[12.5px] text-[var(--text-muted)]">Submitted {formatDateTime(x.submittedAt, tz)}</span>
                    </div>
                    {x.reason && <div className="text-[12.5px] text-[var(--text-muted)]">{x.reason}</div>}
                    {x.body.trim() && <div className="whitespace-pre-wrap rounded-lg bg-[var(--surface-2)] px-3.5 py-3 text-[14px] leading-relaxed">{x.body}</div>}
                    {filesOf(x.id).length > 0 && (
                      <ul className="flex flex-wrap gap-2">{filesOf(x.id).map((f) => <li key={f.id}><a href={`/api/files/${f.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[12.5px] font-semibold hover:bg-[var(--surface-2)]"><Icon name="paperclip" className="h-3.5 w-3.5" />{f.originalName}</a></li>)}</ul>
                    )}
                    {x.grade?.feedback.trim() && <div className="rounded-lg border-l-[3px] border-[var(--star-strong)] bg-[var(--star-soft)] px-3.5 py-2.5"><Prose source={x.grade.feedback} small /></div>}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardBody className="space-y-3 text-[13.5px]">
              <div className="flex justify-between gap-2"><span className="text-[var(--text-muted)]">Due</span><span className={cn("text-right font-semibold", st.key === "overdue" && "text-[var(--danger)]")}>{formatDateTime(a.dueAt, tz)}<span className="block text-[12px] font-normal text-[var(--text-muted)]">{relativeTime(a.dueAt)}</span></span></div>
              <div className="flex justify-between gap-2"><span className="text-[var(--text-muted)]">Maximum score</span><span className="tnum font-semibold">{a.maxScore}</span></div>
              <div className="flex justify-between gap-2"><span className="text-[var(--text-muted)]">Pass mark</span><span className="tnum font-semibold">{a.passMark}</span></div>
              <div className="flex justify-between gap-2"><span className="text-[var(--text-muted)]">Hand in</span><span className="text-right">{[a.allowText && "Written answer", a.allowFiles && "File upload"].filter(Boolean).join(" or ")}</span></div>
              <div className="flex justify-between gap-2"><span className="text-[var(--text-muted)]">Late work</span><span>{a.acceptLate ? "Accepted (marked late)" : "Not accepted"}</span></div>
              <div className="border-t border-[var(--border)] pt-3 text-[12.5px] text-[var(--text-muted)]">{RESUBMIT_COPY[a.resubmissionPolicy]}{a.maxAttempts ? ` Up to ${a.maxAttempts} attempts.` : ""}</div>
              <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[12.5px]"><span className="font-semibold">{st.label}.</span> {st.hint}</div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

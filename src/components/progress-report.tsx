import Link from "next/link";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { LearningStatusBadge, WeekResultBadge, WorkStatusBadge } from "@/components/ui/badge";
import { EmptyState, ProgressBar } from "@/components/ui/feedback";
import { LineChart, BarChart } from "@/components/charts";
import { improvement, summarize } from "@/lib/progress";
import { formatDateOnly, formatPct, truncate } from "@/lib/utils";
import { toProgressItems, type StudentRecord, type WeekEvaluation } from "@/server/services/learner";
import type { Program, ProgramClock, Week } from "@/server/services/program";

/**
 * The three-month progress view and weekly evaluation table. Rendered for the
 * learner themselves and for teachers looking at a learner, from the same
 * record, so both always see the same numbers.
 */
export function ProgressReport({ program, weeks, clock, record, evaluations, linkBase }: {
  program: Program; weeks: Week[]; clock: ProgramClock; record: StudentRecord; evaluations: WeekEvaluation[];
  /** "/learn" for the learner; teacher views link to their grading pages instead. */
  linkBase: "learner" | "teacher";
}) {
  const s = summarize(toProgressItems(record.work));
  const coursesDone = record.courses.filter((c) => c.progress?.completedAt).length;
  const accessed = record.courses.filter((c) => c.progress).length;
  const revisions = record.work.filter((w) => w.status.key === "revision_required" || w.status.key === "ready_for_retry").length;
  const multi = record.work.filter((w) => w.attempts.filter((a) => a.grade).length > 1);

  const trend = evaluations.filter((e) => e.started).map((e) => ({ week: `W${e.week.weekNumber}`, avg: e.summary.averagePct }));
  const activity = evaluations.filter((e) => e.started).map((e) => ({
    week: `W${e.week.weekNumber}`, passed: e.summary.passed, awaiting: e.summary.awaitingGrading,
    below: e.summary.notPassed + e.summary.revisionRequired, missing: e.summary.missing,
  }));
  const outstanding = record.work.filter((w) => ["overdue", "to_start", "in_progress", "needs_action"].includes(w.status.bucket));
  const assignmentHref = (id: string) => (linkBase === "learner" ? `/learn/assignments/${id}` : `/teach/assignments/${id}`);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Weeks completed" value={<>{clock.weeksElapsed}<span className="text-[16px] text-[var(--text-subtle)]">/{program.weeksCount}</span></>} icon="calendar" tone="brand"
          hint={<ProgressBar value={clock.weeksElapsed} max={program.weeksCount} tone="star" label="Weeks elapsed" />} />
        <StatCard label="Average score" value={formatPct(s.averagePct)} icon="trend" tone="success" definition="Mean of latest grades as percentages; ungraded and missing work are not counted."
          hint={s.graded ? `Based on ${s.graded} graded assignment${s.graded === 1 ? "" : "s"}` : "No graded work yet"} delay={40} />
        <StatCard label="Handed in" value={<>{s.submitted}<span className="text-[16px] text-[var(--text-subtle)]">/{s.assigned}</span></>} icon="send" delay={80}
          hint={`${s.awaitingGrading} awaiting grading · ${s.missing} missing`} />
        <StatCard label="Passed" value={<>{s.passed}<span className="text-[16px] text-[var(--text-subtle)]">/{s.graded}</span></>} icon="checkCircle" tone={revisions ? "warning" : "success"} delay={120}
          hint={`${revisions} need${revisions === 1 ? "s" : ""} another attempt`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Scores over time" description="Average of graded work each week. Weeks with nothing graded are left blank, not zero." />
          <CardBody>{trend.some((t) => t.avg !== null) ? <LineChart data={trend} xKey="week" series={[{ key: "avg", label: "Average score", color: "var(--chart-1)" }]} /> : <EmptyState compact icon="chart" title="No graded work yet" />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Work by week" description="What happened to each week's assignments." />
          <CardBody>{activity.length ? (
            <BarChart data={activity} xKey="week" stacked series={[
              { key: "passed", label: "Passed", color: "var(--success)" },
              { key: "below", label: "Below pass / revision", color: "var(--star-strong)" },
              { key: "awaiting", label: "Awaiting grading", color: "var(--chart-1)" },
              { key: "missing", label: "Missing", color: "var(--danger)" },
            ]} />
          ) : <EmptyState compact icon="chart" title="The programme hasn't started yet" />}</CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Courses" />
          <CardBody className="space-y-4 text-[13.5px]">
            <div><div className="mb-1 flex justify-between"><span>Published so far</span><span className="tnum font-semibold">{record.courses.length}</span></div></div>
            <div><div className="mb-1 flex justify-between"><span>Opened</span><span className="tnum font-semibold">{accessed}/{record.courses.length}</span></div><ProgressBar value={accessed} max={record.courses.length} /></div>
            <div><div className="mb-1 flex justify-between"><span>Marked complete</span><span className="tnum font-semibold">{coursesDone}/{record.courses.length}</span></div><ProgressBar value={coursesDone} max={record.courses.length} tone="success" /></div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Milestones" />
          <CardBody>
            <ol className="flex flex-wrap gap-2">
              {weeks.map((w) => {
                const e = evaluations.find((x) => x.week.id === w.id);
                const tone = !e?.started ? "bg-[var(--surface-2)] text-[var(--text-subtle)]"
                  : e.result === "passed" ? "bg-[var(--success-soft)] text-[var(--success)]"
                  : e.result === "not_passed" ? "bg-[var(--star-soft)] text-[var(--star)]"
                  : e.result === "outstanding" ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                  : "bg-[var(--brand-soft)] text-[var(--brand)]";
                return (
                  <li key={w.id} title={`${w.title}${e?.started ? ` — ${e.result.replace(/_/g, " ")}` : " — not started"}`}
                    className={`flex h-11 w-11 flex-col items-center justify-center rounded-lg text-[11px] font-bold ${tone} ${clock.currentWeek?.id === w.id ? "ring-2 ring-[var(--brand)]" : ""}`}>
                    <span className="text-[9px] uppercase opacity-70">Wk</span>{w.weekNumber}
                  </li>
                );
              })}
            </ol>
            {multi.length > 0 && (
              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <div className="mb-2 text-[13px] font-bold">Improvement between attempts</div>
                <ul className="space-y-1.5 text-[13px]">
                  {multi.map((w) => {
                    const g = w.attempts.filter((a) => a.grade).map((a) => a.grade!);
                    const d = improvement(g);
                    return <li key={w.assignment.id} className="flex justify-between gap-2"><span className="truncate">{w.assignment.title}</span><span className="tnum shrink-0 font-semibold">{g.map((x) => x.score).join(" → ")} {d !== null && <span className={d >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>({d >= 0 ? "+" : ""}{d} pts)</span>}</span></li>;
                  })}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Weekly evaluation" description="Built from real submissions and grades. A missing submission, ungraded work and a graded result below the pass mark are always shown differently." />
        <div className="table-wrap">
          <table className="table-dt min-w-[980px]">
            <thead><tr><th>Week</th><th>Course</th><th className="text-right">Assigned</th><th className="text-right">Submitted</th><th className="text-right">Outstanding</th><th className="text-right">Score</th><th className="text-right">Pass mark</th><th>Result</th><th>Teacher feedback</th><th>Learning status</th></tr></thead>
            <tbody>
              {evaluations.filter((e) => e.started).reverse().map((e) => {
                const scored = e.work.filter((w) => w.lastGrade);
                return (
                  <tr key={e.week.id}>
                    <td className="whitespace-nowrap"><div className="font-bold">Week {e.week.weekNumber}</div><div className="text-[12px] text-[var(--text-subtle)]">{formatDateOnly(e.week.startsOn, { day: "numeric", month: "short" })}</div></td>
                    <td className="max-w-56">{e.courses.length ? e.courses.map((c) => <div key={c.course.id} className="truncate">{c.course.title}</div>) : <span className="text-[var(--text-subtle)]">No course published</span>}</td>
                    <td className="tnum text-right">{e.summary.assigned}</td>
                    <td className="tnum text-right">{e.summary.submitted}</td>
                    <td className="tnum text-right">{e.summary.outstanding ? <span className={e.summary.missing ? "font-semibold text-[var(--danger)]" : ""}>{e.summary.outstanding}</span> : 0}</td>
                    <td className="tnum text-right whitespace-nowrap">{scored.length ? scored.map((w) => <div key={w.assignment.id}>{w.lastGrade!.score}/{w.lastGrade!.maxScore}</div>) : <span className="text-[var(--text-subtle)]" title="Nothing graded yet">—</span>}</td>
                    <td className="tnum text-right">{scored.length ? scored.map((w) => <div key={w.assignment.id}>{w.lastGrade!.passMark}</div>) : e.work.length ? e.work.map((w) => <div key={w.assignment.id} className="text-[var(--text-subtle)]">{w.assignment.passMark}</div>) : "—"}</td>
                    <td><WeekResultBadge result={e.result} /></td>
                    <td className="max-w-72 text-[13px]">
                      {e.comment && <div className="mb-1"><span className="font-semibold">{e.comment.evaluatorName}:</span> {truncate(e.comment.comment, 140)}</div>}
                      {e.work.filter((w) => w.lastGrade?.feedback.trim()).map((w) => <div key={w.assignment.id} className="text-[var(--text-muted)]">{truncate(w.lastGrade!.feedback, 90)}</div>)}
                      {!e.comment && !e.work.some((w) => w.lastGrade?.feedback.trim()) && <span className="text-[var(--text-subtle)]">—</span>}
                    </td>
                    <td><LearningStatusBadge status={e.learningStatus} /></td>
                  </tr>
                );
              })}
              {!evaluations.some((e) => e.started) && <tr><td colSpan={10} className="py-10 text-center text-[var(--text-muted)]">The first week hasn't started yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Outstanding work" />
        {outstanding.length === 0 ? <EmptyState compact icon="checkCircle" title="Nothing outstanding" /> : (
          <ul className="divide-y divide-[var(--border)]">
            {outstanding.map((w) => (
              <li key={w.assignment.id}><Link href={assignmentHref(w.assignment.id)} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[var(--surface-2)]">
                <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{w.assignment.title}</span><span className="text-[12.5px] text-[var(--text-muted)]">Week {w.week.weekNumber} · {w.course.title}</span></span>
                <WorkStatusBadge status={w.status.key} />
              </Link></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

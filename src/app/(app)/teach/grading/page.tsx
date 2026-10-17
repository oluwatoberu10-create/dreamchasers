import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState } from "@/components/ui/feedback";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import { gradingQueue, type QueueFilter } from "@/server/services/teaching";
import { teacherContext, NO_PROGRAM } from "../data";

export const metadata = { title: "Submissions & Grading" };

const TABS: { key: QueueFilter; label: string }[] = [
  { key: "awaiting", label: "Awaiting grading" }, { key: "revision", label: "Revision requested" }, { key: "graded", label: "Graded" }, { key: "all", label: "All" },
];

export default async function Grading({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const ctx = await teacherContext();
  if (!ctx.program) return <><PageHeader title="Submissions & Grading" /><Card><EmptyState icon="inbox" title="No programme" description={NO_PROGRAM} /></Card></>;
  const sp = await searchParams;
  const filter = (TABS.find((t) => t.key === sp.filter)?.key ?? "awaiting") as QueueFilter;
  const rows = await gradingQueue(ctx.user, ctx.program.id, filter, 200);
  const tz = ctx.program.timezone;

  return (
    <>
      <PageHeader title="Submissions & Grading" description={filter === "awaiting" ? "Oldest first, so nobody waits too long." : "Latest attempt for each learner and assignment."} />
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "awaiting" ? "/teach/grading" : `/teach/grading?filter=${t.key}`}
            className={cn("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold", filter === t.key ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]")}>{t.label}</Link>
        ))}
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState icon="checkCircle" title={filter === "awaiting" ? "You're all caught up" : "Nothing here"} description={filter === "awaiting" ? "New submissions will appear here, and you'll get a notification." : undefined} /> : (
          <div className="table-wrap">
            <table className="table-dt min-w-[820px]">
              <thead><tr><th>Learner</th><th>Assignment</th><th>Submitted</th><th>Deadline</th><th className="text-right">Score</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.attempt.id}>
                    <td><span className="flex items-center gap-2.5 whitespace-nowrap"><Avatar firstName={r.student.firstName} lastName={r.student.lastName} size={28} /><span className="font-semibold">{r.student.firstName} {r.student.lastName}</span></span></td>
                    <td><div className="font-semibold">{r.assignment.title}</div><div className="text-[12px] text-[var(--text-muted)]">Week {r.week.weekNumber} · {r.course.title}</div></td>
                    <td className="whitespace-nowrap text-[13px]">{formatDateTime(r.attempt.submittedAt, tz)}<div className="text-[12px] text-[var(--text-subtle)]">{relativeTime(r.attempt.submittedAt)}</div></td>
                    <td>{r.attempt.attemptNumber > 1 ? <Badge tone="info">Attempt {r.attempt.attemptNumber}</Badge> : r.attempt.isLate ? <Badge tone="warning">Late</Badge> : <Badge tone="success">On time</Badge>}</td>
                    <td className="tnum text-right">{r.grade ? `${r.grade.score}/${r.grade.maxScore}` : <span className="text-[var(--text-subtle)]">—/{r.assignment.maxScore}</span>}</td>
                    <td>{r.grade ? <Badge tone={r.grade.outcome === "passed" ? "success" : "warning"}>{r.grade.outcome === "passed" ? "Passed" : r.grade.outcome === "revision_requested" ? "Revision requested" : "Below pass mark"}</Badge> : <Badge tone="brand">Awaiting grading</Badge>}</td>
                    <td className="text-right"><Link href={`/teach/grading/${r.attempt.id}`} className={cn("inline-flex h-8 items-center rounded-[var(--radius-field)] px-3 text-[13px] font-semibold", r.grade ? "border border-[var(--border)] hover:bg-[var(--surface-2)]" : "bg-[var(--brand)] text-[var(--on-brand)]")}>{r.grade ? "Review" : "Grade"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

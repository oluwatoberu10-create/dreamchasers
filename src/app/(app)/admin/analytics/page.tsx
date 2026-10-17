import Link from "next/link";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { BarChart, LineChart } from "@/components/charts";
import { cn, formatPct, pct } from "@/lib/utils";
import { gradingBacklog, performanceByWeek, platformMetrics, publicationByWeek, registrationsByWeek, submissionsByDay, teacherActivity } from "@/server/services/analytics";
import { adminContext } from "../data";

export const metadata = { title: "Analytics" };

export default async function Analytics({ searchParams }: { searchParams: Promise<{ teacher?: string }> }) {
  const ctx = await adminContext();
  if (!ctx.program) return <><PageHeader title="Analytics" /><Card><EmptyState icon="chart" title="No programme" action={<ButtonLink href="/admin/settings">Create one</ButtonLink>} /></Card></>;
  const { teacher } = await searchParams;
  const teacherId = teacher && /^[0-9a-f-]{36}$/i.test(teacher) ? teacher : undefined;
  const p = ctx.program;

  const [m, regs, subs, backlog, perf, pubs, teachers] = await Promise.all([
    platformMetrics(p.id), registrationsByWeek(12), submissionsByDay(30), gradingBacklog(p.id),
    performanceByWeek(p.id, teacherId), publicationByWeek(p, ctx.weeks, teacherId), teacherActivity(p.id),
  ]);
  const selected = teachers.find((t) => t.id === teacherId);
  const short = (d: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${d}T00:00:00Z`));

  return (
    <>
      <PageHeader title="Analytics" description="Every chart is computed live from platform records. Hover a figure for its definition." />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-[var(--text-muted)]">Teacher:</span>
        <Link href="/admin/analytics" className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-semibold", !teacherId ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>Everyone</Link>
        {teachers.map((t) => <Link key={t.id} href={`/admin/analytics?teacher=${t.id}`} className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-semibold", teacherId === t.id ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{t.name}</Link>)}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Course publication by week" description={`Expected vs live courses${selected ? ` for ${selected.name}` : ""}. Expected = one per track per week.`} />
          <CardBody><BarChart data={pubs.map((x) => ({ week: `W${x.week}`, expected: x.expected, published: x.published }))} xKey="week" series={[{ key: "expected", label: "Expected", color: "var(--surface-3)" }, { key: "published", label: "Published", color: "var(--chart-1)" }]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Student performance by week" description={`Average latest grade and pass rate${selected ? ` in ${selected.name}'s courses` : ""}. Weeks with no grades are gaps, not zeros.`} />
          <CardBody><LineChart data={perf.map((x) => ({ week: `W${x.week}`, avg: x.avg, pass: x.pass_rate }))} xKey="week" series={[{ key: "avg", label: "Average score", color: "var(--chart-1)" }, { key: "pass", label: "Pass rate", color: "var(--success)" }]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Assignment submission activity" description="Hand-ins per day, last 30 days. Late = submitted after the deadline." />
          <CardBody><BarChart data={subs.map((x) => ({ day: short(x.day), onTime: x.n - x.late, late: x.late }))} xKey="day" stacked series={[{ key: "onTime", label: "On time / resubmission", color: "var(--chart-2)" }, { key: "late", label: "Late", color: "var(--star-strong)" }]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Grading backlog" description={`${m.awaitingGrading} submissions waiting, by how long they've waited.`} />
          <CardBody><BarChart data={backlog} xKey="bucket" series={[{ key: "n", label: "Waiting", color: "var(--chart-4)" }]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Student enrolment over time" description="New registrations per week, last 12 weeks." />
          <CardBody><BarChart data={regs.map((x) => ({ week: short(x.wk), n: x.n }))} xKey="week" series={[{ key: "n", label: "Registrations", color: "var(--chart-1)" }]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Course completion progress" />
          <CardBody className="grid grid-cols-2 gap-4 text-[13.5px]">
            {[
              { l: "Completion rate", v: formatPct(m.completionRate), d: "Courses marked complete ÷ (live courses × learners)" },
              { l: "Submission rate", v: formatPct(pct(m.handedInPairs, m.expectedPairs)), d: "Handed-in ÷ expected, past deadlines" },
              { l: "Pass rate", v: formatPct(m.passRate), d: "Passing latest grades ÷ all latest grades" },
              { l: "Average score", v: formatPct(m.averageScore), d: "Mean latest-grade percentage" },
              { l: "Active learners", v: `${m.activeLearners}/${m.students}`, d: "Activity in the last 14 days" },
              { l: "Needing extra learning", v: String(m.needingSupport), d: "Below pass, revising or repeating" },
            ].map((x) => <div key={x.l} title={x.d}><div className="tnum text-[22px] font-extrabold">{x.v}</div><div className="font-semibold">{x.l}</div><div className="text-[12px] text-[var(--text-subtle)]">{x.d}</div></div>)}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Teacher activity" description="Course publication and grading by each teacher in this programme." />
        <div className="table-wrap">
          <table className="table-dt min-w-[720px]">
            <thead><tr><th>Teacher</th><th className="text-right">Tracks</th><th className="text-right">Courses live</th><th className="text-right">Drafts</th><th className="text-right">Grades given</th><th className="text-right">Last 30 days</th><th className="text-right">Awaiting their grading</th></tr></thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/admin/users/${t.id}`} className="font-semibold hover:text-[var(--brand)]">{t.name}</Link></td>
                  <td className="tnum text-right">{t.tracks}</td><td className="tnum text-right">{t.published}</td><td className="tnum text-right">{t.drafts}</td>
                  <td className="tnum text-right">{t.graded}</td><td className="tnum text-right">{t.graded_30d}</td>
                  <td className={cn("tnum text-right", t.awaiting > 0 && "font-bold text-[var(--brand)]")}>{t.awaiting}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

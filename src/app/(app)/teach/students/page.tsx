import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState } from "@/components/ui/feedback";
import { cn, formatPct } from "@/lib/utils";
import { studentStats } from "@/server/services/teaching";
import { teacherContext, NO_PROGRAM } from "../data";

export const metadata = { title: "Students" };

const FILTERS = [
  { key: "all", label: "All" }, { key: "missing", label: "Missing work" }, { key: "awaiting", label: "Awaiting grading" },
  { key: "below", label: "Below pass mark" }, { key: "support", label: "Needs support" },
];

export default async function Students({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const ctx = await teacherContext();
  if (!ctx.program) return <><PageHeader title="Students" /><Card><EmptyState icon="users" title="No programme" description={NO_PROGRAM} /></Card></>;
  const { q = "", filter = "all" } = await searchParams;
  const all = await studentStats(ctx.program.id);
  const needle = q.trim().toLowerCase();
  const rows = all.filter((s) => (!needle || `${s.firstName} ${s.lastName}`.toLowerCase().includes(needle))
    && (filter === "missing" ? s.missing > 0 : filter === "awaiting" ? s.awaiting > 0 : filter === "below" ? s.belowPass > 0
      : filter === "support" ? s.belowPass + s.revision + s.repeats > 0 : true));
  const href = (f: string) => `/teach/students?${new URLSearchParams({ ...(q ? { q } : {}), ...(f !== "all" ? { filter: f } : {}) })}`;

  return (
    <>
      <PageHeader title="Students" description={`${all.length} learners enrolled in ${ctx.program.name}.`} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form className="flex-1" role="search">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <input name="q" defaultValue={q} placeholder="Search by name…" aria-label="Search learners"
            className="h-10 w-full max-w-sm rounded-[var(--radius-field)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20" />
        </form>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link key={f.key} href={href(f.key)} className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-semibold", filter === f.key ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]")}>{f.label}</Link>
          ))}
        </div>
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState icon="users" title="No learners match" description={q ? "Try a different name." : "Nobody in this group — good news."} /> : (
          <div className="table-wrap">
            <table className="table-dt min-w-[760px]">
              <thead><tr><th>Learner</th><th className="text-right">Handed in</th><th className="text-right">Missing</th><th className="text-right">Awaiting</th><th className="text-right">Below pass</th><th className="text-right" title="Mean of latest grades; ungraded work excluded">Average</th><th>Flags</th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/teach/students/${s.id}`} className="flex items-center gap-2.5 font-semibold hover:text-[var(--brand)]"><Avatar firstName={s.firstName} lastName={s.lastName} size={30} />{s.firstName} {s.lastName}</Link></td>
                    <td className="tnum text-right">{s.submitted}</td>
                    <td className={cn("tnum text-right", s.missing > 0 && "font-bold text-[var(--danger)]")}>{s.missing}</td>
                    <td className="tnum text-right">{s.awaiting}</td>
                    <td className={cn("tnum text-right", s.belowPass > 0 && "font-bold text-[var(--warning)]")}>{s.belowPass}</td>
                    <td className="tnum text-right">{formatPct(s.avgPct)}</td>
                    <td className="space-x-1 whitespace-nowrap">
                      {s.revision > 0 && <Badge tone="warning">Revising {s.revision}</Badge>}
                      {s.repeats > 0 && <Badge tone="info">Repeating</Badge>}
                      {s.missing + s.belowPass + s.revision + s.repeats === 0 && <Badge tone="success">On track</Badge>}
                    </td>
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

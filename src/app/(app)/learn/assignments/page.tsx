import Link from "next/link";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { WorkRow } from "@/components/learning";
import { cn } from "@/lib/utils";
import type { Bucket } from "@/lib/status";
import { learnerContext, NOT_ENROLLED } from "../data";

export const metadata = { title: "Assignments" };

const GROUPS: { bucket: Bucket; title: string; description: string }[] = [
  { bucket: "overdue", title: "Overdue", description: "Past the deadline with nothing handed in." },
  { bucket: "needs_action", title: "Revision & another attempt", description: "Your teacher has asked for more, or you can try again." },
  { bucket: "in_progress", title: "In progress", description: "Drafts you've started." },
  { bucket: "to_start", title: "To start", description: "Not opened yet." },
  { bucket: "awaiting_grading", title: "Awaiting grading", description: "Handed in — your teacher will grade these." },
  { bucket: "done", title: "Passed", description: "Work that met the pass mark." },
];

const FILTERS = [
  { key: "all", label: "All" }, { key: "open", label: "To do" }, { key: "overdue", label: "Overdue" },
  { key: "awaiting", label: "Awaiting grading" }, { key: "graded", label: "Graded" },
];

export default async function Assignments({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const ctx = await learnerContext();
  if (!ctx.program) return <><PageHeader title="Assignments" /><Card><EmptyState icon="edit" title="No programme yet" description={NOT_ENROLLED} /></Card></>;
  const { show = "all" } = await searchParams;
  const tz = ctx.program.timezone;
  const work = ctx.record.work.filter((w) =>
    show === "open" ? ["to_start", "in_progress", "needs_action", "overdue"].includes(w.status.bucket)
    : show === "overdue" ? w.status.bucket === "overdue"
    : show === "awaiting" ? w.status.bucket === "awaiting_grading"
    : show === "graded" ? Boolean(w.lastGrade)
    : true);

  return (
    <>
      <PageHeader title="Assignments" description="Everything you've been set, grouped by what it needs from you." />
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Filter assignments">
        {FILTERS.map((f) => (
          <Link key={f.key} href={f.key === "all" ? "/learn/assignments" : `/learn/assignments?show=${f.key}`} role="tab" aria-selected={show === f.key}
            className={cn("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold", show === f.key ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]")}>
            {f.label}
          </Link>
        ))}
      </div>
      {work.length === 0 ? (
        <Card><EmptyState icon="checkCircle" title={show === "all" ? "No assignments yet" : "Nothing here"} description={show === "all" ? "Assignments appear when your teachers publish them." : "Try another filter."} /></Card>
      ) : (
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const items = work.filter((w) => w.status.bucket === g.bucket).sort((a, b) => +a.assignment.dueAt - +b.assignment.dueAt);
            if (!items.length) return null;
            return (
              <Card key={g.bucket}>
                <CardHeader title={<>{g.title} <span className="tnum ml-1 text-[var(--text-subtle)]">{items.length}</span></>} description={g.description} />
                <div className="divide-y divide-[var(--border)]">{items.map((w) => <WorkRow key={w.assignment.id} item={w} tz={tz} />)}</div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { assignmentTable, AssignmentTable } from "../../teach/assignments/table";
import { adminContext } from "../data";

export const metadata = { title: "Assignments" };

const FILTERS = [
  { key: "all", label: "All" }, { key: "upcoming", label: "Upcoming" }, { key: "grading", label: "Awaiting grading" },
  { key: "missing", label: "Missing submissions" }, { key: "draft", label: "Drafts" }, { key: "archived", label: "Archived" },
];

export default async function AdminAssignments({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const ctx = await adminContext();
  if (!ctx.program) return <><PageHeader title="Assignments" /><Card><EmptyState icon="edit" title="No programme" action={<ButtonLink href="/admin/settings">Create one</ButtonLink>} /></Card></>;
  const { filter = "all" } = await searchParams;
  const rows = await assignmentTable(ctx.user, ctx.program.id, filter);
  return (
    <>
      <PageHeader title="Assignments" description="All assignments across the platform. 'Handed in' counts learners, not attempts; 'Missing' counts learners past the deadline with nothing handed in." />
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={f.key === "all" ? "/admin/assignments" : `/admin/assignments?filter=${f.key}`}
            className={cn("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold", filter === f.key ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]")}>{f.label}</Link>
        ))}
      </div>
      <Card>{rows.length === 0 ? <EmptyState icon="edit" title="No assignments here" /> : <AssignmentTable rows={rows} tz={ctx.program.timezone} base="/teach/assignments" />}</Card>
    </>
  );
}

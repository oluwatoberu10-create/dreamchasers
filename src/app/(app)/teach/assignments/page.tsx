import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { assignmentTable, AssignmentTable } from "./table";
import { teacherContext, NO_PROGRAM } from "../data";

export const metadata = { title: "Assignments" };

const FILTERS = [
  { key: "all", label: "All" }, { key: "upcoming", label: "Upcoming" }, { key: "grading", label: "Needs grading" },
  { key: "missing", label: "Missing submissions" }, { key: "draft", label: "Drafts" }, { key: "archived", label: "Archived" },
];

export default async function TeacherAssignments({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const ctx = await teacherContext();
  if (!ctx.program) return <><PageHeader title="Assignments" /><Card><EmptyState icon="edit" title="No programme" description={NO_PROGRAM} /></Card></>;
  const { filter = "all" } = await searchParams;
  const rows = await assignmentTable(ctx.user, ctx.program.id, filter);
  return (
    <>
      <PageHeader title="Assignments" description="Everything you've set, with submission and grading status." actions={<ButtonLink href="/teach/assignments/new"><Icon name="plus" className="h-4 w-4" />New assignment</ButtonLink>} />
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={f.key === "all" ? "/teach/assignments" : `/teach/assignments?filter=${f.key}`}
            className={cn("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold", filter === f.key ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]")}>{f.label}</Link>
        ))}
      </div>
      <Card>{rows.length === 0 ? <EmptyState icon="edit" title="No assignments here" description="Create an assignment from one of your courses." /> : <AssignmentTable rows={rows} tz={ctx.program.timezone} base="/teach/assignments" />}</Card>
    </>
  );
}

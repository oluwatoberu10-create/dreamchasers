import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { CourseStatusBadge, TrackDot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { cn, formatDateTime } from "@/lib/utils";
import { managedCourses } from "@/server/services/teaching";
import { teacherContext, NO_PROGRAM } from "../data";

export const metadata = { title: "My Courses" };

const TABS = [
  { key: "all", label: "All" }, { key: "draft", label: "Drafts" }, { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" }, { key: "archived", label: "Archived" },
];

export default async function TeacherCourses({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await teacherContext();
  if (!ctx.program) return <><PageHeader title="My Courses" /><Card><EmptyState icon="book" title="No programme" description={NO_PROGRAM} /></Card></>;
  const { status = "all" } = await searchParams;
  const all = await managedCourses(ctx.user, ctx.program.id);
  const effective = (c: (typeof all)[number]["course"]) => (c.status === "scheduled" && c.publishAt && c.publishAt <= new Date() ? "published" : c.status);
  const rows = all.filter((r) => (status === "all" ? effective(r.course) !== "archived" : effective(r.course) === status));
  const tz = ctx.program.timezone;

  return (
    <>
      <PageHeader title="My Courses" description="Courses you present or whose track you teach, organised by programme week."
        actions={<ButtonLink href="/teach/courses/new"><Icon name="plus" className="h-4 w-4" />New course</ButtonLink>} />
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const n = t.key === "all" ? all.filter((r) => effective(r.course) !== "archived").length : all.filter((r) => effective(r.course) === t.key).length;
          return (
            <Link key={t.key} href={t.key === "all" ? "/teach/courses" : `/teach/courses?status=${t.key}`}
              className={cn("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold", status === t.key ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]")}>
              {t.label} <span className="tnum opacity-70">{n}</span>
            </Link>
          );
        })}
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState icon="book" title="No courses here" description="Create your first course for this week's track." action={<ButtonLink href="/teach/courses/new" size="sm">New course</ButtonLink>} /> : (
          <div className="table-wrap">
            <table className="table-dt min-w-[720px]">
              <thead><tr><th>Week</th><th>Course</th><th>Track</th><th>Presenter</th><th className="text-right">Assignments</th><th>Status</th><th>Publication</th></tr></thead>
              <tbody>
                {rows.map(({ course: c, track, week, teacher, assignmentCount }) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap font-bold">Week {week.weekNumber}</td>
                    <td><Link href={`/teach/courses/${c.id}`} className="font-semibold hover:text-[var(--brand)]">{c.title}</Link></td>
                    <td className="whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><TrackDot color={track.color} />{track.name}</span></td>
                    <td className="whitespace-nowrap">{teacher.firstName} {teacher.lastName}</td>
                    <td className="tnum text-right">{assignmentCount}</td>
                    <td><CourseStatusBadge status={c.status} publishAt={c.publishAt} /></td>
                    <td className="whitespace-nowrap text-[12.5px] text-[var(--text-muted)]">{c.status === "draft" ? "—" : formatDateTime(c.publishedAt ?? c.publishAt, tz)}</td>
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

import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { CourseStatusBadge, TrackDot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { cn, formatDateOnly, formatDateTime } from "@/lib/utils";
import { courseSlots, managedCourses } from "@/server/services/teaching";
import { adminContext } from "../data";
import { AssignCourse } from "./assign-course";

export const metadata = { title: "Courses" };

export default async function AdminCourses({ searchParams }: { searchParams: Promise<{ status?: string; track?: string; teacher?: string; deleted?: string }> }) {
  const ctx = await adminContext();
  if (!ctx.program) return <><PageHeader title="Courses" /><Card><EmptyState icon="book" title="No programme" action={<ButtonLink href="/admin/settings">Create one</ButtonLink>} /></Card></>;
  const sp = await searchParams;
  const [all, slots, activeTeachers] = await Promise.all([
    managedCourses(ctx.user, ctx.program.id), courseSlots(ctx.program, ctx.weeks),
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users)
      .where(and(eq(users.role, "teacher"), eq(users.status, "active"))).orderBy(asc(users.firstName)),
  ]);
  const defaultWeek = ctx.weeks.find((w) => w.startsOn > ctx.clock.today)?.id ?? ctx.clock.currentWeek?.id ?? ctx.weeks[0]?.id ?? "";
  const tracks = [...new Map(slots.map((s) => [s.track.id, s.track])).values()];
  const teachers = [...new Map(all.map((r) => [r.teacher.id, r.teacher])).values()];
  const eff = (c: (typeof all)[number]["course"]) => (c.status === "scheduled" && c.publishAt && c.publishAt <= new Date() ? "published" : c.status);
  const rows = all.filter((r) => (!sp.status || eff(r.course) === sp.status) && (!sp.track || r.track.id === sp.track) && (!sp.teacher || r.teacher.id === sp.teacher));
  const tz = ctx.program.timezone;
  const link = (k: string, v: string | null) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([key, val]) => val && key !== "deleted") as [string, string][]);
    if (v) p.set(k, v); else p.delete(k);
    return `/admin/courses${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Courses" description="Every course in the programme, by every teacher." actions={<AssignCourse defaultWeek={defaultWeek}
        teachers={activeTeachers.map((t) => ({ id: t.id, label: `${t.firstName} ${t.lastName}` }))}
        weeks={ctx.weeks.map((w) => ({ id: w.id, label: `Week ${w.weekNumber} — ${formatDateOnly(w.startsOn, { day: "numeric", month: "short" })}` }))} />} />
      {sp.deleted && <div className="mb-4"><Notice tone="success">Course deleted.</Notice></div>}

      <Card className="mb-6">
        <CardHeader title="Weekly coverage" description="Each square is one track's course for one week. Green = live, blue = scheduled, amber = draft, red = missing (week started)." />
        <CardBody className="table-wrap">
          <table className="min-w-[720px] text-[12px]">
            <thead><tr><th className="pr-3 text-left font-semibold text-[var(--text-subtle)]">Track</th>{ctx.weeks.map((w) => <th key={w.id} className={cn("px-1 font-semibold", ctx.clock.currentWeek?.id === w.id ? "text-[var(--brand)]" : "text-[var(--text-subtle)]")}>W{w.weekNumber}</th>)}</tr></thead>
            <tbody>
              {tracks.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap py-1 pr-3 font-semibold"><span className="inline-flex items-center gap-1.5"><TrackDot color={t.color} />{t.name}</span></td>
                  {ctx.weeks.map((w) => {
                    const s = slots.find((x) => x.track.id === t.id && x.week.id === w.id);
                    if (!s) return <td key={w.id} className="px-1"><div className="h-8 rounded bg-[var(--surface-2)] opacity-40" title="Not part of this track" /></td>;
                    const started = w.startsOn <= ctx.clock.today;
                    const cls = s.fulfilled ? "bg-[var(--success)]" : s.scheduled ? "bg-[var(--info)]" : s.courses.length ? "bg-[var(--star-strong)]" : started ? "bg-[var(--danger)]" : "border border-dashed border-[var(--border-strong)]";
                    const c = s.courses[0];
                    return (
                      <td key={w.id} className="px-1">
                        <Link href={c ? `/teach/courses/${c.id}` : `/teach/courses/new?track=${t.id}&week=${w.id}`} title={`${t.name} week ${w.weekNumber}: ${c ? c.title : "no course"}`} className={cn("block h-8 rounded", cls)}>
                          <span className="sr-only">{c ? c.title : "Missing"}</span>
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {tracks.length === 0 && <p className="text-[13px] text-[var(--text-muted)]">Nothing yet. Use <strong>Create &amp; assign course</strong> above, and each course shows up here.</p>}
        </CardBody>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
        {[null, "draft", "scheduled", "published", "archived"].map((s) => (
          <Link key={s ?? "all"} href={link("status", s)} className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-semibold capitalize", (sp.status ?? null) === s ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{s ?? "All statuses"}</Link>
        ))}
        <span className="mx-1 w-px bg-[var(--border)]" />
        {tracks.map((t) => <Link key={t.id} href={link("track", sp.track === t.id ? null : t.id)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold", sp.track === t.id ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}><TrackDot color={t.color} />{t.name}</Link>)}
        <span className="mx-1 w-px bg-[var(--border)]" />
        {teachers.map((t) => <Link key={t.id} href={link("teacher", sp.teacher === t.id ? null : t.id)} className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-semibold", sp.teacher === t.id ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{t.firstName} {t.lastName}</Link>)}
      </div>

      <Card>
        {rows.length === 0 ? <EmptyState icon="book" title="No courses match" /> : (
          <div className="table-wrap">
            <table className="table-dt min-w-[820px]">
              <thead><tr><th>Week</th><th>Course</th><th>Track</th><th>Teacher</th><th className="text-right">Assignments</th><th>Status</th><th>Published / scheduled</th><th>Updated</th></tr></thead>
              <tbody>
                {rows.map(({ course: c, track, week, teacher, assignmentCount }) => (
                  <tr key={c.id}>
                    <td className="font-bold">W{week.weekNumber}</td>
                    <td><Link href={`/teach/courses/${c.id}`} className="font-semibold hover:text-[var(--brand)]">{c.title}</Link></td>
                    <td className="whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><TrackDot color={track.color} />{track.name}</span></td>
                    <td className="whitespace-nowrap">{teacher.firstName} {teacher.lastName}</td>
                    <td className="tnum text-right">{assignmentCount}</td>
                    <td><CourseStatusBadge status={c.status} publishAt={c.publishAt} /></td>
                    <td className="whitespace-nowrap text-[12.5px] text-[var(--text-muted)]">{c.status === "draft" ? "—" : formatDateTime(c.publishedAt ?? c.publishAt, tz)}</td>
                    <td className="whitespace-nowrap text-[12.5px] text-[var(--text-muted)]">{formatDateTime(c.updatedAt, tz, { day: "numeric", month: "short" })}</td>
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { assignments, courseResources, courses, files, repeatRequirements, submissions, users } from "@/db/schema";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge, CourseStatusBadge, TrackDot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { Prose } from "@/components/prose";
import { formatBytes, formatDateOnly, formatDateTime, relativeTime } from "@/lib/utils";
import { updateCourseAction } from "@/server/actions/teaching";
import { canManageCourse } from "@/server/policy";
import { teacherContext } from "../../data";
import { CourseForm } from "../course-form";
import { uploadsAvailable } from "@/server/services/storage";
import { ArchiveControl, PublishControl, RemoveResource, ResourceUploader, ResolveRepeat } from "./client";

export default async function TeacherCourse({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await teacherContext();
  if (!ctx.program || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [course] = await db.select().from(courses).where(eq(courses.id, id));
  if (!course || !(await canManageCourse(ctx.user, course))) notFound();

  const tz = ctx.program.timezone;
  const week = ctx.weeks.find((w) => w.id === course.weekId)!;
  const [resources, as, repeats, teacherRows] = await Promise.all([
    db.select({ r: courseResources, f: files }).from(courseResources).leftJoin(files, eq(files.id, courseResources.fileId)).where(eq(courseResources.courseId, id)).orderBy(asc(courseResources.position)),
    db.select({ a: assignments, handedIn: sql<number>`(select count(*)::int from ${submissions} s where s.assignment_id = ${assignments.id} and s.status <> 'in_progress')`, awaiting: sql<number>`(select count(*)::int from ${submissions} s where s.assignment_id = ${assignments.id} and s.status = 'submitted')` })
      .from(assignments).where(eq(assignments.courseId, id)).orderBy(asc(assignments.dueAt)),
    db.select({ r: repeatRequirements, first: users.firstName, last: users.lastName }).from(repeatRequirements).innerJoin(users, eq(users.id, repeatRequirements.studentId)).where(eq(repeatRequirements.courseId, id)),
    ctx.user.role === "super_admin" ? db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(and(inArray(users.role, ["teacher", "super_admin"]), eq(users.status, "active"))) : Promise.resolve(null),
  ]);
  const track = (await db.query.tracks.findFirst({ where: (t, { eq }) => eq(t.id, course.trackId) }))!;
  const presenter = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, course.teacherId) }))!;
  const trackOptions = ctx.tracks.some((t) => t.id === track.id) ? ctx.tracks : [track, ...ctx.tracks];
  const live = course.status === "published" || (course.status === "scheduled" && course.publishAt !== null && course.publishAt <= new Date());

  return (
    <>
      <PageHeader back={{ href: "/teach/courses", label: "My Courses" }}
        eyebrow={<span className="inline-flex items-center gap-1.5"><TrackDot color={track.color} />{track.name} · Week {week.weekNumber} ({formatDateOnly(week.startsOn, { day: "numeric", month: "short" })})</span>}
        title={course.title}
        description={<>Presented by {presenter.firstName} {presenter.lastName} · updated {relativeTime(course.updatedAt)}</>}
        actions={<><CourseStatusBadge status={course.status} publishAt={course.publishAt} /><ArchiveControl courseId={id} archived={course.status === "archived"} canDelete={ctx.user.role === "super_admin"} /></>} />

      {sp.created && <div className="mb-6"><Notice tone="success" title="Draft created">Next: add materials and an assignment, then publish or schedule it. Learners can't see drafts.</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Assignments" description="Linked to this course" action={course.status !== "archived" && <ButtonLink href={`/teach/assignments/new?course=${id}`} size="sm"><Icon name="plus" className="h-4 w-4" />New assignment</ButtonLink>} />
            {as.length === 0 ? <EmptyState compact icon="edit" title="No assignments yet" description="Add an assignment or assessment for learners to hand in." /> : (
              <ul className="divide-y divide-[var(--border)]">
                {as.map(({ a, handedIn, awaiting }) => (
                  <li key={a.id}><Link href={`/teach/assignments/${a.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-[var(--surface-2)]">
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold">{a.title}</span><span className="text-[12.5px] text-[var(--text-muted)]">Due {formatDateTime(a.dueAt, tz)} · pass {a.passMark}/{a.maxScore}</span></span>
                    <span className="tnum text-[12.5px] text-[var(--text-muted)]">{handedIn} handed in</span>
                    {awaiting > 0 && <Badge tone="brand">{awaiting} to grade</Badge>}
                    <Badge tone={a.status === "published" ? "success" : "neutral"}>{a.status === "published" ? "Published" : a.status === "draft" ? "Draft" : "Archived"}</Badge>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Materials" description="Files are private to enrolled learners and staff." />
            {resources.length > 0 && (
              <ul className="divide-y divide-[var(--border)] border-b border-[var(--border)]">
                {resources.map(({ r, f }) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                    <Icon name={r.kind === "video" ? "video" : r.kind === "link" ? "link" : "file"} className="h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
                    <a href={r.fileId ? `/api/files/${r.fileId}` : r.url!} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[13.5px] font-semibold hover:underline">{r.title}</a>
                    <span className="hidden text-[12px] text-[var(--text-subtle)] sm:inline">{f ? `${formatBytes(f.sizeBytes)}${r.downloadable ? "" : " · view only"}` : r.kind === "video" ? "Video link" : "Link"}</span>
                    <RemoveResource resourceId={r.id} title={r.title} />
                  </li>
                ))}
              </ul>
            )}
            <CardBody><ResourceUploader courseId={id} uploads={uploadsAvailable()} /></CardBody>
          </Card>

          <Card>
            <CardHeader title="Edit course" />
            <CardBody>
              <CourseForm action={updateCourseAction.bind(null, id)} submitLabel="Save changes"
                tracks={trackOptions.map((t) => ({ id: t.id, label: t.name }))}
                weeks={ctx.weeks.map((w) => ({ id: w.id, label: `Week ${w.weekNumber} — ${formatDateOnly(w.startsOn, { day: "numeric", month: "short" })}` }))}
                teachers={teacherRows?.map((t) => ({ id: t.id, label: `${t.firstName} ${t.lastName}` }))}
                initial={{ title: course.title, summary: course.summary ?? "", content: course.content, objectives: course.objectives.join("\n"), evaluationCriteria: course.evaluationCriteria ?? "", trackId: course.trackId, weekId: course.weekId, teacherId: course.teacherId }} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Publication" />
            <CardBody className="space-y-4">
              {live ? (
                <Notice tone="success" title="Live for learners">Published {formatDateTime(course.publishedAt ?? course.publishAt, tz)}. Learners were notified.</Notice>
              ) : course.status === "scheduled" ? (
                <Notice tone="info" title="Scheduled">Opens {formatDateTime(course.publishAt, tz)} ({tz}). Learners can see it's coming, but not its content.</Notice>
              ) : course.status === "archived" ? (
                <Notice tone="warning" title="Archived">Hidden from learners. Their submissions and grades are kept.</Notice>
              ) : (
                <p className="text-[13.5px] text-[var(--text-muted)]">Draft — only staff can see it. Week {week.weekNumber} starts {formatDateOnly(week.startsOn, { weekday: "long", day: "numeric", month: "short" })}.</p>
              )}
              {course.status !== "archived" && !live && <PublishControl courseId={id} scheduled={course.status === "scheduled"} defaultAt={`${week.startsOn}T08:00`} />}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Learner preview" />
            <CardBody className="max-h-[520px] overflow-y-auto">
              {course.objectives.length > 0 && <ul className="mb-4 list-disc space-y-1 pl-5 text-[13.5px]">{course.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>}
              {course.content.trim() ? <Prose source={course.content} small /> : <p className="text-[13px] text-[var(--text-subtle)]">No lesson text yet.</p>}
            </CardBody>
          </Card>

          {repeats.length > 0 && (
            <Card>
              <CardHeader title="Learners revisiting this course" />
              <ul className="divide-y divide-[var(--border)]">
                {repeats.map(({ r, first, last }) => (
                  <li key={r.id} className="space-y-1 px-5 py-3 text-[13px]">
                    <div className="flex items-center justify-between gap-2"><Link href={`/teach/students/${r.studentId}`} className="font-semibold hover:underline">{first} {last}</Link><Badge tone={r.status === "active" ? "info" : r.status === "completed" ? "success" : "neutral"}>{r.status}</Badge></div>
                    <p className="text-[var(--text-muted)]">{r.reason}</p>
                    {r.status === "active" && <ResolveRepeat repeatId={r.id} />}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

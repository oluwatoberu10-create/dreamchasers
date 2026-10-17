import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { courseResources, courses, files } from "@/db/schema";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge, TrackDot } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { WorkRow } from "@/components/learning";
import { Prose } from "@/components/prose";
import { formatBytes, formatDateTime } from "@/lib/utils";
import { studentCanViewCourse } from "@/server/policy";
import { recordCourseView } from "@/server/services/courses";
import { learnerContext } from "../../data";
import { CompleteToggle, MessageTeacher } from "./client";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await learnerContext();
  if (!ctx.program || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [course] = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
  // Not visible → 404, identical to "doesn't exist", so drafts can't be probed.
  if (!course || !(await studentCanViewCourse(ctx.user, course))) notFound();

  await recordCourseView(ctx.user, course);
  const item = ctx.record.courses.find((c) => c.course.id === id)!;
  const tz = ctx.program.timezone;
  const resources = await db.select({ r: courseResources, f: files }).from(courseResources)
    .leftJoin(files, eq(files.id, courseResources.fileId)).where(eq(courseResources.courseId, id)).orderBy(asc(courseResources.position));
  const work = ctx.record.work.filter((w) => w.course.id === id);

  const sameTrack = ctx.record.courses.filter((c) => c.track.id === item.track.id);
  const idx = sameTrack.findIndex((c) => c.course.id === id);
  const prev = sameTrack[idx - 1];
  const next = sameTrack[idx + 1];

  return (
    <>
      <PageHeader
        back={{ href: "/learn/courses", label: "All courses" }}
        eyebrow={<span className="inline-flex items-center gap-1.5"><TrackDot color={item.track.color} />{item.track.name} · Week {item.week.weekNumber}</span>}
        title={course.title}
        description={course.summary ?? undefined}
        actions={<CompleteToggle courseId={id} complete={Boolean(item.progress?.completedAt)} />}
      />

      {item.repeat && (
        <div className="mb-6">
          <Notice tone="info" icon="repeat" title="Keep learning — this course is open for another go">
            <p><strong>Why:</strong> {item.repeat.reason}</p>
            {item.repeat.guidance && <p className="mt-1"><strong>Your teacher suggests:</strong> {item.repeat.guidance}</p>}
            <p className="mt-1 text-[var(--text-muted)]">Your earlier attempts and feedback are kept. When you're ready, open the assignment below and start a new attempt.</p>
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {course.objectives.length > 0 && (
            <Card>
              <CardHeader title="What you'll learn" />
              <CardBody>
                <ul className="space-y-2">
                  {course.objectives.map((o, i) => <li key={i} className="flex gap-2.5 text-[14px]"><Icon name="checkCircle" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" />{o}</li>)}
                </ul>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Lesson" />
            <CardBody>{course.content.trim() ? <Prose source={course.content} /> : <p className="text-[14px] text-[var(--text-muted)]">Your teacher hasn't added lesson text — see the materials and assignments.</p>}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Assignments" description={work.length ? `${work.length} for this course` : undefined} />
            {work.length === 0 ? <EmptyState compact icon="edit" title="No assignments for this course" /> : (
              <div className="divide-y divide-[var(--border)]">{work.map((w) => <WorkRow key={w.assignment.id} item={w} tz={tz} showCourse={false} />)}</div>
            )}
          </Card>
          <nav className="flex justify-between gap-3" aria-label="Course navigation">
            {prev ? <Link href={`/learn/courses/${prev.course.id}`} className="card lift flex-1 p-4 text-[13px]"><span className="text-[var(--text-subtle)]">← Week {prev.week.weekNumber}</span><span className="mt-0.5 block truncate font-bold">{prev.course.title}</span></Link> : <span className="flex-1" />}
            {next ? <Link href={`/learn/courses/${next.course.id}`} className="card lift flex-1 p-4 text-right text-[13px]"><span className="text-[var(--text-subtle)]">Week {next.week.weekNumber} →</span><span className="mt-0.5 block truncate font-bold">{next.course.title}</span></Link> : <span className="flex-1" />}
          </nav>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Materials" />
            {resources.length === 0 ? <EmptyState compact icon="folder" title="No materials yet" /> : (
              <ul className="divide-y divide-[var(--border)]">
                {resources.map(({ r, f }) => {
                  const href = r.fileId ? `/api/files/${r.fileId}${r.downloadable ? "" : "?inline=1"}` : r.url!;
                  const external = !r.fileId;
                  return (
                    <li key={r.id}>
                      <a href={href} target={external || !r.downloadable ? "_blank" : undefined} rel={external ? "noopener noreferrer nofollow" : undefined}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--surface-2)]">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--text-muted)]">
                          <Icon name={r.kind === "video" ? "video" : r.kind === "link" ? "link" : "file"} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold">{r.title}</span>
                          <span className="block text-[12px] text-[var(--text-muted)]">
                            {f ? `${f.originalName.split(".").pop()?.toUpperCase()} · ${formatBytes(f.sizeBytes)}${r.downloadable ? "" : " · view only"}` : new URL(r.url!).hostname}
                          </span>
                        </span>
                        <Icon name={external ? "external" : r.downloadable ? "download" : "eye"} className="h-4 w-4 text-[var(--text-subtle)]" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card>
            <CardBody className="space-y-3 text-[13.5px]">
              <div className="flex justify-between gap-2"><span className="text-[var(--text-muted)]">Teacher</span><span className="font-semibold">{item.teacher.firstName} {item.teacher.lastName}</span></div>
              <div className="flex justify-between gap-2"><span className="text-[var(--text-muted)]">Published</span><span>{formatDateTime(course.publishedAt ?? course.publishAt, tz)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-[var(--text-muted)]">Your status</span>{item.progress?.completedAt ? <Badge tone="success">Completed</Badge> : <Badge tone="brand">In progress</Badge>}</div>
              {course.evaluationCriteria && <div className="border-t border-[var(--border)] pt-3"><div className="mb-1 font-semibold">How this course is evaluated</div><p className="text-[var(--text-muted)]">{course.evaluationCriteria}</p></div>}
              <MessageTeacher teacherId={item.teacher.id} courseTitle={course.title} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

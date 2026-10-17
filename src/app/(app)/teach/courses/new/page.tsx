import { asc, eq, inArray, and } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatDateOnly } from "@/lib/utils";
import { createCourseAction } from "@/server/actions/teaching";
import { teacherContext, NO_PROGRAM } from "../../data";
import { CourseForm } from "../course-form";

export const metadata = { title: "New course" };

export default async function NewCourse({ searchParams }: { searchParams: Promise<{ track?: string; week?: string }> }) {
  const ctx = await teacherContext();
  if (!ctx.program) return <><PageHeader title="New course" /><Card><EmptyState icon="book" title="No programme" description={NO_PROGRAM} /></Card></>;
  const sp = await searchParams;
  const teachers = ctx.user.role === "super_admin"
    ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users)
      .where(and(inArray(users.role, ["teacher", "super_admin"]), eq(users.status, "active"))).orderBy(asc(users.firstName))
    : undefined;
  const defaultWeek = sp.week ?? ctx.weeks.find((w) => w.startsOn > ctx.clock.today)?.id ?? ctx.clock.currentWeek?.id ?? "";

  return (
    <>
      <PageHeader title="New course" back={{ href: "/teach/courses", label: "My Courses" }} description="Courses start as drafts. Add materials and assignments, then publish or schedule them." />
      <Card><CardBody>
        <CourseForm action={createCourseAction} submitLabel="Create draft"
          tracks={ctx.tracks.map((t) => ({ id: t.id, label: t.name }))}
          weeks={ctx.weeks.map((w) => ({ id: w.id, label: `Week ${w.weekNumber} — ${formatDateOnly(w.startsOn, { day: "numeric", month: "short" })}` }))}
          teachers={teachers?.map((t) => ({ id: t.id, label: `${t.firstName} ${t.lastName}` }))}
          initial={{ title: "", summary: "", content: "", objectives: "", evaluationCriteria: "", trackId: sp.track ?? "", weekId: defaultWeek, teacherId: ctx.user.id }} />
      </CardBody></Card>
    </>
  );
}

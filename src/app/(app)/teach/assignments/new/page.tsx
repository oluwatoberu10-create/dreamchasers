import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { createAssignmentAction } from "@/server/actions/teaching";
import { managedCourses } from "@/server/services/teaching";
import { teacherContext, NO_PROGRAM } from "../../data";
import { AssignmentForm } from "../assignment-form";

export const metadata = { title: "New assignment" };

export default async function NewAssignment({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const ctx = await teacherContext();
  if (!ctx.program) return <><PageHeader title="New assignment" /><Card><EmptyState icon="edit" title="No programme" description={NO_PROGRAM} /></Card></>;
  const { course } = await searchParams;
  const courses = (await managedCourses(ctx.user, ctx.program.id)).filter((c) => c.course.status !== "archived");
  if (courses.length === 0) return <><PageHeader title="New assignment" back={{ href: "/teach/assignments", label: "Assignments" }} /><Card><EmptyState icon="book" title="Create a course first" description="Assignments belong to a course." action={<ButtonLink href="/teach/courses/new" size="sm">New course</ButtonLink>} /></Card></>;
  const chosen = courses.find((c) => c.course.id === course) ?? null;
  const dueDefault = `${(chosen?.week ?? ctx.clock.currentWeek ?? ctx.weeks[0]).endsOn}T23:59`;

  return (
    <>
      <PageHeader title="New assignment" back={chosen ? { href: `/teach/courses/${chosen.course.id}`, label: chosen.course.title } : { href: "/teach/assignments", label: "Assignments" }} />
      <Card><CardBody>
        <AssignmentForm action={createAssignmentAction} isNew hasSubmissions={false}
          courses={courses.map((c) => ({ id: c.course.id, label: `Week ${c.week.weekNumber} · ${c.track.name} · ${c.course.title}` }))}
          initial={{ courseId: chosen?.course.id ?? "", kind: "assignment", title: "", instructions: "", maxScore: 100, passMark: 50, dueAt: dueDefault,
            allowText: true, allowFiles: false, requiredFilesNote: "", acceptLate: true, resubmissionPolicy: "on_request", maxAttempts: null, rubric: [], status: "draft" }} />
      </CardBody></Card>
    </>
  );
}

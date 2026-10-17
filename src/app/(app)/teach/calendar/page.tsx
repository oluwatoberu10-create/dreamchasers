import { Calendar } from "@/components/calendar";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { calendarEvents } from "@/server/services/calendar";
import { teacherContext, NO_PROGRAM } from "../data";

export const metadata = { title: "Course Calendar" };

export default async function TeacherCalendar() {
  const ctx = await teacherContext();
  if (!ctx.program) return <><PageHeader title="Course Calendar" /><Card><EmptyState icon="calendar" title="No programme" description={NO_PROGRAM} /></Card></>;
  const events = await calendarEvents(ctx.user, ctx.program, ctx.weeks);
  return (
    <>
      <PageHeader title="Course Calendar" description={`Your courses, publication schedule, deadlines and the courses still needed. Times in ${ctx.program.timezone}.`} />
      <Calendar events={events} today={ctx.clock.today} programStart={ctx.weeks[0]?.startsOn} programEnd={ctx.clock.endDate} />
    </>
  );
}

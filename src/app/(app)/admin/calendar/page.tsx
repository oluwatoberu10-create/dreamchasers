import { Calendar } from "@/components/calendar";
import { Card, PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { formatDateOnly } from "@/lib/utils";
import { calendarEvents } from "@/server/services/calendar";
import { adminContext } from "../data";

export const metadata = { title: "Program Calendar" };

export default async function AdminCalendar() {
  const ctx = await adminContext();
  if (!ctx.program) return <><PageHeader title="Program Calendar" /><Card><EmptyState icon="calendar" title="No programme" action={<ButtonLink href="/admin/settings">Create one</ButtonLink>} /></Card></>;
  const events = await calendarEvents(ctx.user, ctx.program, ctx.weeks);
  return (
    <>
      <PageHeader title="Program Calendar" description={`${ctx.program.name}: ${formatDateOnly(ctx.program.startDate)} – ${formatDateOnly(ctx.clock.endDate)} · ${ctx.program.weeksCount} weeks · ${ctx.program.timezone}. Every course, deadline, milestone and missing course across all teachers.`} />
      <Calendar events={events} today={ctx.clock.today} programStart={ctx.weeks[0]?.startsOn} programEnd={ctx.clock.endDate} />
    </>
  );
}

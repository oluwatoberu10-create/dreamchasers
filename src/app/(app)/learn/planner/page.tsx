import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { personalTasks } from "@/db/schema";
import { Calendar } from "@/components/calendar";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { WorkRow } from "@/components/learning";
import { calendarEvents } from "@/server/services/calendar";
import { learnerContext, NOT_ENROLLED } from "../data";
import { TaskList } from "./tasks";

export const metadata = { title: "Planner" };

export default async function Planner() {
  const ctx = await learnerContext();
  if (!ctx.program) return <><PageHeader title="Planner" /><Card><EmptyState icon="calendar" title="No programme yet" description={NOT_ENROLLED} /></Card></>;
  const { program, weeks, clock, record, user } = ctx;
  const tz = program.timezone;

  const [events, tasks] = await Promise.all([
    calendarEvents(user, program, weeks),
    db.select().from(personalTasks).where(eq(personalTasks.userId, user.id)).orderBy(asc(personalTasks.completedAt), asc(personalTasks.dueOn), asc(personalTasks.createdAt)),
  ]);

  // Assignment to-dos are derived from the work itself, so handing something
  // in moves it here automatically — there is nothing to keep in sync.
  const open = record.work.filter((w) => ["overdue", "needs_action", "in_progress", "to_start"].includes(w.status.bucket))
    .sort((a, b) => +a.assignment.dueAt - +b.assignment.dueAt);
  const waiting = record.work.filter((w) => w.status.bucket === "awaiting_grading");

  return (
    <>
      <PageHeader title="Planner" description="Your to-do list and the programme calendar in one place. Times are shown in the programme's timezone." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="order-2 xl:order-1">
          <Calendar events={events} today={clock.today} programStart={weeks[0]?.startsOn} programEnd={clock.endDate} />
          <p className="mt-2 text-[12px] text-[var(--text-subtle)]">Timezone: {tz}</p>
        </div>
        <div className="order-1 space-y-6 xl:order-2">
          <Card>
            <CardHeader title="To do" description="From your assignments" />
            {open.length === 0 ? <EmptyState compact icon="checkCircle" title="Nothing to do right now" description="New assignments will appear here automatically." /> : (
              <div className="divide-y divide-[var(--border)]">{open.map((w) => <WorkRow key={w.assignment.id} item={w} tz={tz} />)}</div>
            )}
            {waiting.length > 0 && (
              <>
                <div className="border-t border-[var(--border)] px-5 pb-1 pt-3 text-[11.5px] font-bold uppercase tracking-[0.08em] text-[var(--text-subtle)]">Submitted — awaiting grading</div>
                <div className="divide-y divide-[var(--border)]">{waiting.map((w) => <WorkRow key={w.assignment.id} item={w} tz={tz} />)}</div>
              </>
            )}
          </Card>
          <Card>
            <CardHeader title="My tasks" description="Personal reminders only you can see" />
            <TaskList tasks={tasks.map((t) => ({ id: t.id, title: t.title, notes: t.notes, dueOn: t.dueOn, done: Boolean(t.completedAt) }))} today={clock.today} />
          </Card>
        </div>
      </div>
    </>
  );
}

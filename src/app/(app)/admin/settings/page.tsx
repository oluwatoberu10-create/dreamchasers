import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { programs, trackTeachers, users } from "@/db/schema";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge, TrackDot } from "@/components/ui/badge";
import { formatDateOnly } from "@/lib/utils";
import { addDays, snapToWeekday } from "@/lib/dates";
import { getSettings } from "@/server/services/settings";
import { getTracks } from "@/server/services/program";
import { adminContext } from "../data";
import { MakeCurrent, PlatformForm, ProgramForm, TrackEditor, TrackTeacherAssign, WeekRow } from "./client";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const ctx = await adminContext();
  const [settings, allPrograms] = await Promise.all([getSettings(), db.select().from(programs).orderBy(desc(programs.createdAt))]);
  const p = ctx.program;
  const tracks = p ? await getTracks(p.id) : [];
  const assignments = tracks.length ? await db.select({ trackId: trackTeachers.trackId, id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(trackTeachers).innerJoin(users, eq(users.id, trackTeachers.teacherId)).where(inArray(trackTeachers.trackId, tracks.map((t) => t.id))) : [];
  const staff = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users)
    .where(and(inArray(users.role, ["teacher", "super_admin"]), eq(users.status, "active"))).orderBy(asc(users.firstName));
  const nextMonday = snapToWeekday(addDays(new Date().toISOString().slice(0, 10), 1), 1);

  return (
    <>
      <PageHeader title="Settings" description="Programme dates, weekly structure, teaching tracks, reminders and platform rules. Changes are recorded in the activity log." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={p ? "Current programme" : "Create the first programme"} description={p ? `${formatDateOnly(p.startDate)} – ${formatDateOnly(ctx.clock.endDate)} · ${p.weeksCount} weeks` : "Typically 12 or 13 weeks. New learners are enrolled automatically."} />
            <CardBody>
              <ProgramForm programId={p?.id ?? null} initial={p ? {
                name: p.name, description: p.description ?? "", startDate: p.startDate, weeksCount: p.weeksCount, timezone: p.timezone, weekStartDay: p.weekStartDay,
                reminderDaysBefore: p.reminderDaysBefore, reminderHour: p.reminderHour, status: p.status,
              } : { name: "", description: "", startDate: nextMonday, weeksCount: 12, timezone: "Europe/London", weekStartDay: 1, reminderDaysBefore: 3, reminderHour: 9, status: "active" }} />
            </CardBody>
          </Card>

          {p && (
            <Card>
              <CardHeader title="Tracks & teaching responsibilities" description="Each track expects one published course per week in its range. Teachers on a track receive the reminders for it." />
              <CardBody className="space-y-4">
                {tracks.map((t) => {
                  const assigned = assignments.filter((a) => a.trackId === t.id);
                  return (
                    <div key={t.id} className="rounded-xl border border-[var(--border)] p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2"><TrackDot color={t.color} /><span className="text-[15px] font-bold">{t.name}</span><span className="text-[12.5px] text-[var(--text-muted)]">Weeks {t.weekFrom}–{t.weekTo}</span></div>
                      <TrackTeacherAssign trackId={t.id} assigned={assigned} staff={staff.filter((s) => !assigned.some((a) => a.id === s.id))} />
                      <details className="mt-3"><summary className="cursor-pointer text-[12.5px] font-semibold text-[var(--brand)]">Edit track</summary>
                        <div className="mt-3"><TrackEditor programId={p.id} trackId={t.id} weeks={p.weeksCount} initial={{ name: t.name, description: t.description ?? "", color: t.color, weekFrom: t.weekFrom, weekTo: t.weekTo }} /></div>
                      </details>
                    </div>
                  );
                })}
                <details className="rounded-xl border border-dashed border-[var(--border-strong)] p-4" open={tracks.length === 0}>
                  <summary className="cursor-pointer text-[13.5px] font-bold">Add a track</summary>
                  <div className="mt-3"><TrackEditor programId={p.id} trackId={null} weeks={p.weeksCount} initial={{ name: "", description: "", color: "#2563eb", weekFrom: 1, weekTo: p.weeksCount }} /></div>
                </details>
              </CardBody>
            </Card>
          )}

          {p && (
            <Card>
              <CardHeader title="Weeks" description={`Dates follow the start date in ${p.timezone}. Rename weeks to give each one a theme.`} />
              <ul className="divide-y divide-[var(--border)]">
                {ctx.weeks.map((w) => <WeekRow key={w.id} weekId={w.id} number={w.weekNumber} title={w.title} theme={w.theme ?? ""} range={`${formatDateOnly(w.startsOn, { day: "numeric", month: "short" })} – ${formatDateOnly(w.endsOn, { day: "numeric", month: "short" })}`} current={ctx.clock.currentWeek?.id === w.id} />)}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Platform rules" />
            <CardBody><PlatformForm initial={settings} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="All programmes" description="Only one is current. New registrations join the current one." />
            <ul className="divide-y divide-[var(--border)]">
              {allPrograms.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13.5px]">
                  <span className="min-w-0 flex-1"><span className="block font-semibold">{x.name}</span><span className="text-[12px] text-[var(--text-muted)]">{formatDateOnly(x.startDate)} · {x.weeksCount} weeks · {x.status}</span></span>
                  {x.isCurrent ? <Badge tone="success">Current</Badge> : <MakeCurrent programId={x.id} />}
                </li>
              ))}
              {allPrograms.length === 0 && <li className="px-5 py-4 text-[13px] text-[var(--text-muted)]">None yet.</li>}
            </ul>
            {p && <CardBody className="border-t border-[var(--border)]"><details><summary className="cursor-pointer text-[13px] font-semibold text-[var(--brand)]">Start a new programme</summary>
              <div className="mt-3"><ProgramForm programId={null} initial={{ name: "", description: "", startDate: nextMonday, weeksCount: 12, timezone: p.timezone, weekStartDay: p.weekStartDay, reminderDaysBefore: p.reminderDaysBefore, reminderHour: p.reminderHour, status: "draft" }} /></div>
            </details></CardBody>}
          </Card>
        </div>
      </div>
    </>
  );
}

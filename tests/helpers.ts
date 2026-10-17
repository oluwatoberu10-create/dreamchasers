import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { addDays, buildWeeks, localDate, weekdayOf, zonedTimeToUtc } from "@/lib/dates";

export type U = typeof s.users.$inferSelect;

/** Empties every table between test files. */
export async function wipe(): Promise<void> {
  const r = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const names = r.rows.map((x) => `"${x.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`truncate ${names} restart identity cascade`));
}

let n = 0;
export async function user(role: U["role"], first = "Test"): Promise<U> {
  n++;
  const [u] = await db.insert(s.users).values({
    email: `${role}${n}-${Date.now()}@test.local`, passwordHash: "x", firstName: first, lastName: `${role}${n}`, role,
  }).returning();
  return u;
}

/**
 * A running programme in `tz` whose week 2 is the current week, with one
 * track taught by `teacher`, and `students` enrolled.
 */
export async function world(opts: { tz?: string; weeks?: number } = {}) {
  const tz = opts.tz ?? "Europe/London";
  const today = localDate(new Date(), tz);
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const startDate = addDays(monday, -7);

  await db.update(s.programs).set({ isCurrent: false });
  const admin = await user("super_admin", "Admin");
  const teacher = await user("teacher", "Tara");
  const otherTeacher = await user("teacher", "Omar");
  const alice = await user("student", "Alice");
  const bob = await user("student", "Bob");

  const [program] = await db.insert(s.programs).values({
    name: "Test cohort", status: "active", isCurrent: true, startDate, weeksCount: opts.weeks ?? 12, timezone: tz, weekStartDay: 1,
    reminderDaysBefore: 3, reminderHour: 0,
  }).returning();
  const weeks = await db.insert(s.programWeeks).values(buildWeeks(startDate, opts.weeks ?? 12).map((w) => ({ ...w, programId: program.id, title: `Week ${w.weekNumber}` }))).returning();
  weeks.sort((a, b) => a.weekNumber - b.weekNumber);
  const [track] = await db.insert(s.tracks).values({ programId: program.id, name: "Maths", weekFrom: 1, weekTo: opts.weeks ?? 12 }).returning();
  const [otherTrack] = await db.insert(s.tracks).values({ programId: program.id, name: "Art", weekFrom: 1, weekTo: opts.weeks ?? 12 }).returning();
  await db.insert(s.trackTeachers).values([{ trackId: track.id, teacherId: teacher.id }, { trackId: otherTrack.id, teacherId: otherTeacher.id }]);
  const enrolledAt = zonedTimeToUtc(startDate, 0, 0, tz);
  await db.insert(s.enrollments).values([{ programId: program.id, studentId: alice.id, enrolledAt }, { programId: program.id, studentId: bob.id, enrolledAt }]);

  const local = (date: string, h: number, m = 0) => zonedTimeToUtc(date, h, m, tz);
  return { tz, today, program, weeks, track, otherTrack, admin, teacher, otherTeacher, alice, bob, local };
}

export async function notificationsFor(userId: string) {
  return db.select().from(s.notifications).where(sql`${s.notifications.recipientId} = ${userId}`);
}

/** "YYYY-MM-DDTHH:mm" for a date n days from today, as typed into a datetime-local input. */
export function localInput(today: string, days: number, time = "23:59"): string {
  return `${addDays(today, days)}T${time}`;
}

export function fakeFile(name: string, bytes: number[] | Uint8Array, type = "application/octet-stream"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

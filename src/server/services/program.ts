import "server-only";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { cache } from "react";
import { db, type DbOrTx } from "@/db";
import { courses, programWeeks, programs, trackTeachers, tracks } from "@/db/schema";
import { buildWeeks, localDate, programEndDate, programPhase, type ProgramPhase } from "@/lib/dates";
import { conflict } from "@/lib/errors";

export type Program = typeof programs.$inferSelect;
export type Week = typeof programWeeks.$inferSelect;
export type Track = typeof tracks.$inferSelect;

export const getCurrentProgram = cache(async (): Promise<Program | null> => {
  const [p] = await db.select().from(programs).where(eq(programs.isCurrent, true)).limit(1);
  return p ?? null;
});

export async function getWeeks(programId: string, conn: DbOrTx = db): Promise<Week[]> {
  return conn.select().from(programWeeks).where(eq(programWeeks.programId, programId)).orderBy(asc(programWeeks.weekNumber));
}

export type ProgramClock = {
  today: string;
  phase: ProgramPhase;
  endDate: string;
  /** The running week, or null before the start / after the end. */
  currentWeek: Week | null;
  /** Weeks whose start date has been reached. */
  weeksElapsed: number;
};

/** "What week is it?" — always answered in the programme's own timezone. */
export function programClock(program: Program, weeks: Week[], now = new Date()): ProgramClock {
  const today = localDate(now, program.timezone);
  const phase = programPhase(program.startDate, program.weeksCount, today);
  const currentWeek = phase.phase === "running" ? weeks.find((w) => w.weekNumber === phase.weekNumber) ?? null : null;
  const weeksElapsed = phase.phase === "before" ? 0 : phase.phase === "after" ? program.weeksCount : phase.weekNumber;
  return { today, phase, endDate: programEndDate(program.startDate, program.weeksCount), currentWeek, weeksElapsed };
}

/**
 * Brings `program_weeks` in line with the programme's start date and length.
 * Existing weeks keep their titles and themes; only dates move. Weeks beyond a
 * shortened programme are removed — unless a course already sits in one, in
 * which case the change is refused rather than orphaning that course.
 */
export async function syncWeeks(tx: DbOrTx, program: Program): Promise<void> {
  const spans = buildWeeks(program.startDate, program.weeksCount);
  const existing = await getWeeks(program.id, tx);
  const byNumber = new Map(existing.map((w) => [w.weekNumber, w]));

  const surplus = existing.filter((w) => w.weekNumber > program.weeksCount);
  if (surplus.length > 0) {
    const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(courses)
      .where(inArray(courses.weekId, surplus.map((w) => w.id)));
    if ((used?.n ?? 0) > 0) {
      throw conflict(`Weeks ${surplus.map((w) => w.weekNumber).join(", ")} already contain courses. Move or archive them before shortening the programme.`);
    }
    await tx.delete(programWeeks).where(and(eq(programWeeks.programId, program.id), gt(programWeeks.weekNumber, program.weeksCount)));
  }

  for (const span of spans) {
    const found = byNumber.get(span.weekNumber);
    if (found) {
      if (found.startsOn !== span.startsOn || found.endsOn !== span.endsOn) {
        await tx.update(programWeeks).set({ startsOn: span.startsOn, endsOn: span.endsOn }).where(eq(programWeeks.id, found.id));
      }
    } else {
      await tx.insert(programWeeks).values({
        programId: program.id, weekNumber: span.weekNumber, title: `Week ${span.weekNumber}`,
        startsOn: span.startsOn, endsOn: span.endsOn,
      });
    }
  }
}

export async function getTracks(programId: string, conn: DbOrTx = db): Promise<Track[]> {
  return conn.select().from(tracks).where(eq(tracks.programId, programId)).orderBy(asc(tracks.name));
}

/** Tracks a teacher is responsible for in a programme. */
export async function teacherTracks(teacherId: string, programId: string, conn: DbOrTx = db): Promise<Track[]> {
  const rows = await conn.select({ track: tracks }).from(trackTeachers)
    .innerJoin(tracks, eq(tracks.id, trackTeachers.trackId))
    .where(and(eq(trackTeachers.teacherId, teacherId), eq(tracks.programId, programId)))
    .orderBy(asc(tracks.name));
  return rows.map((r) => r.track);
}

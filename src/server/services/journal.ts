import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, transaction } from "@/db";
import { journalEntries, programWeeks, type JournalResponses } from "@/db/schema";
import { conflict, forbidden, notFound, validationError } from "@/lib/errors";
import { localDate } from "@/lib/dates";
import type { SessionUser } from "@/server/auth";
import { isEnrolled } from "@/server/policy";
import { getCurrentProgram } from "./program";

type Actor = Pick<SessionUser, "id" | "role">;
export type JournalEntry = typeof journalEntries.$inferSelect;

export const JOURNAL_PROMPTS: { key: keyof JournalResponses; label: string; hint: string }[] = [
  { key: "learned", label: "What have you learned this week?", hint: "The main ideas, in your own words." },
  { key: "skills", label: "What new skills or knowledge have you gained?", hint: "Something you can do now that you couldn't before." },
  { key: "mostUseful", label: "What was the most useful thing you learned?", hint: "And why it matters to you." },
  { key: "enjoyedLearning", label: "What did you enjoy about this week's learning?", hint: "A lesson, an activity, a moment it clicked." },
  { key: "enjoyedCommunity", label: "What did you enjoy about the Dream Chasers Community?", hint: "People, feedback, support." },
  { key: "difficult", label: "What was difficult for you?", hint: "Being honest here helps your teachers help you." },
  { key: "improve", label: "What would you like to improve next week?", hint: "One or two specific things." },
  { key: "goals", label: "What are your goals for the coming week?", hint: "Small, concrete and achievable." },
];

/**
 * Loads a week for journalling. Learners may write about weeks that have
 * started — not future ones — in a programme they are enrolled in.
 */
async function journalWeek(student: Actor, weekId: string) {
  if (student.role !== "student") throw forbidden("Journals belong to learners.");
  const program = await getCurrentProgram();
  const [week] = await db.select().from(programWeeks).where(eq(programWeeks.id, weekId));
  if (!week || !program || week.programId !== program.id) throw notFound("That week is not part of your programme.");
  if (!(await isEnrolled(student.id, program.id))) throw forbidden("You are not enrolled in this programme.");
  if (week.startsOn > localDate(new Date(), program.timezone)) throw validationError("You can write about this week once it has started.");
  return week;
}

function clean(responses: JournalResponses): JournalResponses {
  const out: JournalResponses = {};
  for (const p of JOURNAL_PROMPTS) out[p.key] = (responses[p.key] ?? "").slice(0, 5000);
  return out;
}

/** Saves (autosave or explicit). Submitted entries can still be edited; they stay submitted. */
export async function saveJournal(student: Actor, weekId: string, responses: JournalResponses): Promise<JournalEntry> {
  await journalWeek(student, weekId);
  const [row] = await db.insert(journalEntries).values({ studentId: student.id, weekId, responses: clean(responses) })
    .onConflictDoUpdate({ target: [journalEntries.studentId, journalEntries.weekId], set: { responses: clean(responses), updatedAt: new Date() } })
    .returning();
  return row;
}

export async function submitJournal(student: Actor, weekId: string, responses: JournalResponses): Promise<JournalEntry> {
  await journalWeek(student, weekId);
  const filled = JOURNAL_PROMPTS.filter((p) => (responses[p.key] ?? "").trim().length > 0).length;
  if (filled < 3) throw validationError("Answer at least three of the prompts before completing your reflection.");
  return transaction(async (tx) => {
    const [row] = await tx.insert(journalEntries).values({ studentId: student.id, weekId, responses: clean(responses), status: "submitted", submittedAt: new Date() })
      .onConflictDoUpdate({
        target: [journalEntries.studentId, journalEntries.weekId],
        set: { responses: clean(responses), status: "submitted", submittedAt: new Date(), updatedAt: new Date() },
      }).returning();
    if (!row) throw conflict("Could not save your reflection.");
    return row;
  });
}

/** Moves a completed reflection back to a private draft. */
export async function reopenJournal(student: Actor, weekId: string): Promise<void> {
  await db.update(journalEntries).set({ status: "draft", submittedAt: null, updatedAt: new Date() })
    .where(and(eq(journalEntries.studentId, student.id), eq(journalEntries.weekId, weekId)));
}

export async function journalHistory(studentId: string, programId: string) {
  return db.select({ entry: journalEntries, week: programWeeks }).from(journalEntries)
    .innerJoin(programWeeks, eq(programWeeks.id, journalEntries.weekId))
    .where(and(eq(journalEntries.studentId, studentId), eq(programWeeks.programId, programId)))
    .orderBy(asc(programWeeks.weekNumber));
}

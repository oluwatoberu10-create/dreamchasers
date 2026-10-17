import "server-only";
import { db, type DbOrTx } from "@/db";
import { platformSettings } from "@/db/schema";

/**
 * Platform-wide switches. Defaults live here so a fresh database behaves
 * sensibly before an admin has saved anything.
 */
export type PlatformSettings = {
  /** Super admins get an in-app notification for every submission. */
  notifyAdminsOnSubmission: boolean;
  /** Teachers may read learners' SUBMITTED journal entries (never drafts). */
  teacherJournalAccess: boolean;
  /** New registrations join the current programme automatically. */
  autoEnrollNewStudents: boolean;
  /** Learners may reopen courses from earlier weeks. */
  allowRevisitPastCourses: boolean;
  /** Hours before a deadline that the "due soon" notification goes out. */
  deadlineReminderHours: number;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  notifyAdminsOnSubmission: true,
  teacherJournalAccess: true,
  autoEnrollNewStudents: true,
  allowRevisitPastCourses: true,
  deadlineReminderHours: 24,
};

export async function getSettings(conn: DbOrTx = db): Promise<PlatformSettings> {
  const rows = await conn.select().from(platformSettings);
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  return out as PlatformSettings;
}

export async function saveSettings(patch: Partial<PlatformSettings>, userId: string, conn: DbOrTx = db): Promise<void> {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    await conn.insert(platformSettings)
      .values({ key, value, updatedById: userId, updatedAt: new Date() })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedById: userId, updatedAt: new Date() } });
  }
}

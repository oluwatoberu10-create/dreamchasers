import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { closePool } from "@/db/migrate";
import { addDays, zonedTimeToUtc } from "@/lib/dates";
import { journalAccess } from "@/server/policy";
import { createCourse, setPublication } from "@/server/services/courses";
import { journalHistory, saveJournal, submitJournal } from "@/server/services/journal";
import { listConversations, openConversation, readConversation, sendMessage } from "@/server/services/messaging";
import { markAllRead, markRead, notify, unreadCount } from "@/server/services/notifications";
import { runCourseReminders, weeksInReminderWindow } from "@/server/services/reminders";
import { saveSettings } from "@/server/services/settings";
import { validateUpload } from "@/server/services/storage";
import { notificationsFor, user, wipe, world } from "./helpers";

beforeAll(wipe);
afterAll(closePool);

describe("weekly journal", () => {
  it("one entry per learner per week, drafts private, history kept", async () => {
    const w = await world();
    await saveJournal(w.alice, w.weeks[0].id, { learned: "a" });
    await saveJournal(w.alice, w.weeks[0].id, { learned: "a, edited" });
    const rows = await db.select().from(s.journalEntries).where(eq(s.journalEntries.studentId, w.alice.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].responses.learned).toBe("a, edited");
    expect(rows[0].status).toBe("draft");

    // Drafts are never visible to teachers.
    expect(await journalAccess(w.teacher, rows[0])).toBe("none");
    await expect(submitJournal(w.alice, w.weeks[0].id, { learned: "x" })).rejects.toThrow(/three/);
    const done = await submitJournal(w.alice, w.weeks[0].id, { learned: "x", difficult: "y", goals: "z" });
    expect(done.status).toBe("submitted");

    expect(await journalAccess(w.alice, done)).toBe("owner");
    expect(await journalAccess(w.bob, done)).toBe("none");
    expect(await journalAccess(w.teacher, done)).toBe("teacher_review");
    expect(await journalAccess(await user("teacher"), done)).toBe("none"); // teaches nobody here
    expect(await journalAccess(w.admin, done)).toBe("admin_metadata");

    await saveSettings({ teacherJournalAccess: false }, w.admin.id);
    expect(await journalAccess(w.teacher, done)).toBe("none");
    await saveSettings({ teacherJournalAccess: true }, w.admin.id);

    await saveJournal(w.alice, w.weeks[1].id, { learned: "week 2" });
    const history = await journalHistory(w.alice.id, w.program.id);
    expect(history.map((h) => h.week.weekNumber)).toEqual([1, 2]);
  });

  it("future weeks and other people's journals are off limits", async () => {
    const w = await world();
    await expect(saveJournal(w.alice, w.weeks[5].id, { learned: "future" })).rejects.toThrow(/once it has started/);
    await expect(saveJournal(w.teacher, w.weeks[0].id, { learned: "x" })).rejects.toThrow(/belong to learners/);
  });
});

describe("notifications", () => {
  it("deduplicates repeated events and keeps read state per recipient", async () => {
    const w = await world();
    const item = { recipientId: w.alice.id, type: "system" as const, title: "Hello", dedupeKey: "evt-1" };
    expect(await notify(db, [item])).toBe(1);
    expect(await notify(db, [item])).toBe(0);
    const [n] = (await notificationsFor(w.alice.id)).filter((x) => x.dedupeKey === "evt-1");

    await markRead(w.bob.id, [n.id]); // someone else's row: no effect
    expect((await notificationsFor(w.alice.id)).find((x) => x.id === n.id)?.readAt).toBeNull();
    await markRead(w.alice.id, [n.id]);
    expect((await notificationsFor(w.alice.id)).find((x) => x.id === n.id)?.readAt).not.toBeNull();

    await notify(db, [{ ...item, dedupeKey: "evt-2" }, { ...item, dedupeKey: "evt-3" }]);
    expect(await unreadCount(w.alice.id)).toBe(2);
    await markAllRead(w.alice.id);
    expect(await unreadCount(w.alice.id)).toBe(0);
  });
});

describe("course-upload reminders", () => {
  /** Teacher ids that received a course reminder notification. */
  async function remindedTeachers(ids: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const id of ids) {
      if ((await notificationsFor(id)).some((n) => n.dedupeKey.startsWith("course-reminder:"))) out.push(id);
    }
    return out;
  }

  it("notifies teachers with a missing course, once, and stops when it is published", async () => {
    await wipe();
    const w = await world();
    // Week 3 starts in (7 - weekday offset) days; set "now" to 2 days before it, in the programme zone.
    const week3 = w.weeks[2];
    const now = zonedTimeToUtc(addDays(week3.startsOn, -2), 10, 0, w.tz);

    const first = await runCourseReminders(now);
    expect(first.weeksInWindow).toEqual([3]);
    expect(first.slotsMissing).toBe(2); // Maths and Art
    expect(first.sent).toBe(2);
    expect((await remindedTeachers([w.teacher.id, w.otherTeacher.id])).sort()).toEqual([w.teacher.id, w.otherTeacher.id].sort());
    const rows = await db.select().from(s.teacherReminders);
    expect(rows.every((r) => r.status === "sent" && r.sentAt !== null)).toBe(true);

    const second = await runCourseReminders(now);
    expect(second.sent).toBe(0);
    expect(second.alreadyHandled).toBe(2);
    const reminders = (await notificationsFor(w.teacher.id)).filter((n) => n.dedupeKey.startsWith("course-reminder:"));
    expect(reminders).toHaveLength(1);

    // Publishing week 4's Maths course means Tara is not reminded for week 4.
    const c = await createCourse(w.teacher, { title: "W4", content: "", objectives: [], trackId: w.track.id, weekId: w.weeks[3].id });
    await setPublication(w.teacher, c.id, { mode: "now" });
    const later = zonedTimeToUtc(addDays(w.weeks[3].startsOn, -1), 10, 0, w.tz);
    const third = await runCourseReminders(later);
    expect(third.weeksInWindow).toEqual([4]);
    expect(third.sent).toBe(1);
    const week4 = await db.select().from(s.teacherReminders).where(eq(s.teacherReminders.weekId, w.weeks[3].id));
    expect(week4.map((r) => r.teacherId)).toEqual([w.otherTeacher.id]);
  });

  it("uses the programme's timezone, not the server's", async () => {
    await wipe();
    const w = await world({ tz: "Pacific/Auckland" });
    const program = { ...w.program, reminderDaysBefore: 1, reminderHour: 9 };
    const week3 = w.weeks[2];
    // 08:30 the day before in Auckland: window not yet open (hour < 9)…
    const early = zonedTimeToUtc(addDays(week3.startsOn, -1), 8, 30, "Pacific/Auckland");
    // …09:30 Auckland is the same UTC calendar day for a server in UTC, but the window is now open.
    const open = zonedTimeToUtc(addDays(week3.startsOn, -1), 9, 30, "Pacific/Auckland");
    expect(weeksInReminderWindow(program, w.weeks, early).map((x) => x.weekNumber)).toEqual([]);
    expect(weeksInReminderWindow(program, w.weeks, open).map((x) => x.weekNumber)).toEqual([3]);
  });
});

describe("messaging", () => {
  it("learners message staff only; threads are private to participants", async () => {
    await wipe();
    const w = await world();
    await expect(openConversation(w.alice, w.bob.id)).rejects.toThrow(/can't message/);
    const outsider = await user("teacher");
    await expect(openConversation(outsider, w.alice.id)).rejects.toThrow(/can't message/);

    const id = await openConversation(w.teacher, w.alice.id);
    expect(await openConversation(w.alice, w.teacher.id)).toBe(id); // one thread per pair
    await sendMessage(w.teacher, id, "You missed the test — can I help?");
    await sendMessage(w.alice, id, "Yes please");

    expect((await notificationsFor(w.alice.id)).some((n) => n.type === "message_received")).toBe(true);
    const list = await listConversations(w.teacher.id);
    expect(list[0].unread).toBe(1);
    await readConversation(w.teacher.id, id);
    expect((await listConversations(w.teacher.id))[0].unread).toBe(0);
    await expect(readConversation(w.bob.id, id)).rejects.toThrow(/does not exist/);
    await expect(sendMessage(w.bob, id, "hi")).rejects.toThrow(/does not exist/);
  });
});

describe("upload validation", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  it("accepts real files of permitted types and rejects the rest", () => {
    expect(validateUpload("notes.pdf", 1000, pdf, "course_resource")).toBe("application/pdf");
    expect(() => validateUpload("virus.exe", 1000, pdf, "course_resource")).toThrow(/not an accepted/);
    expect(() => validateUpload("fake.pdf", 1000, new Uint8Array([0x4d, 0x5a, 0, 0]), "submission")).toThrow(/does not look like/);
    expect(() => validateUpload("big.pdf", 11 * 1024 * 1024, pdf, "submission")).toThrow(/larger than 10 MB/);
    expect(() => validateUpload("lecture.mp4", 1000, pdf, "submission")).toThrow(/not an accepted/);
    expect(() => validateUpload("empty.txt", 0, new Uint8Array(), "submission")).toThrow(/empty/);
  });
});

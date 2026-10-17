import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { registerSchema } from "@/lib/validation";
import { canViewStudent, isEnrolled } from "@/server/policy";
import { changeRole, deleteUser, registerStudent, setAccountStatus } from "@/server/services/users";
import { closePool } from "@/db/migrate";
import { user, wipe, world } from "./helpers";

beforeAll(wipe);
afterAll(closePool);

describe("registration and roles", () => {
  it("public registration creates an enrolled learner, without approval", async () => {
    const w = await world();
    const u = await registerStudent({ firstName: "New", lastName: "Person", email: "new.person@test.local", password: "long-enough-password" });
    expect(u.role).toBe("student");
    expect(u.status).toBe("active");
    expect(await isEnrolled(u.id, w.program.id)).toBe(true);
  });

  it("a role posted with the registration form is discarded", () => {
    const parsed = registerSchema.parse({ firstName: "Eve", lastName: "X", email: "eve@test.local", password: "long-enough-password", role: "super_admin" });
    expect(parsed).not.toHaveProperty("role");
  });

  it("rejects a duplicate email regardless of case", async () => {
    await expect(registerStudent({ firstName: "A", lastName: "B", email: "NEW.PERSON@test.local", password: "long-enough-password" })).rejects.toThrow(/already exists/);
  });

  it("learners and teachers cannot change roles", async () => {
    const student = await user("student");
    const teacher = await user("teacher");
    await expect(changeRole(student, student.id, "super_admin")).rejects.toThrow(/super admins/i);
    await expect(changeRole(teacher, student.id, "teacher")).rejects.toThrow(/super admins/i);
    const [still] = await db.select().from(s.users).where(eq(s.users.id, student.id));
    expect(still.role).toBe("student");
  });

  it("a super admin can promote and demote, and demotion removes teaching duties", async () => {
    const w = await world();
    await changeRole(w.admin, w.alice.id, "teacher");
    await db.insert(s.trackTeachers).values({ trackId: w.track.id, teacherId: w.alice.id });
    await changeRole(w.admin, w.alice.id, "student");
    const [back] = await db.select().from(s.users).where(eq(s.users.id, w.alice.id));
    expect(back.role).toBe("student");
    const duties = await db.select().from(s.trackTeachers).where(eq(s.trackTeachers.teacherId, w.alice.id));
    expect(duties).toHaveLength(0);
    const log = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "user.role_changed"));
    expect(log.length).toBeGreaterThanOrEqual(2);
  });

  it("the last active super admin cannot be removed — even by direct SQL", async () => {
    await wipe();
    const only = await user("super_admin");
    await expect(changeRole(only, only.id, "student")).rejects.toThrow(/only super admin/i);
    await expect(db.execute(sql`update users set role = 'student' where id = ${only.id}`)).rejects.toThrow();
  });

  it("deactivation signs the user out; deletion is refused when records exist", async () => {
    const w = await world();
    await db.insert(s.sessions).values({ userId: w.bob.id, tokenHash: `t-${Date.now()}`, expiresAt: new Date(Date.now() + 864e5) });
    await setAccountStatus(w.admin, w.bob.id, "deactivated");
    expect(await db.select().from(s.sessions).where(eq(s.sessions.userId, w.bob.id))).toHaveLength(0);
    await expect(setAccountStatus(w.admin, w.admin.id, "deactivated")).rejects.toThrow(/your own/);

    const [course] = await db.insert(s.courses).values({ programId: w.program.id, trackId: w.track.id, weekId: w.weeks[0].id, teacherId: w.teacher.id, createdById: w.teacher.id, title: "C" }).returning();
    expect(course).toBeTruthy();
    await expect(deleteUser(w.admin, w.teacher.id)).rejects.toThrow(/Deactivate it instead/);
    const fresh = await user("student");
    await deleteUser(w.admin, fresh.id);
    expect(await db.select().from(s.users).where(eq(s.users.id, fresh.id))).toHaveLength(0);
  });

  it("teachers only see learners in programmes they teach", async () => {
    const w = await world();
    const outsider = await user("teacher");
    const stranger = await user("student");
    expect(await canViewStudent(w.teacher, w.alice.id)).toBe(true);
    expect(await canViewStudent(outsider, w.alice.id)).toBe(false);
    expect(await canViewStudent(w.teacher, stranger.id)).toBe(false);
    expect(await canViewStudent(w.alice, w.bob.id)).toBe(false);
    expect(await canViewStudent(w.admin, stranger.id)).toBe(true);
  });
});

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, transaction, type DbOrTx } from "@/db";
import {
  authTokens, courses, enrollments, grades, messages, programs, sessions, submissions, trackTeachers, tracks, users,
} from "@/db/schema";
import { conflict, forbidden, notFound, validationError } from "@/lib/errors";
import { generateToken, hashToken } from "@/lib/crypto";
import { fullName } from "@/lib/utils";
import type { Role, SessionUser } from "@/server/auth";
import { audit } from "./audit";
import { notify } from "./notifications";

type Actor = Pick<SessionUser, "id" | "role">;

const ROLE_LABEL: Record<Role, string> = { student: "Learner", teacher: "Teacher", super_admin: "Super admin" };

function assertAdmin(actor: Actor) {
  if (actor.role !== "super_admin") throw forbidden("Only super admins can manage accounts.");
}

async function emailTaken(email: string, exceptId?: string, conn: DbOrTx = db): Promise<boolean> {
  const rows = await conn.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
  return rows.length > 0 && rows[0].id !== exceptId;
}

async function enrollInCurrent(userId: string, conn: DbOrTx) {
  const [program] = await conn.select().from(programs).where(eq(programs.isCurrent, true)).limit(1);
  if (program) await conn.insert(enrollments).values({ programId: program.id, studentId: userId }).onConflictDoNothing();
}

export async function issueToken(userId: string, purpose: "verify_email" | "reset_password", hours: number, conn: DbOrTx = db): Promise<string> {
  const token = generateToken();
  await conn.insert(authTokens).values({ userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + hours * 3600_000) });
  return token;
}

/** Admin-created account. The person sets their own password from a link the admin shares. */
export async function adminCreateUser(actor: Actor, input: { firstName: string; lastName: string; email: string; role: Role }) {
  assertAdmin(actor);
  if (await emailTaken(input.email)) throw conflict("An account with that email already exists.");
  const { user, token } = await transaction(async (tx) => {
    const [u] = await tx.insert(users).values({
      email: input.email, firstName: input.firstName, lastName: input.lastName, role: input.role,
      // Unusable until they choose one: no password can ever hash to this.
      passwordHash: `unset$${generateToken(16)}`,
    }).returning();
    if (u.role === "student") await enrollInCurrent(u.id, tx);
    const t = await issueToken(u.id, "reset_password", 24 * 7, tx);
    await audit({ actorId: actor.id, action: "user.created", entityType: "user", entityId: u.id, summary: `Created ${ROLE_LABEL[u.role]} account for ${fullName(u)}` }, tx);
    return { user: u, token: t };
  });
  // No email is sent: the admin passes this set-password link on themselves.
  return { user, invitePath: `/reset-password/${token}` };
}

/** A one-time set-password link (24h) for someone who is locked out. The admin shares it. */
export async function adminResetLink(actor: Actor, userId: string): Promise<string> {
  assertAdmin(actor);
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw notFound();
  if (target.status !== "active") throw validationError("Reactivate this account first.");
  const token = await issueToken(target.id, "reset_password", 24);
  await audit({ actorId: actor.id, action: "user.reset_link", entityType: "user", entityId: target.id, summary: `Created a password reset link for ${fullName(target)}` });
  return `/reset-password/${token}`;
}

export async function updateUserDetails(actor: Actor, userId: string, input: { firstName: string; lastName: string; email: string }) {
  assertAdmin(actor);
  if (await emailTaken(input.email, userId)) throw conflict("Another account already uses that email.");
  await transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, userId));
    if (!before) throw notFound();
    await tx.update(users).set({ ...input, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await audit({ actorId: actor.id, action: "user.updated", entityType: "user", entityId: userId, summary: `Updated details for ${fullName(input)}` }, tx);
  });
}

export async function changeRole(actor: Actor, userId: string, role: Role) {
  assertAdmin(actor);
  await transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!target) throw notFound();
    if (target.role === role) return;
    if (target.id === actor.id && role !== "super_admin") {
      const [others] = await tx.select({ n: sql<number>`count(*)::int` }).from(users)
        .where(and(eq(users.role, "super_admin"), eq(users.status, "active"), sql`${users.id} <> ${actor.id}`));
      if ((others?.n ?? 0) === 0) throw conflict("You are the only super admin. Promote someone else first.");
    }

    // Demoting to learner removes teaching responsibilities (recorded below);
    // their past courses and grades stay attributed to them.
    let removedTracks: string[] = [];
    if (role === "student") {
      const removed = await tx.delete(trackTeachers).where(eq(trackTeachers.teacherId, userId)).returning();
      removedTracks = removed.map((r) => r.trackId);
      await enrollInCurrent(userId, tx);
    }

    await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
    await audit({
      actorId: actor.id, action: "user.role_changed", entityType: "user", entityId: userId,
      summary: `Changed ${fullName(target)} from ${ROLE_LABEL[target.role]} to ${ROLE_LABEL[role]}`,
      metadata: { from: target.role, to: role, removedTracks },
    }, tx);
    await notify(tx, [{
      recipientId: userId, type: "role_changed", title: `Your role is now ${ROLE_LABEL[role]}`,
      body: role === "student" ? "Your dashboard has switched to the learner view." : "You now have access to teaching tools.",
      link: role === "super_admin" ? "/admin" : role === "teacher" ? "/teach" : "/learn",
      dedupeKey: `role:${userId}:${role}:${Date.now()}`,
    }]);
  });
}

export async function setAccountStatus(actor: Actor, userId: string, status: "active" | "deactivated") {
  assertAdmin(actor);
  if (userId === actor.id) throw conflict("You cannot deactivate your own account.");
  await transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId));
    if (!target) throw notFound();
    await tx.update(users).set({ status, deactivatedAt: status === "deactivated" ? new Date() : null, updatedAt: new Date() }).where(eq(users.id, userId));
    if (status === "deactivated") await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit({ actorId: actor.id, action: status === "deactivated" ? "user.deactivated" : "user.reactivated", entityType: "user", entityId: userId, summary: `${status === "deactivated" ? "Deactivated" : "Reactivated"} ${fullName(target)}` }, tx);
  });
}

/**
 * Permanent deletion is only allowed for accounts with no learning record.
 * Anyone with submissions, grades given, courses or messages is deactivated
 * instead, so other people's records stay intact.
 */
export async function deleteUser(actor: Actor, userId: string) {
  assertAdmin(actor);
  if (userId === actor.id) throw conflict("You cannot delete your own account.");
  await transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId));
    if (!target) throw notFound();
    const counts = await tx.execute<{ subs: number; graded: number; taught: number; sent: number }>(sql`
      select
        (select count(*)::int from ${submissions} where student_id = ${userId}) as subs,
        (select count(*)::int from ${grades} where graded_by_id = ${userId}) as graded,
        (select count(*)::int from ${courses} where teacher_id = ${userId} or created_by_id = ${userId}) as taught,
        (select count(*)::int from ${messages} where sender_id = ${userId}) as sent`);
    const c = counts.rows[0];
    if (c.subs + c.graded + c.taught + c.sent > 0) {
      throw conflict("This account has learning records (submissions, grades, courses or messages). Deactivate it instead so those records are preserved.");
    }
    await tx.delete(users).where(eq(users.id, userId));
    await audit({ actorId: actor.id, action: "user.deleted", entityType: "user", entityId: userId, summary: `Deleted account ${fullName(target)} <${target.email}>` }, tx);
  });
}

export async function assignTeacher(actor: Actor, trackId: string, teacherId: string, assign: boolean) {
  assertAdmin(actor);
  await transaction(async (tx) => {
    const [track] = await tx.select().from(tracks).where(eq(tracks.id, trackId));
    const [teacher] = await tx.select().from(users).where(eq(users.id, teacherId));
    if (!track || !teacher) throw notFound();
    if (assign) {
      if (teacher.role === "student") throw validationError("Promote this person to teacher before assigning them a track.");
      await tx.insert(trackTeachers).values({ trackId, teacherId }).onConflictDoNothing();
    } else {
      await tx.delete(trackTeachers).where(and(eq(trackTeachers.trackId, trackId), eq(trackTeachers.teacherId, teacherId)));
    }
    await audit({ actorId: actor.id, action: assign ? "track.teacher_assigned" : "track.teacher_removed", entityType: "track", entityId: trackId, summary: `${assign ? "Assigned" : "Removed"} ${fullName(teacher)} ${assign ? "to" : "from"} ${track.name}` }, tx);
  });
}

export async function setEnrollment(actor: Actor, programId: string, studentId: string, enrolled: boolean) {
  assertAdmin(actor);
  const [student] = await db.select().from(users).where(eq(users.id, studentId));
  if (!student || student.role !== "student") throw validationError("Only learners can be enrolled.");
  if (enrolled) await db.insert(enrollments).values({ programId, studentId }).onConflictDoNothing();
  else await db.delete(enrollments).where(and(eq(enrollments.programId, programId), eq(enrollments.studentId, studentId)));
  await audit({ actorId: actor.id, action: enrolled ? "enrollment.added" : "enrollment.removed", entityType: "user", entityId: studentId, summary: `${enrolled ? "Enrolled" : "Unenrolled"} ${fullName(student)}` });
}

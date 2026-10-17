"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { authTokens, sessions, users } from "@/db/schema";
import { hashPassword, hashToken, verifyPassword } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";
import { changePasswordSchema, loginSchema, passwordSchema, profileSchema } from "@/lib/validation";
import { safeInternalPath } from "@/lib/utils";
import { clientIp, createSession, destroySession, homeFor, requireUser } from "@/server/auth";
import { audit } from "@/server/services/audit";
import { enforce } from "@/server/services/rate-limit";
import { parse, run } from "./run";

const DUMMY_HASH = "scrypt$00000000000000000000000000000000$" + "0".repeat(128);

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let destination = "/";
  const result = await run(async () => {
    const input = parse(loginSchema, fd);
    const ip = await clientIp();
    await enforce(`login:ip:${ip}`, 30, 900);
    await enforce(`login:email:${input.email}`, 8, 900, "Too many attempts for this account. Wait 15 minutes or ask an administrator to reset your password.");

    const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${input.email}`).limit(1);
    // Always run a hash comparison so response time does not reveal whether the account exists.
    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) throw new AppError("UNAUTHENTICATED", "That email and password don't match.");
    if (user.status !== "active") throw new AppError("FORBIDDEN", "This account has been deactivated. Contact an administrator.");

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await createSession(user.id);
    const next = safeInternalPath(input.next, "");
    destination = next && next !== "/" ? next : homeFor(user);
  });
  if (result.ok) redirect(destination);
  return result;
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let home = "/";
  const result = await run(async () => {
    const input = parse(z.object({ token: z.string().min(10).max(200), password: passwordSchema }), fd);
    const [record] = await db.select().from(authTokens).where(and(
      eq(authTokens.tokenHash, hashToken(input.token)), eq(authTokens.purpose, "reset_password"),
      isNull(authTokens.consumedAt), gt(authTokens.expiresAt, new Date()),
    )).limit(1);
    if (!record) throw new AppError("VALIDATION_ERROR", "That link has expired or was already used. Ask an administrator for a new one.");

    const [user] = await db.update(users).set({ passwordHash: await hashPassword(input.password), emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`, updatedAt: new Date() })
      .where(eq(users.id, record.userId)).returning();
    await db.update(authTokens).set({ consumedAt: new Date() }).where(eq(authTokens.id, record.id));
    await db.delete(sessions).where(eq(sessions.userId, record.userId)); // sign out everywhere
    await audit({ actorId: user.id, action: "user.password_reset", entityType: "user", entityId: user.id, summary: `${user.firstName} ${user.lastName} reset their password` });
    if (user.status !== "active") throw new AppError("FORBIDDEN", "Password saved, but this account is deactivated.");
    await createSession(user.id);
    home = homeFor(user);
  });
  if (result.ok) redirect(home);
  return result;
}

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const input = parse(profileSchema, fd);
    await db.update(users).set({ firstName: input.firstName, lastName: input.lastName, bio: input.bio ?? null, timezone: input.timezone, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return "Profile saved.";
  });
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await enforce(`pwchange:${user.id}`, 5, 900);
    const input = parse(changePasswordSchema, fd);
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new AppError("VALIDATION_ERROR", "Your current password is incorrect.", { currentPassword: "Incorrect password." });
    }
    await db.update(users).set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() }).where(eq(users.id, user.id));
    // Keep this session; end every other one.
    const { cookies } = await import("next/headers");
    const { SESSION_COOKIE } = await import("@/server/auth");
    const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
    await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.tokenHash, hashToken(token))));
    await audit({ actorId: user.id, action: "user.password_changed", entityType: "user", entityId: user.id, summary: "Changed password" });
    return { message: "Password changed. Other devices have been signed out.", data: { reset: true } };
  });
}

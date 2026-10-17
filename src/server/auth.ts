import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { generateToken, hashToken } from "@/lib/crypto";
import { forbidden, unauthenticated } from "@/lib/errors";

export const SESSION_COOKIE = "dt_session";
const SESSION_DAYS = 30;

export type SessionUser = typeof users.$inferSelect;
export type Role = SessionUser["role"];

/* ── capabilities ────────────────────────────────────────────────────── */

/** Super admins teach with the same account — no second login needed. */
export const canTeach = (u: Pick<SessionUser, "role">) => u.role === "teacher" || u.role === "super_admin";
export const isAdmin = (u: Pick<SessionUser, "role">) => u.role === "super_admin";
export const isStudent = (u: Pick<SessionUser, "role">) => u.role === "student";

/** Where each role lands after signing in. */
export function homeFor(u: Pick<SessionUser, "role">): string {
  if (u.role === "super_admin") return "/admin";
  if (u.role === "teacher") return "/teach";
  return "/learn";
}

/* ── session lifecycle ───────────────────────────────────────────────── */

export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);

  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt, userAgent: ua });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

/**
 * The signed-in user, read fresh from the database on every request (deduped
 * per render by `cache`). Because the role comes from the row and not from the
 * cookie, a role change or deactivation takes effect on the very next request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row || row.user.status !== "active") return null;
  return row.user;
});

/* ── guards for server actions (throw) ───────────────────────────────── */

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  return user;
}

export async function requireTeacher(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canTeach(user)) throw forbidden("Only teachers can do that.");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user)) throw forbidden("Only super admins can do that.");
  return user;
}

export async function requireStudent(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStudent(user)) throw forbidden("Only learners can do that.");
  return user;
}

/* ── guards for pages (redirect) ─────────────────────────────────────── */

export async function pageUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function pageStudent(): Promise<SessionUser> {
  const user = await pageUser();
  if (!isStudent(user)) redirect(homeFor(user));
  return user;
}

export async function pageTeacher(): Promise<SessionUser> {
  const user = await pageUser();
  if (!canTeach(user)) redirect(homeFor(user));
  return user;
}

export async function pageAdmin(): Promise<SessionUser> {
  const user = await pageUser();
  if (!isAdmin(user)) redirect(homeFor(user));
  return user;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim().slice(0, 64);
}

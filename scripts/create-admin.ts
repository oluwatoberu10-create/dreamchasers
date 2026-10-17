/**
 * Bootstraps the first super admin — the safe way.
 *
 *   npm run admin:create -- --email you@example.com [--first Ada --last Lovelace]
 *
 * If an account with that email exists it is promoted. Otherwise one is created
 * with a random password that is printed ONCE to this terminal (it is never
 * stored in plain text or emailed); sign in and change it from your profile.
 * No default or predictable admin credentials exist anywhere in this codebase.
 */
import { loadDotEnv } from "./env";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  loadDotEnv();
  const { ensureEnv } = await import("./pg");
  ensureEnv();
  const email = arg("email")?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("usage: npm run admin:create -- --email you@example.com [--first Name --last Name]");
    process.exit(1);
  }
  const { sql, eq } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { users, auditLogs } = await import("../src/db/schema");
  const { hashPassword, generateToken } = await import("../src/lib/crypto");
  const { closePool } = await import("../src/db/migrate");

  const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (existing) {
    await db.update(users).set({ role: "super_admin", status: "active", updatedAt: new Date() }).where(eq(users.id, existing.id));
    await db.insert(auditLogs).values({
      actorId: null, action: "user.role_changed", entityType: "user", entityId: existing.id,
      summary: `Promoted ${email} to super admin from the command line`, metadata: { from: existing.role, to: "super_admin" },
    });
    console.log(`[admin] ${email} is now a super admin.`);
  } else {
    const password = generateToken(18);
    const [u] = await db.insert(users).values({
      email, passwordHash: await hashPassword(password), firstName: arg("first") ?? "Platform", lastName: arg("last") ?? "Admin",
      role: "super_admin", emailVerifiedAt: new Date(),
    }).returning();
    await db.insert(auditLogs).values({ actorId: null, action: "user.created", entityType: "user", entityId: u.id, summary: `Created super admin ${email} from the command line` });
    console.log(`[admin] created super admin ${email}`);
    console.log(`[admin] one-time password: ${password}`);
    console.log("[admin] sign in, then change it under Profile > Password. It is not shown again.");
  }
  await closePool();
}

main().catch((e) => { console.error("[admin]", e); process.exit(1); });

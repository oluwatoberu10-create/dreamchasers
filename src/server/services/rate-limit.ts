import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { AppError } from "@/lib/errors";

/**
 * Fixed-window rate limit backed by Postgres, so it holds across every
 * serverless instance. One atomic upsert per check: the window resets when it
 * has expired, otherwise the counter increments.
 *
 * Returns true when the call is allowed.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const result = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   then now() else rate_limits.window_start end
    returning count
  `);
  return Number(result.rows[0]?.count ?? 1) <= limit;
}

export async function enforce(key: string, limit: number, windowSeconds: number, message?: string): Promise<void> {
  if (!(await hit(key, limit, windowSeconds))) {
    throw new AppError("RATE_LIMITED", message ?? "Too many attempts. Please wait a few minutes and try again.");
  }
}

/**
 * Runs the scheduled jobs once: publish due courses, teacher course-upload
 * reminders, deadline notifications. Point a server crontab at this, e.g.
 *   0 * * * *  cd /srv/dream-tutors && npm run jobs:run
 * Pass --at=2026-10-16T09:30:00Z to simulate a different "now" (local only).
 */
import { loadDotEnv } from "./env";
import { isLocalUrl } from "./local-guard";

async function main() {
  loadDotEnv();
  const { ensureEnv } = await import("./pg");
  ensureEnv();
  const at = process.argv.find((a) => a.startsWith("--at="))?.slice(5);
  if (at && !isLocalUrl(process.env.DATABASE_URL)) {
    console.error("[jobs] --at is only allowed against a local database.");
    process.exit(1);
  }
  const now = at ? new Date(at) : new Date();
  const { runJobs } = await import("../src/server/services/jobs");
  const { closePool } = await import("../src/db/migrate");
  const result = await runJobs(at ? "cli-simulated" : "cli", now);
  console.log(JSON.stringify(result, null, 2));
  await closePool();
}

main().catch((e) => { console.error("[jobs]", e); process.exit(1); });

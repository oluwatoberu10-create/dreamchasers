/**
 * `npm run dev` (or `npm run preview` for a fast production build) — brings
 * the local Postgres cluster up (creating it on first
 * run), applies any pending migrations, then hands over to Next.js.
 *
 * If DATABASE_URL points somewhere else, the local cluster is left alone.
 */
import { spawn, spawnSync } from "node:child_process";
import { loadDotEnv } from "./env";
import { start, isRunning, ensureDatabase, LOCAL_DATABASE_URL } from "./pg";

async function main() {
  loadDotEnv();
  const usingLocal = !process.env.DATABASE_URL || process.env.DATABASE_URL === LOCAL_DATABASE_URL;

  if (usingLocal) {
    process.env.DATABASE_URL = LOCAL_DATABASE_URL;
    if (!isRunning()) start();
    else console.log("[pg] already running");
    await ensureDatabase();
  } else {
    console.log("[db] using DATABASE_URL from the environment");
  }

  // Imported only now, after DATABASE_URL is settled: the pool is built at import time.
  const { runMigrations, closePool } = await import("../src/db/migrate");
  await runMigrations();
  await closePool();
  console.log("[db] migrations up to date");

  const bin = process.platform === "win32" ? "node_modules\\.bin\\next.cmd" : "node_modules/.bin/next";
  const opts = { stdio: "inherit" as const, env: process.env, shell: process.platform === "win32" };
  const prod = process.argv.includes("--prod");
  const args = process.argv.slice(2).filter((a) => a !== "--prod");

  // --prod (`npm run preview`): optimised build + `next start`. Much faster
  // page loads than `next dev`, which compiles each page on first visit.
  if (prod) {
    const build = spawnSync(bin, ["build"], opts);
    if (build.status !== 0) process.exit(build.status ?? 1);
  }
  const next = spawn(bin, [prod ? "start" : "dev", ...args], opts);
  next.on("exit", (code) => process.exit(code ?? 0));
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => next.kill(signal));
}

main().catch((err) => {
  console.error("[dev]", err);
  process.exit(1);
});

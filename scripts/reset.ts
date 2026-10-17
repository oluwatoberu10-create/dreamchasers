/** Drops every table and re-applies migrations. Local databases only. */
import { loadDotEnv } from "./env";
import { assertLocal } from "./local-guard";

async function main() {
  loadDotEnv();
  assertLocal("reset", "DT_ALLOW_REMOTE_RESET");
  const { ensureEnv } = await import("./pg");
  ensureEnv();
  const { getPool } = await import("../src/db");
  await getPool().query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  const { runMigrations, closePool } = await import("../src/db/migrate");
  await runMigrations();
  await closePool();
  console.log("[db] reset complete");
}

main().catch((e) => { console.error("[reset]", e); process.exit(1); });

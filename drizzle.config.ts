import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgresql://dreamtutors:dreamtutors@127.0.0.1:54331/dreamtutors" },
} satisfies Config;

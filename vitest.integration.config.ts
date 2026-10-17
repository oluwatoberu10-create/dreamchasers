import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Integration tests run against a real Postgres database (the local cluster by
 * default) in a throwaway schema-reset database. See tests/setup.ts.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      // Server modules import "server-only" to keep them out of client bundles.
      // Under vitest there is no bundler, so stub it.
      "server-only": resolve(__dirname, "./tests/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      DATABASE_URL: "postgresql://dreamtutors:dreamtutors@127.0.0.1:54331/dreamtutors_test",
      LOCAL_UPLOAD_DIR: ".uploads-test",
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

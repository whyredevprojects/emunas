import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * All tests run inside workerd (Miniflare) with local D1 databases, the Cache API and a local
 * rate limiter. `@cloudflare/vitest-plugin` is the renamed `@cloudflare/vitest-pool-workers`.
 * Vectorize and Workers AI have no local simulator; tests pass in-memory fakes for VEC and AI.
 * Migrations are read from the same folders wrangler.jsonc points at and applied by the tests,
 * so every run starts from a fresh local D1.
 */
export default defineConfig(async () => {
  const searchMigrations = await readD1Migrations(new URL("./migrations/search/", import.meta.url).pathname);
  const feedbackMigrations = await readD1Migrations(new URL("./migrations/feedback/", import.meta.url).pathname);
  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: "2026-10-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB_SEARCH", "DB_FEEDBACK"],
          ratelimits: { RATE: { namespace_id: "1001", simple: { limit: 30, period: 10 } } },
          bindings: {
            TEST_SEARCH_MIGRATIONS: searchMigrations,
            TEST_FEEDBACK_MIGRATIONS: feedbackMigrations,
            TURNSTILE_SECRET: "test-turnstile-secret",
            FEEDBACK_HASH_SALT: "test-salt",
            ACCESS_TEAM_DOMAIN: "https://emunas-test.cloudflareaccess.com",
            ACCESS_AUD: "test-aud",
          },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      testTimeout: 30_000,
    },
  };
});

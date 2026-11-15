import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * Edge handler tests inside workerd (Miniflare) with a local R2 bucket bound as
 * AUDIO. `@cloudflare/vitest-plugin` is the renamed `@cloudflare/vitest-pool-workers`.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-10-01",
        compatibilityFlags: ["nodejs_compat"],
        r2Buckets: ["AUDIO"],
      },
    }),
  ],
  test: {
    include: ["test/edge/**/*.test.ts"],
    testTimeout: 30_000,
  },
});

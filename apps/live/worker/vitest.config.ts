import { fileURLToPath } from "node:url";
import base from "@emunas/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

// The site Worker, its wrangler config and the _headers template are tested on their own
// (run from CI: `npx vitest run --config apps/live/worker/vitest.config.ts`), so the app's
// jsdom suite and this one do not share settings.
export default mergeConfig(base, defineConfig({ root: fileURLToPath(new URL(".", import.meta.url)) }));

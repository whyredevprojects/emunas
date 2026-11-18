import { fileURLToPath } from "node:url";
import base from "@emunas/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

// The site Worker, its wrangler config and the _headers file are tested on their own
// (`npx vitest run --config apps/home/worker/vitest.config.ts`), apart from the app's suite.
export default mergeConfig(base, defineConfig({ root: fileURLToPath(new URL(".", import.meta.url)) }));

import { fileURLToPath } from "node:url";
import base from "@emunas/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

// The wrangler config, the headers tool and the _headers template are tested on their own
// (run from CI: `npx vitest run --config apps/quiet/worker/vitest.config.ts`), so the app's
// jsdom suite and this one do not share settings.
export default mergeConfig(base, defineConfig({ root: fileURLToPath(new URL(".", import.meta.url)) }));

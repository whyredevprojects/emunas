import base from "@emunas/config/vitest";
import { getViteConfig } from "astro/config";
import { mergeConfig } from "vitest/config";

// getViteConfig lets unit tests import .astro components (rendered with the Container API).
// The browser end-to-end suite has its own config (vitest.e2e.config.ts).
export default getViteConfig(
  mergeConfig(base, {
    test: {
      exclude: ["**/node_modules/**", "**/dist/**", "test/e2e/**"],
    },
  }),
);

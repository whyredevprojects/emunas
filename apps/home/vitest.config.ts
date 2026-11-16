import base from "@emunas/config/vitest";
import { getViteConfig } from "astro/config";
import { mergeConfig } from "vitest/config";

// getViteConfig lets unit tests import .astro components. The Worker has its own suite
// (worker/vitest.config.ts).
export default getViteConfig(
  mergeConfig(base, {
    test: {
      exclude: ["**/node_modules/**", "**/dist/**", "worker/**"],
    },
  }),
);

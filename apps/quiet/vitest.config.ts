import base from "@emunas/config/vitest";
import { getViteConfig } from "astro/config";
import { mergeConfig } from "vitest/config";

/**
 * Test files that read the real-data site builds of test/site-builds.ts. They form the `site`
 * project: its globalSetup builds those sites once, before any file starts (and only when a file of
 * this project is selected), and its files run one at a time, so the few builds they still make
 * themselves (on fixtures, through test/astro-build.ts) never queue behind each other's lock.
 */
const SITE_TESTS = [
  "src/components/calendar/calendar.build.test.ts",
  "src/components/indexes/test/site.test.ts",
  "src/components/seo/test/site.build.test.ts",
  "src/components/stories/test/site.build.test.ts",
  "src/components/topics/test/site.build.test.ts",
];

// Projects that extend the root concatenate its `include`, so the root has none and each project
// names its own files.
const { include, ...shared } = base.test ?? {};

// getViteConfig lets unit tests import .astro components (rendered with the Container API).
// The browser end-to-end suite has its own config (vitest.e2e.config.ts).
export default getViteConfig(
  mergeConfig(
    { ...base, test: shared },
    {
      test: {
        exclude: ["**/node_modules/**", "**/dist/**", "test/e2e/**"],
        projects: [
          { extends: true, test: { name: "unit", include, exclude: SITE_TESTS } },
          {
            extends: true,
            test: { name: "site", include: SITE_TESTS, globalSetup: ["test/site-builds.ts"], fileParallelism: false },
          },
        ],
      },
    },
  ),
);

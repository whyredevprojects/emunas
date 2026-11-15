/**
 * W3.8 acceptance: no @hebcal code in the client bundle. Bundles the three W3.8 route modules with
 * Vite (as the app build does, without writing files) and checks every module that ends up in the
 * output: the calendar runtime and its committed table are in, nothing from `@hebcal/*` is, and the
 * pipeline's `data/` folder is never pulled in.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Rollup } from "vite";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "../../..");

async function bundledModules(): Promise<string[]> {
  const out = await build({
    configFile: false,
    logLevel: "silent",
    root: app,
    build: {
      write: false,
      minify: false,
      rollupOptions: {
        input: {
          today: join(app, "routes/_ui.index.tsx"),
          series: join(app, "routes/series.tsx"),
          seriesOne: join(app, "routes/series.$seriesId.tsx"),
        },
        // framework code is irrelevant to this check
        external: (id) => /^(react|react-dom|react-router|react-aria|react-aria-components|zustand)(\/|$)/.test(id),
        preserveEntrySignatures: "exports-only",
      },
    },
  });
  const outputs = (Array.isArray(out) ? out : [out]) as Rollup.RollupOutput[];
  const ids = new Set<string>();
  for (const o of outputs) {
    for (const chunk of o.output) {
      if (chunk.type === "chunk") for (const id of chunk.moduleIds) ids.add(id);
    }
  }
  return [...ids];
}

describe("client bundle of Today and series", () => {
  it("contains the calendar runtime and table but no @hebcal code", async () => {
    const ids = await bundledModules();
    expect(ids.some((id) => id.includes("packages/calendar/src/calendar.ts"))).toBe(true);
    expect(ids.some((id) => id.includes("packages/calendar/table/"))).toBe(true);
    expect(ids.filter((id) => /[\\/]@hebcal[\\/]/.test(id) || id.includes("hebcal/core"))).toEqual([]);
    expect(ids.filter((id) => /[\\/]data[\\/](derived|catalog|transcripts)[\\/]/.test(id))).toEqual([]);
    // the normalize tables are used for labels only; the person/work alias tables are not shipped
    expect(ids.filter((id) => /packages[\\/]normalize[\\/]src[\\/]tables[\\/](people|works)\.ts/.test(id))).toEqual([]);
  }, 60_000);
});

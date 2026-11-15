/**
 * Bundle analysis: the runtime entry (`src/index.ts`, what the sites import) must not pull in any
 * @hebcal code (GPL-2.0-or-later; integration-plan C16). esbuild bundles the entry the way Vite /
 * wrangler would and we inspect every input module in its metafile.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Metafile } from "esbuild";
import { describe, expect, it } from "vitest";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(pkg, "src", "index.ts");

async function bundle(entryPoint: string, externalJson = false, platform: "browser" | "node" = "browser"): Promise<{ meta: Metafile; code: string }> {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    metafile: true,
    minify: true,
    format: "esm",
    platform,
    target: "es2022",
    logLevel: "silent",
    absWorkingDir: pkg,
    ...(externalJson ? { external: ["*.json"] } : {}),
  });
  const out = result.outputFiles[0];
  if (!out) throw new Error("no output");
  return { meta: result.metafile, code: out.text };
}

const hebcalInputs = (meta: Metafile) => Object.keys(meta.inputs).filter((p) => /hebcal/i.test(p));

describe("runtime entry bundle", () => {
  it("contains no module from @hebcal/*", async () => {
    const { meta } = await bundle(entry);
    const inputs = Object.keys(meta.inputs);
    expect(inputs.some((p) => p.endsWith("src/index.ts"))).toBe(true);
    expect(inputs.some((p) => p.endsWith("table/5787-5800.json"))).toBe(true);
    expect(hebcalInputs(meta)).toEqual([]);
    expect(inputs.filter((p) => p.includes("node_modules"))).toEqual([]);
  });

  it("is small: the code is a few KB, the table well under 100 KB", async () => {
    const { code } = await bundle(entry, true);
    expect(code.length).toBeLessThan(6_000);
    const { code: withTable } = await bundle(entry);
    expect(withTable.length).toBeLessThan(100_000);
  });

  it("the analysis does catch a hebcal import (control)", async () => {
    const { meta } = await bundle(join(pkg, "scripts", "generate.ts"), false, "node");
    expect(hebcalInputs(meta).length).toBeGreaterThan(0);
  });

  it("no source file under src/ mentions @hebcal in an import, and hebcal is a devDependency only", () => {
    for (const f of readdirSync(join(pkg, "src"))) {
      const text = readFileSync(join(pkg, "src", f), "utf8");
      expect(/from\s+["']@hebcal|import\(\s*["']@hebcal|require\(\s*["']@hebcal/.test(text), f).toBe(false);
    }
    const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    expect(Object.keys(manifest["dependencies"] ?? {})).not.toContain("@hebcal/core");
    expect(manifest["devDependencies"]?.["@hebcal/core"]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

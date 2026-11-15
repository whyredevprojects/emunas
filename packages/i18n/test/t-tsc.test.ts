import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Runs the repo's real `tsc` (TypeScript 7) on small fixture projects, so the
 * acceptance "t('missing') fails tsc" is proven by the compiler and not only by
 * `@ts-expect-error` in t.test.ts.
 */
const here = dirname(fileURLToPath(import.meta.url));
const tsc = join(dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin/tsc");

function compile(fixture: string): { ok: boolean; output: string } {
  try {
    const out = execFileSync(process.execPath, [tsc, "--noEmit", "-p", join(here, "fixtures/tsc", fixture)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output: out };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("createT under tsc", () => {
  it("compiles a correct use", () => {
    const result = compile("ok");
    expect(result.output).toBe("");
    expect(result.ok).toBe(true);
  });

  it("t('missing') fails tsc", () => {
    const result = compile("missing-key");
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/main\.ts\(8,\d+\): error TS2345/);
    expect(result.output).toContain('"missing"');
  });

  it("a table missing a key fails tsc", () => {
    const result = compile("incomplete-table");
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/main\.ts\(5,\d+\): error TS2741/);
    expect(result.output).toContain('"nav.search"');
  });
});

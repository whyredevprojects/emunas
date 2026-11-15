import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { TRANSCRIPTS_PATH, repoRoot } from "./helpers.ts";

/**
 * integration-plan §0.3: only packages/corpus/src/transcript-gate.ts (build) and
 * packages/corpus-guard (leak check) may reference the transcripts folder. ESLint
 * covers JS/TS/Astro; this grep also covers JSON, CSS, HTML, Markdown and YAML in
 * site code, and the CI workflow.
 */
const SCANNED_ROOTS = ["apps", "packages", "workers", "site-policy"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".astro", ".react-router", ".wrangler", ".corpus", "coverage"]);
const ALLOWED = (rel: string) =>
  rel === "packages/corpus/src/transcript-gate.ts" || rel.startsWith("packages/corpus-guard/");

function* walk(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(join(dir, e.name));
    } else if (e.isFile()) {
      yield join(dir, e.name);
    }
  }
}

describe("transcript path is referenced only behind the one door", () => {
  it("appears nowhere in site code outside the transcript gate and the guard", () => {
    const offenders: string[] = [];
    const files = [...SCANNED_ROOTS.flatMap((r) => [...walk(join(repoRoot, r))]), join(repoRoot, ".github/workflows/ci.yml")];
    for (const file of files) {
      const rel = relative(repoRoot, file).split("\\").join("/");
      if (ALLOWED(rel)) continue;
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      if (text.includes(TRANSCRIPTS_PATH)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

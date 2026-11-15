import { ESLint } from "eslint";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../eslint.config.js";
import { AUDITS, INPUT_TXT, TRANSCRIPTS_PATH, configDir, repoRoot } from "./helpers.ts";

let eslint: ESLint;

beforeAll(() => {
  // The config is imported directly: ESLint's own dynamic config import does not run
  // inside Vitest's module runner. The CLI test at the end covers the real loading path.
  eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: true, overrideConfig: config });
});

async function lint(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: resolve(repoRoot, filePath) });
  if (!result) throw new Error("no lint result");
  return result.messages;
}

const ruleIds = (msgs: { ruleId: string | null }[]) => msgs.map((m) => m.ruleId);

describe("restricted imports (apps may not read the pipeline data folder)", () => {
  it("fails an apps/quiet/src file importing from data/", async () => {
    const msgs = await lint(
      "apps/quiet/src/pages/leak.ts",
      `import ingest from "../../../../data/derived/ingest.json";\nexport default ingest;\n`,
    );
    expect(ruleIds(msgs)).toContain("no-restricted-imports");
  });

  it("fails an apps/live/app file importing a data path", async () => {
    const msgs = await lint(
      "apps/live/app/routes/leak.tsx",
      `export { default } from "../../../../data/catalog/pocket-guide-2012.json";\n`,
    );
    expect(ruleIds(msgs)).toContain("no-restricted-imports");
  });

  it("fails an app importing the Node-only corpus build entry", async () => {
    const msgs = await lint(
      "apps/live/app/routes/leak.ts",
      `import { build } from "@emunas/corpus/build";\nexport const b = build;\n`,
    );
    expect(ruleIds(msgs)).toContain("no-restricted-imports");
  });

  it("fails an .astro page importing from data/", async () => {
    const msgs = await lint(
      "apps/quiet/src/pages/leak.astro",
      `---\nimport ingest from "../../../../data/derived/ingest.json";\n---\n<p>{ingest.stats}</p>\n`,
    );
    expect(ruleIds(msgs)).toContain("no-restricted-imports");
  });

  it("allows the public corpus entry", async () => {
    const msgs = await lint(
      "apps/live/app/routes/ok.ts",
      `import type { PublicShiur } from "@emunas/corpus/public";\nexport type S = PublicShiur;\n`,
    );
    expect(msgs).toEqual([]);
  });
});

describe("forbidden literals (one door: transcript gate and guard only)", () => {
  it("fails an apps/ file containing the transcripts path", async () => {
    const msgs = await lint("apps/live/app/routes/leak.ts", `export const p = "${TRANSCRIPTS_PATH}/x.json";\n`);
    expect(ruleIds(msgs)).toContain("no-restricted-syntax");
  });

  it("fails a template literal naming the ASR input file", async () => {
    const msgs = await lint(
      "apps/quiet/src/lib/leak.ts",
      "export const f = (dir: string) => `${dir}/" + INPUT_TXT + "`;\n",
    );
    expect(ruleIds(msgs)).toContain("no-restricted-syntax");
  });

  it("fails the audit folder name in a package", async () => {
    const msgs = await lint("packages/corpus/src/load.ts", `export const d = "data/derived/${AUDITS}";\n`);
    expect(ruleIds(msgs)).toContain("no-restricted-syntax");
  });

  it("fails the literal inside .astro frontmatter and markup", async () => {
    const msgs = await lint(
      "apps/quiet/src/pages/leak.astro",
      `---\nconst p = "${TRANSCRIPTS_PATH}";\n---\n<p>{p}</p>\n<p>${TRANSCRIPTS_PATH}</p>\n`,
    );
    expect(ruleIds(msgs).filter((r) => r === "no-restricted-syntax").length).toBeGreaterThanOrEqual(1);
  });

  it("fails JSX text containing the literal", async () => {
    const msgs = await lint("apps/live/app/routes/leak.tsx", `export const X = () => <p>${TRANSCRIPTS_PATH}</p>;\n`);
    expect(ruleIds(msgs)).toContain("no-restricted-syntax");
  });

  it("fails worker code containing the literal", async () => {
    const msgs = await lint("workers/api/src/leak.ts", `export const p = "${TRANSCRIPTS_PATH}";\n`);
    expect(ruleIds(msgs)).toContain("no-restricted-syntax");
  });

  it("allows the literal in packages/corpus/src/transcript-gate.ts", async () => {
    const msgs = await lint("packages/corpus/src/transcript-gate.ts", `export const p = "${TRANSCRIPTS_PATH}";\n`);
    expect(msgs).toEqual([]);
  });

  it("allows the literal in packages/corpus-guard", async () => {
    const msgs = await lint(
      "packages/corpus-guard/src/scan.ts",
      `export const p = "${TRANSCRIPTS_PATH}";\nexport const f = "${INPUT_TXT}";\n`,
    );
    expect(msgs).toEqual([]);
  });

  it("does not flag ordinary words", async () => {
    const msgs = await lint(
      "apps/live/app/routes/ok.ts",
      `export const a = "auditor";\nexport const b = "data/derived-notes";\nexport const c = "input-txt";\n`,
    );
    expect(msgs).toEqual([]);
  });
});

describe("site:lint CLI path", () => {
  const eslintBin = resolve(repoRoot, "node_modules/eslint/bin/eslint.js");
  const run = (stdinFilename: string, code: string) =>
    spawnSync(
      process.execPath,
      [eslintBin, "--config", resolve(configDir, "eslint.config.js"), "--stdin", "--stdin-filename", stdinFilename],
      { cwd: repoRoot, input: code, encoding: "utf8" },
    );

  it("exits non-zero for an apps/ file importing data/ and naming the transcripts path", () => {
    const res = run(
      "apps/quiet/src/pages/leak.ts",
      `import ingest from "../../../../data/derived/ingest.json";\nexport const p = "${TRANSCRIPTS_PATH}";\nexport default ingest;\n`,
    );
    expect(res.status).toBe(1);
    expect(res.stdout).toContain("no-restricted-imports");
    expect(res.stdout).toContain("no-restricted-syntax");
  });

  it("exits zero for a clean apps/ file", () => {
    const res = run("apps/live/app/routes/ok.ts", `export const ok = 1;\n`);
    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
  });
});

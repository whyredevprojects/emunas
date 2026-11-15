/**
 * Builds the mini corpus of @emunas/corpus (layer included) into a temp directory through the
 * corpus:build CLI, for the C2.1 model tests. App code may not import @emunas/corpus/build.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repo = resolve(here, "../../../../../..");
const corpusPkg = join(repo, "packages/corpus");

export interface MiniCorpus {
  readonly dir: string;
  dispose(): void;
}

export function buildMiniCorpus(): MiniCorpus {
  const work = mkdtempSync(join(tmpdir(), "quiet-entries-"));
  const dir = join(work, "corpus");
  const tsx = join(repo, "node_modules", ".bin", "tsx");
  const r = spawnSync(
    tsx,
    [
      join(corpusPkg, "src", "cli.ts"),
      "--data-dir",
      join(corpusPkg, "test/fixtures/mini/data"),
      "--policy-dir",
      join(corpusPkg, "test/fixtures/mini/site-policy"),
      "--out",
      dir,
      "--media-origin",
      "https://media.example.org",
    ],
    { cwd: repo, env: { ...process.env, INIT_CWD: repo, EMUNAS_DEPLOY: "" }, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`corpus:build failed:\n${r.stdout}\n${r.stderr}`);
  return { dir, dispose: () => rmSync(work, { recursive: true, force: true }) };
}

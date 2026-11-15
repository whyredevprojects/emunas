/**
 * Builds `.corpus/` from the repository's data into `out` through the corpus:build CLI (app code
 * may not import @emunas/corpus/build; the CLI is the public way in).
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export function buildCorpus(repo: string, out: string, mediaOrigin: string): void {
  const tsx = join(repo, "node_modules", ".bin", "tsx");
  const r = spawnSync(tsx, [join(repo, "packages", "corpus", "src", "cli.ts"), "--out", out, "--media-origin", mediaOrigin], {
    cwd: repo,
    env: { ...process.env, INIT_CWD: repo, EMUNAS_DEPLOY: "" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`corpus:build failed:\n${r.stdout}\n${r.stderr}`);
}

/**
 * Where `.corpus/` is, for the corpus-entry indexes and the layer reader: `EMUNAS_CORPUS_DIR`, else
 * the first `.corpus/` with a `build.json` found walking up from the working directory (the repo
 * root, when Astro runs in `apps/quiet`). An explicit `EMUNAS_CORPUS_DIR` that does not hold a
 * corpus is an error.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { LocalizedText } from "@emunas/corpus/public";

/** A chapter of a shiur, as the entry pages cite it. */
export interface ChapterRef {
  idx: number;
  t: number;
  title: LocalizedText;
}

/** The `.corpus/` directory to read, or null when there is none. */
export function findCorpusDir(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string | null {
  const explicit = env["EMUNAS_CORPUS_DIR"];
  if (explicit !== undefined && explicit !== "") {
    const dir = resolve(cwd, explicit);
    if (!existsSync(join(dir, "build.json"))) {
      throw new Error(`EMUNAS_CORPUS_DIR=${explicit}: no build.json there (run npm run corpus:build)`);
    }
    return dir;
  }
  let at = resolve(cwd);
  for (;;) {
    const candidate = join(at, ".corpus");
    if (existsSync(join(candidate, "build.json"))) return candidate;
    const up = dirname(at);
    if (up === at) return null;
    at = up;
  }
}

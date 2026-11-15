/**
 * Build-time reader for the catalog pages (W3.1). Reads only `.corpus/` (the output of
 * `buildCorpusWithAggregates`, integration-plan §5.1): build.json, index.json, sections.json,
 * series.json, occasions.json and audio-table.json. Never `data/` (§1.4 C3).
 *
 * Imported from `.astro` frontmatter only (runs in Node during `astro build`); nothing here
 * reaches a browser.
 *
 * Location: `EMUNAS_CORPUS_DIR` when set, otherwise the nearest `.corpus/` with a build.json found
 * walking up from the working directory (the app directory under `npm run build -w`, the repo root
 * in CI).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { OccasionsFile, SectionsFile, SeriesFile } from "@emunas/corpus/aggregate";
import type { AudioTable, BuildInfo, CorpusIndex } from "@emunas/corpus/public";

export interface CatalogCorpus {
  readonly dir: string;
  readonly build: BuildInfo;
  readonly index: CorpusIndex;
  readonly sections: SectionsFile;
  readonly series: SeriesFile;
  readonly occasions: OccasionsFile;
  readonly audio: AudioTable;
}

export const CORPUS_DIR_ENV = "EMUNAS_CORPUS_DIR";

/** The `.corpus/` directory to read, or null when none can be found. */
export function findCorpusDir(env: NodeJS.ProcessEnv = process.env, from: string = process.cwd()): string | null {
  const explicit = env[CORPUS_DIR_ENV];
  if (explicit !== undefined && explicit !== "") {
    const dir = resolve(from, explicit);
    return existsSync(join(dir, "build.json")) ? dir : null;
  }
  let here = resolve(from);
  for (;;) {
    const candidate = join(here, ".corpus");
    if (existsSync(join(candidate, "build.json"))) return candidate;
    const up = dirname(here);
    if (up === here) return null;
    here = up;
  }
}

function readJson<T>(dir: string, name: string): T {
  const path = join(dir, name);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    throw new Error(
      `catalog pages: cannot read ${path} (${(e as Error).message}). Run \`npm run corpus:build\` first ` +
        `(it writes the aggregate files), or point ${CORPUS_DIR_ENV} at a built .corpus/.`,
      { cause: e },
    );
  }
}

const cache = new Map<string, CatalogCorpus>();

/** Reads (once per directory) the files the catalog pages need. Throws with a clear message when absent. */
export function loadCatalogCorpus(dir?: string): CatalogCorpus {
  const where = dir ?? findCorpusDir();
  if (where === null) {
    throw new Error(
      `catalog pages: no .corpus/ found (looked for ${CORPUS_DIR_ENV} and .corpus/build.json above ${process.cwd()}). ` +
        "Run `npm run corpus:build` before building the Quiet site.",
    );
  }
  const hit = cache.get(where);
  if (hit) return hit;
  const corpus: CatalogCorpus = {
    dir: where,
    build: readJson<BuildInfo>(where, "build.json"),
    index: readJson<CorpusIndex>(where, "index.json"),
    sections: readJson<SectionsFile>(where, "sections.json"),
    series: readJson<SeriesFile>(where, "series.json"),
    occasions: readJson<OccasionsFile>(where, "occasions.json"),
    audio: readJson<AudioTable>(where, "audio-table.json"),
  };
  cache.set(where, corpus);
  return corpus;
}

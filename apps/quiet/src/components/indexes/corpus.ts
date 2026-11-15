/**
 * Build-time reader of `.corpus/` for the AI indexes (W3.4: sources, stories, people, inyanim).
 *
 * Reads only the files `corpus:build` writes (integration-plan §5.1): build.json, index.json, the
 * aggregate files (works, people, concepts, stories, entities) and, for concept pages, the
 * chapter titles of `shiurim/<id>.json`. Never the pipeline's data folder (§1.4 C3).
 *
 * Where `.corpus/` is: `EMUNAS_CORPUS_DIR`, else the first `.corpus/` with a `build.json` found
 * walking up from the working directory (the repo root, when Astro runs in `apps/quiet`).
 * Without a corpus the index routes produce no pages and a warning is printed, so a shell-only
 * build (`EMUNAS_SHELL_SAMPLE=1`) still works; an explicit `EMUNAS_CORPUS_DIR` that does not hold
 * a corpus is an error.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  ConceptsFile,
  EntitiesFile,
  PeopleFile,
  StoriesFile,
  WorksFile,
} from "@emunas/corpus/aggregate";
import type { BuildInfo, CorpusIndex, IndexRow, L, PublicShiur } from "@emunas/corpus/public";

/** A chapter of a shiur, as the inyanim pages show it. */
export interface ChapterRef {
  idx: number;
  t: number;
  title: L;
}

export interface IndexesData {
  readonly dir: string;
  readonly build: BuildInfo;
  readonly works: WorksFile;
  readonly people: PeopleFile;
  readonly concepts: ConceptsFile;
  readonly stories: StoriesFile;
  readonly entities: EntitiesFile;
  /** index.json rows by shiur id (catalog fields for citations). */
  readonly rows: ReadonlyMap<string, IndexRow>;
  /** Chapters of a shiur by `idx` (empty for a catalog-only or unknown shiur). */
  chapters(shiurId: string): ReadonlyMap<number, ChapterRef>;
}

const CORPUS_FILES = ["build.json", "index.json", "works.json", "people.json", "concepts.json", "stories.json", "entities.json"] as const;

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

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Loads a corpus directory. Throws when a required file is missing (a broken corpus build). */
export function loadIndexesData(dir: string): IndexesData {
  for (const f of CORPUS_FILES) {
    if (!existsSync(join(dir, f))) throw new Error(`${join(dir, f)} is missing (run npm run corpus:build)`);
  }
  const index = readJson<CorpusIndex>(join(dir, "index.json"));
  const rows = new Map(index.shiurim.map((r) => [r.id, r]));
  const chapterCache = new Map<string, ReadonlyMap<number, ChapterRef>>();
  const empty: ReadonlyMap<number, ChapterRef> = new Map();
  return {
    dir,
    build: readJson<BuildInfo>(join(dir, "build.json")),
    works: readJson<WorksFile>(join(dir, "works.json")),
    people: readJson<PeopleFile>(join(dir, "people.json")),
    concepts: readJson<ConceptsFile>(join(dir, "concepts.json")),
    stories: readJson<StoriesFile>(join(dir, "stories.json")),
    entities: readJson<EntitiesFile>(join(dir, "entities.json")),
    rows,
    chapters(shiurId) {
      const hit = chapterCache.get(shiurId);
      if (hit) return hit;
      const path = join(dir, "shiurim", `${shiurId}.json`);
      // Ids come from the corpus' own files; anything else (a path-like id) is simply unknown.
      if (!rows.has(shiurId) || !existsSync(path)) return empty;
      const shiur = readJson<Pick<PublicShiur, "notes">>(path);
      const map = new Map<number, ChapterRef>(
        (shiur.notes?.chapters ?? []).map((c) => [c.idx, { idx: c.idx, t: c.t, title: c.title }]),
      );
      chapterCache.set(shiurId, map);
      return map;
    },
  };
}

let cached: { key: string; data: IndexesData | null } | null = null;

/**
 * The corpus for the current build (memoised per directory), or null when there is none.
 * Pages call this from `getStaticPaths` and from their frontmatter.
 */
export function indexesData(): IndexesData | null {
  const dir = findCorpusDir();
  const key = dir ?? "";
  if (cached && cached.key === key) return cached.data;
  if (dir === null) {
    console.warn("[quiet indexes] no .corpus/ found: sources, stories, people and inyanim pages are not built (run npm run corpus:build)");
  }
  cached = { key, data: dir === null ? null : loadIndexesData(dir) };
  return cached.data;
}

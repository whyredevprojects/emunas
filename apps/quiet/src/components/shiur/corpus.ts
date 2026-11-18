/**
 * Build-time reader for the shiur pages (Node only; used in page frontmatter and
 * `getStaticPaths`, never shipped to a browser). Reads `.corpus/` only (integration-plan C3):
 * `index.json`, `shiurim/<id>.json`, `neighbours.json`, `series.json`, `build.json`, and the
 * corpus layer `layer/` (topics, people, glossary, works, stories and the per-shiur refs
 * `layer/shiur/<id>.json`) through the Quiet layer reader. Never `data/`.
 *
 * Where `.corpus/` is: `EMUNAS_CORPUS_DIR`, else the first `.corpus/` with a `build.json` found
 * walking up from the working directory (`astro build` runs in `apps/quiet`). Without a corpus the
 * site still builds, with no shiur pages and a warning.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { BuildInfo, CorpusIndex, IndexRow, PublicShiur } from "@emunas/corpus/public";
import type { LayerShiurRefs } from "@emunas/corpus/public";
import type { NeighboursFile, SeriesFile } from "@emunas/corpus/aggregate";
import type { Ed } from "../../lib/edition.ts";
import { findLayerDir, loadQuietLayer, type QuietLayer } from "../corpus/layer.ts";
import type { RowLookup } from "./view.ts";

export function findCorpusDir(env: Readonly<Record<string, string | undefined>> = process.env, from = process.cwd()): string | null {
  const explicit = env["EMUNAS_CORPUS_DIR"]?.trim();
  if (explicit) return existsSync(join(explicit, "build.json")) ? resolve(explicit) : null;
  let dir = resolve(from);
  for (;;) {
    const candidate = join(dir, ".corpus");
    if (existsSync(join(candidate, "build.json"))) return candidate;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function readJson<T>(dir: string, file: string): T {
  return JSON.parse(readFileSync(join(dir, file), "utf8")) as T;
}

function readOptional<T>(dir: string, file: string): T | null {
  return existsSync(join(dir, file)) ? readJson<T>(dir, file) : null;
}

export interface ShiurCorpus {
  readonly dir: string;
  readonly build: BuildInfo;
  readonly index: CorpusIndex;
  readonly rows: RowLookup;
  readonly neighbours: NeighboursFile;
  readonly seriesTitle: (id: string, ed: Ed) => string | undefined;
  /** The corpus layer (empty, with a warning, when the corpus has none). */
  readonly layer: QuietLayer;
  /** The shiur's layer refs (null: not in the visible set). */
  refs(id: string): LayerShiurRefs | null;
  shiur(id: string): PublicShiur;
}

const cache = new Map<string, ShiurCorpus>();

/** Loads (once per directory) the files the shiur pages need. */
export function loadShiurCorpus(dir: string): ShiurCorpus {
  const hit = cache.get(dir);
  if (hit) return hit;
  const build = readJson<BuildInfo>(dir, "build.json");
  const index = readJson<CorpusIndex>(dir, "index.json");
  const neighbours = readOptional<NeighboursFile>(dir, "neighbours.json") ?? {};
  const series = readOptional<SeriesFile>(dir, "series.json");
  const layer = loadQuietLayer(findLayerDir(dir));
  if (layer.warnings.length > 0) console.warn(`[quiet shiur] ${layer.warnings.join("; ")}`);

  const rowMap = new Map<string, IndexRow>(index.shiurim.map((r) => [r.id, r]));
  const seriesTitles = new Map((series?.series ?? []).map((s) => [s.id, s.title] as const));
  const shiurim = new Map<string, PublicShiur>();

  const corpus: ShiurCorpus = {
    dir,
    build,
    index,
    rows: (id) => rowMap.get(id),
    neighbours,
    seriesTitle: (id, ed) => seriesTitles.get(id)?.[ed],
    layer,
    // Only a shiur in the corpus index can have refs; a catalog-only shiur never does.
    refs: (id) => (rowMap.get(id) ? layer.shiurRefs(id) : null),
    shiur(id) {
      let s = shiurim.get(id);
      if (!s) {
        if (!rowMap.has(id)) throw new Error(`shiur ${JSON.stringify(id)} is not in ${join(dir, "index.json")}`);
        s = readJson<PublicShiur>(dir, join("shiurim", `${id}.json`));
        shiurim.set(id, s);
      }
      return s;
    },
  };
  cache.set(dir, corpus);
  return corpus;
}

let warned = false;

/** The corpus for this build, or null (warned once) when there is none. */
export function currentCorpus(): ShiurCorpus | null {
  const dir = findCorpusDir();
  if (!dir) {
    if (!warned) {
      warned = true;
      console.warn("[quiet] no .corpus/ found (run `npm run corpus:build` or set EMUNAS_CORPUS_DIR): no shiur pages built");
    }
    return null;
  }
  return loadShiurCorpus(dir);
}

/**
 * Build-time reader for the shiur pages (Node only; used in page frontmatter and
 * `getStaticPaths`, never shipped to a browser). Reads `.corpus/` only (integration-plan C3):
 * `index.json`, `shiurim/<id>.json`, `neighbours.json`, `entities.json`, `people.json`,
 * `series.json`, `build.json`. Never `data/`.
 *
 * Where `.corpus/` is: `EMUNAS_CORPUS_DIR`, else the first `.corpus/` with a `build.json` found
 * walking up from the working directory (`astro build` runs in `apps/quiet`). Without a corpus the
 * site still builds, with no shiur pages and a warning.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { BuildInfo, CorpusIndex, IndexRow, PublicShiur } from "@emunas/corpus/public";
import type { EntitiesFile, NeighboursFile, PeopleFile, SeriesFile } from "@emunas/corpus/aggregate";
import type { EntityKind } from "@emunas/links";
import type { Ed } from "../../lib/edition.ts";
import type { EntityCounts, RowLookup } from "./view.ts";

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
  readonly entityCounts: EntityCounts;
  /** Display name of a person key in an edition (Hebrew spelling in the Yiddish edition when known). */
  readonly personName: (key: string, ed: Ed, fallback: string) => string;
  readonly seriesTitle: (id: string, ed: Ed) => string | undefined;
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
  const entities = readOptional<EntitiesFile>(dir, "entities.json");
  const people = readOptional<PeopleFile>(dir, "people.json");
  const series = readOptional<SeriesFile>(dir, "series.json");

  const rowMap = new Map<string, IndexRow>(index.shiurim.map((r) => [r.id, r]));
  const counts = new Map<string, number>();
  const kinds: [EntityKind, keyof Pick<EntitiesFile, "works" | "people" | "concepts">][] = [
    ["work", "works"],
    ["person", "people"],
    ["concept", "concepts"],
  ];
  for (const [kind, field] of kinds) {
    for (const e of entities?.[field] ?? []) {
      // Only entities.json's quietPage decides whether a page exists (generic works never get one,
      // whatever their count), so an entity without a page, or not listed, is passed as count 0.
      counts.set(`${kind}:${e.key}`, e.quietPage ? e.shiurim : 0);
    }
  }
  const heName = new Map<string, string>();
  for (const p of people?.people ?? []) if (p.he) heName.set(p.key, p.he);
  const seriesTitles = new Map((series?.series ?? []).map((s) => [s.id, s.title] as const));
  const shiurim = new Map<string, PublicShiur>();

  const corpus: ShiurCorpus = {
    dir,
    build,
    index,
    rows: (id) => rowMap.get(id),
    neighbours,
    entityCounts: entities ? (kind, key) => counts.get(`${kind}:${key}`) ?? 0 : () => undefined,
    personName: (key, ed, fallback) => (ed === "yi" ? (heName.get(key) ?? fallback) : fallback),
    seriesTitle: (id, ed) => seriesTitles.get(id)?.[ed],
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

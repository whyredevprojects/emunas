/**
 * Paths of the Live data files (tech-live §3.3). Stable paths, not content-hashed: Workers assets keep
 * only the current version, so hashed paths would 404 in tabs left open across a deploy. Freshness is
 * by `rev` (per shiur) and `buildId`.
 *
 * Ids and keys are single path segments; anything that could escape the segment is rejected.
 */
import type { Ed } from "@emunas/corpus/public";
import type { DataKind, EntityKind } from "./types.ts";

export const DATA_ROOT = "/data";

export class DataPathError extends Error {
  override name = "DataPathError";
}

/** One path segment: no slash, backslash, dot-segment or control character. Encoded for the URL. */
function segment(what: string, value: string): string {
  const control = [...value].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f);
  if (value === "" || value === "." || value === ".." || control || /[/\\]/u.test(value)) {
    throw new DataPathError(`invalid ${what}: ${JSON.stringify(value)}`);
  }
  return encodeURIComponent(value);
}

function lang(value: Ed): Ed {
  if (value !== "en" && value !== "yi") throw new DataPathError(`invalid language: ${String(value)}`);
  return value;
}

export const dataPaths = {
  build: () => `${DATA_ROOT}/build.json`,
  corpus: () => `${DATA_ROOT}/corpus.json`,
  facets: () => `${DATA_ROOT}/facets.json`,
  today: () => `${DATA_ROOT}/today.json`,
  shiur: (id: string) => `${DATA_ROOT}/shiur/${segment("shiur id", id)}.json`,
  writeup: (id: string, l: Ed) => `${DATA_ROOT}/writeup/${segment("shiur id", id)}.${lang(l)}.json`,
  series: (id: string) => `${DATA_ROOT}/series/${segment("series id", id)}.json`,
  works: () => `${DATA_ROOT}/works.json`,
  work: (key: string) => `${DATA_ROOT}/work/${segment("work key", key)}.json`,
  entity: (kind: EntityKind, key: string) => {
    if (kind !== "p" && kind !== "c" && kind !== "o") throw new DataPathError(`invalid entity kind: ${String(kind)}`);
    return `${DATA_ROOT}/entity/${kind}/${segment("entity key", key)}.json`;
  },
  moments: (l: Ed, shard: number) => {
    if (!Number.isInteger(shard) || shard < 0) throw new DataPathError(`invalid shard: ${shard}`);
    return `${DATA_ROOT}/moments/${lang(l)}-${shard}.json`;
  },
  quickIndex: (l: Ed) => `${DATA_ROOT}/quick-index.${lang(l)}.json`,
  topics: () => `${DATA_ROOT}/topics.json`,
  topic: (id: string) => `${DATA_ROOT}/topic/${segment("topic id", id)}.json`,
  topicMoments: (id: string, page: number) => {
    if (!Number.isInteger(page) || page < 1) throw new DataPathError(`invalid page: ${page}`);
    return `${DATA_ROOT}/topic/${segment("topic id", id)}.moments-${page}.json`;
  },
  topicShiurim: (id: string, page: number) => {
    if (!Number.isInteger(page) || page < 1) throw new DataPathError(`invalid page: ${page}`);
    return `${DATA_ROOT}/topic-shiurim/${segment("topic id", id)}.${page}.json`;
  },
  thread: (id: string) => `${DATA_ROOT}/thread/${segment("thread id", id)}.json`,
  story: (id: string) => `${DATA_ROOT}/story/${segment("story id", id)}.json`,
  storiesIndex: () => `${DATA_ROOT}/stories-index.json`,
  glossary: (shard: string) => `${DATA_ROOT}/glossary/${segment("glossary shard", shard)}.json`,
  exploreEntities: () => `${DATA_ROOT}/explore/entities.json`,
} as const satisfies Record<DataKind, (...args: never[]) => string>;

/**
 * The file path (relative to the data root, decoded) for a data URL path, e.g.
 * `/data/shiur/x.json` → `shiur/x.json`. Used by emitters and the fixture fetcher to map URLs to
 * files. Null for paths outside `/data/`.
 */
export function dataFileOf(urlPath: string): string | null {
  const prefix = `${DATA_ROOT}/`;
  if (!urlPath.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(urlPath.slice(prefix.length));
  } catch {
    return null;
  }
}

/**
 * The glossary shard holding a concept's card: the longest prefix in `shards` (build.json
 * `glossaryShards`) that the id starts with, or null when none does.
 */
export function glossaryShardFor(id: string, shards: readonly string[]): string | null {
  let best: string | null = null;
  for (const p of shards) if (id.startsWith(p) && (best === null || p.length > best.length)) best = p;
  return best;
}

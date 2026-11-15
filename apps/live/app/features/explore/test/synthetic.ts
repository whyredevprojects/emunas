/**
 * Seeded synthetic data for Explore tests: `corpus.json` rows shaped like the real corpus (997
 * shiurim, 730 yi / 267 en, ~62% dated 5724–5780, ~28% parsha / ~35% zman, a dozen series, Zipf-ish
 * entity frequencies), and the files derived from them (facets, build, moment shards, entity files).
 */
import { OCCASIONS, PARSHIYOS } from "@emunas/normalize";
import {
  LIVE_DATA_SCHEMA_VERSION,
  MOMENT_SHARD_SIZE,
  type BuildFile,
  type CorpusFile,
  type CorpusRow,
  type EntityFile,
  type EntityKind,
  type FacetsFile,
  type FacetValue,
  type MomentKind,
  type MomentRow,
  type MomentShardFile,
} from "../live-data.ts";
import { CATEGORIES } from "../url.ts";

/** mulberry32 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rand {
  next(): number;
  int(n: number): number;
  pick<T>(list: readonly T[]): T;
  /** Index with a Zipf-like skew (small indices much more likely). */
  zipf(n: number): number;
  chance(p: number): boolean;
}

export function rand(seed: number): Rand {
  const r = rng(seed);
  return {
    next: r,
    int: (n) => Math.floor(r() * n),
    pick: (list) => list[Math.floor(r() * list.length)]!,
    zipf: (n) => Math.min(n - 1, Math.floor(n ** r()) - 1),
    chance: (p) => r() < p,
  };
}

const SINGLE_PARSHIYOS = PARSHIYOS.filter((p) => p.parts === undefined).map((p) => p.key);
const ZMANIM = OCCASIONS.map((o) => o.key);

export interface SyntheticOptions {
  n?: number;
  seed?: number;
  people?: number;
  concepts?: number;
  works?: number;
}

export function syntheticRows({ n = 997, seed = 1, people = 1285, concepts = 1100, works = 750 }: SyntheticOptions = {}): CorpusRow[] {
  const R = rand(seed);
  const rows: CorpusRow[] = [];
  const series = Array.from({ length: 16 }, (_, i) => `series-${i}`);
  for (let i = 0; i < n; i++) {
    const lang = R.chance(730 / 997) ? "yi" : "en";
    const kindRoll = R.next();
    const category = kindRoll < 0.28 ? "parsha" : kindRoll < 0.63 ? "zman" : R.pick(CATEGORIES.filter((c) => c !== "parsha" && c !== "zman"));
    const parsha = category === "parsha" ? R.pick(SINGLE_PARSHIYOS) : null;
    const zman = category === "zman" ? (R.chance(0.03) ? "other" : R.pick(ZMANIM)) : null;
    const years = R.chance(0.62) ? [5724 + R.int(57)] : [];
    if (years.length && R.chance(0.004)) years.push(years[0]! + 1);
    const inSeries = category === "set" && R.chance(0.8);
    const full = R.chance(518 / 997);
    const ent = (pool: number, max: number, prefix: string) =>
      full ? [...new Set(Array.from({ length: R.int(max) }, () => `${prefix}-${R.zipf(pool)}`))].sort() : [];
    rows.push({
      id: `${lang}-synthetic-${String(i).padStart(4, "0")}`,
      rev: "r",
      lang,
      category,
      status: full ? "full" : "catalog-only",
      title: `Shiur ${i}`,
      heading: null,
      sectionTitle: "Section",
      derived: R.chance(0.21) ? (R.chance(0.5) ? "filename" : "dir-prefix") : "catalog",
      parsha,
      zman,
      perek: null,
      years,
      series: inSeries ? { id: R.pick(series), order: i } : null,
      duration: 600 + R.int(7200),
      oneLiner: full ? { en: `About shiur ${i}`, yi: `וועגן שיעור ${i}` } : null,
      entities: { works: ent(works, 30, "w"), people: ent(people, 16, "p"), concepts: ent(concepts, 15, "c") },
      counts: { chapters: full ? 10 : 0, stories: full ? R.int(4) : 0, questions: full ? R.int(5) : 0, insights: full ? R.int(8) : 0 },
    } as CorpusRow);
  }
  return rows;
}

const tally = (values: Iterable<string>) => {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
};

const facetRecord = (m: Map<string, number>, label: (k: string) => FacetValue["label"]) =>
  Object.fromEntries([...m].sort().map(([k, count]) => [k, { label: label(k), count }]));

export function corpusFile(rows: CorpusRow[]): CorpusFile {
  const full = rows.filter((r) => r.status === "full").length;
  return {
    schemaVersion: LIVE_DATA_SCHEMA_VERSION,
    buildId: "test",
    counts: { total: rows.length, full, catalogOnly: rows.length - full, downgraded: 0 },
    shiurim: rows,
  };
}

export function facetsFile(rows: CorpusRow[]): FacetsFile {
  const same = (k: string) => ({ en: k, yi: k });
  const tableLabel = new Map([...PARSHIYOS, ...OCCASIONS].map((o) => [o.key, { en: o.en, yi: o.yi, he: o.he }]));
  const occ = tally(rows.flatMap((r) => [r.parsha, r.zman].filter((x): x is string => x !== null)));
  const parshaKeys = new Set(PARSHIYOS.map((p) => p.key));
  return {
    schemaVersion: LIVE_DATA_SCHEMA_VERSION,
    category: facetRecord(tally(rows.map((r) => r.category)), same),
    lang: {
      en: { label: { en: "English", yi: "ענגליש" }, count: rows.filter((r) => r.lang === "en").length },
      yi: { label: { en: "Yiddish", yi: "אידיש" }, count: rows.filter((r) => r.lang === "yi").length },
    },
    occasion: Object.fromEntries(
      [...occ].sort().map(([k, count]) => [
        k,
        { label: tableLabel.get(k) ?? { en: "Other occasions", yi: "אנדערע געלעגנהייטן" }, count, type: parshaKeys.has(k) ? "parsha" : "zman" },
      ]),
    ) as FacetsFile["occasion"],
    year: facetRecord(tally(rows.flatMap((r) => (r.years.length ? r.years.map(String) : ["unknown"]))), same),
    series: Object.fromEntries(
      [...tally(rows.flatMap((r) => (r.series ? [r.series.id] : [])))].map(([k, count]) => [
        k,
        { label: { en: `Series ${k}`, yi: `סעריע ${k}` }, count, lang: "yi" as const, sibling: null },
      ]),
    ),
    work: facetRecord(tally(rows.flatMap((r) => r.entities.works)), (k) => ({ en: `Work ${k}`, yi: `ספר ${k}` })),
    person: facetRecord(tally(rows.flatMap((r) => r.entities.people)), (k) => ({ en: `Person ${k}`, yi: `פערזאן ${k}` })),
    concept: facetRecord(tally(rows.flatMap((r) => r.entities.concepts)), (k) => ({ en: `Concept ${k}`, yi: `ענין ${k}` })),
  };
}

const KINDS: readonly MomentKind[] = ["s", "i", "st", "q", "tk", "kp"];

/** Three moments per full shiur, cycling through the kinds; one of every seven has no time. */
export function momentRows(rows: CorpusRow[], lang: "en" | "yi"): MomentRow[] {
  const out: MomentRow[] = [];
  let k = 0;
  for (const r of rows) {
    if (r.status !== "full") continue;
    for (let j = 0; j < 3; j++) {
      const kind = KINDS[k++ % KINDS.length]!;
      const t = k % 7 === 0 ? null : 60 * (j + 1);
      out.push({ id: `${r.id}~${kind}${j}`, shiurId: r.id, kind, t, end: t === null ? null : t + 30, title: `${lang} moment ${j} of ${r.id}` });
    }
  }
  return out;
}

export function momentShards(rows: CorpusRow[], lang: "en" | "yi"): MomentShardFile[] {
  const all = momentRows(rows, lang);
  const shards: MomentShardFile[] = [];
  for (let i = 0; i * MOMENT_SHARD_SIZE < all.length || i === 0; i++) {
    shards.push({ schemaVersion: LIVE_DATA_SCHEMA_VERSION, lang, shard: i, moments: all.slice(i * MOMENT_SHARD_SIZE, (i + 1) * MOMENT_SHARD_SIZE) });
  }
  return shards;
}

export function buildFile(rows: CorpusRow[], shards: { en: number; yi: number }): BuildFile {
  const full = rows.filter((r) => r.status === "full").length;
  return {
    schemaVersion: LIVE_DATA_SCHEMA_VERSION,
    corpusSchemaVersion: 2,
    buildId: "test",
    dataSha: null,
    generatedAt: "2026-11-15T00:00:00.000Z",
    counts: { total: rows.length, full, catalogOnly: rows.length - full, downgraded: 0 },
    momentShards: shards,
    glossaryShards: [],
  };
}

export function entityFile(kind: EntityKind, key: string, related: EntityFile["related"]): EntityFile {
  return {
    schemaVersion: LIVE_DATA_SCHEMA_VERSION,
    kind,
    key,
    label: { en: key, yi: key },
    shiurIds: [],
    years: {},
    moments: [],
    related,
  };
}

/**
 * Build-time reader: `.corpus/` → `SeoCorpus` (W4.5). Node only (`.server` keeps it out of the
 * client bundle). Reads the aggregate files and `index.json` only, never per-shiur files and never
 * anything under the pipeline's `data/` folder (integration-plan §1.4 C3).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { CorpusIndex } from "@emunas/corpus/public";
import type {
  ConceptsFile,
  EntitiesFile,
  EntityCount,
  OccasionsFile,
  PeopleFile,
  SeriesFile,
  WorksFile,
} from "@emunas/corpus/aggregate";
import type { SeoCorpus, SeoEntity, SeoLabel, SeoOccasion } from "./model.ts";

function readJson<T>(dir: string, file: string): T {
  return JSON.parse(readFileSync(join(dir, file), "utf8")) as T;
}

/**
 * The `.corpus/` directory: `EMUNAS_CORPUS_DIR`, else the nearest `.corpus/` with a `build.json`
 * found walking up from `from` (the app or repo directory). Null when there is none.
 */
export function findCorpusDir(env: Readonly<Record<string, string | undefined>>, from: string): string | null {
  const explicit = env["EMUNAS_CORPUS_DIR"]?.trim();
  if (explicit) return existsSync(join(explicit, "build.json")) ? resolve(explicit) : null;
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, ".corpus", "build.json"))) return join(dir, ".corpus");
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function readSeoCorpus(corpusDir: string): SeoCorpus {
  const index = readJson<CorpusIndex>(corpusDir, "index.json");
  const seriesFile = readJson<SeriesFile>(corpusDir, "series.json");
  const occasionsFile = readJson<OccasionsFile>(corpusDir, "occasions.json");
  const worksFile = readJson<WorksFile>(corpusDir, "works.json");
  const peopleFile = readJson<PeopleFile>(corpusDir, "people.json");
  const conceptsFile = readJson<ConceptsFile>(corpusDir, "concepts.json");
  const entities = readJson<EntitiesFile>(corpusDir, "entities.json");

  const shiurim = index.shiurim.map((r) => ({
    id: r.id,
    lang: r.lang,
    titleOriginal: r.catalog.titleOriginal,
    subTitle: r.catalog.subTitle,
    sectionTitle: r.catalog.sectionTitle,
    years: r.years,
    oneLiner: r.oneLiner,
  }));

  const series = seriesFile.series.map((s) => ({ id: s.id, title: s.title, count: s.count }));

  // Occasions: table parshiyos and zmanim (labelled, parsha/zman known), then keys outside the
  // tables (the "other" bucket and unmapped slugs) labelled by the catalog spelling.
  const table = new Map<string, { kind: "parsha" | "zman"; label: SeoLabel }>();
  for (const p of occasionsFile.parshiyos) table.set(p.key, { kind: "parsha", label: { en: p.en, yi: p.yi } });
  for (const z of occasionsFile.zmanim) table.set(z.key, { kind: "zman", label: { en: z.en, yi: z.yi } });
  const raw = new Map<string, string>();
  for (const r of index.shiurim) {
    for (const v of [r.parsha, r.zman]) if (v && !raw.has(v.key)) raw.set(v.key, v.raw);
  }
  const occasions: SeoOccasion[] = entities.occasions.map((o) => {
    const t = table.get(o.key);
    const fallback = raw.get(o.key) ?? o.key;
    return { key: o.key, kind: t?.kind ?? null, label: t?.label ?? { en: fallback, yi: fallback }, count: o.shiurim };
  });

  const entity = (counts: readonly EntityCount[], label: (key: string) => SeoLabel): SeoEntity[] =>
    counts.map((c) => ({ key: c.key, label: label(c.key), count: c.shiurim, prerender: c.livePrerender }));

  const works = new Map(worksFile.works.map((w) => [w.key, w]));
  const people = new Map(peopleFile.people.map((p) => [p.key, p]));
  const concepts = new Map(conceptsFile.concepts.map((c) => [c.key, c]));
  // Every entity in entities.json (for the Quiet thresholds); labels from the aggregate files.
  return {
    shiurim,
    series,
    occasions,
    works: entity(entities.works, (key) => {
      const w = works.get(key);
      return w ? { en: w.en, yi: w.yi ?? w.he ?? w.en } : { en: key, yi: key };
    }),
    people: entity(entities.people, (key) => {
      const p = people.get(key);
      return p ? { en: p.en, yi: p.he ?? p.en } : { en: key, yi: key };
    }),
    concepts: entity(entities.concepts, (key) => {
      const c = concepts.get(key);
      return c ? { en: c.he, yi: c.he } : { en: key, yi: key };
    }),
  };
}

/** Relative paths of every file under the emitted `/data/` tree (`shiur/x.json`), or null without one. */
export function readDataFileSet(dataDir: string): Set<string> | null {
  if (!existsSync(join(dataDir, "build.json"))) return null;
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.add(relative(dataDir, p).split(sep).join("/"));
    }
  };
  walk(dataDir);
  return out;
}

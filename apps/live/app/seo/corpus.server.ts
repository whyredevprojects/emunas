/**
 * Build-time reader: `.corpus/` → `SeoCorpus` (W4.5). Node only (`.server` keeps it out of the
 * client bundle). Reads `index.json`, the catalog aggregates (`series.json`, `occasions.json`) and
 * the corpus layer's entity files (`layer/`, C1.7), never per-shiur files and never anything under
 * the pipeline's `data/` folder (integration-plan §1.4 C3). Works, people, concepts, topics,
 * stories and threads are corpus ids, and every page flag comes from the layer, by the same rules
 * as the data emit (`app/data/live-pages.ts`). Without a layer there are no entity pages.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  LAYER_DIR,
  LAYER_FILES,
  type CorpusIndex,
  type LayerConcept,
  type LayerPerson,
  type LayerStory,
  type LayerThread,
  type LayerTopicNode,
  type LayerWork,
} from "@emunas/corpus/public";
import { liveConceptPage, livePersonPage, liveStoryPage, liveThreadPage, liveTopicPage, liveWorkPage } from "../data/live-pages.ts";
import type { OccasionsFile, SeriesFile } from "@emunas/corpus/aggregate";
import { byUiLang, pickText, type UiLang } from "@emunas/i18n";
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

const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const str = (x: unknown): string => (typeof x === "string" ? x : "");

interface LayerLists {
  topics: SeoEntity[];
  concepts: SeoEntity[];
  people: SeoEntity[];
  works: SeoEntity[];
  stories: SeoEntity[];
  threads: SeoEntity[];
}

/** A generated layer text as an SEO label: each interface language's text along `CONTENT_FALLBACK`. */
function seoLabel(l: Partial<Record<UiLang, unknown>> | null | undefined): SeoLabel {
  const text = byUiLang((lang) => str(l?.[lang]));
  return byUiLang((lang) => pickText(text, lang).text);
}

/** The corpus layer's entities with their page flags. Throws when a `.corpus/layer/` file is missing. */
export function readLayerLists(corpusDir: string): LayerLists {
  const dir = join(corpusDir, LAYER_DIR);
  const read = (file: string): Record<string, unknown> => {
    const p = join(dir, file);
    if (!existsSync(p)) throw new Error(`${LAYER_DIR}/${file} is missing in ${corpusDir}: the corpus layer is required (run npm run corpus:build)`);
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  };
  const quiet = (x: { pages?: { quiet?: unknown } | null }) => x.pages?.quiet === true;
  return {
    topics: arr<LayerTopicNode>(read(LAYER_FILES.topics)["tree"]).map((t) => ({
      key: t.id,
      label: seoLabel(t.label),
      count: t.count,
      prerender: liveTopicPage(t),
      quietPage: quiet(t),
    })),
    concepts: arr<LayerConcept>(read(LAYER_FILES.concepts)["concepts"]).map((c) => ({
      key: c.id,
      label: {
        en: str(c.label?.en) || str(c.canonicalHe),
        yi: str(c.label?.yi) || str(c.canonicalHe),
        he: str(c.canonicalHe) || str(c.label?.he) || str(c.label?.yi),
      },
      count: c.count,
      prerender: liveConceptPage(c),
      quietPage: quiet(c),
      topicId: c.mergedIntoTopic ?? null,
    })),
    people: arr<LayerPerson>(read(LAYER_FILES.people)["people"]).map((p) => ({
      key: p.id,
      label: {
        en: str(p.nameEn),
        yi: str(p.nameYi) || str(p.nameHe) || str(p.nameEn),
        he: str(p.nameHe) || str(p.nameYi) || str(p.nameEn),
      },
      count: p.count,
      prerender: livePersonPage(p),
      quietPage: quiet(p),
    })),
    works: arr<LayerWork>(read(LAYER_FILES.works)["works"]).map((w) => ({
      key: w.id,
      label: { en: str(w.titleEn), yi: str(w.titleHe) || str(w.titleEn), he: str(w.titleHe) || str(w.titleEn) },
      count: w.count,
      prerender: liveWorkPage(w),
      quietPage: quiet(w),
    })),
    stories: arr<LayerStory>(read(LAYER_FILES.stories)["stories"]).map((s) => ({
      key: s.id,
      label: seoLabel(s.title),
      count: arr(s.tellings).length,
      prerender: liveStoryPage(s),
      quietPage: quiet(s),
    })),
    threads: arr<LayerThread>(read(LAYER_FILES.threads)["threads"]).map((t) => ({
      key: t.id,
      label: seoLabel(t.label),
      count: t.shiurCount,
      prerender: liveThreadPage(t),
      quietPage: false,
    })),
  };
}

export function readSeoCorpus(corpusDir: string): SeoCorpus {
  const index = readJson<CorpusIndex>(corpusDir, "index.json");
  const seriesFile = readJson<SeriesFile>(corpusDir, "series.json");
  const occasionsFile = readJson<OccasionsFile>(corpusDir, "occasions.json");

  const shiurim = index.shiurim.map((r) => ({
    id: r.id,
    lang: r.lang,
    titleOriginal: r.catalog.titleOriginal,
    subTitle: r.catalog.subTitle,
    sectionTitle: r.catalog.sectionTitle,
    years: r.years,
    oneLiner: r.oneLiner,
  }));

  // A series with no parts has no data file (the Live emit writes none), so it has no route.
  const series = seriesFile.series.filter((s) => s.count > 0).map((s) => ({ id: s.id, title: s.title, count: s.count }));

  // Occasions: every table parsha and zman with its catalog count (occasions.json lists them all),
  // then the keys of the "other" bucket (one-off events, values outside the tables), grouped by the
  // shiur's own key as the data emit groups them and labelled by the catalog spelling.
  const occasions: SeoOccasion[] = [
    ...occasionsFile.parshiyos.map((p): SeoOccasion => ({ key: p.key, kind: "parsha", label: { en: p.en, yi: p.yi, he: p.he || p.yi }, count: p.count })),
    ...occasionsFile.zmanim.map((z): SeoOccasion => ({ key: z.key, kind: "zman", label: { en: z.en, yi: z.yi, he: z.he || z.yi }, count: z.count })),
  ];
  const table = new Set(occasions.map((o) => o.key));
  const rows = new Map(index.shiurim.map((r) => [r.id, r]));
  const other = new Map<string, SeoOccasion>();
  for (const ref of arr<{ id?: unknown }>(occasionsFile.other)) {
    const r = typeof ref.id === "string" ? rows.get(ref.id) : undefined;
    const v = r?.zman && !table.has(r.zman.key) ? r.zman : (r?.parsha ?? null);
    if (!v || table.has(v.key)) continue;
    const prev = other.get(v.key);
    other.set(v.key, { key: v.key, kind: null, label: prev?.label ?? byUiLang(() => v.raw), count: (prev?.count ?? 0) + 1 });
  }
  occasions.push(...other.values());

  return { shiurim, series, occasions, ...readLayerLists(corpusDir) };
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

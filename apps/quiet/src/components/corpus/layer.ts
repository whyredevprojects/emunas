/**
 * Build-time reader of `.corpus/layer/` for the Quiet site (corpus-wave-plan §3.3, C1.8).
 *
 * Reads only the files `corpus:build` writes into `.corpus/layer/` (never the pipeline's data
 * folder, never anything under its raw folder). Every file is optional: a missing layer, or a
 * layer built with `enabled: false`, gives empty indexes and one warning, so a shell-only build
 * still works. The pipeline's shapes keep changing, so records are read defensively: a record
 * without a string `id` is skipped, a missing array is empty, and flags are read as `=== true`.
 *
 * The page lookups (`hasPage`, `links`) come from the layer's own page flags through
 * `@emunas/links` `pageLookupFromLayer`, so every page and every link agrees on which entries
 * have a page on Quiet.
 *
 * Where the layer is: `<corpus>/layer/`, with `<corpus>` found as the AI indexes find it
 * (`EMUNAS_CORPUS_DIR`, else the nearest `.corpus/` with a `build.json`).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LAYER_DIR,
  LAYER_FILES,
  type LayerConcept,
  type LayerInfo,
  type LayerOccasionTopic,
  type LayerPerson,
  type LayerRedirectKind,
  type LayerRedirectsFile,
  type LayerSeries,
  type LayerShiurRefs,
  type LayerStory,
  type LayerSynonyms,
  type LayerThread,
  type LayerTopicDetail,
  type LayerTopicNode,
  type LayerWork,
  type LegacyRedirect,
} from "@emunas/corpus/public";
import { pageLookupFromLayer, type CorpusKind, type LayerLinkData } from "@emunas/links";
import { findCorpusDir } from "../indexes/corpus.ts";

/** Entries per index on the title page (Quiet C5), counted from the layer. */
export interface LayerIndexCounts {
  /** ענינים: every topic in the tree. */
  readonly topics: number;
  /** ערכים: every glossary entry. */
  readonly glossary: number;
  /** שמות: people listed on Quiet (type `other` below the line threshold and excluded people are not). */
  readonly names: number;
  /** מראי מקומות: every work. */
  readonly sources: number;
  /** מעשיות: every story with a visible telling. */
  readonly stories: number;
}

export interface QuietLayer {
  /** `.corpus/layer/`, or null when there is none. */
  readonly dir: string | null;
  /** False when there is no layer (or it was built with the corpus absent): every list is empty. */
  readonly enabled: boolean;
  readonly info: LayerInfo | null;
  /** |V|: the shiurim the layer counts from (0 without a layer). */
  readonly visibleShiurim: number;
  readonly topics: readonly LayerTopicNode[];
  readonly concepts: readonly LayerConcept[];
  readonly people: readonly LayerPerson[];
  readonly works: readonly LayerWork[];
  readonly stories: readonly LayerStory[];
  readonly threads: readonly LayerThread[];
  readonly synonyms: readonly LayerSynonyms[];
  readonly redirects: LayerRedirectsFile;
  readonly occasionTopics: readonly LayerOccasionTopic[];
  topic(id: string): LayerTopicNode | undefined;
  topicDetail(id: string): LayerTopicDetail | undefined;
  concept(id: string): LayerConcept | undefined;
  person(id: string): LayerPerson | undefined;
  work(id: string): LayerWork | undefined;
  story(id: string): LayerStory | undefined;
  thread(id: string): LayerThread | undefined;
  /** `series/<id>.json` (null: no synthesis for that series). */
  series(seriesId: string): LayerSeries | null;
  /** `shiur/<id>.json` (null: the shiur is not in the visible set). */
  shiurRefs(shiurId: string): LayerShiurRefs | null;
  /** `LinkData` parts for `@emunas/links` (page flags, concept → topic). */
  readonly links: LayerLinkData;
  /** Whether Quiet builds a page for this entry (threads: never in this cut). */
  hasPage(kind: CorpusKind, id: string): boolean;
  readonly counts: LayerIndexCounts;
  /** What the reader skipped or could not find (printed once per build). */
  readonly warnings: readonly string[];
}

const EMPTY_REDIRECTS: LayerRedirectsFile = {
  corpus: { topics: {}, concepts: {}, people: {}, works: {}, stories: {}, threads: {} },
  legacy: [],
};

const REDIRECT_KINDS: readonly LayerRedirectKind[] = ["topics", "concepts", "people", "works", "stories", "threads"];

/** Ids that may name a file: no path separators, no dot segments. */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasId(v: unknown): boolean {
  return isRecord(v) && typeof v["id"] === "string" && v["id"] !== "";
}

/** Parsed JSON, or null when the file is missing. A file that does not parse is a broken build. */
function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (e) {
    throw new Error(`${path} is not valid JSON (re-run npm run corpus:build): ${(e as Error).message}`, { cause: e });
  }
}

/** The array at `file[key]`, records without an id dropped. */
function records<T>(file: unknown, key: string, name: string, warnings: string[]): T[] {
  if (file === null) {
    warnings.push(`${name} missing`);
    return [];
  }
  const list = isRecord(file) ? file[key] : undefined;
  if (!Array.isArray(list)) {
    warnings.push(`${name}: no "${key}" list`);
    return [];
  }
  const kept = list.filter(hasId);
  if (kept.length < list.length) warnings.push(`${name}: ${list.length - kept.length} records without an id skipped`);
  return kept as T[];
}

function readRedirects(file: unknown, warnings: string[]): LayerRedirectsFile {
  if (file === null) {
    warnings.push(`${LAYER_FILES.redirects} missing`);
    return EMPTY_REDIRECTS;
  }
  if (!isRecord(file)) {
    warnings.push(`${LAYER_FILES.redirects}: not an object`);
    return EMPTY_REDIRECTS;
  }
  const corpusIn = isRecord(file["corpus"]) ? file["corpus"] : {};
  const corpus = { ...EMPTY_REDIRECTS.corpus };
  for (const kind of REDIRECT_KINDS) {
    const map = corpusIn[kind];
    const out: Record<string, string> = {};
    if (isRecord(map)) for (const [from, to] of Object.entries(map)) if (typeof to === "string" && to !== "") out[from] = to;
    corpus[kind] = out;
  }
  const legacyIn = Array.isArray(file["legacy"]) ? (file["legacy"] as unknown[]) : [];
  const legacy = legacyIn.filter(
    (r): r is LegacyRedirect =>
      isRecord(r) &&
      (r["kind"] === "person" || r["kind"] === "work" || r["kind"] === "concept") &&
      typeof r["oldKey"] === "string" &&
      r["oldKey"] !== "" &&
      !r["oldKey"].includes("/") &&
      (r["target"] === null || (isRecord(r["target"]) && typeof r["target"]["kind"] === "string" && typeof r["target"]["id"] === "string")),
  );
  if (legacy.length < legacyIn.length) warnings.push(`${LAYER_FILES.redirects}: ${legacyIn.length - legacy.length} legacy rows skipped`);
  return { corpus, legacy };
}

function byId<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((r) => [r.id, r]));
}

/** The layer folder of a corpus directory, or null when the corpus has none. */
export function findLayerDir(corpusDir: string | null): string | null {
  if (corpusDir === null) return null;
  const dir = join(corpusDir, LAYER_DIR);
  return existsSync(join(dir, LAYER_FILES.layer)) ? dir : null;
}

/** Loads `.corpus/layer/` (null: no layer, every list empty). */
export function loadQuietLayer(dir: string | null): QuietLayer {
  const warnings: string[] = [];
  const info = dir === null ? null : (readJson(join(dir, LAYER_FILES.layer)) as LayerInfo | null);
  const enabled = dir !== null && isRecord(info) && info.enabled === true;
  if (dir === null) warnings.push("no .corpus/layer/ (run npm run corpus:build)");
  else if (!enabled) warnings.push(".corpus/layer/ was built without the corpus data: the corpus indexes are empty");

  const read = (name: string): unknown => (enabled && dir !== null ? readJson(join(dir, name)) : null);
  const w: string[] = [];
  const topicsFile = read(LAYER_FILES.topics);
  const topics = records<LayerTopicNode>(topicsFile, "tree", LAYER_FILES.topics, w);
  const details = topicsFile === null ? [] : records<LayerTopicDetail>(topicsFile, "detail", LAYER_FILES.topics, w);
  const concepts = records<LayerConcept>(read(LAYER_FILES.concepts), "concepts", LAYER_FILES.concepts, w);
  const people = records<LayerPerson>(read(LAYER_FILES.people), "people", LAYER_FILES.people, w);
  const works = records<LayerWork>(read(LAYER_FILES.works), "works", LAYER_FILES.works, w);
  const stories = records<LayerStory>(read(LAYER_FILES.stories), "stories", LAYER_FILES.stories, w);
  const threads = records<LayerThread>(read(LAYER_FILES.threads), "threads", LAYER_FILES.threads, w);
  const synonymsFile = read(LAYER_FILES.synonyms);
  const synonymsIn = isRecord(synonymsFile) && Array.isArray(synonymsFile["synonyms"]) ? (synonymsFile["synonyms"] as unknown[]) : [];
  const synonyms = synonymsIn.filter(
    (s): s is LayerSynonyms => isRecord(s) && typeof s["kind"] === "string" && typeof s["id"] === "string" && Array.isArray(s["terms"]),
  );
  const redirects = enabled ? readRedirects(read(LAYER_FILES.redirects), w) : EMPTY_REDIRECTS;
  const occasionFile = read(LAYER_FILES.occasionTopics);
  const occasionsIn = isRecord(occasionFile) && Array.isArray(occasionFile["occasions"]) ? (occasionFile["occasions"] as unknown[]) : [];
  const occasionTopics = occasionsIn.filter(
    (o): o is LayerOccasionTopic =>
      isRecord(o) && typeof o["key"] === "string" && (o["kind"] === "parsha" || o["kind"] === "zman") && typeof o["topicId"] === "string",
  );
  // Without a layer the one warning above says it all.
  if (enabled) warnings.push(...w);

  const topicMap = byId(topics);
  const detailMap = byId(details);
  const conceptMap = byId(concepts);
  const personMap = byId(people);
  const workMap = byId(works);
  const storyMap = byId(stories);
  const threadMap = byId(threads);
  const links = pageLookupFromLayer(
    enabled ? { topics: { tree: topics }, concepts: { concepts }, people: { people }, works: { works }, stories: { stories }, threads: { threads } } : {},
  );
  const seriesCache = new Map<string, LayerSeries | null>();
  const shiurCache = new Map<string, LayerShiurRefs | null>();
  const visible = isRecord(info) && isRecord(info.counts) && typeof info.counts.visibleShiurim === "number" ? info.counts.visibleShiurim : 0;

  function perId<T>(cache: Map<string, T | null>, sub: string, id: string, ok: (v: unknown) => boolean): T | null {
    if (!enabled || dir === null || !SAFE_ID.test(id)) return null;
    const hit = cache.get(id);
    if (hit !== undefined) return hit;
    const v = readJson(join(dir, sub, `${id}.json`));
    const out = v !== null && ok(v) ? (v as T) : null;
    cache.set(id, out);
    return out;
  }

  return {
    dir,
    enabled,
    info: enabled ? info : null,
    visibleShiurim: enabled ? visible : 0,
    topics,
    concepts,
    people,
    works,
    stories,
    threads,
    synonyms,
    redirects,
    occasionTopics,
    topic: (id) => topicMap.get(id),
    topicDetail: (id) => detailMap.get(id),
    concept: (id) => conceptMap.get(id),
    person: (id) => personMap.get(id),
    work: (id) => workMap.get(id),
    story: (id) => storyMap.get(id),
    thread: (id) => threadMap.get(id),
    series: (id) => perId<LayerSeries>(seriesCache, LAYER_FILES.seriesDir, id, (v) => isRecord(v) && v["seriesId"] === id),
    shiurRefs: (id) => perId<LayerShiurRefs>(shiurCache, LAYER_FILES.shiurDir, id, (v) => isRecord(v) && v["shiurId"] === id),
    links,
    hasPage: (kind, id) => kind !== "thread" && links.hasPage("quiet", kind, id) === true,
    counts: {
      topics: topics.length,
      glossary: concepts.length,
      names: people.filter((p) => p.listed?.quiet === true && (p.excluded ?? null) === null).length,
      sources: works.length,
      stories: stories.length,
    },
    warnings,
  };
}

let cached: { key: string; layer: QuietLayer } | null = null;

/**
 * The layer for the current build (memoised per directory). Without a layer, an empty one and a
 * single warning. Pages call this from `getStaticPaths` and from their frontmatter.
 */
export function quietLayer(): QuietLayer {
  const dir = findLayerDir(findCorpusDir());
  const key = dir ?? "";
  if (cached && cached.key === key) return cached.layer;
  const layer = loadQuietLayer(dir);
  if (layer.warnings.length > 0) console.warn(`[quiet layer] ${layer.warnings.join("; ")}`);
  cached = { key, layer };
  return layer;
}

/**
 * Build-time reader of `.corpus/layer/` for the Quiet site (corpus-wave-plan §3.3, C1.8).
 *
 * Reads only the files `corpus:build` writes into `.corpus/layer/` (never the pipeline's data
 * folder, never anything under its raw folder). The layer is required: a missing `.corpus/`,
 * `.corpus/layer/` or layer file stops the build. The pipeline's shapes keep changing, so records
 * are read defensively: a record without a string `id` is skipped, a missing array is empty, and
 * flags are read as `=== true`.
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
  type LayerSeries,
  type LayerShiurRefs,
  type LayerStory,
  type LayerSynonyms,
  type LayerThread,
  type LayerTopicDetail,
  type LayerTopicNode,
  type LayerWork,
} from "@emunas/corpus/public";
import { pageLookupFromLayer, type CorpusKind, type LayerLinkData } from "@emunas/links";
import { findCorpusDir } from "../indexes/corpus.ts";

export interface QuietLayer {
  /** `.corpus/layer/`. */
  readonly dir: string;
  readonly info: LayerInfo;
  /** |V|: the shiurim the layer counts from. */
  readonly visibleShiurim: number;
  readonly topics: readonly LayerTopicNode[];
  readonly concepts: readonly LayerConcept[];
  readonly people: readonly LayerPerson[];
  readonly works: readonly LayerWork[];
  readonly stories: readonly LayerStory[];
  readonly threads: readonly LayerThread[];
  readonly synonyms: readonly LayerSynonyms[];
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
  /** What the reader skipped or could not find (printed once per build). */
  readonly warnings: readonly string[];
}

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
  return parse(path);
}

/** Parsed JSON of a layer file the build cannot do without. */
function readRequired(path: string): unknown {
  if (!existsSync(path)) throw new Error(`${path} is missing: the corpus layer is required (run npm run corpus:build)`);
  return parse(path);
}

function parse(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (e) {
    throw new Error(`${path} is not valid JSON (re-run npm run corpus:build): ${(e as Error).message}`, { cause: e });
  }
}

/** The array at `file[key]`, records without an id dropped. */
function records<T>(file: unknown, key: string, name: string, warnings: string[]): T[] {
  const list = isRecord(file) ? file[key] : undefined;
  if (!Array.isArray(list)) {
    warnings.push(`${name}: no "${key}" list`);
    return [];
  }
  const kept = list.filter(hasId);
  if (kept.length < list.length) warnings.push(`${name}: ${list.length - kept.length} records without an id skipped`);
  return kept as T[];
}

function byId<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((r) => [r.id, r]));
}

/** The layer folder of a corpus directory; throws when the corpus has none. */
export function findLayerDir(corpusDir: string): string {
  const dir = join(corpusDir, LAYER_DIR);
  if (!existsSync(join(dir, LAYER_FILES.layer))) {
    throw new Error(`no ${LAYER_DIR}/${LAYER_FILES.layer} in ${corpusDir}: the corpus layer is required (run npm run corpus:build)`);
  }
  return dir;
}

/** Loads `.corpus/layer/`. */
export function loadQuietLayer(dir: string): QuietLayer {
  const warnings: string[] = [];
  const info = readRequired(join(dir, LAYER_FILES.layer));
  if (!isRecord(info)) throw new Error(`${join(dir, LAYER_FILES.layer)} is not a layer.json object (re-run npm run corpus:build)`);

  const read = (name: string): unknown => readRequired(join(dir, name));
  const topicsFile = read(LAYER_FILES.topics);
  const topics = records<LayerTopicNode>(topicsFile, "tree", LAYER_FILES.topics, warnings);
  const details = records<LayerTopicDetail>(topicsFile, "detail", LAYER_FILES.topics, warnings);
  const concepts = records<LayerConcept>(read(LAYER_FILES.concepts), "concepts", LAYER_FILES.concepts, warnings);
  const people = records<LayerPerson>(read(LAYER_FILES.people), "people", LAYER_FILES.people, warnings);
  const works = records<LayerWork>(read(LAYER_FILES.works), "works", LAYER_FILES.works, warnings);
  const stories = records<LayerStory>(read(LAYER_FILES.stories), "stories", LAYER_FILES.stories, warnings);
  const threads = records<LayerThread>(read(LAYER_FILES.threads), "threads", LAYER_FILES.threads, warnings);
  const synonymsFile = read(LAYER_FILES.synonyms);
  const synonymsIn = isRecord(synonymsFile) && Array.isArray(synonymsFile["synonyms"]) ? (synonymsFile["synonyms"] as unknown[]) : [];
  const synonyms = synonymsIn.filter(
    (s): s is LayerSynonyms => isRecord(s) && typeof s["kind"] === "string" && typeof s["id"] === "string" && Array.isArray(s["terms"]),
  );
  const occasionFile = read(LAYER_FILES.occasionTopics);
  const occasionsIn = isRecord(occasionFile) && Array.isArray(occasionFile["occasions"]) ? (occasionFile["occasions"] as unknown[]) : [];
  const occasionTopics = occasionsIn.filter(
    (o): o is LayerOccasionTopic =>
      isRecord(o) && typeof o["key"] === "string" && (o["kind"] === "parsha" || o["kind"] === "zman") && typeof o["topicId"] === "string",
  );

  const topicMap = byId(topics);
  const detailMap = byId(details);
  const conceptMap = byId(concepts);
  const personMap = byId(people);
  const workMap = byId(works);
  const storyMap = byId(stories);
  const threadMap = byId(threads);
  const links = pageLookupFromLayer({
    topics: { tree: topics },
    concepts: { concepts },
    people: { people },
    works: { works },
    stories: { stories },
    threads: { threads },
  });
  const seriesCache = new Map<string, LayerSeries | null>();
  const shiurCache = new Map<string, LayerShiurRefs | null>();
  const visible = isRecord(info["counts"]) && typeof info["counts"]["visibleShiurim"] === "number" ? info["counts"]["visibleShiurim"] : 0;

  function perId<T>(cache: Map<string, T | null>, sub: string, id: string, ok: (v: unknown) => boolean): T | null {
    if (!SAFE_ID.test(id)) return null;
    const hit = cache.get(id);
    if (hit !== undefined) return hit;
    const v = readJson(join(dir, sub, `${id}.json`));
    const out = v !== null && ok(v) ? (v as T) : null;
    cache.set(id, out);
    return out;
  }

  return {
    dir,
    info: info as unknown as LayerInfo,
    visibleShiurim: visible,
    topics,
    concepts,
    people,
    works,
    stories,
    threads,
    synonyms,
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
    warnings,
  };
}

let cached: { key: string; layer: QuietLayer } | null = null;

/**
 * The layer for the current build (memoised per directory). Throws without a `.corpus/` or its
 * layer. Pages call this from `getStaticPaths` and from their frontmatter.
 */
export function quietLayer(): QuietLayer {
  const corpusDir = findCorpusDir();
  if (corpusDir === null) throw new Error("no .corpus/ found: the corpus layer is required (run npm run corpus:build)");
  const dir = findLayerDir(corpusDir);
  const key = dir;
  if (cached && cached.key === key) return cached.layer;
  const layer = loadQuietLayer(dir);
  if (layer.warnings.length > 0) console.warn(`[quiet layer] ${layer.warnings.join("; ")}`);
  cached = { key, layer };
  return layer;
}

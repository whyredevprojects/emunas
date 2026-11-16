/**
 * Reads the corpus layer (`.corpus/layer/`, corpus-wave-plan §3.3, C1.2) for the Live emit. Node only.
 *
 * Only `.corpus/layer/` is read: never the pipeline's `data/` folder, never its raw folder (alias
 * maps, ASR variants), never the per-section search dump. The layer is already an allow-listed
 * projection with visible recounts. The layer is required: a missing `.corpus/layer/` file stops the
 * emit. Records are still read defensively, because the data keeps growing and its shape may change:
 * a missing array reads as empty, and an unknown field is never copied (the emitter maps fields one
 * by one).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

export interface LayerInput {
  info: LayerInfo;
  topics: LayerTopicNode[];
  topicDetail: Map<string, LayerTopicDetail>;
  concepts: LayerConcept[];
  people: LayerPerson[];
  works: LayerWork[];
  stories: LayerStory[];
  threads: LayerThread[];
  occasionTopics: LayerOccasionTopic[];
  /** Series syntheses by series id (only series with a visible part). */
  series: Map<string, LayerSeries>;
  /** Per-shiur refs of the visible shiurim. */
  refs: Map<string, LayerShiurRefs>;
  /**
   * synonyms.json: per entity, search-folded terms from its own display fields only (plan §1 rule 1).
   * Used for the command bar's query expansion, never displayed.
   */
  synonyms: LayerSynonyms[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const withId = <T>(xs: unknown): T[] => arr<unknown>(xs).filter((x) => isObj(x) && typeof x["id"] === "string") as T[];

/** The layer of a `.corpus/` directory. Throws when `.corpus/layer/` or one of its files is missing. */
export function readLayerInput(corpusDir: string, shiurIds: Iterable<string>): LayerInput {
  const dir = join(corpusDir, LAYER_DIR);
  const need = <T>(name: string): Partial<T> => {
    const p = join(dir, name);
    if (!existsSync(p)) throw new Error(`${LAYER_DIR}/${name} is missing in ${corpusDir}: the corpus layer is required (run npm run corpus:build)`);
    return readJson<Partial<T>>(p);
  };
  const info = need<LayerInfo>(LAYER_FILES.layer) as LayerInfo;
  const topicsFile = need<{ tree: unknown; detail: unknown }>(LAYER_FILES.topics);
  const storiesFile = need<{ stories: unknown }>(LAYER_FILES.stories);
  const threadsFile = need<{ threads: unknown }>(LAYER_FILES.threads);
  const series = new Map<string, LayerSeries>();
  const seriesDir = join(dir, LAYER_FILES.seriesDir);
  if (existsSync(seriesDir)) {
    for (const name of readdirSync(seriesDir).sort()) {
      if (!name.endsWith(".json")) continue;
      const s = readJson<LayerSeries>(join(seriesDir, name));
      if (isObj(s) && typeof s.seriesId === "string") series.set(s.seriesId, s);
    }
  }
  const refs = new Map<string, LayerShiurRefs>();
  const refsDir = join(dir, LAYER_FILES.shiurDir);
  for (const id of shiurIds) {
    const p = join(refsDir, `${id}.json`);
    if (existsSync(p)) refs.set(id, readJson<LayerShiurRefs>(p));
  }
  return {
    info,
    topics: withId<LayerTopicNode>(topicsFile.tree),
    topicDetail: new Map(withId<LayerTopicDetail>(topicsFile.detail).map((d) => [d.id, d])),
    concepts: withId<LayerConcept>(need<{ concepts: unknown }>(LAYER_FILES.concepts).concepts),
    people: withId<LayerPerson>(need<{ people: unknown }>(LAYER_FILES.people).people),
    works: withId<LayerWork>(need<{ works: unknown }>(LAYER_FILES.works).works),
    stories: withId<LayerStory>(storiesFile.stories),
    threads: withId<LayerThread>(threadsFile.threads),
    occasionTopics: arr<LayerOccasionTopic>(need<{ occasions: unknown }>(LAYER_FILES.occasionTopics).occasions).filter(
      (o) => isObj(o) && typeof o.key === "string" && typeof o.topicId === "string",
    ),
    series,
    refs,
    synonyms: arr<unknown>(need<{ synonyms: unknown }>(LAYER_FILES.synonyms).synonyms).flatMap((x): LayerSynonyms[] => {
      if (!isObj(x) || typeof x["id"] !== "string" || typeof x["kind"] !== "string") return [];
      const terms = arr<unknown>(x["terms"]).filter((t): t is string => typeof t === "string" && t.trim() !== "");
      return [{ kind: x["kind"] as LayerSynonyms["kind"], id: x["id"], terms }];
    }),
  };
}

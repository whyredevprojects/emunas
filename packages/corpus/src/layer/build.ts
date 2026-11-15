/**
 * The corpus-layer projection (corpus-wave-plan §3.3, C1.2): `.corpus/layer/` from the allow-listed
 * corpus input (C1.1), the projected shiurim and the corpus policy. Pure apart from `loadLayerInput`.
 *
 * Two steps, because the aggregate's works.json needs the resolved source works and the legacy
 * redirects need the aggregate:
 *
 *   prepareLayer  → context, tag index, works, source-work index   (feeds `aggregate`)
 *   finishLayer   → every layer file, given the aggregates
 *
 * Every file is assembled field by field from the loose-schema records; nothing is spread from an
 * input record. Counts and flags come from the visible set only.
 */
import type { Aggregates } from "../aggregate/types.ts";
import { createDataReader } from "../build/read.ts";
import { LAYER_FILES, LAYER_SCHEMA_VERSION } from "../public/corpus-layer.ts";
import type {
  LayerCounts,
  LayerInfo,
  LayerRedirectsFile,
  LayerSiteCounts,
  LayerWorksFile,
} from "../public/corpus-layer.ts";
import type { CorpusIndex, PublicShiur } from "../public/types.ts";
import { LayerContext } from "./context.ts";
import {
  buildConcepts,
  buildPeople,
  buildWorks,
  peopleBase,
  sameAsLinks,
  storyPersonOf,
  type PersonBase,
  type SameAsLinks,
} from "./entities.ts";
import { readCorpusInput, type CorpusInputResult } from "./input/load.ts";
import { buildVisibleSet, loadCategoryVisibility, type CategoryVisibility } from "./input/visible.ts";
import { buildLegacyRedirects } from "./legacy.ts";
import { buildOccasionTopics, occasionsByTopic } from "./occasion-topics.ts";
import { corpusPolicyHash, loadCorpusPolicy, type CorpusPolicy } from "./policy.ts";
import { LAYER_REDIRECT_KINDS } from "./redirects.ts";
import { buildSeries } from "./series.ts";
import { buildShiurRefs, sourceWorkIndex } from "./shiur-refs.ts";
import { buildStories, buildThreads } from "./stories.ts";
import { buildSynonyms } from "./synonyms.ts";
import { buildTagIndex, type TagIndex } from "./tag-index.ts";
import { buildTopics } from "./topics.ts";

export interface LayerSources {
  corpus: CorpusInputResult;
  policy: CorpusPolicy;
  categoryVisibility: CategoryVisibility;
}

/** Read the corpus input (allow-listed reader), the corpus policy and the category visibility. */
export function loadLayerInput(opts: { dataDir: string; policyDir: string }): LayerSources {
  const policy = loadCorpusPolicy(opts.policyDir);
  const corpus = readCorpusInput(createDataReader(opts.dataDir), { policy });
  return { corpus, policy, categoryVisibility: loadCategoryVisibility(opts.policyDir) };
}

export interface PreparedLayer {
  sources: LayerSources;
  /** null when the corpus is absent (layer off). */
  state: {
    ctx: LayerContext;
    tags: TagIndex;
    links: SameAsLinks;
    people: Map<string, PersonBase>;
    works: LayerWorksFile;
  } | null;
  /** Source moment id → corpus work id (empty when the layer is off); for the aggregate's works.json. */
  sourceWorkIds: Map<string, string>;
}

export function prepareLayer(sources: LayerSources, projected: { shiurim: readonly PublicShiur[]; index: CorpusIndex }): PreparedLayer {
  const input = sources.corpus.input;
  if (input === null) return { sources, state: null, sourceWorkIds: new Map() };
  const visible = buildVisibleSet({
    shiurim: projected.shiurim,
    corpusShiurIds: input.index.shiurIds,
    categoryVisibility: sources.categoryVisibility,
    policy: sources.policy,
  });
  const ctx = new LayerContext({ input, policy: sources.policy, visible, shiurim: projected.shiurim, index: projected.index });
  const tags = buildTagIndex(ctx);
  const links = sameAsLinks(ctx);
  const people = peopleBase(ctx);
  const works = buildWorks(ctx, people, links);
  const sourceWorkIds = sourceWorkIndex(ctx, new Set(works.works.map((w) => w.id)));
  return { sources, state: { ctx, tags, links, people, works }, sourceWorkIds };
}

export interface LayerOutput {
  /** Path inside `.corpus/layer/` → content. */
  files: Record<string, unknown>;
  info: LayerInfo;
}

const zeroSite = (): LayerSiteCounts => ({ topics: 0, concepts: 0, people: 0, works: 0, stories: 0, threads: 0 });

function baseInfo(p: PreparedLayer): LayerInfo {
  const r = p.sources.corpus.report;
  const i = p.sources.corpus.input;
  const counts: LayerCounts = {
    visibleShiurim: 0,
    topics: 0,
    concepts: 0,
    people: 0,
    works: 0,
    stories: 0,
    threads: 0,
    series: 0,
    shiurRefs: 0,
    synonyms: 0,
    redirects: { corpus: 0, legacy: 0, legacyUnmatched: 0 },
    pages: { quiet: zeroSite(), live: zeroSite() },
  };
  const warnings = [...r.warnings];
  for (const d of r.disabled) warnings.push(`${d.file} not used (${d.reason})`);
  if (r.untagged.length > 0) warnings.push(`${r.untagged.length} corpus shiurim without usable shiur-tags`);
  if (r.coercedPersonTypes.length > 0) warnings.push(`${r.coercedPersonTypes.length} people with an unknown type read as other`);
  if (r.notReadDenied > 0) warnings.push(`${r.notReadDenied} index.json files entries on the deny list (not read)`);
  return {
    layerSchemaVersion: LAYER_SCHEMA_VERSION,
    enabled: i !== null,
    corpusVersion: r.version,
    knownCorpusVersion: r.knownVersion,
    generatedAt: r.generatedAt,
    inputs: {
      topics: r.read.includes("topics.json"),
      concepts: r.read.includes("concepts.json"),
      people: r.read.includes("people.json"),
      works: r.read.includes("works.json"),
      stories: i?.stories !== null && i !== null,
      teachingClusters: i?.teachingClusters !== null && i !== null,
      redirects: i?.redirects !== null && i !== null,
      series: r.seriesRead,
      shiurTags: r.shiurTagsRead,
    },
    policyHash: corpusPolicyHash(p.sources.policy),
    counts,
    warnings,
    notRead: [...r.notRead],
    droppedKeys: Object.fromEntries(
      Object.entries(r.droppedKeys)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([file, keys]) => [file, Object.values(keys).reduce((a, n) => a + n, 0)]),
    ),
    droppedRecords: r.droppedRecords.length,
    lint: { clusterCounts: [] },
  };
}

export function finishLayer(p: PreparedLayer, aggregates: Aggregates): LayerOutput {
  const info = baseInfo(p);
  if (p.state === null) return { files: { [LAYER_FILES.layer]: info }, info };
  const { ctx, tags, links, people: base, works } = p.state;

  const concepts = buildConcepts(ctx, links);
  const stories = buildStories(ctx, storyPersonOf(ctx, base));
  const threads = buildThreads(ctx);
  const people = buildPeople(ctx, base, works, stories.file, links);
  const occasionTopics = buildOccasionTopics(ctx, tags);
  const topics = buildTopics(ctx, {
    tags,
    threads: threads.file,
    stories: stories.file,
    conceptIds: new Set(concepts.concepts.map((c) => c.id)),
    personIds: new Set(people.people.filter((x) => x.excluded === null).map((x) => x.id)),
    workIds: new Set(works.works.map((w) => w.id)),
    occasionsOf: occasionsByTopic(occasionTopics),
  });
  const series = buildSeries(ctx);
  const refs = buildShiurRefs(ctx, { tags, concepts, people, works, stories: stories.file, threads: threads.file }, p.sourceWorkIds);
  const synonyms = buildSynonyms(ctx, { topics: topics.file, concepts, people, works });
  const legacy = buildLegacyRedirects(ctx, { aggregates, topics: topics.file, concepts, people, works });
  const corpus = Object.fromEntries(LAYER_REDIRECT_KINDS.map((k) => [k, { ...ctx.redirects.map[k] }])) as LayerRedirectsFile["corpus"];
  const redirects: LayerRedirectsFile = { corpus, legacy };

  // ---- layer.json
  const w = info.warnings;
  if (tags.unknownTopicRefs > 0) w.push(`${tags.unknownTopicRefs} topic tags point at unknown topic ids (dropped)`);
  if (topics.orphaned > 0) w.push(`${topics.orphaned} topics whose parent does not exist (shown at the top)`);
  if (stories.withoutTelling > 0) w.push(`${stories.withoutTelling} stories with no visible telling (left out)`);
  if (threads.belowTwo > 0) w.push(`${threads.belowTwo} teaching clusters with fewer than two visible shiurim (dropped)`);
  for (const d of ctx.redirects.dropped) w.push(`redirect ${d.kind}:${d.from} dropped (${d.reason})`);
  w.push(...ctx.warnings);
  info.lint.clusterCounts = threads.lint;
  const c = info.counts;
  c.visibleShiurim = ctx.visibleIds.length;
  c.topics = topics.file.tree.length;
  c.concepts = concepts.concepts.length;
  c.people = people.people.length;
  c.works = works.works.length;
  c.stories = stories.file.stories.length;
  c.threads = threads.file.threads.length;
  c.series = series.size;
  c.shiurRefs = refs.size;
  c.synonyms = synonyms.synonyms.length;
  c.redirects = {
    corpus: LAYER_REDIRECT_KINDS.reduce((a, k) => a + Object.keys(corpus[k]).length, 0),
    legacy: legacy.length,
    legacyUnmatched: legacy.filter((l) => l.target === null).length,
  };
  for (const site of ["quiet", "live"] as const) {
    const s = c.pages[site];
    s.topics = topics.file.tree.filter((t) => t.pages[site]).length;
    s.concepts = concepts.concepts.filter((x) => x.pages[site]).length;
    s.people = people.people.filter((x) => x.pages[site]).length;
    s.works = works.works.filter((x) => x.pages[site]).length;
    s.stories = stories.file.stories.filter((x) => x.pages[site]).length;
    s.threads = site === "live" ? threads.file.threads.filter((x) => x.page).length : 0;
  }

  const files: Record<string, unknown> = {
    [LAYER_FILES.layer]: info,
    [LAYER_FILES.topics]: topics.file,
    [LAYER_FILES.concepts]: concepts,
    [LAYER_FILES.people]: people,
    [LAYER_FILES.works]: works,
    [LAYER_FILES.stories]: stories.file,
    [LAYER_FILES.threads]: threads.file,
    [LAYER_FILES.synonyms]: synonyms,
    [LAYER_FILES.redirects]: redirects,
    [LAYER_FILES.occasionTopics]: occasionTopics,
  };
  for (const [id, s] of series) files[`${LAYER_FILES.seriesDir}/${id}.json`] = s;
  for (const [id, r] of refs) files[`${LAYER_FILES.shiurDir}/${id}.json`] = r;
  return { files, info };
}

/** prepare + finish in one go, for callers that already hold the aggregates. */
export function buildLayer(
  sources: LayerSources,
  projected: { shiurim: readonly PublicShiur[]; index: CorpusIndex },
  aggregates: Aggregates,
): LayerOutput {
  return finishLayer(prepareLayer(sources, projected), aggregates);
}

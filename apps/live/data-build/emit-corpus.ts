/**
 * The corpus-layer part of the Live emit (C1.7, corpus-wave-plan §3, §4; concept-live C, E, F, G).
 * Pure: `.corpus/layer/` (read by `layer-input.ts`) plus the projected shiurim → the corpus-layer
 * `/data/*` files and the lookups the rest of the emit uses (entity ids and labels, topic mixes).
 *
 * Rules carried here:
 * - Every field is copied one by one from the layer, which is itself an allow-listed projection with
 *   visible recounts (plan §3.2). No alias, synonym or ASR variant is copied into any file; labels come
 *   from each entity's own display fields.
 * - Entity id spaces are corpus ids. Live lists a person only with a Live page (≥3 shiurim, never type
 *   `other`, never excluded), a concept with a Live page (not merged into a topic), a work with a Live
 *   page (never generic), and every topic with visible shiurim (E.1).
 * - A page file exists exactly when the layer's Live page flag is set (topics, threads, stories).
 * - Languages: members and tellings carry their own audio language; nothing pairs shiurim (F.1).
 * - Featured slots (the occasion mix) leave out shiurim mostly by another speaker and the owner's
 *   excluded topics (E.5, D7).
 */
import { brotliCompressSync, constants } from "node:zlib";
import type {
  Ed,
  L,
  LayerConcept,
  LayerPerson,
  LayerShiurRefs,
  LayerStory,
  LayerTopicNode,
  LayerWork,
  PublicShiur,
} from "@emunas/corpus/public";
import { dataPaths } from "../app/data/paths.ts";
import {
  liveConceptPage,
  livePersonPage,
  liveStoryPage,
  liveThreadPage,
  liveTopicPage,
  liveWorkPage,
} from "../app/data/live-pages.ts";
import {
  LIVE_DATA_SCHEMA_VERSION,
  TOPIC_FIRST_MOMENTS,
  TOPIC_MOMENTS_PAGE_SIZE,
  type CorpusMember,
  type DataFiles,
  type EntityChip,
  type ExploreEntitiesFile,
  type FacetLabel,
  type GlossaryCard,
  type MixItem,
  type SeriesSynthesis,
  type ShiurCard,
  type ShiurCorpus,
  type StoriesIndexFile,
  type StoryFile,
  type StoryPerson,
  type ThreadFile,
  type TopicFile,
  type TopicMoment,
  type TopicsFile,
} from "../app/data/types.ts";
import type { LayerInput } from "./layer-input.ts";

const V = LIVE_DATA_SCHEMA_VERSION;

/** Owner policy for featured slots (site-policy/corpus-policy.json `featured`, D7). */
export interface FeaturedPolicy {
  maxOtherSpeakerShare: number;
  excludeTopicIds: readonly string[];
}

export const DEFAULT_FEATURED: FeaturedPolicy = { maxOtherSpeakerShare: 0.5, excludeTopicIds: [] };

export const CORPUS_LIMITS = {
  /** Sections in today.json's occasion mix. */
  mixFirst: 12,
  /** Rows in a topic file's thread and story lists (the totals say how many there are). */
  topicThreads: 20,
  topicStories: 20,
  topicCoTopics: 8,
  /** "Hear it explained" buttons on a glossary card. */
  glossaryExamples: 3,
  /** Brotli target per glossary shard when splitting (the budget is 8 KiB). */
  glossaryShardBr: 6 * 1024,
} as const;

/** Chapter kinds that go into a mix (concept-live C.3: `main` and `story`). */
const MIX_KINDS = new Set(["main", "story"]);

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const nz = (s: unknown): string => (typeof s === "string" ? s : "");
const arr = <T>(x: readonly T[] | null | undefined): readonly T[] => (Array.isArray(x) ? x : []);
const lcopy = (l: L | null | undefined): L => ({ en: nz(l?.en), yi: nz(l?.yi) });

/** A label whose `he` is set only when it differs from the Yiddish form. */
export function facetLabel(en: string, yi: string, he: string | null | undefined): FacetLabel {
  return he && he !== yi ? { en, yi, he } : { en, yi };
}

function sortedRecord<T>(entries: Iterable<[string, T]>): Record<string, T> {
  return Object.fromEntries([...entries].sort(([a], [b]) => cmp(a, b)));
}

function brSize(x: unknown): number {
  return brotliCompressSync(JSON.stringify(x), { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }).length;
}

// ---------------------------------------------------------------------------------------------
// The view: which entities Live lists, their labels, per-shiur ids

export interface ShiurEntityIds {
  topics: string[];
  people: string[];
  concepts: string[];
  works: string[];
}

export interface CorpusView {
  layer: LayerInput | null;
  topics: Map<string, LayerTopicNode>;
  /** Live-listed (= Live page) entities. */
  people: Map<string, LayerPerson>;
  concepts: Map<string, LayerConcept>;
  works: Map<string, LayerWork>;
  /** Every layer concept with visible shiurim (glossary cards, term chips). */
  allConcepts: Map<string, LayerConcept>;
  allPeople: Map<string, LayerPerson>;
  allWorks: Map<string, LayerWork>;
  topicLabel(id: string): FacetLabel;
  personLabel(id: string): FacetLabel;
  conceptLabel(id: string): FacetLabel;
  workLabel(id: string): FacetLabel;
  /** Story moment id (a telling) → its merged story. */
  storyOfMoment: Map<string, LayerStory>;
  /** Live-listed entity ids of a summarized shiur (empty without layer refs). */
  entitiesOf(shiurId: string): ShiurEntityIds;
}

export function corpusView(layer: LayerInput | null): CorpusView {
  const topics = new Map<string, LayerTopicNode>();
  const people = new Map<string, LayerPerson>();
  const concepts = new Map<string, LayerConcept>();
  const works = new Map<string, LayerWork>();
  const allConcepts = new Map<string, LayerConcept>();
  const allPeople = new Map<string, LayerPerson>();
  const allWorks = new Map<string, LayerWork>();
  const storyOfMoment = new Map<string, LayerStory>();
  if (layer) {
    for (const t of layer.topics) if (liveTopicPage(t)) topics.set(t.id, t);
    for (const p of layer.people) {
      allPeople.set(p.id, p);
      if (livePersonPage(p)) people.set(p.id, p);
    }
    for (const c of layer.concepts) {
      if (c.count > 0) allConcepts.set(c.id, c);
      if (liveConceptPage(c)) concepts.set(c.id, c);
    }
    for (const w of layer.works) {
      allWorks.set(w.id, w);
      if (liveWorkPage(w)) works.set(w.id, w);
    }
    for (const st of layer.stories ?? []) for (const t of arr(st.tellings)) storyOfMoment.set(t.momentId, st);
  }
  const labelOf = <T>(m: Map<string, T>, f: (x: T) => FacetLabel) => (id: string): FacetLabel => {
    const x = m.get(id);
    return x ? f(x) : { en: id, yi: id };
  };
  const topicLabel = labelOf(new Map(layer?.topics.map((t) => [t.id, t]) ?? []), (t) =>
    facetLabel(nz(t.label?.en), nz(t.label?.yi), t.label?.he),
  );
  const personLabel = labelOf(allPeople, (p) => facetLabel(nz(p.nameEn), nz(p.nameYi) || nz(p.nameHe), p.nameHe));
  const conceptLabel = labelOf(allConcepts, (c) => facetLabel(nz(c.label?.en), nz(c.label?.yi), c.canonicalHe));
  // Works have no Yiddish title of their own: the Hebrew title serves the Yiddish interface.
  const workLabel = labelOf(allWorks, (w) => facetLabel(nz(w.titleEn), nz(w.titleHe) || nz(w.titleEn), w.titleHe));
  const sortedIds = (ids: Iterable<string>, ok: { has(id: string): boolean }) =>
    [...new Set([...ids].filter((id) => ok.has(id)))].sort(cmp);
  return {
    layer,
    topics,
    people,
    concepts,
    works,
    allConcepts,
    allPeople,
    allWorks,
    topicLabel,
    personLabel,
    conceptLabel,
    workLabel,
    storyOfMoment,
    entitiesOf(shiurId) {
      const r = layer?.refs.get(shiurId);
      if (!r) return { topics: [], people: [], concepts: [], works: [] };
      return {
        topics: sortedIds([...arr(r.topics).map((t) => t.id), ...arr(r.chapters).flatMap((c) => arr(c.topicIds))], topics),
        people: sortedIds(arr(r.personIds), people),
        concepts: sortedIds(arr(r.conceptIds), concepts),
        works: sortedIds(arr(r.workIds), works),
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Corpus-layer files

export interface CorpusEmitContext {
  input: { shiurim: readonly PublicShiur[]; index: { shiurim: readonly { id: string }[] } };
  byId: ReadonlyMap<string, PublicShiur>;
  put: <K extends keyof DataFiles>(urlPath: string, body: DataFiles[K]) => void;
  featured: FeaturedPolicy;
}

/** A topic's featured mix (today.json compacts it). */
export interface FeaturedMix {
  topicId: string;
  label: FacetLabel;
  sections: number;
  shiurim: number;
  first: MixItem[];
}

export interface CorpusEmitResult {
  glossaryShards: string[];
  /** Topic id → the featured mix (D7 filters applied), for today.json. */
  featuredMix(topicId: string): FeaturedMix | null;
  /** Occasion key → topic id (occasion-topics of the layer). */
  occasionTopic: Map<string, string>;
  /** The self-contained corpus block of a shiur file (G.1), or undefined. */
  shiurCorpus(shiurId: string): ShiurCorpus | undefined;
  /** Shiur ids a shiur's corpus block names (thread pointers), for the titles map. */
  shiurPointers(shiurId: string): string[];
}

interface Section extends TopicMoment {
  topicIds: readonly string[];
}

export function shiurCard(s: PublicShiur, withOneLiner: boolean): ShiurCard {
  const ol = s.status === "full" && withOneLiner ? (s.notes?.summary.oneLiner ?? null) : null;
  return {
    id: s.id,
    lang: s.lang,
    title: s.catalog.titleOriginal,
    oneLiner: ol ? lcopy(ol) : null,
    duration: s.duration,
    years: [...s.years],
    status: s.status,
  };
}

const firstYear = (s: PublicShiur | undefined): number | null => (s && s.years.length > 0 ? Math.min(...s.years) : null);

export function emitCorpusFiles(view: CorpusView, ctx: CorpusEmitContext): CorpusEmitResult {
  const { layer } = view;
  const { byId, put } = ctx;
  const catalogPos = new Map(ctx.input.index.shiurim.map((r, i) => [r.id, i]));
  const chapterOf = (shiurId: string, idx: number | null) => {
    if (idx === null) return null;
    return byId.get(shiurId)?.notes?.chapters.find((c) => c.idx === idx) ?? null;
  };
  const member = (m: { shiurId: string; momentId: string; chapterIdx: number | null; t: number | null; year: number | null; lang: Ed }): CorpusMember => {
    const s = byId.get(m.shiurId);
    const ch = chapterOf(m.shiurId, m.chapterIdx);
    return {
      shiurId: m.shiurId,
      momentId: m.momentId,
      t: m.t,
      year: m.year,
      lang: m.lang,
      title: s?.catalog.titleOriginal ?? m.shiurId,
      chapterTitle: ch ? lcopy(ch.title) : null,
    };
  };
  const visible = (id: string) => byId.get(id)?.status === "full";

  // ------------------------------------------------------------------ topics.json
  const allTopics = layer?.topics ?? [];
  const parentOf = new Map(allTopics.map((t) => [t.id, t.parentId ?? null]));
  const chain = (id: string): string[] => {
    const out: string[] = [];
    for (let cur: string | null = id; cur !== null && !out.includes(cur); cur = parentOf.get(cur) ?? null) out.push(cur);
    return out;
  };
  const tree: TopicsFile = {
    schemaVersion: V,
    topics: allTopics
      .filter((t) => view.topics.has(t.id))
      // Parents first (level order), so a reader can compute levels in one pass.
      .sort((a, b) => a.level - b.level)
      .map((t) => {
        const l = view.topicLabel(t.id);
        return [t.id, t.parentId && view.topics.has(t.parentId) ? t.parentId : null, l.en, l.yi, l.he ?? null, t.count];
      }),
  };
  put<"topics">(dataPaths.topics(), tree);

  // ------------------------------------------------------------------ topic sections (mixes)
  // Per topic (with its descendants' tags): the shiurim with tagged main/story chapters, each with
  // the shiur's salience for the topic (shiur level, else section level only).
  const SECTION_ONLY = 0.05;
  const perTopic = new Map<string, Map<string, { sal: number; secs: Section[] }>>();
  for (const s of ctx.input.shiurim) {
    const r = layer?.refs.get(s.id);
    if (!r || s.status !== "full" || !s.notes) continue;
    const sal = new Map<string, number>();
    for (const t of arr(r.topics)) for (const a of chain(t.id)) sal.set(a, Math.max(sal.get(a) ?? 0, t.salience));
    const year = firstYear(s);
    for (const c of arr(r.chapters)) {
      const ch = s.notes.chapters.find((x) => x.idx === c.idx);
      if (!ch || !MIX_KINDS.has(ch.kind)) continue;
      const ids = arr(c.topicIds).filter((x) => view.topics.has(x));
      const sec: Section = { id: ch.id, shiurId: s.id, t: ch.t, end: ch.end, lang: s.lang, title: lcopy(ch.title), year, topicIds: ids };
      for (const a of new Set(ids.flatMap(chain))) {
        if (!view.topics.has(a)) continue;
        let m = perTopic.get(a);
        if (!m) perTopic.set(a, (m = new Map()));
        let e = m.get(s.id);
        if (!e) m.set(s.id, (e = { sal: sal.get(a) ?? SECTION_ONLY, secs: [] }));
        e.secs.push(sec);
      }
    }
  }
  /** Best first: shiurim by salience, then year (undated last), then catalog order; one section per shiur per round. */
  const ordered = (m: Map<string, { sal: number; secs: Section[] }> | undefined, keep: (s: Section) => boolean = () => true): Section[] => {
    if (!m) return [];
    const rows = [...m]
      .map(([id, e]) => ({ id, sal: e.sal, secs: e.secs.filter(keep) }))
      .filter((r) => r.secs.length > 0)
      .sort((a, b) => {
        const ya = firstYear(byId.get(a.id)) ?? Number.POSITIVE_INFINITY;
        const yb = firstYear(byId.get(b.id)) ?? Number.POSITIVE_INFINITY;
        return b.sal - a.sal || ya - yb || (catalogPos.get(a.id) ?? 0) - (catalogPos.get(b.id) ?? 0) || cmp(a.id, b.id);
      });
    const out: Section[] = [];
    for (let round = 0; ; round++) {
      let any = false;
      for (const r of rows) {
        const x = r.secs[round];
        if (x) {
          out.push(x);
          any = true;
        }
      }
      if (!any) break;
    }
    return out;
  };
  const toMoment = (x: Section): TopicMoment => ({ id: x.id, shiurId: x.shiurId, t: x.t, end: x.end, lang: x.lang, title: x.title, year: x.year });
  const toMix = (x: Section): MixItem => ({ id: x.id, shiurId: x.shiurId, t: x.t, end: x.end, lang: x.lang, title: x.title });

  // ------------------------------------------------------------------ topic/<id>.json
  const threadById = new Map((layer?.threads ?? []).map((t) => [t.id, t]));
  const storyById = new Map((layer?.stories ?? []).map((s) => [s.id, s]));
  const chipFor = (kind: "person" | "work", id: string | undefined | null): EntityChip | null => {
    if (!id) return null;
    if (kind === "person") {
      const p = view.people.get(id);
      return p ? { id, label: view.personLabel(id), page: true } : null;
    }
    const w = view.works.get(id);
    return w ? { id, label: view.workLabel(id), page: true } : null;
  };
  for (const t of allTopics) {
    if (!view.topics.has(t.id)) continue;
    const d = layer?.topicDetail.get(t.id);
    const secs = ordered(perTopic.get(t.id));
    const rest = secs.slice(TOPIC_FIRST_MOMENTS);
    const pages = Math.ceil(rest.length / TOPIC_MOMENTS_PAGE_SIZE);
    const sameConcept = t.sameAs?.conceptId ? view.allConcepts.get(t.sameAs.conceptId) : undefined;
    const threads = arr(d?.threadIds).flatMap((id) => {
      const th = threadById.get(id);
      return th ? [{ id, label: lcopy(th.label), shiurCount: th.shiurCount, page: liveThreadPage(th) }] : [];
    });
    const stories = arr(d?.storyIds).flatMap((id) => {
      const st = storyById.get(id);
      return st ? [{ id, title: lcopy(st.title), tellings: arr(st.tellings).length, page: liveStoryPage(st) }] : [];
    });
    const file: TopicFile = {
      schemaVersion: V,
      id: t.id,
      level: t.level,
      label: view.topicLabel(t.id),
      breadcrumb: chain(t.id)
        .slice(1)
        .reverse()
        .filter((id) => view.topics.has(id))
        .map((id) => ({ id, label: view.topicLabel(id) })),
      description: d?.description ? lcopy(d.description) : null,
      reviewed: t.reviewed === true,
      term: sameConcept ? { conceptId: sameConcept.id, he: nz(sameConcept.canonicalHe), definition: lcopy(sameConcept.definition) } : null,
      person: chipFor("person", t.sameAs?.personId),
      work: chipFor("work", t.sameAs?.workId),
      count: t.count,
      hubs: arr(d?.hubs).flatMap((id) => {
        const s = byId.get(id);
        return s && visible(id) ? [shiurCard(s, true)] : [];
      }),
      children: arr(d?.children)
        .filter((id) => view.topics.has(id))
        .map((id) => ({ id, label: view.topicLabel(id), count: view.topics.get(id)!.count })),
      coTopics: arr(d?.coTopics)
        .filter((c) => view.topics.has(c.id))
        .slice(0, CORPUS_LIMITS.topicCoTopics)
        .map((c) => ({ id: c.id, label: view.topicLabel(c.id), sections: c.sections })),
      threads: threads.slice(0, CORPUS_LIMITS.topicThreads),
      threadTotal: threads.length,
      stories: stories.slice(0, CORPUS_LIMITS.topicStories),
      storyTotal: stories.length,
      occasions: [...arr(d?.occasions)],
      moments: secs.slice(0, TOPIC_FIRST_MOMENTS).map(toMoment),
      momentTotal: secs.length,
      momentShiurim: perTopic.get(t.id)?.size ?? 0,
      momentPages: pages,
    };
    put<"topic">(dataPaths.topic(t.id), file);
    for (let p = 0; p < pages; p++) {
      put<"topicMoments">(dataPaths.topicMoments(t.id, p + 1), {
        schemaVersion: V,
        topicId: t.id,
        page: p + 1,
        moments: rest
          .slice(p * TOPIC_MOMENTS_PAGE_SIZE, (p + 1) * TOPIC_MOMENTS_PAGE_SIZE)
          .map((x) => ({ id: x.id, shiurId: x.shiurId, t: x.t, end: x.end, lang: x.lang })),
      });
    }
  }

  // ------------------------------------------------------------------ featured mixes (today.json)
  const excluded = new Set(ctx.featured.excludeTopicIds);
  const otherSpeaker = (shiurId: string): boolean => {
    const share = layer?.refs.get(shiurId)?.otherSpeakerShare;
    return typeof share === "number" && share >= ctx.featured.maxOtherSpeakerShare;
  };
  const featuredMix = (topicId: string): FeaturedMix | null => {
    if (!view.topics.has(topicId) || chain(topicId).some((id) => excluded.has(id))) return null;
    const keep = (x: Section) => !otherSpeaker(x.shiurId) && !x.topicIds.some((id) => chain(id).some((a) => excluded.has(a)));
    const secs = ordered(perTopic.get(topicId), keep);
    if (secs.length === 0) return null;
    return {
      topicId,
      label: view.topicLabel(topicId),
      sections: secs.length,
      shiurim: new Set(secs.map((x) => x.shiurId)).size,
      first: secs.slice(0, CORPUS_LIMITS.mixFirst).map(toMix),
    };
  };
  const occasionTopic = new Map<string, string>();
  for (const o of layer?.occasionTopics ?? []) if (view.topics.has(o.topicId) && !occasionTopic.has(o.key)) occasionTopic.set(o.key, o.topicId);

  // ------------------------------------------------------------------ thread/<id>.json
  const insightText = (shiurId: string, momentId: string): L | null => {
    const i = byId.get(shiurId)?.notes?.insights.find((x) => x.id === momentId);
    return i ? lcopy(i.text) : null;
  };
  for (const th of layer?.threads ?? []) {
    if (!liveThreadPage(th)) continue;
    const file: ThreadFile = {
      schemaVersion: V,
      id: th.id,
      label: lcopy(th.label),
      summary: lcopy(th.summary),
      reviewed: th.reviewed === true,
      topics: arr(th.topicIds)
        .filter((id) => view.topics.has(id))
        .map((id) => ({ id, label: view.topicLabel(id) })),
      members: arr(th.members)
        .filter((m) => visible(m.shiurId))
        .map((m) => ({ ...member(m), text: insightText(m.shiurId, m.momentId) })),
      shiurCount: th.shiurCount,
      datedCount: th.datedCount,
      years: th.years ? [th.years[0], th.years[1]] : null,
      timeline: th.timeline === true,
    };
    put<"thread">(dataPaths.thread(th.id), file);
  }

  // ------------------------------------------------------------------ story/<id>.json, stories-index.json
  const storyPerson = (p: LayerStory["people"][number]): StoryPerson | null => {
    if ("id" in p && typeof p.id === "string") {
      const listed = view.people.get(p.id);
      if (listed) return { id: p.id, label: view.personLabel(p.id), page: true };
      const any = view.allPeople.get(p.id);
      // Not listed on Live (type other, excluded, below the line): the name as plain text.
      return any ? { name: nz(any.nameEn) || p.id } : null;
    }
    return "name" in p && typeof p.name === "string" && p.name !== "" ? { name: p.name } : null;
  };
  // The section join (layer topics' storyIds), restricted to topics Live lists.
  const topicsOfStory = new Map<string, string[]>();
  for (const t of allTopics) {
    if (!view.topics.has(t.id)) continue;
    for (const id of arr(layer?.topicDetail.get(t.id)?.storyIds)) {
      const list = topicsOfStory.get(id) ?? [];
      if (!list.includes(t.id)) list.push(t.id);
      topicsOfStory.set(id, list);
    }
  }
  // Only the most specific topics are written: the client adds the ancestors from the topic tree.
  const mostSpecific = (ids: readonly string[]): string[] => {
    const covered = new Set(ids.flatMap((id) => chain(id).slice(1)));
    return ids.filter((id) => !covered.has(id)).sort(cmp);
  };
  // Catalogued shiurim (the guide) before uncatalogued ones (titles from file names), concept-live C.4.
  const catalogued = (shiurId: string): boolean => {
    const d = byId.get(shiurId)?.catalog.derived;
    return d !== "filename" && d !== "dir-prefix";
  };
  const storyEnd = (shiurId: string, momentId: string): number | null =>
    byId.get(shiurId)?.notes?.stories.find((x) => x.id === momentId)?.end ?? null;
  const storiesIndex: StoriesIndexFile = { schemaVersion: V, stories: [], people: {} };
  const indexPeople = new Set<string>();
  for (const st of layer?.stories ?? []) {
    const tellings = arr(st.tellings).filter((t) => visible(t.shiurId));
    const first = tellings[0];
    if (!first) continue;
    const people = [
      ...new Set(arr(st.people).flatMap((p) => ("id" in p && typeof p.id === "string" && view.people.has(p.id) ? [p.id] : []))),
    ];
    for (const id of people) indexPeople.add(id);
    const names = [
      ...new Set(
        arr(st.people).flatMap((p) => {
          const sp = storyPerson(p);
          return sp && "name" in sp && sp.name !== "" ? [sp.name] : [];
        }),
      ),
    ];
    const ranked = tellings
      .map((t, i) => ({ t, i, cat: catalogued(t.shiurId) }))
      .sort((a, b) => Number(b.cat) - Number(a.cat) || a.i - b.i);
    const plays = ranked
      .filter((x, k) => ranked.findIndex((y) => y.t.lang === x.t.lang) === k)
      .map(({ t }) => ({ lang: t.lang, shiurId: t.shiurId, momentId: t.momentId, t: t.t, end: storyEnd(t.shiurId, t.momentId) }));
    storiesIndex.stories.push({
      id: st.id,
      title: lcopy(st.title),
      people,
      names,
      topics: mostSpecific(topicsOfStory.get(st.id) ?? []),
      tellings: tellings.length,
      langs: (["en", "yi"] as const).filter((l) => tellings.some((t) => t.lang === l)),
      page: liveStoryPage(st),
      first: { shiurId: first.shiurId, momentId: first.momentId, t: first.t },
      plays,
    });
    if (!liveStoryPage(st)) continue;
    const file: StoryFile = {
      schemaVersion: V,
      id: st.id,
      title: lcopy(st.title),
      retelling: lcopy(st.retelling),
      reviewed: st.reviewed === true,
      people: arr(st.people).flatMap((p) => storyPerson(p) ?? []),
      attributionVaries: st.attributionVaries === true,
      tellings: tellings.map(member),
    };
    put<"story">(dataPaths.story(st.id), file);
  }
  storiesIndex.people = sortedRecord([...indexPeople].map((id) => [id, view.personLabel(id)]));
  put<"storiesIndex">(dataPaths.storiesIndex(), storiesIndex);

  // ------------------------------------------------------------------ glossary/<prefix>.json
  const cards: GlossaryCard[] = [...view.allConcepts.values()]
    .sort((a, b) => cmp(a.id, b.id))
    .map((c) => ({
      id: c.id,
      he: nz(c.canonicalHe),
      label: lcopy(c.label),
      definition: lcopy(c.definition),
      count: c.count,
      page: view.concepts.has(c.id),
      topicId: c.mergedIntoTopic && view.topics.has(c.mergedIntoTopic) ? c.mergedIntoTopic : null,
      examples: arr(c.exampleRefs)
        .filter((r) => visible(r.shiurId))
        .slice(0, CORPUS_LIMITS.glossaryExamples)
        .map((r) => ({ shiurId: r.shiurId, momentId: r.momentId, t: r.t })),
    }));
  const glossaryShards = shardByPrefix(cards, (xs) => brSize(xs) <= CORPUS_LIMITS.glossaryShardBr);
  for (const [shard, xs] of glossaryShards) put<"glossary">(dataPaths.glossary(shard), { schemaVersion: V, shard, concepts: xs });

  const threadPage = (id: string) => liveThreadPage(threadById.get(id) ?? {});

  // ------------------------------------------------------------------ explore/entities.json
  const explore: ExploreEntitiesFile = { schemaVersion: V, shiurim: {} };
  for (const s of ctx.input.shiurim) {
    if (s.status !== "full" || !layer?.refs.has(s.id)) continue;
    const e = view.entitiesOf(s.id);
    if (e.topics.length + e.people.length + e.concepts.length + e.works.length === 0) continue;
    explore.shiurim[s.id] = e;
  }
  explore.shiurim = sortedRecord(Object.entries(explore.shiurim));
  put<"exploreEntities">(dataPaths.exploreEntities(), explore);

  // ------------------------------------------------------------------ per-shiur corpus block (G.1)
  const shiurCorpus = (shiurId: string): ShiurCorpus | undefined => {
    const r: LayerShiurRefs | undefined = layer?.refs.get(shiurId);
    if (!r || !visible(shiurId)) return undefined;
    const topics = arr(r.topics)
      .filter((t) => view.topics.has(t.id))
      .map((t) => ({ id: t.id, salience: t.salience }));
    const chapters = arr(r.chapters)
      .map((c) => ({ idx: c.idx, topicIds: arr(c.topicIds).filter((id) => view.topics.has(id)) }))
      .filter((c) => c.topicIds.length > 0);
    const topicIds = [...new Set([...topics.map((t) => t.id), ...chapters.flatMap((c) => c.topicIds)])].sort(cmp);
    return {
      topics,
      chapters,
      topicLabels: Object.fromEntries(topicIds.map((id) => [id, { id, label: view.topicLabel(id), page: true }])),
      terms: arr(r.conceptIds)
        .filter((id) => view.allConcepts.has(id))
        .map((id) => ({ id, label: view.conceptLabel(id), page: view.concepts.has(id) })),
      sources: arr(r.sources)
        .filter((x) => view.allWorks.has(x.workId))
        .map((x) => ({ momentId: x.momentId, workId: x.workId, page: view.works.has(x.workId) })),
      stories: arr(r.stories).map((x) => ({ momentId: x.momentId, storyId: x.storyId, tellings: x.tellings, page: liveStoryPage(storyById.get(x.storyId) ?? {}) })),
      insights: arr(r.insights).map((x) => ({
        momentId: x.momentId,
        threadId: x.threadId,
        shiurCount: x.shiurCount,
        years: x.years ? [x.years[0], x.years[1]] : null,
        page: threadPage(x.threadId),
        ...(x.other && visible(x.other.shiurId)
          ? { other: { shiurId: x.other.shiurId, momentId: x.other.momentId, t: x.other.t, year: x.other.year, lang: x.other.lang } }
          : {}),
      })),
    };
  };
  const shiurPointers = (shiurId: string): string[] =>
    arr(layer?.refs.get(shiurId)?.insights).flatMap((x) => (x.other && visible(x.other.shiurId) ? [x.other.shiurId] : []));

  return { glossaryShards: glossaryShards.map(([s]) => s), featuredMix, occasionTopic, shiurCorpus, shiurPointers };
}

/** The series synthesis for a series file, or undefined (concept-live C.6). */
export function seriesSynthesis(layer: LayerInput | null, seriesId: string, visibleIds: ReadonlySet<string>): SeriesSynthesis | undefined {
  const x = layer?.series.get(seriesId);
  if (!x) return undefined;
  return {
    title: lcopy(x.title),
    overview: lcopy(x.overview),
    keyThemes: arr(x.keyThemes).map(lcopy),
    arc: arr(x.arc)
      .filter((a) => visibleIds.has(a.shiurId))
      .map((a) => ({ shiurId: a.shiurId, oneLiner: lcopy(a.oneLiner) })),
    reviewed: x.reviewed === true,
  };
}

/**
 * Splits id-sorted items into shards by id prefix: start with one-character prefixes and split a
 * shard into longer prefixes until `fits` holds (an id equal to its shard's prefix stays there).
 * Returns `[prefix, items]` in prefix order; a client finds an id's shard by longest prefix.
 */
export function shardByPrefix<T extends { id: string }>(items: readonly T[], fits: (xs: readonly T[]) => boolean): [string, T[]][] {
  const out: [string, T[]][] = [];
  const split = (prefix: string, xs: readonly T[]) => {
    if (xs.length === 0) return;
    const longer = xs.filter((x) => x.id.length > prefix.length);
    if (prefix !== "" && (fits(xs) || longer.length === 0)) {
      out.push([prefix, [...xs]]);
      return;
    }
    const exact = xs.filter((x) => x.id.length <= prefix.length);
    if (exact.length > 0) out.push([prefix, exact]);
    const groups = new Map<string, T[]>();
    for (const x of longer) {
      const p = x.id.slice(0, prefix.length + 1);
      const g = groups.get(p);
      if (g) g.push(x);
      else groups.set(p, [x]);
    }
    for (const [p, g] of [...groups].sort(([a], [b]) => cmp(a, b))) split(p, g);
  };
  split("", items);
  return out.sort(([a], [b]) => cmp(a, b));
}

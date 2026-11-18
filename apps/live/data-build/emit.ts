/**
 * The Live static data emit (W3.6, tech-live §3.3): `.corpus/` (W1.2 projection + W2.1 aggregates)
 * plus `@emunas/search-core` documents → every `/data/*` file of the W2.4 contract
 * (`app/data/types.ts`). Pure: no I/O, deterministic for a given input and `generatedAt`.
 *
 * Every text field is copied from the public contract (`PublicShiur`, aggregate files), which has no
 * transcript-derived field. `candidateTopics` never reaches these files: the quick index is built from
 * search-core documents without their `keywords`.
 */
import { createHash } from "node:crypto";
import type { PublicShiur, Ed, L, LayerWork } from "@emunas/corpus/public";
import { livePersonChipList, liveStoryPage } from "../app/data/live-pages.ts";
import type { MentionRef, OccasionShiurRef, WorkRef } from "@emunas/corpus/aggregate";
import { OCCASIONS, OTHER_OCCASION_KEY, PARSHIYOS } from "@emunas/normalize";
import { CATEGORY_LABELS, formatHebrewYear, hebrewYearParts } from "@emunas/i18n";
import { buildEntityDocs, buildSearchDoc } from "@emunas/search-core/build";
import { foldForIndex, type SearchDoc } from "@emunas/search-core";
import MiniSearch from "minisearch";
import { dataFileOf, dataPaths } from "../app/data/paths.ts";
import { occasionMix } from "../app/features/mix/occasion.ts";
import {
  LIVE_DATA_SCHEMA_VERSION,
  MOMENT_SHARD_SIZE,
  type BuildFile,
  type CorpusFile,
  type CorpusRow,
  type EntityFile,
  type EntityKind,
  type FacetLabel,
  type FacetsFile,
  type FacetValue,
  type MomentKind,
  type MomentRef,
  type MomentRow,
  type MomentShardFile,
  type OccasionFacetValue,
  type PersonChip,
  type QuickEntity,
  type QuickIndexFile,
  type SeriesFile,
  type SeriesFacetValue,
  type ShiurFile,
  type ShiurRelated,
  type TodayCard,
  type TodayFile,
  type TodayOccasion,
  TODAY_ROW_PER_LANG,
  type WorkCitation,
  type WorkFile,
  type WorksFile,
  type WriteupFile,
  type DataFiles,
} from "../app/data/types.ts";
import type { CorpusInput } from "./corpus-input.ts";
import {
  DEFAULT_FEATURED,
  corpusView,
  emitCorpusFiles,
  facetLabel,
  seriesSynthesis,
  type CorpusView,
  type FeaturedPolicy,
} from "./emit-corpus.ts";

/** Bump when the emit logic changes the output for the same input (part of `buildId`). */
export const EMITTER_VERSION = 2;

/** Tunables (tech-live §3.3). */
export const EMIT_LIMITS = {
  /**
   * Occasions with at least this many shiurim get an `entity/o/<key>.json` file. People and concepts
   * follow the corpus layer's Live page flags (≥3 shiurim, C1.7).
   */
  entityFileMin: 2,
  /** `related` lists entities sharing at least this many shiurim. */
  relatedMinShared: 5,
  relatedMax: 12,
  /** "A moment for today" candidates per occasion in today.json (from the row's shiurim). */
  todayPoolPerOccasion: 4,
  /**
   * Sections of the occasion mix in today.json (enough to start playing; the rest come from the
   * topic's moment pages). Two since corpus v2: its topic parsha/zman keys link about 90 occasions
   * to a topic, and three per mix took today.json past its 30 KiB budget.
   */
  todayMixFirst: 2,
  /** Entries in today.json `newlySummarized` (Today shows 8 after the language filter). */
  newlySummarized: 12,
} as const;

export interface EmitOptions {
  /** ISO 8601; goes to build.json only. */
  generatedAt: string;
  /**
   * "Same idea elsewhere" lists from `neighbors.ts` (W4.4), computed before the emit because they
   * need worker threads and the embedding cache. Absent: every `related.neighbors` is empty.
   */
  neighbors?: { byShiur: ReadonlyMap<string, ShiurRelated["neighbors"]>; fingerprint: string };
  /** Featured-slot policy (corpus-policy `featured`, D7); defaults to the shipped defaults. */
  featured?: FeaturedPolicy;
}

export type EmittedFiles = Map<string, DataFiles[keyof DataFiles]>;

const V = LIVE_DATA_SCHEMA_VERSION;
const EDS: readonly Ed[] = ["en", "yi"];

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** `<shiurId>~<kind><n>` → `<shiurId>`. */
const shiurOfMoment = (id: string): string => id.slice(0, Math.max(0, id.indexOf("~")));

function sortedRecord<T>(entries: Iterable<[string, T]>): Record<string, T> {
  return Object.fromEntries([...entries].sort(([a], [b]) => cmp(a, b)));
}

function uniq<T>(xs: Iterable<T>): T[] {
  return [...new Set(xs)];
}

/** Year label: digits+civil in English, Hebrew letters in Yiddish. */
function yearLabel(key: string): FacetLabel {
  if (key === "unknown") return { en: "Year unknown", yi: "יאר נישט באקאנט" };
  const y = Number(key);
  const parts = hebrewYearParts(y);
  if (!parts) return { en: key, yi: key };
  return { en: formatHebrewYear(y, "en"), yi: parts.hebrew, he: parts.hebrew };
}

const LANG_LABELS: Record<Ed, FacetLabel> = {
  en: { en: "English", yi: "ענגליש" },
  yi: { en: "Yiddish", yi: "אידיש" },
};

const OTHER_OCCASION: FacetLabel = { en: "Other occasions", yi: "אנדערע געלעגנהייטן" };

/** A label whose `he` is set only when it differs from the Yiddish form (keeps facets.json small). */
const label = facetLabel;

export function emitLiveData(input: CorpusInput, opts: EmitOptions): EmittedFiles {
  const { info, index, aggregates: agg } = input;
  const files: EmittedFiles = new Map();
  const put = <K extends keyof DataFiles>(urlPath: string, body: DataFiles[K]) => {
    const file = dataFileOf(urlPath);
    if (file === null) throw new Error(`not a data path: ${urlPath}`);
    if (files.has(file)) throw new Error(`emitted twice: ${file}`);
    files.set(file, body);
  };

  const shiurim = input.shiurim;
  const byId = new Map(shiurim.map((s) => [s.id, s]));
  const catalogPos = new Map(index.shiurim.map((r, i) => [r.id, i]));
  const byYear = (a: string, b: string): number => {
    const ya = byId.get(a)?.years[0] ?? Number.POSITIVE_INFINITY;
    const yb = byId.get(b)?.years[0] ?? Number.POSITIVE_INFINITY;
    return ya - yb || (catalogPos.get(a) ?? 0) - (catalogPos.get(b) ?? 0) || cmp(a, b);
  };
  const sortByYear = (ids: Iterable<string>) =>
    uniq(ids)
      .filter((id) => byId.has(id))
      .sort(byYear);

  // Moment lookups: id → ref (with t/end) for every timed item of every full shiur.
  const momentById = new Map<string, MomentRef>();
  const momentsOf = (s: PublicShiur): MomentRef[] => {
    const n = s.notes;
    if (!n) return [];
    const out: MomentRef[] = [];
    const add = (kind: MomentKind, id: string, t: number | null, end: number | null) =>
      out.push({ id, shiurId: s.id, kind, t, end });
    for (const c of n.chapters) add("s", c.id, c.t, c.end);
    for (const k of n.summary.keyPoints) add("kp", k.id, k.t, k.end);
    for (const i of n.insights) add("i", i.id, i.t, i.end);
    for (const q of n.questions) add("q", q.id, q.tq, q.ta);
    for (const st of n.stories) add("st", st.id, st.t, st.end);
    for (const tk of n.takeaways) add("tk", tk.id, tk.t, tk.end);
    return out;
  };
  for (const s of shiurim) for (const m of momentsOf(s)) momentById.set(m.id, m);
  const ref = (id: string): MomentRef | null => {
    const m = momentById.get(id);
    return m ? { ...m } : null;
  };

  // ------------------------------------------------------------------ corpus layer (C1.7)
  const view: CorpusView = corpusView(input.layer);
  const layerOut = emitCorpusFiles(view, {
    input,
    byId,
    put,
    featured: opts.featured ?? DEFAULT_FEATURED,
  });

  // ------------------------------------------------------------------ corpus.json
  const counts = { ...info.counts };
  // Catalog fields only: the entity ids of each shiur are Explore's own file, explore/entities.json.
  const corpusRows: CorpusRow[] = index.shiurim.map((r) => ({
    id: r.id,
    rev: r.rev,
    lang: r.lang,
    category: r.category,
    status: r.status,
    title: r.catalog.titleOriginal,
    heading: r.catalog.heading ?? null,
    sectionTitle: r.catalog.sectionTitle,
    derived: r.catalog.derived,
    parsha: r.parsha?.key ?? null,
    zman: r.zman?.key ?? null,
    perek: r.perek,
    years: r.years,
    series: r.series ? { id: r.series.id, order: r.series.order } : null,
    duration: r.duration,
    oneLiner: r.oneLiner,
    counts: {
      chapters: r.counts.chapters,
      stories: r.counts.stories,
      questions: r.counts.questions,
      insights: r.counts.insights,
    },
  }));
  const corpus: CorpusFile = { schemaVersion: V, buildId: "", counts, shiurim: corpusRows };

  // ------------------------------------------------------------------ occasions
  // The curated listing (occasions.json): parshiyos and zmanim with their sub-headings, plus the
  // "other" bucket. Uncatalogued file-name guesses are not listed (W2.1), but their keys still get a
  // facet label so corpus.json filters can show them.
  type Occ = { type: "parsha" | "zman"; label: FacetLabel; ids: string[] };
  const listed = new Map<string, Occ>();
  const refIds = (xs: readonly OccasionShiurRef[]) => xs.map((x) => x.id);
  const tableLabel = new Map<string, FacetLabel>();
  for (const p of agg.occasions.parshiyos) tableLabel.set(p.key, label(p.en, p.yi, p.he));
  for (const z of agg.occasions.zmanim) tableLabel.set(z.key, label(z.en, z.yi, z.he));
  for (const p of agg.occasions.parshiyos) {
    if (p.count === 0) continue;
    listed.set(p.key, { type: "parsha", label: label(p.en, p.yi, p.he), ids: sortByYear(refIds(p.shiurim)) });
  }
  for (const z of agg.occasions.zmanim) {
    if (z.count === 0) continue;
    const ids = [...refIds(z.shiurim), ...z.subs.flatMap((s) => refIds(s.shiurim))];
    listed.set(z.key, { type: "zman", label: label(z.en, z.yi, z.he), ids: sortByYear(ids) });
  }
  const tableKeys = new Set(listed.keys());
  // The "other" bucket: grouped by the shiur's own key (normalize files one-off zmanim under
  // `other`; an unmapped parsha/zman keeps its slug), labelled by the catalog string.
  for (const r of agg.occasions.other) {
    const s = byId.get(r.id);
    if (!s) continue;
    const pick =
      s.zman && !tableKeys.has(s.zman.key)
        ? (["zman", s.zman] as const)
        : s.parsha
          ? (["parsha", s.parsha] as const)
          : null;
    if (!pick || listed.get(pick[1].key)?.ids.includes(r.id)) continue;
    const [type, v] = pick;
    const prev = listed.get(v.key);
    const l = prev?.label ?? (v.key === OTHER_OCCASION_KEY ? OTHER_OCCASION : { en: v.raw, yi: v.raw });
    listed.set(v.key, { type: prev?.type ?? type, label: l, ids: sortByYear([...(prev?.ids ?? []), r.id]) });
  }

  // ------------------------------------------------------------------ entity labels (corpus layer)
  const workLabel = view.workLabel;
  const personLabel = view.personLabel;
  const conceptLabel = view.conceptLabel;

  // ------------------------------------------------------------------ facets.json
  const tally = (pick: (r: CorpusRow) => Iterable<string>): Map<string, number> => {
    const m = new Map<string, number>();
    for (const r of corpusRows) for (const k of uniq(pick(r))) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  // Entity facets: corpus ids Live lists, counted over the shiurim tagged with them (corpus layer).
  const entityTally = (pick: (e: ReturnType<CorpusView["entitiesOf"]>) => readonly string[]) =>
    tally((r) => pick(view.entitiesOf(r.id)));
  const fv = (l: FacetLabel, count: number): FacetValue => ({ label: l, count });
  const categoryCounts = tally((r) => [r.category]);
  const category: FacetsFile["category"] = {};
  for (const [k, n] of [...categoryCounts].sort(([a], [b]) => cmp(a, b))) {
    const c = k as keyof typeof CATEGORY_LABELS;
    category[c] = fv({ en: CATEGORY_LABELS[c].en, yi: CATEGORY_LABELS[c].yi }, n);
  }
  const langCounts = tally((r) => [r.lang]);
  const occasionFacet = new Map<string, OccasionFacetValue>();
  for (const r of index.shiurim) {
    for (const [type, v] of [
      ["parsha", r.parsha],
      ["zman", r.zman],
    ] as const) {
      if (!v) continue;
      const prev = occasionFacet.get(v.key);
      const l = listed.get(v.key)?.label ?? tableLabel.get(v.key) ?? { en: v.raw, yi: v.raw };
      occasionFacet.set(v.key, {
        label: prev?.label ?? l,
        count: (prev?.count ?? 0) + 1,
        type: prev?.type ?? type,
        // The same rule as the entity/o files below.
        hasPage: (listed.get(v.key)?.ids.length ?? 0) >= EMIT_LIMITS.entityFileMin,
      });
    }
  }
  const yearCounts = tally((r) => (r.years.length ? r.years.map(String) : ["unknown"]));
  const seriesFacet: [string, SeriesFacetValue][] = agg.series.series
    .filter((x) => x.parts.length > 0)
    .map((x) => [
      x.id,
      { label: { en: x.title.en, yi: x.title.yi }, count: x.parts.length, lang: x.lang },
    ]);
  const facets: FacetsFile = {
    schemaVersion: V,
    category,
    lang: { en: fv(LANG_LABELS.en, langCounts.get("en") ?? 0), yi: fv(LANG_LABELS.yi, langCounts.get("yi") ?? 0) },
    occasion: sortedRecord(occasionFacet),
    year: sortedRecord([...yearCounts].map(([k, n]) => [k, fv(yearLabel(k), n)])),
    series: sortedRecord(seriesFacet),
    work: sortedRecord([...entityTally((e) => e.works)].map(([k, n]) => [k, fv(workLabel(k), n)])),
    person: sortedRecord([...entityTally((e) => e.people)].map(([k, n]) => [k, fv(personLabel(k), n)])),
    concept: sortedRecord([...entityTally((e) => e.concepts)].map(([k, n]) => [k, fv(conceptLabel(k), n)])),
  };
  put<"facets">(dataPaths.facets(), facets);

  // ------------------------------------------------------------------ today.json
  /** Round-robin over the occasion's shiurim (in year order) so the pool spans shiurim and years. */
  const todayPool = (ids: readonly string[]): MomentRef[] => {
    const per = ids.map((id) => {
      const n = byId.get(id)?.notes;
      if (!n) return [];
      const xs: MomentRef[] = [];
      const max = Math.max(n.insights.length, n.stories.length, n.questions.length);
      for (let i = 0; i < max; i++) {
        for (const id2 of [n.insights[i]?.id, n.stories[i]?.id, n.questions[i]?.id]) {
          const m = id2 === undefined ? null : ref(id2);
          if (m && m.t !== null) xs.push(m);
        }
      }
      return xs;
    });
    const out: MomentRef[] = [];
    for (let round = 0; out.length < EMIT_LIMITS.todayPoolPerOccasion; round++) {
      let any = false;
      for (const xs of per) {
        const m = xs[round];
        if (!m) continue;
        any = true;
        out.push(m);
        if (out.length >= EMIT_LIMITS.todayPoolPerOccasion) break;
      }
      if (!any) break;
    }
    return out;
  };
  // Today renders from this file alone (plan §4): a compact card for every shiur it names, the
  // occasion labels, and per occasion the first items of its mix (occasion → topic, corpus layer).
  // Rows hold a few shiurim per audio language (the occasion page lists all); only the
  // newly-summarized cards carry a one-liner. That keeps the file inside its 30 KiB budget.
  const newlySummarized = Object.entries(input.updatedAt)
    .filter(([id]) => byId.get(id)?.status === "full")
    .sort(([a, x], [b, y]) => cmp(y, x) || cmp(a, b))
    .slice(0, EMIT_LIMITS.newlySummarized)
    .map(([shiurId, updatedAt]) => ({ shiurId, updatedAt }));
  const rowOf = (ids: readonly string[]): string[] => {
    const seen: Partial<Record<Ed, number>> = {};
    return ids.filter((id) => {
      const lang = byId.get(id)?.lang;
      if (lang === undefined) return false;
      seen[lang] = (seen[lang] ?? 0) + 1;
      return seen[lang] <= TODAY_ROW_PER_LANG;
    });
  };
  const sharedLabel = new Map([...PARSHIYOS, ...OCCASIONS].map((r) => [r.key, { en: r.en, yi: r.yi }]));
  const sameAsShared = (k: string, l: FacetLabel) => sharedLabel.get(k)?.en === l.en && sharedLabel.get(k)?.yi === l.yi;
  const todayOccasions = sortedRecord(
    [...listed].map(([k, o]): [string, TodayOccasion] => {
      const row = rowOf(o.ids);
      const topicId = layerOut.occasionTopic.get(k);
      const mix = topicId ? layerOut.featuredMix(topicId) : null;
      return [
        k,
        {
          ...(sameAsShared(k, o.label) ? {} : { label: o.label }),
          shiurIds: row,
          total: o.ids.length,
          moments: todayPool(row).flatMap((m) => (m.t === null ? [] : [{ id: m.id, t: m.t }])),
          mix: mix && {
            topicId: mix.topicId,
            label: mix.label,
            sections: mix.sections,
            shiurim: mix.shiurim,
            // The head the button plays at once: the same rule as the client's rest (the occasion's
            // own catalog shiurim first, one section per shiur), over the featured sections.
            first: occasionMix({ head: [], topic: mix.first, catalog: o.ids, audio: "both", size: EMIT_LIMITS.todayMixFirst }).items.map(
              (x) => ({ id: x.id, t: x.t, end: x.end, title: x.title }),
            ),
            ...(mix.skip.length > 0 ? { skip: mix.skip } : {}),
          },
        },
      ];
    }),
  );
  const withOneLiner = new Set(newlySummarized.map((n) => n.shiurId));
  const cardIds = new Set<string>([
    ...Object.values(todayOccasions).flatMap((o) => [
      ...o.shiurIds,
      ...o.moments.map((m) => shiurOfMoment(m.id)),
      ...(o.mix?.first.map((m) => shiurOfMoment(m.id)) ?? []),
    ]),
    ...withOneLiner,
  ]);
  const todayCard = (s: PublicShiur): TodayCard => {
    const ol = withOneLiner.has(s.id) ? s.notes?.summary.oneLiner : undefined;
    return {
      lang: s.lang,
      title: s.catalog.titleOriginal,
      duration: Math.round(s.duration),
      years: [...s.years],
      status: s.status,
      ...(ol ? { oneLiner: { en: ol.en, yi: ol.yi } } : {}),
    };
  };
  const today: TodayFile = {
    schemaVersion: V,
    counts,
    occasions: todayOccasions,
    newlySummarized,
    cards: sortedRecord(
      [...cardIds].flatMap((id) => {
        const s = byId.get(id);
        return s ? [[id, todayCard(s)] as const] : [];
      }),
    ),
  };
  put<"today">(dataPaths.today(), today);

  // ------------------------------------------------------------------ shiur/<id>.json, writeup/<id>.<lang>.json
  const seriesById = new Map(agg.series.series.map((x) => [x.id, x]));
  for (const s of shiurim) {
    const nb = agg.neighbours[s.id];
    const nav = nb?.series ?? nb?.section ?? null;
    const { notes, recordings, ...rest } = s;
    const neighbors = (opts.neighbors?.byShiur.get(s.id) ?? []).map((n) => ({ ...n }));
    const prev = nav?.prev ?? null;
    const next = nav?.next ?? null;
    const sameOccasion = nb?.sameOccasion ?? [];
    // Self-contained (G.1): titles of every shiur this file points at, the series title and the
    // corpus-layer refs with their labels, so the room loads nothing corpus-wide.
    const named = [...sameOccasion, prev, next, ...neighbors.map((n) => n.shiurId), ...layerOut.shiurPointers(s.id)];
    const titles = sortedRecord(
      uniq(named.filter((x): x is string => x !== null && x !== s.id)).flatMap((id) => {
        const o = byId.get(id);
        const t: [string, { title: string; lang: Ed; years: number[] }][] = o ? [[id, { title: o.catalog.titleOriginal, lang: o.lang, years: [...o.years] }]] : [];
        return t;
      }),
    );
    const series = s.series ? seriesById.get(s.series.id) : undefined;
    const file: ShiurFile = {
      schemaVersion: V,
      ...rest,
      recordings: recordings.map((r) => ({ ...r })),
      related: { sameOccasion, prev, next, neighbors, titles },
      seriesTitle: series ? { en: series.title.en, yi: series.title.yi } : null,
    };
    const refs = layerOut.shiurCorpus(s.id);
    if (refs) file.corpus = refs;
    if (s.status === "full" && notes) {
      const { writeup, ...without } = notes;
      const langs = EDS.filter((l) => writeup[l].length > 0);
      file.notes = { ...without, writeupLangs: langs };
      for (const l of langs) {
        const w: WriteupFile = { schemaVersion: V, shiurId: s.id, rev: s.rev, lang: l, blocks: writeup[l] };
        put<"writeup">(dataPaths.writeup(s.id, l), w);
      }
    }
    put<"shiur">(dataPaths.shiur(s.id), file);
  }

  // ------------------------------------------------------------------ series/<id>.json
  for (const x of agg.series.series) {
    if (x.parts.length === 0) continue;
    const file: SeriesFile = {
      schemaVersion: V,
      id: x.id,
      title: { en: x.title.en, yi: x.title.yi },
      lang: x.lang,
      parts: x.parts.flatMap((p) => {
        const s = byId.get(p.id);
        if (!s) return [];
        return [
          {
            shiurId: s.id,
            order: p.order,
            title: s.catalog.titleOriginal,
            oneLiner: s.notes?.summary.oneLiner ?? null,
            duration: s.duration,
            years: s.years,
            status: s.status,
            perek: s.perek,
          },
        ];
      }),
      perekGroups: (x.groups ?? []).flatMap((g) =>
        g.perek === null ? [] : [{ perek: g.perek, shiurIds: g.shiurIds }],
      ),
    };
    const synthesis = seriesSynthesis(
      input.layer,
      x.id,
      new Set(x.parts.filter((p) => byId.get(p.id)?.status === "full").map((p) => p.id)),
    );
    if (synthesis) file.synthesis = synthesis;
    put<"series">(dataPaths.series(x.id), file);
  }

  // ------------------------------------------------------------------ works.json, work/<key>.json
  const citation = (m: {
    shiurId: string;
    id: string;
    t: number | null;
    mention: WorkCitation["mention"];
    resolution: WorkCitation["resolution"];
  }): WorkCitation => ({
    shiurId: m.shiurId,
    sourceId: m.id,
    t: m.t,
    mention: m.mention,
    resolution: m.resolution,
  });
  // Keyed by corpus work id (C1.7): a work with a Live page (≥3 shiurim, never generic). Each cited
  // source goes to the work its moment resolves to in the layer refs, else to its aggregate entry's
  // work; locations keep the reference order of the aggregate (W2.1). A corpus entry counts only
  // the visible set (corpus-wave-plan §3.2: `full` ∩ the corpus index, i.e. shiurim with layer
  // refs), as Quiet's work pages do: a `full` shiur the corpus stage has not reached yet is cited
  // on neither site.
  const inV = (shiurId: string): boolean => input.layer.refs.has(shiurId);
  const sourceWork = new Map<string, string>();
  for (const r of input.layer.refs.values()) for (const x of r.sources ?? []) sourceWork.set(x.momentId, x.workId);
  type Loc = { ref: WorkRef; citations: WorkCitation[] };
  const locs = new Map<string, Map<string, Loc>>();
  const unloc = new Map<string, WorkCitation[]>();
  const mentions = new Map<string, number>();
  const workOfMention = (m: MentionRef, fallback: string | null | undefined): string | null =>
    sourceWork.get(m.id) ?? fallback ?? null;
  for (const w of agg.works.works) {
    for (const r of w.refs) {
      for (const m of r.mentions) {
        if (!inV(m.shiurId)) continue;
        const id = workOfMention(m, w.workId);
        if (id === null || !view.allWorks.has(id)) continue;
        mentions.set(id, (mentions.get(id) ?? 0) + 1);
        if (!view.works.has(id)) continue;
        let byRef = locs.get(id);
        if (!byRef) locs.set(id, (byRef = new Map()));
        let l = byRef.get(r.ref);
        if (!l) byRef.set(r.ref, (l = { ref: r, citations: [] }));
        l.citations.push(citation(m));
      }
    }
    for (const m of w.unlocated) {
      if (!inV(m.shiurId)) continue;
      const id = workOfMention(m, w.workId);
      if (id === null || !view.allWorks.has(id)) continue;
      mentions.set(id, (mentions.get(id) ?? 0) + 1);
      if (!view.works.has(id)) continue;
      unloc.set(id, [...(unloc.get(id) ?? []), citation(m)]);
    }
  }
  const sortKeyCmp = (a: readonly number[], b: readonly number[]): number => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? -1) - (b[i] ?? -1);
      if (d !== 0) return d;
    }
    return 0;
  };
  // C2.6: the shelf lists every non-generic work with visible shiurim (those below the page line go
  // in a collapsed row); a family hub (genre with child works, generic false in the layer) is shelved
  // with its children after it, in the layer's shelf order.
  /** A person as a chip: page link, the 1–2 shiurim it opens (E.1), or plain text. */
  const personChip = (id: string): PersonChip | null => {
    const p = view.allPeople.get(id);
    if (!p) return null;
    const chip: PersonChip = { id, label: personLabel(id), page: view.people.has(id) };
    if (livePersonChipList(p)) {
      chip.shiurim = sortByYear(p.shiurIds ?? []).map((sid) => {
        const s = byId.get(sid)!;
        return { id: sid, title: s.catalog.titleOriginal, lang: s.lang, years: s.years };
      });
    }
    return chip;
  };
  const liveWorks = [...view.works.values()];
  const shelfWorks = [...view.allWorks.values()].filter((w) => w.count > 0 && w.generic !== true);
  const shelved = new Set(shelfWorks.map((w) => w.id));
  const childrenOf = new Map<string, LayerWork[]>();
  for (const w of view.allWorks.values()) {
    if (!w.parentWorkId || w.count <= 0) continue;
    childrenOf.set(w.parentWorkId, [...(childrenOf.get(w.parentWorkId) ?? []), w]);
  }
  /** The work and every work below it (layer `parentWorkId`), guarded against loops. */
  const familyOf = (id: string): string[] => {
    const out: string[] = [];
    const visit = (x: string) => {
      if (out.includes(x)) return;
      out.push(x);
      for (const c of childrenOf.get(x) ?? []) visit(c.id);
    };
    visit(id);
    return out;
  };
  const familyShiurim = (id: string): string[] => sortByYear(familyOf(id).flatMap((x) => view.allWorks.get(x)?.shiurIds ?? []));
  const workChip = (id: string) => ({
    id,
    label: workLabel(id),
    page: view.works.has(id),
    count: view.allWorks.get(id)?.count ?? 0,
  });
  const works: WorksFile = {
    schemaVersion: V,
    works: shelfWorks.map((w) => ({
      key: w.id,
      name: w.titleEn,
      label: workLabel(w.id),
      count: w.count,
      mentions: mentions.get(w.id) ?? 0,
      page: view.works.has(w.id),
      group: w.orderGroup ?? "other",
      parentId: w.parentWorkId && shelved.has(w.parentWorkId) ? w.parentWorkId : null,
    })),
  };
  put<"works">(dataPaths.works(), works);
  for (const w of liveWorks) {
    const parent = w.parentWorkId ? view.allWorks.get(w.parentWorkId) : undefined;
    const file: WorkFile = {
      schemaVersion: V,
      key: w.id,
      name: w.titleEn,
      label: workLabel(w.id),
      reviewed: w.reviewed === true,
      sefariaIndexTitle: typeof w.sefariaIndexTitle === "string" && w.sefariaIndexTitle.trim() !== "" ? w.sefariaIndexTitle : null,
      author: w.authorPersonId ? personChip(w.authorPersonId) : null,
      parent: parent && parent.generic !== true ? { id: parent.id, label: workLabel(parent.id), page: view.works.has(parent.id) } : null,
      children: (childrenOf.get(w.id) ?? []).map((c) => workChip(c.id)),
      shiurIds: familyShiurim(w.id),
      locations: [...(locs.get(w.id)?.values() ?? [])]
        .sort((a, b) => sortKeyCmp(a.ref.sortKey, b.ref.sortKey))
        .map((l) => ({ ref: l.ref.label.en, sefariaRef: l.ref.ref, citations: l.citations })),
      unlocated: unloc.get(w.id) ?? [],
    };
    put<"work">(dataPaths.work(w.id), file);
  }

  // ------------------------------------------------------------------ entity/{p,c,o}/<key>.json
  type Ent = {
    kind: EntityKind;
    key: string;
    label: FacetLabel;
    ids: string[];
    moments: MomentRef[];
    extra?: Pick<EntityFile, "reviewed" | "person" | "concept">;
  };
  const ents: Ent[] = [];
  const entityMin = EMIT_LIMITS.entityFileMin;
  // People and concepts: corpus ids with a Live page (C1.7). A person's moments are the tellings
  // of the merged stories that name him; a concept's are its example sections.
  const storyTellings = new Map(input.layer.stories.map((st) => [st.id, st.tellings ?? []]));
  const storyById = new Map(input.layer.stories.map((st) => [st.id, st]));
  for (const p of view.people.values()) {
    const ids = sortByYear(p.shiurIds ?? []);
    if (ids.length === 0) continue;
    const mine = new Set(ids);
    const moments = uniq((p.storyIds ?? []).flatMap((sid) => (storyTellings.get(sid) ?? []).map((t) => t.momentId)))
      .flatMap((id) => ref(id) ?? [])
      .filter((m) => mine.has(m.shiurId));
    // C2.6: names as given, aliases, his seforim, shiurim citing them, merged stories.
    const own = uniq([...(p.worksAuthored ?? []), ...(p.sameIdWork ? [p.sameIdWork] : [])]).filter((id) => view.allWorks.has(id));
    const personStories = uniq(p.storyIds ?? []).flatMap((sid) => {
      const st = storyById.get(sid);
      const tellings = (st?.tellings ?? []).filter((t) => byId.has(t.shiurId));
      const first = tellings[0];
      if (!st || !first) return [];
      return [
        {
          id: sid,
          title: { en: st.title?.en ?? "", yi: st.title?.yi ?? "" },
          tellings: tellings.length,
          page: liveStoryPage(st),
          first: { shiurId: first.shiurId, momentId: first.momentId, t: first.t ?? null },
        },
      ];
    });
    personStories.sort((a, b) => b.tellings - a.tellings || cmp(a.id, b.id));
    ents.push({
      kind: "p",
      key: p.id,
      label: personLabel(p.id),
      ids,
      moments,
      extra: {
        reviewed: p.reviewed === true,
        person: {
          kind: "person",
          id: p.id,
          names: { he: p.nameHe ?? "", en: p.nameEn ?? "", yi: p.nameYi ?? "" },
          aliases: uniq((p.aliases ?? []).filter((a) => typeof a === "string" && a.trim() !== "")),
          description: p.description ? { en: p.description.en ?? "", yi: p.description.yi ?? "" } : null,
          works: own.map((id) => workChip(id)),
          cited: sortByYear(own.flatMap((id) => familyShiurim(id))),
          stories: personStories,
        },
      },
    });
  }
  for (const c of view.concepts.values()) {
    const ids = sortByYear(c.shiurIds ?? []);
    if (ids.length === 0) continue;
    const mine = new Set(ids);
    const moments = uniq((c.exampleRefs ?? []).map((x) => x.momentId))
      .flatMap((id) => ref(id) ?? [])
      .filter((m) => mine.has(m.shiurId));
    ents.push({
      kind: "c",
      key: c.id,
      label: conceptLabel(c.id),
      ids,
      moments,
      extra: {
        reviewed: c.reviewed === true,
        concept: {
          he: c.canonicalHe ?? "",
          label: { en: c.label?.en ?? "", yi: c.label?.yi ?? "" },
          definition: { en: c.definition?.en ?? "", yi: c.definition?.yi ?? "" },
        },
      },
    });
  }
  for (const [key, o] of listed) {
    if (o.ids.length < entityMin) continue;
    const moments = o.ids.flatMap((id) => {
      const n = byId.get(id)?.notes;
      if (!n) return [];
      return [...n.insights.map((x) => x.id), ...n.stories.map((x) => x.id), ...n.questions.map((x) => x.id)].flatMap(
        (mid) => ref(mid) ?? [],
      );
    });
    ents.push({ kind: "o", key, label: o.label, ids: o.ids, moments });
  }
  // Co-occurrence: entities sharing ≥ relatedMinShared shiurim.
  const entKey = (e: { kind: EntityKind; key: string }) => `${e.kind}:${e.key}`;
  const entsByShiur = new Map<string, number[]>();
  ents.forEach((e, i) => {
    for (const id of e.ids) {
      const xs = entsByShiur.get(id) ?? [];
      xs.push(i);
      entsByShiur.set(id, xs);
    }
  });
  const shared = new Map<number, Map<number, number>>();
  for (const xs of entsByShiur.values()) {
    for (const a of xs) {
      let m = shared.get(a);
      if (!m) shared.set(a, (m = new Map()));
      for (const b of xs) if (a !== b) m.set(b, (m.get(b) ?? 0) + 1);
    }
  }
  ents.forEach((e, i) => {
    const years = new Map<string, number>();
    for (const id of e.ids) {
      const ys = byId.get(id)!.years;
      for (const y of ys.length ? uniq(ys.map(String)) : ["unknown"]) years.set(y, (years.get(y) ?? 0) + 1);
    }
    const related = [...(shared.get(i) ?? new Map<number, number>())]
      .filter(([, n]) => n >= EMIT_LIMITS.relatedMinShared)
      .map(([j, n]) => ({ kind: ents[j]!.kind, key: ents[j]!.key, shared: n }))
      .sort((a, b) => b.shared - a.shared || cmp(entKey(a), entKey(b)))
      .slice(0, EMIT_LIMITS.relatedMax);
    const file: EntityFile = {
      schemaVersion: V,
      kind: e.kind,
      key: e.key,
      label: e.label,
      shiurIds: e.ids,
      years: sortedRecord(years),
      moments: e.moments,
      related,
      ...e.extra,
    };
    put<"entity">(dataPaths.entity(e.kind, e.key), file);
  });

  // ------------------------------------------------------------------ moments/<lang>-<n>.json
  const momentShards: Record<Ed, number> = { en: 0, yi: 0 };
  for (const lang of EDS) {
    const rows: MomentRow[] = [];
    for (const s of shiurim) {
      const n = s.notes;
      if (!n) continue;
      const row = (kind: MomentKind, id: string, t: number | null, end: number | null, title: L): MomentRow => ({
        id,
        shiurId: s.id,
        kind,
        t,
        end,
        title: title[lang],
      });
      for (const c of n.chapters) rows.push({ ...row("s", c.id, c.t, c.end, c.title), sectionKind: c.kind });
      for (const k of n.summary.keyPoints) rows.push(row("kp", k.id, k.t, k.end, k.text));
      for (const i of n.insights) rows.push(row("i", i.id, i.t, i.end, i.text));
      for (const q of n.questions) rows.push(row("q", q.id, q.tq, q.ta, q.q));
      for (const st of n.stories) rows.push(row("st", st.id, st.t, st.end, st.title));
      for (const tk of n.takeaways) rows.push(row("tk", tk.id, tk.t, tk.end, tk.text));
    }
    const count = Math.max(1, Math.ceil(rows.length / MOMENT_SHARD_SIZE));
    momentShards[lang] = count;
    for (let i = 0; i < count; i++) {
      const shard: MomentShardFile = {
        schemaVersion: V,
        lang,
        shard: i,
        moments: rows.slice(i * MOMENT_SHARD_SIZE, (i + 1) * MOMENT_SHARD_SIZE),
      };
      put<"moments">(dataPaths.moments(lang, i), shard);
    }
  }

  // ------------------------------------------------------------------ quick-index.<lang>.json
  const docs = shiurim.map((shiur) => buildSearchDoc({ shiur }));
  const names = entityNames(view);
  const entityText = (id: string): string[] => {
    const e = view.entitiesOf(id);
    const keys = [...e.works.map((x) => `work:${x}`), ...e.people.map((x) => `person:${x}`), ...e.concepts.map((x) => `concept:${x}`)];
    return keys.flatMap((k) => names.get(k) ?? []);
  };
  const suggestible = quickEntities(view);
  for (const lang of EDS) put<"quickIndex">(dataPaths.quickIndex(lang), quickIndex(docs, lang, entityText, suggestible));

  // ------------------------------------------------------------------ build.json, corpus.json
  const buildId = createHash("sha256")
    .update(JSON.stringify([info.buildId, EMITTER_VERSION, V, ...(opts.neighbors ? [opts.neighbors.fingerprint] : [])]))
    .digest("hex")
    .slice(0, 16);
  corpus.buildId = buildId;
  put<"corpus">(dataPaths.corpus(), corpus);
  const build: BuildFile = {
    schemaVersion: V,
    corpusSchemaVersion: info.schemaVersion,
    buildId,
    dataSha: info.dataSha,
    generatedAt: opts.generatedAt,
    counts,
    momentShards,
    glossaryShards: layerOut.glossaryShards,
  };
  put<"build">(dataPaths.build(), build);

  return files;
}

// ---------------------------------------------------------------------------------------------
// Quick index (command bar, W4.3): MiniSearch over search-core fields, pre-folded.

/**
 * Indexed fields. Values are folded with search-core's `foldForIndex` at build time, so the client
 * searches with `normalizeQuery(q).tokens` (same fold) and MiniSearch's default tokenizer and
 * lower-casing; no custom `processTerm` needs to survive serialization.
 */
export const QUICK_INDEX_FIELDS = ["title", "occasion", "oneLiner", "sections", "entities"] as const;
/** Stored for display without loading corpus.json: the catalog title as written and the audio language. */
export const QUICK_INDEX_STORE_FIELDS = ["name", "lang"] as const;

type QuickDoc = { id: string; name: string; lang: Ed } & Record<(typeof QUICK_INDEX_FIELDS)[number], string>;

/**
 * Entity names for the quick index, from the search-core EntityDocs (labels only: the entity's own
 * display names; no synonyms or aliases), keyed `<kind>:<id>`. Only entities listed on Live.
 */
function entityNames(view: CorpusView): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const layer = view.layer;
  const docs = buildEntityDocs({
    topics: { tree: layer.topics, detail: [...layer.topicDetail.values()] },
    concepts: { concepts: layer.concepts },
    people: { people: layer.people },
    works: { works: layer.works },
    stories: { stories: layer.stories },
    synonyms: { synonyms: [] },
  });
  for (const d of docs) {
    if (!d.listed.live) continue;
    out.set(`${d.kind}:${d.id}`, uniq([d.labels.en, d.labels.yi, d.labels.he].filter((x): x is string => x !== null)));
  }
  return out;
}

/**
 * The command bar's entity suggestions (C3.6): the search-core EntityDocs (labels + clean synonyms
 * from the layer's synonyms.json) of the entities with a Live page (`live-pages.ts`, as in
 * `corpusView`): topics, concepts not merged into a topic, people ≥3 never of the `other` group,
 * works ≥3 never generic. No ASR variant has an input path here.
 */
export function quickEntities(view: CorpusView): QuickEntity[] {
  const layer = view.layer;
  const docs = buildEntityDocs({
    topics: { tree: layer.topics, detail: [...layer.topicDetail.values()] },
    concepts: { concepts: layer.concepts },
    people: { people: layer.people },
    works: { works: layer.works },
    stories: { stories: layer.stories },
    synonyms: { synonyms: layer.synonyms },
  });
  const live = { topic: view.topics, concept: view.concepts, person: view.people, work: view.works } as const;
  return docs
    .filter((d) => live[d.kind].has(d.id) && d.count > 0)
    .map((d) => ({
      kind: d.kind,
      id: d.id,
      labels: { he: d.labels.he, en: d.labels.en, yi: d.labels.yi },
      synonyms: [...d.synonyms],
      count: d.count,
    }));
}

function quickDoc(d: SearchDoc, lang: Ed, entityText: (shiurId: string) => readonly string[]): QuickDoc {
  const f = (xs: readonly (string | null | undefined)[]) =>
    xs
      .flatMap((x) => (x ? [foldForIndex(x)] : []))
      .filter((x) => x.length > 0)
      .join("\n");
  return {
    id: d.id,
    name: d.titleOriginal,
    lang: d.lang,
    title: f([d.titleOriginal, d.heading, d.subTitle]),
    occasion: f([...d.parsha, ...d.zman]),
    oneLiner: f([d.oneLiner?.[lang]]),
    sections: f(d.sections.map((s) => s.title[lang])),
    entities: f([...entityText(d.id)]),
  };
}

export function quickIndex(
  docs: readonly SearchDoc[],
  lang: Ed,
  entityText: (shiurId: string) => readonly string[] = () => [],
  entities: readonly QuickEntity[] = [],
): QuickIndexFile {
  const options = {
    fields: [...QUICK_INDEX_FIELDS],
    storeFields: [...QUICK_INDEX_STORE_FIELDS],
    idField: "id",
  };
  const ms = new MiniSearch<QuickDoc>(options);
  ms.addAll([...docs].sort((a, b) => cmp(a.id, b.id)).map((d) => quickDoc(d, lang, entityText)));
  return { schemaVersion: V, lang, options, index: ms.toJSON(), entities: [...entities] };
}

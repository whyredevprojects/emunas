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
import type { PublicShiur, Ed, L } from "@emunas/corpus/public";
import type { OccasionShiurRef, WorkEntry } from "@emunas/corpus/aggregate";
import { OTHER_OCCASION_KEY } from "@emunas/normalize";
import { CATEGORY_LABELS, formatHebrewYear, hebrewYearParts } from "@emunas/i18n";
import { buildSearchDoc } from "@emunas/search-core/build";
import { foldForIndex, type SearchDoc } from "@emunas/search-core";
import MiniSearch from "minisearch";
import { dataFileOf, dataPaths } from "../app/data/paths.ts";
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
  type QuickIndexFile,
  type SeriesFile,
  type SeriesFacetValue,
  type ShiurFile,
  type StoriesFile,
  type TodayFile,
  type WorkCitation,
  type WorkFile,
  type WorksFile,
  type WriteupFile,
  type DataFiles,
} from "../app/data/types.ts";
import type { CorpusInput } from "./corpus-input.ts";

/** Bump when the emit logic changes the output for the same input (part of `buildId`). */
export const EMITTER_VERSION = 1;

/** Tunables (tech-live §3.3). */
export const EMIT_LIMITS = {
  /** Only entities with at least this many shiurim get an `entity/{p,c,o}/<key>.json` file. */
  entityFileMin: 2,
  /** `related` lists entities sharing at least this many shiurim. */
  relatedMinShared: 5,
  relatedMax: 12,
  /** "A moment for today" candidates per occasion in today.json. */
  todayPoolPerOccasion: 12,
  /** Entries in today.json `newlySummarized`. */
  newlySummarized: 24,
} as const;

export interface EmitOptions {
  /** ISO 8601; goes to build.json only. */
  generatedAt: string;
}

export type EmittedFiles = Map<string, DataFiles[keyof DataFiles]>;

const V = LIVE_DATA_SCHEMA_VERSION;
const EDS: readonly Ed[] = ["en", "yi"];

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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
function label(en: string, yi: string, he: string | null | undefined): FacetLabel {
  return he && he !== yi ? { en, yi, he } : { en, yi };
}

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

  // ------------------------------------------------------------------ corpus.json
  const counts = { ...info.counts };
  // Concepts are AI-extracted terms; one that occurs in a single shiur (or is stop-listed) is not a
  // browse facet. corpus.json and facets.json carry only concepts with an entity page; the shiur
  // file still lists all of its own concepts.
  const browseConcepts = new Set(
    agg.entities.concepts.filter((c) => c.shiurim >= EMIT_LIMITS.entityFileMin).map((c) => c.key),
  );
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
    entities: {
      works: r.entities.works,
      people: r.entities.people,
      concepts: r.entities.concepts.filter((k) => browseConcepts.has(k)),
    },
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

  // ------------------------------------------------------------------ entity labels and members
  const workByKey = new Map<string, WorkEntry>(agg.works.works.map((w) => [w.key, w]));
  const personByKey = new Map(agg.people.people.map((p) => [p.key, p]));
  const conceptByKey = new Map(agg.concepts.concepts.map((c) => [c.key, c]));
  const fallbackWork = new Map<string, string>();
  const fallbackPerson = new Map<string, string>();
  const fallbackConcept = new Map<string, string>();
  for (const s of shiurim) {
    const n = s.notes;
    if (!n) continue;
    for (const src of n.sources)
      if (src.workKey && src.work && !fallbackWork.has(src.workKey)) fallbackWork.set(src.workKey, src.work);
    for (const p of n.people) if (!fallbackPerson.has(p.key)) fallbackPerson.set(p.key, p.name);
    for (const st of n.stories) {
      st.peopleKeys.forEach((k, i) => {
        const name = st.people[i];
        if (name !== undefined && !fallbackPerson.has(k)) fallbackPerson.set(k, name);
      });
    }
    for (const c of n.concepts) if (!fallbackConcept.has(c.key)) fallbackConcept.set(c.key, c.he);
  }
  const workLabel = (key: string): FacetLabel => {
    const w = workByKey.get(key);
    if (w) return label(w.en, w.yi ?? w.en, w.he);
    const name = fallbackWork.get(key) ?? key;
    return { en: name, yi: name };
  };
  const personLabel = (key: string): FacetLabel => {
    const p = personByKey.get(key);
    if (p) return p.he ? { en: p.en, yi: p.he } : { en: p.en, yi: p.en };
    const name = fallbackPerson.get(key) ?? key;
    return { en: name, yi: name };
  };
  const conceptLabel = (key: string): FacetLabel => {
    const he = conceptByKey.get(key)?.he ?? fallbackConcept.get(key) ?? key;
    return { en: he, yi: he };
  };

  // ------------------------------------------------------------------ facets.json
  const tally = (pick: (r: CorpusRow) => Iterable<string>): Map<string, number> => {
    const m = new Map<string, number>();
    for (const r of corpusRows) for (const k of uniq(pick(r))) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
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
      occasionFacet.set(v.key, { label: prev?.label ?? l, count: (prev?.count ?? 0) + 1, type: prev?.type ?? type });
    }
  }
  const yearCounts = tally((r) => (r.years.length ? r.years.map(String) : ["unknown"]));
  const seriesFacet: [string, SeriesFacetValue][] = agg.series.series
    .filter((x) => x.parts.length > 0)
    .map((x) => [
      x.id,
      { label: { en: x.title.en, yi: x.title.yi }, count: x.parts.length, lang: x.lang, sibling: x.sibling },
    ]);
  const facets: FacetsFile = {
    schemaVersion: V,
    category,
    lang: { en: fv(LANG_LABELS.en, langCounts.get("en") ?? 0), yi: fv(LANG_LABELS.yi, langCounts.get("yi") ?? 0) },
    occasion: sortedRecord(occasionFacet),
    year: sortedRecord([...yearCounts].map(([k, n]) => [k, fv(yearLabel(k), n)])),
    series: sortedRecord(seriesFacet),
    work: sortedRecord([...tally((r) => r.entities.works)].map(([k, n]) => [k, fv(workLabel(k), n)])),
    person: sortedRecord([...tally((r) => r.entities.people)].map(([k, n]) => [k, fv(personLabel(k), n)])),
    concept: sortedRecord([...tally((r) => r.entities.concepts)].map(([k, n]) => [k, fv(conceptLabel(k), n)])),
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
  const today: TodayFile = {
    schemaVersion: V,
    occasions: sortedRecord([...listed].map(([k, o]) => [k, { shiurIds: o.ids, moments: todayPool(o.ids) }])),
    newlySummarized: Object.entries(input.updatedAt)
      .filter(([id]) => byId.get(id)?.status === "full")
      .sort(([a, x], [b, y]) => cmp(y, x) || cmp(a, b))
      .slice(0, EMIT_LIMITS.newlySummarized)
      .map(([shiurId, updatedAt]) => ({ shiurId, updatedAt })),
  };
  put<"today">(dataPaths.today(), today);

  // ------------------------------------------------------------------ shiur/<id>.json, writeup/<id>.<lang>.json
  for (const s of shiurim) {
    const nb = agg.neighbours[s.id];
    const nav = nb?.series ?? nb?.section ?? null;
    const { notes, recordings, ...rest } = s;
    const file: ShiurFile = {
      schemaVersion: V,
      ...rest,
      recordings: recordings.map((r) => ({ ...r })),
      related: {
        sameOccasion: nb?.sameOccasion ?? [],
        prev: nav?.prev ?? null,
        next: nav?.next ?? null,
        neighbors: [],
      },
    };
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
      sibling: x.sibling,
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
  const listedWorks = agg.works.works.filter((w) => w.shiurCount > 0);
  const works: WorksFile = {
    schemaVersion: V,
    // The shelf: generic labels ("Gemara", "Midrash") are listed in facets, not shelved.
    works: listedWorks
      .filter((w) => !w.genre)
      .map((w) => ({ key: w.key, name: w.en, label: workLabel(w.key), count: w.shiurCount, mentions: w.mentionCount })),
  };
  put<"works">(dataPaths.works(), works);
  for (const w of listedWorks) {
    const file: WorkFile = {
      schemaVersion: V,
      key: w.key,
      name: w.en,
      label: workLabel(w.key),
      locations: w.refs.map((r) => ({ ref: r.label.en, sefariaRef: r.ref, citations: r.mentions.map(citation) })),
      unlocated: w.unlocated.map(citation),
    };
    put<"work">(dataPaths.work(w.key), file);
  }

  // ------------------------------------------------------------------ entity/{p,c,o}/<key>.json
  type Ent = { kind: EntityKind; key: string; label: FacetLabel; ids: string[]; moments: MomentRef[] };
  const ents: Ent[] = [];
  const entityMin = EMIT_LIMITS.entityFileMin;
  for (const p of agg.people.people) {
    const ids = sortByYear(p.shiurim.map((x) => x.id));
    if (ids.length < entityMin) continue;
    const moments = p.shiurim.flatMap((x) => x.stories.flatMap((id) => ref(id) ?? []));
    ents.push({ kind: "p", key: p.key, label: personLabel(p.key), ids, moments });
  }
  // Concepts: every browse concept (≥2 shiurim, not stop-listed). concepts.json (≥3) supplies the
  // chapters whose title names the term; a 2-shiur concept has its shiurim only.
  const conceptShiurim = new Map<string, string[]>();
  for (const s of shiurim) {
    for (const k of uniq((s.notes?.concepts ?? []).map((c) => c.key))) {
      if (browseConcepts.has(k)) conceptShiurim.set(k, [...(conceptShiurim.get(k) ?? []), s.id]);
    }
  }
  for (const [key, members] of [...conceptShiurim].sort(([a], [b]) => cmp(a, b))) {
    const ids = sortByYear(members);
    if (ids.length < entityMin) continue;
    const c = conceptByKey.get(key);
    const moments = (c?.shiurim ?? []).flatMap((x) => x.sections.flatMap((id) => ref(id) ?? []));
    ents.push({ kind: "c", key, label: conceptLabel(key), ids, moments });
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
    };
    put<"entity">(dataPaths.entity(e.kind, e.key), file);
  });

  // ------------------------------------------------------------------ stories.json
  const stories: StoriesFile = {
    schemaVersion: V,
    stories: agg.stories.stories.map((st) => ({
      id: st.id,
      shiurId: st.shiurId,
      title: { en: st.title.en, yi: st.title.yi },
      peopleKeys: st.peopleKeys,
      t: st.t,
      end: st.end,
      year: st.years[0] ?? null,
      lang: st.lang,
    })),
  };
  put<"stories">(dataPaths.stories(), stories);

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
  const docs = shiurim.map((shiur) => buildSearchDoc({ shiur, candidateTopics: [] }));
  for (const lang of EDS) put<"quickIndex">(dataPaths.quickIndex(lang), quickIndex(docs, lang));

  // ------------------------------------------------------------------ build.json, corpus.json
  const buildId = createHash("sha256")
    .update(JSON.stringify([info.buildId, EMITTER_VERSION, V]))
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
/** Stored for display without loading corpus.json: the catalog title as written. */
export const QUICK_INDEX_STORE_FIELDS = ["name"] as const;

type QuickDoc = { id: string; name: string } & Record<(typeof QUICK_INDEX_FIELDS)[number], string>;

function quickDoc(d: SearchDoc, lang: Ed): QuickDoc {
  const f = (xs: readonly (string | null | undefined)[]) =>
    xs
      .flatMap((x) => (x ? [foldForIndex(x)] : []))
      .filter((x) => x.length > 0)
      .join("\n");
  return {
    id: d.id,
    name: d.titleOriginal,
    title: f([d.titleOriginal, d.heading, d.subTitle]),
    occasion: f([...d.parsha, ...d.zman]),
    oneLiner: f([d.oneLiner?.[lang]]),
    sections: f(d.sections.map((s) => s.title[lang])),
    entities: f([...uniq(d.sources.map((s) => s.work)), ...d.people, ...d.concepts]),
  };
}

export function quickIndex(docs: readonly SearchDoc[], lang: Ed): QuickIndexFile {
  const options = {
    fields: [...QUICK_INDEX_FIELDS],
    storeFields: [...QUICK_INDEX_STORE_FIELDS],
    idField: "id",
  };
  const ms = new MiniSearch<QuickDoc>(options);
  ms.addAll([...docs].sort((a, b) => cmp(a.id, b.id)).map((d) => quickDoc(d, lang)));
  return { schemaVersion: V, lang, options, index: ms.toJSON() };
}

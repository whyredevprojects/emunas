/**
 * Derives a complete, contract-conforming `/data/` tree from projected `PublicShiur`s (the golden
 * outputs of `@emunas/corpus`), so wave-3/4 UI work can develop and test against realistic files
 * before W3.6 emits the real ones. Pure: no I/O, deterministic output.
 *
 * This is a fixture generator, not the production emitter: aggregates are computed naively from the
 * shiurim given (no normalize tables, no thresholds, no MiniSearch). W3.6 owns the real emit and must
 * produce the same shapes (`../types.ts`).
 */
import type { Ed, L, PublicShiur } from "@emunas/corpus/public";
import { dataFileOf, dataPaths } from "../paths.ts";
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
  type LiveRecording,
  type MomentKind,
  type MomentRef,
  type MomentRow,
  type MomentShardFile,
  type QuickIndexFile,
  type SeriesFile,
  type ShiurFile,
  type StoriesFile,
  type StoryRow,
  type TodayFile,
  type WorkCitation,
  type WorkFile,
  type WorksFile,
  type WriteupFile,
} from "../types.ts";

/** Input shiur: the public contract, optionally already carrying A1 `audioUrl`s. */
export type FixtureShiur = Omit<PublicShiur, "recordings"> & {
  recordings: (PublicShiur["recordings"][number] & { audioUrl?: string | null })[];
};

export interface DeriveOptions {
  /** Media host for recordings without an `audioUrl` (Amendment A1). */
  mediaOrigin: string;
  buildId: string;
  generatedAt: string;
  corpusSchemaVersion: number;
  /** Series titles (from `.corpus/index.json` in the real build). Missing ones fall back to the id. */
  seriesTitles?: Readonly<Record<string, L>>;
  /** Manifest `updatedAt` per shiur, for "newly summarized". */
  updatedAt?: Readonly<Record<string, string>>;
}

const V = LIVE_DATA_SCHEMA_VERSION;
const EDS: readonly Ed[] = ["en", "yi"];

const byYear = (rows: ReadonlyMap<string, FixtureShiur>) => (a: string, b: string) => {
  const ya = rows.get(a)?.years[0] ?? Number.POSITIVE_INFINITY;
  const yb = rows.get(b)?.years[0] ?? Number.POSITIVE_INFINITY;
  return ya - yb || a.localeCompare(b);
};

function sortedRecord<T>(entries: Iterable<[string, T]>): Record<string, T> {
  return Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function plainLabel(text: string): FacetLabel {
  return { en: text, yi: text };
}

/** Same scheme as the corpus build will use after A1: one encoded path segment per key segment. */
function fixtureAudioUrl(origin: string, recordingId: string): string {
  return `${origin.replace(/\/+$/, "")}/${encodeURIComponent(recordingId)}.mp3`;
}

function liveRecordings(s: FixtureShiur, origin: string): LiveRecording[] {
  return s.recordings.map((r) => ({
    id: r.id,
    order: r.order,
    offset: r.offset,
    duration: r.duration,
    audioUrl: r.audioUrl !== undefined ? r.audioUrl : fixtureAudioUrl(origin, r.id),
    transcript: { eligible: false },
  }));
}

function corpusRow(s: FixtureShiur): CorpusRow {
  const n = s.notes;
  return {
    id: s.id,
    rev: s.rev,
    lang: s.lang,
    category: s.category,
    status: s.status,
    title: s.catalog.titleOriginal,
    heading: s.catalog.heading ?? null,
    sectionTitle: s.catalog.sectionTitle,
    derived: s.catalog.derived,
    parsha: s.parsha?.key ?? null,
    zman: s.zman?.key ?? null,
    perek: s.perek,
    years: s.years,
    series: s.series ? { id: s.series.id, order: s.series.order } : null,
    duration: s.duration,
    oneLiner: n ? n.summary.oneLiner : null,
    entities: {
      works: n ? [...new Set(n.sources.flatMap((x) => (x.workKey ? [x.workKey] : [])))].sort() : [],
      people: n ? [...new Set(n.people.map((p) => p.key))].sort() : [],
      concepts: n ? [...new Set(n.concepts.map((c) => c.key))].sort() : [],
    },
    counts: {
      chapters: n?.chapters.length ?? 0,
      stories: n?.stories.length ?? 0,
      questions: n?.questions.length ?? 0,
      insights: n?.insights.length ?? 0,
    },
  };
}

function momentRefs(s: FixtureShiur, kinds: readonly MomentKind[]): MomentRef[] {
  const n = s.notes;
  if (!n) return [];
  const out: MomentRef[] = [];
  const add = (kind: MomentKind, id: string, t: number | null, end: number | null) => {
    if (kinds.includes(kind)) out.push({ id, shiurId: s.id, kind, t, end });
  };
  for (const c of n.chapters) add("s", c.id, c.t, c.end);
  for (const k of n.summary.keyPoints) add("kp", k.id, k.t, k.end);
  for (const i of n.insights) add("i", i.id, i.t, i.end);
  for (const q of n.questions) add("q", q.id, q.tq, q.ta);
  for (const st of n.stories) add("st", st.id, st.t, st.end);
  for (const tk of n.takeaways) add("tk", tk.id, tk.t, tk.end);
  return out;
}

function momentRows(s: FixtureShiur, lang: Ed): MomentRow[] {
  const n = s.notes;
  if (!n) return [];
  const rows: MomentRow[] = [];
  for (const c of n.chapters) {
    rows.push({ id: c.id, shiurId: s.id, kind: "s", t: c.t, end: c.end, title: c.title[lang], sectionKind: c.kind });
  }
  for (const k of n.summary.keyPoints)
    rows.push({ id: k.id, shiurId: s.id, kind: "kp", t: k.t, end: k.end, title: k.text[lang] });
  for (const i of n.insights)
    rows.push({ id: i.id, shiurId: s.id, kind: "i", t: i.t, end: i.end, title: i.text[lang] });
  for (const q of n.questions) rows.push({ id: q.id, shiurId: s.id, kind: "q", t: q.tq, end: q.ta, title: q.q[lang] });
  for (const st of n.stories)
    rows.push({ id: st.id, shiurId: s.id, kind: "st", t: st.t, end: st.end, title: st.title[lang] });
  for (const tk of n.takeaways)
    rows.push({ id: tk.id, shiurId: s.id, kind: "tk", t: tk.t, end: tk.end, title: tk.text[lang] });
  return rows;
}

/** Derives every `/data/` file. Keys are data file paths relative to `/data/` (e.g. `shiur/<id>.json`). */
export function deriveLiveData(input: readonly FixtureShiur[], opts: DeriveOptions): Map<string, unknown> {
  const shiurim = [...input].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(shiurim.map((s) => [s.id, s]));
  const files = new Map<string, unknown>();
  const put = (urlPath: string, body: unknown) => {
    const file = dataFileOf(urlPath);
    if (file === null) throw new Error(`not a data path: ${urlPath}`);
    files.set(file, body);
  };

  const counts = {
    total: shiurim.length,
    full: shiurim.filter((s) => s.status === "full").length,
    catalogOnly: shiurim.filter((s) => s.status === "catalog-only").length,
    downgraded: 0,
  };

  // corpus.json
  const corpus: CorpusFile = { schemaVersion: V, buildId: opts.buildId, counts, shiurim: shiurim.map(corpusRow) };
  put(dataPaths.corpus(), corpus);

  // occasions (parsha + zman share one namespace)
  const occasions = new Map<string, { type: "parsha" | "zman"; raw: string; ids: string[] }>();
  for (const s of shiurim) {
    for (const [type, v] of [
      ["parsha", s.parsha],
      ["zman", s.zman],
    ] as const) {
      if (!v) continue;
      const o = occasions.get(v.key) ?? { type, raw: v.raw, ids: [] };
      o.ids.push(s.id);
      occasions.set(v.key, o);
    }
  }
  for (const o of occasions.values()) o.ids.sort(byYear(byId));

  // entity aggregates
  type Agg = { label: FacetLabel; ids: Set<string>; moments: MomentRef[] };
  const ents: Record<"person" | "concept" | "work", Map<string, Agg>> = {
    person: new Map(),
    concept: new Map(),
    work: new Map(),
  };
  const agg = (kind: keyof typeof ents, key: string, label: FacetLabel): Agg => {
    let a = ents[kind].get(key);
    if (!a) {
      a = { label, ids: new Set(), moments: [] };
      ents[kind].set(key, a);
    }
    return a;
  };
  type WorkAgg = {
    name: string;
    located: Map<string, { sefariaRef: string | null; c: WorkCitation[] }>;
    unlocated: WorkCitation[];
    mentions: number;
  };
  const citations = new Map<string, WorkAgg>();
  for (const s of shiurim) {
    const n = s.notes;
    if (!n) continue;
    for (const p of n.people) agg("person", p.key, plainLabel(p.name)).ids.add(s.id);
    for (const c of n.concepts) agg("concept", c.key, { en: c.he, yi: c.he, he: c.he }).ids.add(s.id);
    for (const st of n.stories) {
      for (const k of st.peopleKeys) {
        const a = ents.person.get(k);
        a?.moments.push({ id: st.id, shiurId: s.id, kind: "st", t: st.t, end: st.end });
      }
    }
    for (const src of n.sources) {
      if (!src.workKey || src.work === null) continue;
      agg("work", src.workKey, plainLabel(src.work)).ids.add(s.id);
      const w: WorkAgg = citations.get(src.workKey) ?? {
        name: src.work,
        located: new Map(),
        unlocated: [],
        mentions: 0,
      };
      const cite: WorkCitation = {
        shiurId: s.id,
        sourceId: src.id,
        t: src.t,
        mention: src.mention,
        resolution: src.resolution,
      };
      w.mentions++;
      if (src.ref) {
        const loc = w.located.get(src.ref) ?? { sefariaRef: src.sefariaRef, c: [] };
        loc.c.push(cite);
        w.located.set(src.ref, loc);
      } else {
        w.unlocated.push(cite);
      }
      citations.set(src.workKey, w);
    }
  }

  // facets.json
  const count = (label: FacetLabel, n: number): FacetValue => ({ label, count: n });
  const categories = new Map<string, number>();
  const years = new Map<string, number>();
  for (const s of shiurim) {
    categories.set(s.category, (categories.get(s.category) ?? 0) + 1);
    const ys = s.years.length ? s.years.map(String) : ["unknown"];
    for (const y of ys) years.set(y, (years.get(y) ?? 0) + 1);
  }
  const seriesIds = [...new Set(shiurim.flatMap((s) => (s.series ? [s.series.id] : [])))].sort();
  const seriesTitle = (id: string): L => opts.seriesTitles?.[id] ?? { en: id, yi: id };
  const siblingOf = (id: string): string | null => {
    const base = id.replace(/-(yi|en)$/, "");
    const other = seriesIds.find((x) => x !== id && x.replace(/-(yi|en)$/, "") === base);
    return other ?? null;
  };
  const facets: FacetsFile = {
    schemaVersion: V,
    category: Object.fromEntries([...categories].sort().map(([k, n]) => [k, count(plainLabel(k), n)])),
    lang: {
      en: count({ en: "English", yi: "ענגליש" }, shiurim.filter((s) => s.lang === "en").length),
      yi: count({ en: "Yiddish", yi: "אידיש" }, shiurim.filter((s) => s.lang === "yi").length),
    },
    occasion: sortedRecord(
      [...occasions].map(([k, o]) => [
        k,
        { label: { en: o.raw, yi: o.raw, he: o.raw }, count: o.ids.length, type: o.type },
      ]),
    ),
    year: sortedRecord([...years].map(([k, n]) => [k, count(plainLabel(k), n)])),
    series: sortedRecord(
      seriesIds.map((id) => {
        const members = shiurim.filter((s) => s.series?.id === id);
        return [id, { label: seriesTitle(id), count: members.length, lang: members[0]!.lang, sibling: siblingOf(id) }];
      }),
    ),
    work: sortedRecord([...ents.work].map(([k, a]) => [k, count(a.label, a.ids.size)])),
    person: sortedRecord([...ents.person].map(([k, a]) => [k, count(a.label, a.ids.size)])),
    concept: sortedRecord([...ents.concept].map(([k, a]) => [k, count(a.label, a.ids.size)])),
  };
  put(dataPaths.facets(), facets);

  // today.json
  const today: TodayFile = {
    schemaVersion: V,
    occasions: sortedRecord(
      [...occasions].map(([k, o]) => [
        k,
        { shiurIds: o.ids, moments: o.ids.flatMap((id) => momentRefs(byId.get(id)!, ["i", "st", "q"])) },
      ]),
    ),
    newlySummarized: Object.entries(opts.updatedAt ?? {})
      .filter(([id]) => byId.get(id)?.status === "full")
      .sort(([a, x], [b, y]) => (x < y ? 1 : x > y ? -1 : a.localeCompare(b)))
      .map(([shiurId, updatedAt]) => ({ shiurId, updatedAt })),
  };
  put(dataPaths.today(), today);

  // shiur/<id>.json and writeup/<id>.<lang>.json
  for (const s of shiurim) {
    const { notes, recordings: _r, ...rest } = s;
    const occasionKey = s.parsha?.key ?? s.zman?.key ?? null;
    const same = occasionKey ? (occasions.get(occasionKey)?.ids ?? []).filter((x) => x !== s.id) : [];
    const order = shiurim.filter((x) => x.series && s.series && x.series.id === s.series.id);
    order.sort((a, b) => (a.series!.order ?? 1e9) - (b.series!.order ?? 1e9) || a.id.localeCompare(b.id));
    const pos = order.findIndex((x) => x.id === s.id);
    const file: ShiurFile = {
      schemaVersion: V,
      ...rest,
      recordings: liveRecordings(s, opts.mediaOrigin),
      related: {
        sameOccasion: same,
        prev: pos > 0 ? order[pos - 1]!.id : null,
        next: pos >= 0 && pos < order.length - 1 ? order[pos + 1]!.id : null,
        neighbors: [],
      },
    };
    if (notes) {
      const { writeup, ...without } = notes;
      const langs = EDS.filter((l) => writeup[l].length > 0);
      file.notes = { ...without, writeupLangs: langs };
      for (const l of langs) {
        const w: WriteupFile = { schemaVersion: V, shiurId: s.id, rev: s.rev, lang: l, blocks: writeup[l] };
        put(dataPaths.writeup(s.id, l), w);
      }
    }
    put(dataPaths.shiur(s.id), file);
  }

  // series/<id>.json
  for (const id of seriesIds) {
    const members = shiurim
      .filter((s) => s.series?.id === id)
      .sort((a, b) => (a.series!.order ?? 1e9) - (b.series!.order ?? 1e9) || a.id.localeCompare(b.id));
    const perek = new Map<string, string[]>();
    for (const m of members) {
      if (m.perek === null) continue;
      perek.set(m.perek, [...(perek.get(m.perek) ?? []), m.id]);
    }
    const file: SeriesFile = {
      schemaVersion: V,
      id,
      title: seriesTitle(id),
      lang: members[0]!.lang,
      sibling: siblingOf(id),
      parts: members.map((m) => ({
        shiurId: m.id,
        order: m.series!.order,
        title: m.catalog.titleOriginal,
        oneLiner: m.notes?.summary.oneLiner ?? null,
        duration: m.duration,
        years: m.years,
        status: m.status,
        perek: m.perek,
      })),
      perekGroups: [...perek].map(([p, ids]) => ({ perek: p, shiurIds: ids })),
    };
    put(dataPaths.series(id), file);
  }

  // works.json and work/<key>.json
  const workKeys = [...citations.keys()].sort();
  const works: WorksFile = {
    schemaVersion: V,
    works: workKeys.map((k) => {
      const w = citations.get(k)!;
      const a = ents.work.get(k)!;
      return { key: k, name: w.name, label: a.label, count: a.ids.size, mentions: w.mentions };
    }),
  };
  put(dataPaths.works(), works);
  for (const k of workKeys) {
    const w = citations.get(k)!;
    const file: WorkFile = {
      schemaVersion: V,
      key: k,
      name: w.name,
      label: ents.work.get(k)!.label,
      locations: [...w.located].map(([ref, l]) => ({ ref, sefariaRef: l.sefariaRef, citations: l.c })),
      unlocated: w.unlocated,
    };
    put(dataPaths.work(k), file);
  }

  // entity/{p,c,o}/<key>.json (fixtures: every entity; the real emit applies the ≥2 threshold)
  const entityFile = (
    kind: EntityKind,
    key: string,
    label: FacetLabel,
    ids: string[],
    moments: MomentRef[],
  ): EntityFile => {
    const sorted = [...ids].sort(byYear(byId));
    const hist = new Map<string, number>();
    for (const id of sorted) {
      const ys = byId.get(id)!.years;
      for (const y of ys.length ? ys.map(String) : ["unknown"]) hist.set(y, (hist.get(y) ?? 0) + 1);
    }
    return { schemaVersion: V, kind, key, label, shiurIds: sorted, years: sortedRecord(hist), moments, related: [] };
  };
  for (const [key, a] of ents.person)
    put(dataPaths.entity("p", key), entityFile("p", key, a.label, [...a.ids], a.moments));
  for (const [key, a] of ents.concept)
    put(dataPaths.entity("c", key), entityFile("c", key, a.label, [...a.ids], a.moments));
  for (const [key, o] of occasions) {
    put(
      dataPaths.entity("o", key),
      entityFile("o", key, { en: o.raw, yi: o.raw, he: o.raw }, o.ids, today.occasions[key]?.moments ?? []),
    );
  }

  // stories.json
  const stories: StoryRow[] = shiurim.flatMap((s) =>
    (s.notes?.stories ?? []).map((st) => ({
      id: st.id,
      shiurId: s.id,
      title: st.title,
      peopleKeys: st.peopleKeys,
      t: st.t,
      end: st.end,
      year: s.years[0] ?? null,
      lang: s.lang,
    })),
  );
  const storiesFile: StoriesFile = { schemaVersion: V, stories };
  put(dataPaths.stories(), storiesFile);

  // moments/<lang>-<n>.json
  const shards: Record<Ed, number> = { en: 0, yi: 0 };
  for (const lang of EDS) {
    const rows = shiurim.flatMap((s) => momentRows(s, lang));
    const n = Math.max(1, Math.ceil(rows.length / MOMENT_SHARD_SIZE));
    shards[lang] = n;
    for (let i = 0; i < n; i++) {
      const shard: MomentShardFile = {
        schemaVersion: V,
        lang,
        shard: i,
        moments: rows.slice(i * MOMENT_SHARD_SIZE, (i + 1) * MOMENT_SHARD_SIZE),
      };
      put(dataPaths.moments(lang, i), shard);
    }
  }

  // quick-index.<lang>.json: a placeholder index (W3.6 serializes a real MiniSearch).
  for (const lang of EDS) {
    const q: QuickIndexFile = {
      schemaVersion: V,
      lang,
      options: { fields: ["title", "oneLiner"], storeFields: ["title"], idField: "id" },
      index: {
        fixture: true,
        documents: shiurim.map((s) => ({
          id: s.id,
          title: s.catalog.titleOriginal,
          oneLiner: s.notes?.summary.oneLiner[lang] ?? "",
        })),
      },
    };
    put(dataPaths.quickIndex(lang), q);
  }

  // build.json
  const build: BuildFile = {
    schemaVersion: V,
    corpusSchemaVersion: opts.corpusSchemaVersion,
    buildId: opts.buildId,
    dataSha: null,
    generatedAt: opts.generatedAt,
    counts,
    momentShards: shards,
  };
  put(dataPaths.build(), build);

  return files;
}

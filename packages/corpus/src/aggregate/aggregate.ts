/**
 * Aggregated indexes over the projected corpus (integration-plan §5.1, W2.1): sections, catalog
 * neighbours, series, occasions, years, works, people, concepts, stories and entity counts.
 *
 * Pure: takes the projected shiurim and index (keys already produced by the Keyer) and the
 * @emunas/normalize tables; no I/O. Never throws on data: a value the tables do not know lands in
 * an "other"/unmapped bucket (the projector has already reported it), and summary counts of what
 * was left out go to `warnings`.
 */
import {
  CONCEPT_MIN_SHIURIM,
  OCCASIONS,
  OTHER_OCCASION_KEY,
  PARSHIYOS,
  compareSortKeys,
  compareWorks,
  foldBasic,
  lookupConcept,
  lookupParsha,
  lookupZman,
  parseSefariaRef,
  personByKey,
  refLabel,
  workByKey,
  type Work,
} from "@emunas/normalize";
import { ENTITY_THRESHOLDS } from "../public/index.ts";
import type { CorpusIndex, PublicShiur } from "../public/types.ts";
import { UNPLACED, parshaPosition, zmanPosition } from "./calendar-order.ts";
import type {
  Aggregates,
  ConceptEntry,
  ConceptsFile,
  EntitiesFile,
  EntityCount,
  MentionRef,
  Neighbours,
  NeighboursFile,
  OccasionShiurRef,
  OccasionsFile,
  ParshaOccasion,
  PeopleFile,
  PersonEntry,
  SectionListing,
  SectionsFile,
  SeriesEntry,
  SeriesFile,
  StoriesFile,
  StoryEntry,
  WorkEntry,
  WorkRef,
  WorksFile,
  YearsFile,
  ZmanOccasion,
} from "./types.ts";

export interface AggregateInput {
  shiurim: readonly PublicShiur[];
  index: CorpusIndex;
  /** Source moment id → merged corpus work id (corpus layer, C1.2); absent → every `workId` is null. */
  sourceWorkIds?: ReadonlyMap<string, string>;
}

export interface AggregateResult {
  files: Aggregates;
  /** Summary lines for build-report `warnings` (counts and keys only, never item text). */
  warnings: string[];
}

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Context shared by the aggregators: catalog order and year sort. */
class Ctx {
  readonly byId: Map<string, PublicShiur>;
  readonly pos: Map<string, number>;
  readonly ordered: PublicShiur[];
  readonly input: AggregateInput;

  constructor(input: AggregateInput) {
    this.input = input;
    this.byId = new Map(input.shiurim.map((s) => [s.id, s]));
    this.pos = new Map(input.index.shiurim.map((r, i) => [r.id, i]));
    // Shiurim missing from the index (should not happen) sort after the rest, by id.
    this.ordered = [...input.shiurim].sort((a, b) => this.cmpCatalog(a.id, b.id));
  }

  cmpCatalog = (a: string, b: string): number =>
    (this.pos.get(a) ?? Number.MAX_SAFE_INTEGER) - (this.pos.get(b) ?? Number.MAX_SAFE_INTEGER) || cmpStr(a, b);

  firstYear(id: string): number {
    const ys = this.byId.get(id)?.years ?? [];
    return ys.length > 0 ? Math.min(...ys) : Number.POSITIVE_INFINITY;
  }

  /** By earliest year (undated last), then catalog order. */
  cmpYear = (a: string, b: string): number => {
    const ya = this.firstYear(a);
    const yb = this.firstYear(b);
    if (ya !== yb) return ya < yb ? -1 : 1;
    return this.cmpCatalog(a, b);
  };
}

/** True when the shiur's parsha/zman is a guess from a file name or directory (decision 7). */
export function isGuessedOccasion(s: PublicShiur): boolean {
  return s.catalog.derived === "filename" || s.catalog.derived === "dir-prefix";
}

// ---------------------------------------------------------------- sections + neighbours

function sections(c: Ctx): SectionsFile {
  const lists = new Map<string, string[]>();
  for (const s of c.ordered) {
    const key = `${s.catalog.source}:${s.catalog.sectionId}`;
    const l = lists.get(key) ?? [];
    l.push(s.id);
    lists.set(key, l);
  }
  const out: SectionListing[] = c.input.index.sections.map((x) => {
    const ids = lists.get(x.key) ?? [];
    return { key: x.key, source: x.source, id: x.id, title: x.title, order: x.order, count: ids.length, shiurIds: ids };
  });
  return { sections: out };
}

function nav(of: string, ids: readonly string[], id: string): Neighbours["section"] | null {
  const i = ids.indexOf(id);
  if (i < 0) return null;
  return { of, pos: i + 1, count: ids.length, prev: ids[i - 1] ?? null, next: ids[i + 1] ?? null };
}

function occasionKeysOf(s: PublicShiur): string[] {
  if (isGuessedOccasion(s)) return [];
  const keys: string[] = [];
  for (const v of [s.parsha, s.zman]) if (v && v.key !== OTHER_OCCASION_KEY) keys.push(v.key);
  return keys;
}

function neighbours(c: Ctx, sec: SectionsFile, series: SeriesFile): NeighboursFile {
  const bySection = new Map(sec.sections.map((x) => [x.key, x]));
  const seriesById = new Map(series.series.map((x) => [x.id, x.parts.map((p) => p.id)]));
  const byOccasion = new Map<string, string[]>();
  for (const s of c.ordered) {
    for (const k of occasionKeysOf(s)) {
      const l = byOccasion.get(k) ?? [];
      l.push(s.id);
      byOccasion.set(k, l);
    }
  }
  for (const l of byOccasion.values()) l.sort(c.cmpYear);

  const out: NeighboursFile = {};
  for (const s of c.ordered) {
    const key = `${s.catalog.source}:${s.catalog.sectionId}`;
    const section = nav(key, bySection.get(key)?.shiurIds ?? [s.id], s.id) ?? { of: key, pos: 1, count: 1, prev: null, next: null };
    const sid = s.series?.id ?? null;
    const seriesNav = sid !== null ? nav(sid, seriesById.get(sid) ?? [], s.id) : null;
    const same = new Set<string>();
    for (const k of occasionKeysOf(s)) for (const id of byOccasion.get(k) ?? []) if (id !== s.id) same.add(id);
    out[s.id] = { section, series: seriesNav, sameOccasion: [...same].sort(c.cmpYear) };
  }
  return out;
}

// ---------------------------------------------------------------- series

function seriesFile(c: Ctx): SeriesFile {
  const all = c.input.index.series;
  const ids = new Set(all.map((x) => x.id));
  const out: SeriesEntry[] = all.map((x) => {
    const parts = x.shiurIds
      .map((id) => c.byId.get(id))
      .filter((s): s is PublicShiur => s !== undefined)
      .map((s) => ({ id: s.id, order: s.series?.order ?? null, perek: s.perek, lang: s.lang, status: s.status }));
    const m = /^(.*)-(yi|en)$/.exec(x.id);
    const siblingId = m ? `${m[1]}-${m[2] === "yi" ? "en" : "yi"}` : null;
    let groups: SeriesEntry["groups"] = null;
    if (parts.some((p) => p.perek !== null)) {
      // Consecutive runs of the same perek (quote marks folded), so the groups keep series order.
      const fold = (x: string | null) => (x === null ? null : foldBasic(x));
      groups = [];
      for (const p of parts) {
        const last = groups[groups.length - 1];
        if (last && fold(last.perek) === fold(p.perek)) last.shiurIds.push(p.id);
        else groups.push({ perek: p.perek, shiurIds: [p.id] });
      }
    }
    return {
      id: x.id,
      title: { en: x.title.en, yi: x.title.yi },
      lang: x.lang,
      catalogSectionIds: [...x.catalogSectionIds],
      count: parts.length,
      sibling: siblingId !== null && ids.has(siblingId) ? siblingId : null,
      parts,
      groups,
    };
  });
  return { series: out };
}

// ---------------------------------------------------------------- occasions

function occasions(c: Ctx): { file: OccasionsFile; counts: Map<string, number> } {
  const parsha = new Map<string, OccasionShiurRef[]>();
  const zman = new Map<string, { main: OccasionShiurRef[]; seudah: OccasionShiurRef[]; lechaim: OccasionShiurRef[] }>();
  const other: OccasionShiurRef[] = [];
  let guesses = 0;
  for (const s of c.ordered) {
    if (s.parsha === null && s.zman === null) continue;
    if (isGuessedOccasion(s)) {
      guesses++;
      continue;
    }
    if (s.parsha) {
      const m = lookupParsha(s.parsha.raw);
      const ref: OccasionShiurRef = { id: s.id, lang: s.lang, years: [...s.years], raw: s.parsha.raw, audience: m.audience };
      if (s.parsha.key === OTHER_OCCASION_KEY) other.push(ref);
      else {
        const l = parsha.get(s.parsha.key) ?? [];
        l.push(ref);
        parsha.set(s.parsha.key, l);
      }
    }
    if (s.zman) {
      const m = lookupZman(s.zman.raw);
      const ref: OccasionShiurRef = { id: s.id, lang: s.lang, years: [...s.years], raw: s.zman.raw, audience: m.audience };
      if (s.zman.key === OTHER_OCCASION_KEY) other.push(ref);
      else {
        const e = zman.get(s.zman.key) ?? { main: [], seudah: [], lechaim: [] };
        (m.sub === null ? e.main : e[m.sub]).push(ref);
        zman.set(s.zman.key, e);
      }
    }
  }
  const byYear = (l: OccasionShiurRef[]) => l.sort((a, b) => c.cmpYear(a.id, b.id));
  const counts = new Map<string, number>();

  const parshiyos: ParshaOccasion[] = PARSHIYOS.map((p) => {
    const l = byYear(parsha.get(p.key) ?? []);
    parsha.delete(p.key);
    counts.set(p.key, l.length);
    return { key: p.key, order: p.order, chumash: p.chumash, he: p.he, yi: p.yi, en: p.en, parts: p.parts ? [p.parts[0], p.parts[1]] : null, count: l.length, shiurim: l };
  });
  const zmanim: ZmanOccasion[] = OCCASIONS.map((o) => {
    const e = zman.get(o.key) ?? { main: [], seudah: [], lechaim: [] };
    zman.delete(o.key);
    const subs: ZmanOccasion["subs"] = [];
    if (e.seudah.length > 0) subs.push({ sub: "seudah", shiurim: byYear(e.seudah) });
    if (e.lechaim.length > 0) subs.push({ sub: "lechaim", shiurim: byYear(e.lechaim) });
    const count = e.main.length + e.seudah.length + e.lechaim.length;
    counts.set(o.key, count);
    return { key: o.key, order: o.order, he: o.he, yi: o.yi, en: o.en, count, shiurim: byYear(e.main), subs };
  });
  // Keys the tables do not list (a Keyer other than normalize): keep them visible under "other".
  for (const l of parsha.values()) other.push(...l);
  for (const e of zman.values()) other.push(...e.main, ...e.seudah, ...e.lechaim);
  other.sort((a, b) => c.cmpYear(a.id, b.id) || cmpStr(a.raw, b.raw));
  return { file: { parshiyos, zmanim, other, excluded: { uncataloguedGuesses: guesses } }, counts };
}

// ---------------------------------------------------------------- years

/** Position inside a year: parsha/zman calendar position (guesses unplaced), then catalog order. */
function yearPosition(s: PublicShiur): number {
  if (isGuessedOccasion(s)) return UNPLACED;
  const ps = [s.parsha ? parshaPosition(s.parsha.key) : UNPLACED, s.zman ? zmanPosition(s.zman.key) : UNPLACED];
  return Math.min(...ps);
}

function years(c: Ctx): YearsFile {
  const by = new Map<number, string[]>();
  const unknown: string[] = [];
  for (const s of c.ordered) {
    if (s.years.length === 0) unknown.push(s.id);
    for (const y of new Set(s.years)) {
      const l = by.get(y) ?? [];
      l.push(s.id);
      by.set(y, l);
    }
  }
  const posOf = new Map(c.ordered.map((s) => [s.id, yearPosition(s)]));
  const inYear = (a: string, b: string) => (posOf.get(a) ?? UNPLACED) - (posOf.get(b) ?? UNPLACED) || c.cmpCatalog(a, b);
  return {
    years: [...by.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, ids]) => ({ year, count: ids.length, shiurIds: ids.sort(inYear) })),
    unknown: { count: unknown.length, shiurIds: unknown },
  };
}

// ---------------------------------------------------------------- works

interface WorkAcc {
  key: string;
  names: Map<string, number>;
  shiurim: Set<string>;
  mentions: number;
  refs: Map<string, { ref: string; label: { en: string; he: string }; sortKey: number[]; mentions: MentionRef[] }>;
  unlocated: MentionRef[];
}

function mostUsed(names: Map<string, number>): string {
  return [...names.entries()].sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]))[0]?.[0] ?? "";
}

/** The corpus work most of an entry's mentions resolve to (ties: the smaller id). */
function corpusWorkOf(w: WorkAcc, sourceWorkIds: ReadonlyMap<string, string> | undefined): string | null {
  if (!sourceWorkIds) return null;
  const tally = new Map<string, number>();
  for (const m of [...[...w.refs.values()].flatMap((r) => r.mentions), ...w.unlocated]) {
    const id = sourceWorkIds.get(m.id);
    if (id !== undefined) tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]))[0]?.[0] ?? null;
}

function works(c: Ctx): { file: WorksFile; unparsedRefs: number } {
  const acc = new Map<string, WorkAcc>();
  let unparsedRefs = 0;
  for (const s of c.ordered) {
    for (const src of s.notes?.sources ?? []) {
      const parsed = src.sefariaRef !== null && src.sefariaRef.trim() !== "" ? parseSefariaRef(src.sefariaRef) : null;
      if (parsed && !parsed.ok) unparsedRefs++;
      // A generic label ("Gemara", "Midrash") with a parseable ref is filed under the ref's work.
      const parsedKey = parsed?.ok ? parsed.workKey : null;
      const key = src.workKey !== null && !(parsedKey !== null && workByKey(src.workKey)?.genre === true) ? src.workKey : parsedKey;
      if (key === null) continue;
      let w = acc.get(key);
      if (!w) acc.set(key, (w = { key, names: new Map(), shiurim: new Set(), mentions: 0, refs: new Map(), unlocated: [] }));
      const name = src.work ?? (parsed?.ok ? parsed.en : key);
      w.names.set(name, (w.names.get(name) ?? 0) + 1);
      w.shiurim.add(s.id);
      w.mentions++;
      const m: MentionRef = { shiurId: s.id, id: src.id, t: src.t, resolution: src.resolution, mention: src.mention, ref: src.ref };
      if (src.soft) m.soft = true;
      if (parsed?.ok && src.sefariaRef !== null && src.resolution !== "unresolved") {
        let r = w.refs.get(src.sefariaRef);
        if (!r) {
          r = { ref: src.sefariaRef, label: { en: refLabel(parsed, "en"), he: refLabel(parsed, "he") }, sortKey: [...parsed.sortKey], mentions: [] };
          w.refs.set(src.sefariaRef, r);
        }
        r.mentions.push(m);
      } else {
        w.unlocated.push(m);
      }
    }
  }
  const byMention = (a: MentionRef, b: MentionRef) => c.cmpYear(a.shiurId, b.shiurId) || cmpStr(a.id, b.id);
  const entries: { e: WorkEntry; work: Work | null }[] = [...acc.values()].map((w) => {
    const work = workByKey(w.key);
    const refs: WorkRef[] = [...w.refs.values()]
      .sort((a, b) => compareSortKeys(a.sortKey, b.sortKey) || cmpStr(a.ref, b.ref))
      .map((r) => ({ ...r, mentions: r.mentions.sort(byMention) }));
    const e: WorkEntry = {
      key: w.key,
      workId: corpusWorkOf(w, c.input.sourceWorkIds),
      mapped: work !== null,
      group: work?.group ?? null,
      order: work?.order ?? null,
      he: work?.he ?? null,
      yi: work?.yi ?? null,
      en: work?.en ?? mostUsed(w.names),
      sefaria: work ? [...work.sefaria] : [],
      scheme: work?.scheme ?? "none",
      genre: work?.genre ?? false,
      names: [...w.names.keys()].sort(cmpStr),
      shiurCount: w.shiurim.size,
      mentionCount: w.mentions,
      refs,
      unlocated: w.unlocated.sort(byMention),
    };
    return { e, work };
  });
  entries.sort((a, b) => {
    if (a.work && b.work) return compareWorks(a.work, b.work) || cmpStr(a.e.key, b.e.key);
    if (a.work) return -1;
    if (b.work) return 1;
    return cmpStr(a.e.key, b.e.key);
  });
  return { file: { works: entries.map((x) => x.e) }, unparsedRefs };
}

// ---------------------------------------------------------------- people

function people(c: Ctx): PeopleFile {
  const acc = new Map<string, { names: Map<string, number>; shiurim: Map<string, { mentioned: boolean; stories: string[] }> }>();
  const get = (key: string, sid: string, name: string) => {
    let p = acc.get(key);
    if (!p) acc.set(key, (p = { names: new Map(), shiurim: new Map() }));
    p.names.set(name, (p.names.get(name) ?? 0) + 1);
    let e = p.shiurim.get(sid);
    if (!e) p.shiurim.set(sid, (e = { mentioned: false, stories: [] }));
    return e;
  };
  for (const s of c.ordered) {
    const n = s.notes;
    if (!n) continue;
    for (const p of n.people) get(p.key, s.id, p.name).mentioned = true;
    for (const st of n.stories) {
      st.peopleKeys.forEach((key, i) => {
        const e = get(key, s.id, st.people[i] ?? key);
        if (!e.stories.includes(st.id)) e.stories.push(st.id);
      });
    }
  }
  const out: PersonEntry[] = [...acc.entries()].map(([key, p]) => {
    const person = personByKey(key);
    return {
      key,
      mapped: person !== null,
      en: person?.en ?? mostUsed(p.names),
      he: person?.he ?? null,
      names: [...p.names.keys()].sort(cmpStr),
      shiurCount: p.shiurim.size,
      shiurim: [...p.shiurim.entries()]
        .sort((a, b) => c.cmpCatalog(a[0], b[0]))
        .map(([id, e]) => ({ id, mentioned: e.mentioned, stories: e.stories })),
    };
  });
  out.sort((a, b) => cmpStr(foldBasic(a.en), foldBasic(b.en)) || cmpStr(a.key, b.key));
  return { people: out };
}

// ---------------------------------------------------------------- concepts

function concepts(c: Ctx): { file: ConceptsFile; all: { key: string; shiurim: number }[] } {
  const acc = new Map<string, { he: string; variants: Set<string>; shiurim: Map<string, string[]>; stop: boolean }>();
  for (const s of c.ordered) {
    const n = s.notes;
    if (!n) continue;
    for (const x of n.concepts) {
      const m = lookupConcept(x.he);
      let e = acc.get(x.key);
      if (!e) acc.set(x.key, (e = { he: m.he, variants: new Set(), shiurim: new Map(), stop: m.stop }));
      e.variants.add(x.he);
      if (!e.shiurim.has(s.id)) {
        const term = foldBasic(m.he);
        const sections = term.length === 0 ? [] : n.chapters.filter((ch) => foldBasic(ch.title.yi).includes(term)).map((ch) => ch.id);
        e.shiurim.set(s.id, sections);
      }
    }
  }
  let stopListed = 0;
  let belowThreshold = 0;
  const listed: ConceptEntry[] = [];
  const all: { key: string; shiurim: number }[] = [];
  for (const [key, e] of acc) {
    if (e.stop) {
      stopListed++;
      continue;
    }
    all.push({ key, shiurim: e.shiurim.size });
    if (e.shiurim.size < CONCEPT_MIN_SHIURIM) {
      belowThreshold++;
      continue;
    }
    listed.push({
      key,
      he: e.he,
      variants: [...e.variants].sort(cmpStr),
      shiurCount: e.shiurim.size,
      shiurim: [...e.shiurim.entries()].sort((a, b) => c.cmpCatalog(a[0], b[0])).map(([id, sections]) => ({ id, sections })),
    });
  }
  listed.sort((a, b) => cmpStr(foldBasic(a.he), foldBasic(b.he)) || cmpStr(a.key, b.key));
  all.sort((a, b) => cmpStr(a.key, b.key));
  return { file: { minShiurim: CONCEPT_MIN_SHIURIM, omitted: { stopListed, belowThreshold }, concepts: listed }, all };
}

// ---------------------------------------------------------------- stories

function stories(c: Ctx, peopleFile: PeopleFile): StoriesFile {
  const list: StoryEntry[] = [];
  for (const s of c.ordered) {
    for (const st of s.notes?.stories ?? []) {
      const e: StoryEntry = {
        id: st.id,
        shiurId: s.id,
        lang: s.lang,
        years: [...s.years],
        title: { en: st.title.en, yi: st.title.yi },
        people: [...st.people],
        peopleKeys: [...st.peopleKeys],
        t: st.t,
        end: st.end,
      };
      if (st.soft) e.soft = true;
      list.push(e);
    }
  }
  const groups = new Map<string | null, string[]>();
  for (const st of list) {
    const k = st.peopleKeys[0] ?? null;
    const l = groups.get(k) ?? [];
    l.push(st.id);
    groups.set(k, l);
  }
  const rank = new Map(peopleFile.people.map((p, i) => [p.key, i]));
  const byPerson = [...groups.entries()]
    .sort((a, b) => {
      if (a[0] === null) return b[0] === null ? 0 : 1;
      if (b[0] === null) return -1;
      return (rank.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b[0]) ?? Number.MAX_SAFE_INTEGER) || cmpStr(a[0], b[0]);
    })
    .map(([key, storyIds]) => ({ key, storyIds }));
  return { stories: list, byPerson };
}

// ---------------------------------------------------------------- entities

function entities(
  w: WorksFile,
  p: PeopleFile,
  conceptCounts: { key: string; shiurim: number }[],
  occasionCounts: Map<string, number>,
): EntitiesFile {
  const T = ENTITY_THRESHOLDS;
  const count = (key: string, n: number, quietMin: number, pageable = true): EntityCount => ({
    key,
    shiurim: n,
    quietPage: pageable && n >= quietMin,
    livePrerender: pageable && n >= T.live.prerender,
  });
  const byKey = (a: { key: string }, b: { key: string }) => cmpStr(a.key, b.key);
  return {
    thresholds: { quiet: { ...T.quiet }, live: { ...T.live } },
    works: w.works.map((x) => count(x.key, x.shiurCount, T.quiet.work, !x.genre)).sort(byKey),
    people: p.people.map((x) => count(x.key, x.shiurCount, T.quiet.person)).sort(byKey),
    concepts: conceptCounts.map((x) => count(x.key, x.shiurim, T.quiet.concept)),
    occasions: [...occasionCounts.entries()].map(([key, shiurim]) => ({ key, shiurim })).sort(byKey),
  };
}

// ---------------------------------------------------------------- all

export function aggregate(input: AggregateInput): AggregateResult {
  const c = new Ctx(input);
  const sec = sections(c);
  const ser = seriesFile(c);
  const occ = occasions(c);
  const wk = works(c);
  const ppl = people(c);
  const con = concepts(c);
  const files: Aggregates = {
    sections: sec,
    neighbours: neighbours(c, sec, ser),
    series: ser,
    occasions: occ.file,
    years: years(c),
    works: wk.file,
    people: ppl,
    concepts: con.file,
    stories: stories(c, ppl),
    entities: entities(wk.file, ppl, con.all, occ.counts),
  };

  const warnings: string[] = [];
  const unlisted = sec.sections.reduce((a, x) => a + x.count, 0) !== input.shiurim.length;
  if (unlisted) warnings.push("aggregate: some shiurim are in no catalog section of index.json");
  if (occ.file.excluded.uncataloguedGuesses > 0) {
    warnings.push(`aggregate: ${occ.file.excluded.uncataloguedGuesses} uncatalogued shiurim with a guessed parsha/zman left out of occasions`);
  }
  if (occ.file.other.length > 0) warnings.push(`aggregate: ${occ.file.other.length} parsha/zman values in the "other" occasion bucket`);
  if (wk.unparsedRefs > 0) warnings.push(`aggregate: ${wk.unparsedRefs} sefariaRef values did not parse (listed as place not identified)`);
  return { files, warnings };
}

/** File names in `.corpus/` for each aggregate. */
export const AGGREGATE_FILES: Readonly<Record<keyof Aggregates, string>> = {
  sections: "sections.json",
  neighbours: "neighbours.json",
  series: "series.json",
  occasions: "occasions.json",
  years: "years.json",
  works: "works.json",
  people: "people.json",
  concepts: "concepts.json",
  stories: "stories.json",
  entities: "entities.json",
};

/** `{ "<file>.json": content }` for buildCorpus's `extraOutputs`. */
export function aggregateOutputs(files: Aggregates): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(AGGREGATE_FILES) as (keyof Aggregates)[]) out[AGGREGATE_FILES[k]] = files[k];
  return out;
}

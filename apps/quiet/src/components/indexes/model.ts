/**
 * Page models of the AI indexes (concept-quiet §5.7–5.10, tech-quiet §2, integration-plan W3.4).
 * Pure functions from the corpus aggregates to what each page lists; the `.astro` files only lay
 * them out. Rules kept here so they are tested once:
 *
 * - Entity pages exist exactly where `entities.json` says `quietPage` (works and people at ≥2
 *   shiurim, concepts at ≥3, never a generic work such as "Midrash"). Any other entity's line on
 *   its index links straight to its shiurim, each at its time.
 * - Every line points at a shiur page, at the moment (`#t=` global seconds, or `#s{idx}` for a
 *   section) when the data has one.
 * - Sources: works in traditional order (as `works.json` gives them), references in the work's own
 *   order; `inferred` lines carry "apparently"; mentions without a place go last under "place not
 *   identified"; a Sefaria link only for a reference some mention resolved.
 * - Nothing here reads story retellings, write-up text or anything from transcripts: the aggregate
 *   files do not carry them.
 */
import type { ConceptEntry, PersonEntry, StoryEntry, WorkEntry, MentionRef } from "@emunas/corpus/aggregate";
import { parseMomentId, type IndexRow } from "@emunas/corpus/public";
import { RESOLUTION_LABELS, langFor, scriptOf, type ContentLang, type Dir } from "@emunas/i18n";
import { formatQuiet } from "@emunas/links";
import type { Ed } from "../../lib/edition.ts";
import type { IndexesData } from "./corpus.ts";
import { useIndexesT, type IndexesKey } from "./strings.ts";

export type IndexKind = "sources" | "stories" | "people" | "inyanim";
export type EntityKind = "work" | "person" | "concept";

/** A data string with the `lang`/`dir` of its script (rendered as a `<bdi>`). */
export interface Run {
  readonly text: string;
  readonly lang: ContentLang;
  readonly dir: Dir;
}

export function run(text: string, ed: Ed): Run {
  const { lang, dir } = langFor(text, ed);
  return { text, lang, dir };
}

// ------------------------------------------------------------------ hrefs

const INDEX_ROUTE = { sources: "sources", stories: "stories", people: "people", inyanim: "concepts" } as const;

export function indexHref(ed: Ed, index: IndexKind): string {
  return formatQuiet({ kind: "index", ed, index: INDEX_ROUTE[index] });
}

/** The entity page, or its line on the index page (`#key`) when it has no page of its own. */
export function entityHref(ed: Ed, entity: EntityKind, key: string, hasPage: boolean): string {
  return formatQuiet({ kind: "entity", ed, entity, key }, { entityCount: () => (hasPage ? Number.POSITIVE_INFINITY : 0) });
}

export function shiurHref(ed: Ed, shiurId: string, t: number | null): string {
  return t === null ? formatQuiet({ kind: "shiur", ed, id: shiurId }) : formatQuiet({ kind: "shiur", ed, id: shiurId, t });
}

export function sectionHref(ed: Ed, shiurId: string, idx: number): string {
  return formatQuiet({ kind: "shiur", ed, id: shiurId, moment: { kind: "s", index: idx } });
}

/** Outbound Sefaria link (tech-quiet §4: resolved references only, encoded as one path segment). */
export function sefariaHref(ref: string): string {
  return `https://www.sefaria.org/${encodeURIComponent(ref.trim())}`;
}

/** The index anchor of an entity line (`/{ed}/people/#key` in @emunas/links). */
export function anchorOf(key: string): string {
  return encodeURIComponent(key);
}

// ------------------------------------------------------------------ page sets

/** Keys that get a Quiet page of their own, straight from `entities.json`. */
export function pageKeys(data: IndexesData, entity: EntityKind): Set<string> {
  const list = entity === "work" ? data.entities.works : entity === "person" ? data.entities.people : data.entities.concepts;
  return new Set(list.filter((e) => e.quietPage).map((e) => e.key));
}

// ------------------------------------------------------------------ citations

/** One pointer into a shiur: the catalog's own words for it, and where in it. */
export interface Cite {
  readonly shiurId: string;
  readonly href: string;
  /** Parsha or zman as catalogued, else the section title. */
  readonly occasion: Run;
  /** Catalog number as printed. */
  readonly n: string | null;
  readonly years: readonly number[];
  /** Language of the shiur; shown only when it differs from the edition. */
  readonly lang: Ed;
  /** Global seconds of the moment, or null (link to the shiur itself). */
  readonly t: number | null;
}

function catalogOrder(data: IndexesData): Map<string, number> {
  let i = 0;
  const order = new Map<string, number>();
  for (const id of data.rows.keys()) order.set(id, i++);
  return order;
}

const orderCache = new WeakMap<IndexesData, Map<string, number>>();
function orderOf(data: IndexesData): Map<string, number> {
  let o = orderCache.get(data);
  if (!o) {
    o = catalogOrder(data);
    orderCache.set(data, o);
  }
  return o;
}

function citeFromRow(row: IndexRow, ed: Ed, t: number | null, href?: string): Cite {
  const occasion = row.parsha?.raw ?? row.zman?.raw ?? row.catalog.sectionTitle;
  return {
    shiurId: row.id,
    href: href ?? shiurHref(ed, row.id, t),
    occasion: run(occasion, row.lang),
    n: row.catalog.n,
    years: row.years,
    lang: row.lang,
    t,
  };
}

/** A citation for a shiur of the corpus, or null for an id the corpus does not have (line dropped). */
export function citeOf(data: IndexesData, ed: Ed, shiurId: string, t: number | null): Cite | null {
  const row = data.rows.get(shiurId);
  return row ? citeFromRow(row, ed, t) : null;
}

function byCatalog(data: IndexesData) {
  const order = orderOf(data);
  return (a: { shiurId: string; t: number | null }, b: { shiurId: string; t: number | null }): number =>
    (order.get(a.shiurId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.shiurId) ?? Number.MAX_SAFE_INTEGER) ||
    (a.t ?? -1) - (b.t ?? -1);
}

/** One citation per shiur, at its earliest moment, in catalog order. */
function citesPerShiur(data: IndexesData, ed: Ed, points: readonly { shiurId: string; t: number | null }[]): Cite[] {
  const first = new Map<string, number | null>();
  for (const p of points) {
    const prev = first.get(p.shiurId);
    if (prev === undefined || (p.t !== null && (prev === null || p.t < prev))) first.set(p.shiurId, p.t);
  }
  return [...first]
    .map(([shiurId, t]) => ({ shiurId, t }))
    .sort(byCatalog(data))
    .map((p) => citeOf(data, ed, p.shiurId, p.t))
    .filter((c): c is Cite => c !== null);
}

// ------------------------------------------------------------------ alphabetical order

const HEBREW_FINALS: Readonly<Record<string, string>> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const LEADING_ARTICLE = /^(?:the|a|an)\s+/i;

/** Sort form of a name: no leading article, no marks, no quote marks or punctuation in front. */
export function sortForm(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-֑ͯ-ׇ]/g, "")
    .replace(/^[\s"'“”‘’׳״\-–(.]+/, "")
    .replace(LEADING_ARTICLE, "")
    .replace(/^[\s"'“”‘’׳״\-–(.]+/, "")
    .trim();
}

/** The jump-list letter of a name: Hebrew letters without final forms, Latin capitals, else "#". */
export function letterOf(text: string): string {
  const ch = sortForm(text).charAt(0);
  if (/[א-ת]/.test(ch)) return HEBREW_FINALS[ch] ?? ch;
  if (/[a-z]/i.test(ch)) return ch.toUpperCase();
  return "#";
}

const collators = { he: new Intl.Collator("he", { sensitivity: "base", numeric: true }), en: new Intl.Collator("en", { sensitivity: "base", numeric: true }) };

/**
 * Alphabetical order for an edition: names in the edition's script first (Hebrew letters in the
 * Yiddish edition, Latin in the English one), each part in its own collation; ties by key.
 */
export function compareNames(ed: Ed) {
  const primary = ed === "yi" ? "he" : "latin";
  return (a: { name: Run; key: string }, b: { name: Run; key: string }): number => {
    const sa = scriptOf(a.name.text) === primary ? 0 : 1;
    const sb = scriptOf(b.name.text) === primary ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const ka = sortForm(a.name.text);
    const kb = sortForm(b.name.text);
    const heb = /[א-ת]/.test(ka.charAt(0)) || /[א-ת]/.test(kb.charAt(0));
    return (heb ? collators.he : collators.en).compare(ka, kb) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  };
}

export interface LetterBlock<T> {
  readonly letter: string;
  /** Anchor id of the block. */
  readonly id: string;
  readonly items: T[];
}

/** Consecutive runs by letter (items already sorted). */
export function byLetter<T extends { letter: string }>(items: readonly T[]): LetterBlock<T>[] {
  const out: LetterBlock<T>[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.letter === item.letter) last.items.push(item);
    else out.push({ letter: item.letter, id: `letter-${out.length + 1}`, items: [item] });
  }
  return out;
}

// ------------------------------------------------------------------ sources

export type WorkGroupId =
  | "torah" | "neviim" | "kesuvim" | "targum" | "mishnah" | "bavli" | "yerushalmi" | "midrash"
  | "zohar" | "rishonim" | "acharonim" | "tefillah" | "other" | "unmapped" | "general";

const KNOWN_GROUPS: ReadonlySet<string> = new Set([
  "torah", "neviim", "kesuvim", "targum", "mishnah", "bavli", "yerushalmi", "midrash",
  "zohar", "rishonim", "acharonim", "tefillah", "other",
]);

export function workGroupOf(w: Pick<WorkEntry, "genre" | "mapped" | "group">): WorkGroupId {
  if (w.genre) return "general";
  if (!w.mapped) return "unmapped";
  return w.group !== null && KNOWN_GROUPS.has(w.group) ? (w.group as WorkGroupId) : "other";
}

export function workName(w: Pick<WorkEntry, "en" | "he" | "yi">, ed: Ed): { name: Run; alt: Run | null } {
  if (ed === "yi") return { name: run(w.yi ?? w.he ?? w.en, ed), alt: null };
  const alt = w.he !== null && w.he !== w.en ? run(w.he, ed) : null;
  return { name: run(w.en, ed), alt };
}

function workPoints(w: WorkEntry): { shiurId: string; t: number | null }[] {
  return [...w.refs.flatMap((r) => r.mentions), ...w.unlocated];
}

export interface WorkLine {
  readonly key: string;
  readonly name: Run;
  readonly alt: Run | null;
  readonly shiurCount: number;
  readonly mentionCount: number;
  /** The work's page, or null when it has none (then `cites` lists its shiurim). */
  readonly href: string | null;
  readonly cites: readonly Cite[];
}

export interface WorkGroupBlock {
  readonly group: WorkGroupId;
  readonly id: string;
  readonly label: string;
  readonly note: string | null;
  readonly works: readonly WorkLine[];
}

export function sourcesIndex(data: IndexesData, ed: Ed): WorkGroupBlock[] {
  const t = useIndexesT(ed);
  const pages = pageKeys(data, "work");
  const groups = new Map<WorkGroupId, WorkLine[]>();
  for (const w of data.works.works) {
    const g = workGroupOf(w);
    const hasPage = pages.has(w.key);
    const line: WorkLine = {
      key: w.key,
      ...workName(w, ed),
      shiurCount: w.shiurCount,
      mentionCount: w.mentionCount,
      href: hasPage ? entityHref(ed, "work", w.key, true) : null,
      cites: hasPage ? [] : citesPerShiur(data, ed, workPoints(w)),
    };
    let list = groups.get(g);
    if (!list) groups.set(g, (list = []));
    list.push(line);
  }
  // Table groups in the order works.json gives them, then works not in the table, then generic labels.
  const order: WorkGroupId[] = [...groups.keys()].filter((g) => g !== "unmapped" && g !== "general");
  if (groups.has("unmapped")) order.push("unmapped");
  if (groups.has("general")) order.push("general");
  return order.map((g) => ({
    group: g,
    id: `group-${g}`,
    label: t(`work.group.${g}` as IndexesKey),
    note: g === "general" ? t("work.generalNote") : null,
    works: groups.get(g) ?? [],
  }));
}

export interface MentionLine {
  /** "apparently" for an inferred identification; null when resolved. */
  readonly qualifier: string | null;
  readonly cite: Cite;
}

export interface RefBlock {
  readonly ref: string;
  readonly label: Run;
  readonly sefaria: string | null;
  readonly mentions: readonly MentionLine[];
}

export interface OtherRefLine extends MentionLine {
  /** The reference as the notes give it. */
  readonly text: Run;
}

export interface WorkPage {
  readonly key: string;
  readonly name: Run;
  readonly alt: Run | null;
  readonly group: WorkGroupId;
  readonly groupLabel: string;
  readonly shiurCount: number;
  readonly mentionCount: number;
  /** Other spellings filed under this work (only when they differ from the name shown). */
  readonly names: readonly Run[];
  readonly refs: readonly RefBlock[];
  /** References with a place that could not be put in the work's order. */
  readonly otherRefs: readonly OtherRefLine[];
  /** Mentions with no place at all ("place not identified"). */
  readonly unplaced: readonly MentionLine[];
}

function qualifierOf(m: Pick<MentionRef, "resolution">, ed: Ed): string | null {
  return m.resolution === "inferred" ? RESOLUTION_LABELS.inferred[ed] : null;
}

export function workPage(data: IndexesData, ed: Ed, w: WorkEntry): WorkPage {
  const t = useIndexesT(ed);
  const cmp = byCatalog(data);
  const line = (m: MentionRef): MentionLine | null => {
    const cite = citeOf(data, ed, m.shiurId, m.t);
    return cite ? { qualifier: qualifierOf(m, ed), cite } : null;
  };
  const lines = (ms: readonly MentionRef[]): MentionLine[] =>
    [...ms].sort(cmp).map(line).filter((l): l is MentionLine => l !== null);

  const refs: RefBlock[] = w.refs
    .map((r) => ({
      ref: r.ref,
      label: run(ed === "yi" ? r.label.he : r.label.en, ed),
      sefaria: r.mentions.some((m) => m.resolution === "resolved") ? sefariaHref(r.ref) : null,
      mentions: lines(r.mentions),
    }))
    .filter((r) => r.mentions.length > 0);

  const withPlace = w.unlocated.filter((m) => m.ref !== null && m.ref.trim() !== "" && m.resolution !== "unresolved");
  const without = w.unlocated.filter((m) => !withPlace.includes(m));
  const otherRefs: OtherRefLine[] = [...withPlace]
    .sort((a, b) => collators.en.compare(a.ref ?? "", b.ref ?? "") || cmp(a, b))
    .flatMap((m) => {
      const l = line(m);
      return l ? [{ ...l, text: run((m.ref ?? "").trim(), ed) }] : [];
    });

  const { name, alt } = workName(w, ed);
  const group = workGroupOf(w);
  return {
    key: w.key,
    name,
    alt,
    group,
    groupLabel: t(`work.group.${group}` as IndexesKey),
    shiurCount: w.shiurCount,
    mentionCount: w.mentionCount,
    names: w.names.filter((n) => n !== name.text && n !== alt?.text).map((n) => run(n, ed)),
    refs,
    otherRefs,
    unplaced: lines(without),
  };
}

// ------------------------------------------------------------------ people and stories

export function personName(p: Pick<PersonEntry, "en" | "he">, ed: Ed): { name: Run; alt: Run | null } {
  if (ed === "yi") {
    const name = run(p.he ?? p.en, ed);
    return { name, alt: p.he !== null && p.en !== p.he ? run(p.en, ed) : null };
  }
  return { name: run(p.en, ed), alt: p.he !== null && p.he !== p.en ? run(p.he, ed) : null };
}

function storiesById(data: IndexesData): Map<string, StoryEntry> {
  return new Map(data.stories.stories.map((s) => [s.id, s]));
}

export interface PersonLine {
  readonly key: string;
  readonly name: Run;
  readonly alt: Run | null;
  readonly letter: string;
  readonly shiurCount: number;
  readonly href: string | null;
  readonly cites: readonly Cite[];
}

export function peopleIndex(data: IndexesData, ed: Ed): LetterBlock<PersonLine>[] {
  const pages = pageKeys(data, "person");
  const stories = storiesById(data);
  const lines: PersonLine[] = data.people.people.map((p) => {
    const { name, alt } = personName(p, ed);
    const hasPage = pages.has(p.key);
    return {
      key: p.key,
      name,
      alt,
      letter: letterOf(name.text),
      shiurCount: p.shiurCount,
      href: hasPage ? entityHref(ed, "person", p.key, true) : null,
      cites: hasPage
        ? []
        : citesPerShiur(
            data,
            ed,
            p.shiurim.map((s) => ({ shiurId: s.id, t: firstStoryTime(s.stories, stories) })),
          ),
    };
  });
  return byLetter(lines.sort(compareNames(ed)));
}

function firstStoryTime(ids: readonly string[], stories: ReadonlyMap<string, StoryEntry>): number | null {
  let best: number | null = null;
  for (const id of ids) {
    const t = stories.get(id)?.t ?? null;
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

export interface StoryLine {
  readonly id: string;
  readonly title: string;
  readonly cite: Cite;
}

export interface PersonPage {
  readonly key: string;
  readonly name: Run;
  readonly alt: Run | null;
  readonly names: readonly Run[];
  readonly shiurCount: number;
  readonly shiurim: readonly { cite: Cite; stories: readonly StoryLine[] }[];
}

function storyLine(data: IndexesData, ed: Ed, s: StoryEntry): StoryLine | null {
  const cite = citeOf(data, ed, s.shiurId, s.t);
  return cite ? { id: s.id, title: s.title[ed], cite } : null;
}

export function personPage(data: IndexesData, ed: Ed, p: PersonEntry): PersonPage {
  const stories = storiesById(data);
  const { name, alt } = personName(p, ed);
  const shiurim = p.shiurim.flatMap((s) => {
    const cite = citeOf(data, ed, s.id, null);
    if (!cite) return [];
    const lines = s.stories
      .map((id) => stories.get(id))
      .filter((x): x is StoryEntry => x !== undefined)
      .sort((a, b) => (a.t ?? -1) - (b.t ?? -1))
      .map((x) => storyLine(data, ed, x))
      .filter((x): x is StoryLine => x !== null);
    return [{ cite, stories: lines }];
  });
  return {
    key: p.key,
    name,
    alt,
    names: p.names.filter((n) => n !== name.text && n !== alt?.text).map((n) => run(n, ed)),
    shiurCount: p.shiurCount,
    shiurim,
  };
}

export interface StoryGroup {
  readonly key: string | null;
  /** Anchor id of the group. */
  readonly id: string;
  readonly name: Run;
  readonly letter: string;
  /** The person's page, else their line on the people index; null for the no-person group. */
  readonly personHref: string | null;
  readonly stories: readonly StoryLine[];
}

const NO_PERSON_ID = "no-person";

export function storiesIndex(data: IndexesData, ed: Ed): { groups: StoryGroup[]; letters: LetterBlock<StoryGroup>[]; rest: StoryGroup | null } {
  const t = useIndexesT(ed);
  const stories = storiesById(data);
  const people = new Map(data.people.people.map((p) => [p.key, p]));
  const pages = pageKeys(data, "person");
  const named: StoryGroup[] = [];
  let rest: StoryGroup | null = null;
  for (const g of data.stories.byPerson) {
    const lines = g.storyIds
      .map((id) => stories.get(id))
      .filter((s): s is StoryEntry => s !== undefined)
      .map((s) => storyLine(data, ed, s))
      .filter((s): s is StoryLine => s !== null);
    if (lines.length === 0) continue;
    const person = g.key === null ? undefined : people.get(g.key);
    if (g.key === null || !person) {
      // A story whose person is missing from people.json is filed with the unnamed ones.
      const prev: StoryLine[] = rest ? [...rest.stories] : [];
      rest = { key: null, id: NO_PERSON_ID, name: run(t("people.noPerson"), ed), letter: "#", personHref: null, stories: [...prev, ...lines] };
      continue;
    }
    const { name } = personName(person, ed);
    named.push({
      key: g.key,
      id: anchorOf(g.key),
      name,
      letter: letterOf(name.text),
      personHref: entityHref(ed, "person", g.key, pages.has(g.key)),
      stories: lines,
    });
  }
  named.sort(compareNames(ed) as (a: StoryGroup, b: StoryGroup) => number);
  const groups = rest ? [...named, rest] : named;
  return { groups, letters: byLetter(named), rest };
}

// ------------------------------------------------------------------ inyanim

export interface ConceptLine {
  readonly key: string;
  readonly he: Run;
  readonly letter: string;
  readonly shiurCount: number;
  readonly href: string | null;
  readonly cites: readonly Cite[];
}

/** The headword is the Hebrew term in both editions (concept-quiet §5.10). */
export function conceptsIndex(data: IndexesData, ed: Ed): LetterBlock<ConceptLine>[] {
  const pages = pageKeys(data, "concept");
  const lines: ConceptLine[] = data.concepts.concepts.map((c) => {
    const hasPage = pages.has(c.key);
    return {
      key: c.key,
      he: { text: c.he, lang: "he", dir: "rtl" },
      letter: letterOf(c.he),
      shiurCount: c.shiurCount,
      href: hasPage ? entityHref(ed, "concept", c.key, true) : null,
      cites: hasPage ? [] : conceptShiurim(data, ed, c).map((s) => s.cite),
    };
  });
  return byLetter(lines);
}

export interface SectionLine {
  readonly idx: number;
  readonly title: string;
  readonly t: number;
  readonly href: string;
}

export interface ConceptPage {
  readonly key: string;
  readonly he: Run;
  readonly variants: readonly Run[];
  readonly shiurCount: number;
  readonly shiurim: readonly { cite: Cite; sections: readonly SectionLine[] }[];
}

function conceptShiurim(data: IndexesData, ed: Ed, c: ConceptEntry): { cite: Cite; sections: SectionLine[] }[] {
  return c.shiurim.flatMap((s) => {
    const chapters = data.chapters(s.id);
    const sections: SectionLine[] = s.sections
      .map((id) => parseMomentId(id))
      .filter((m) => m !== null && m.kind === "s" && m.shiurId === s.id)
      .flatMap((m) => {
        const ch = chapters.get(m!.index);
        return ch ? [{ idx: ch.idx, title: ch.title[ed], t: ch.t, href: sectionHref(ed, s.id, ch.idx) }] : [];
      })
      .sort((a, b) => a.t - b.t);
    const first = sections[0];
    const row = data.rows.get(s.id);
    if (!row) return [];
    // With a matching section, the shiur line opens at it; otherwise at the shiur's start.
    const cite = first ? citeFromRow(row, ed, first.t, first.href) : citeFromRow(row, ed, null);
    return [{ cite, sections }];
  });
}

export function conceptPage(data: IndexesData, ed: Ed, c: ConceptEntry): ConceptPage {
  return {
    key: c.key,
    he: { text: c.he, lang: "he", dir: "rtl" },
    variants: c.variants.filter((v) => v !== c.he).map((v) => ({ text: v, lang: "he", dir: "rtl" }) as Run),
    shiurCount: c.shiurCount,
    // On the page the sections carry the times, so the shiur line itself opens the shiur.
    shiurim: conceptShiurim(data, ed, c).map((s) => ({ ...s, cite: { ...s.cite, href: shiurHref(ed, s.cite.shiurId, null), t: null } })),
  };
}

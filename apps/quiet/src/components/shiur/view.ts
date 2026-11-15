/**
 * The shiur page's view model (concept-quiet §5.4, tech-quiet §4): pure functions from a
 * `PublicShiur` (plus a few lookups from the aggregate files) to what the components render.
 * Browser-safe and framework-free so it can be unit-tested without Astro.
 *
 * Nothing here reads raw data: the input is the allow-listed public contract, so there is no
 * field through which transcript text could arrive.
 */
import { sourceRefParts, type SourceRefParts } from "@emunas/i18n";
import type { EntityKind } from "@emunas/links";
import { quietPaths } from "@emunas/links";
import { sefariaUrl, WORK_GROUP_LABELS, WORK_GROUPS, workByKey, type WorkGroup } from "@emunas/normalize";
import type { IndexRow, PublicNotes, PublicShiur, PublicSource } from "@emunas/corpus/public";
import type { Neighbours } from "@emunas/corpus/aggregate";
import type { Ed } from "../../lib/edition.ts";

// ---------------------------------------------------------------- anchors

/** Section anchor, `#s{idx}` (tech-quiet §2, `@emunas/links` `#s{i}`): idx = extraction section index. */
export const sectionAnchor = (idx: number): string => `s${idx}`;
/** Write-up paragraph anchor, `#p{block}-{paragraph}` (positions in the edition's write-up). */
export const paragraphAnchor = (block: number, paragraph: number): string => `p${block}-${paragraph}`;
/** Source anchor, `#src{idx}` (idx in the published source list). */
export const sourceAnchor = (idx: number): string => `src${idx}`;

// ---------------------------------------------------------------- source letters

const LATIN = "abcdefghijklmnopqrstuvwxyz";
/** Hebrew letters in order, without final forms (as footnote letters are set in a sefer). */
const HEBREW = "אבגדהוזחטיכלמנסעפצקרשת";

/**
 * Footnote letter for the n-th source (0-based): a, b, … z, aa, ab, … in English; א, ב, … ת, אא, …
 * in Yiddish (bijective numbering, so no letter is ever skipped or doubled).
 */
export function sourceLetter(n: number, ed: Ed): string {
  const alphabet = ed === "yi" ? HEBREW : LATIN;
  const base = alphabet.length;
  let i = Math.max(0, Math.floor(n)) + 1;
  let out = "";
  while (i > 0) {
    const r = (i - 1) % base;
    out = alphabet[r] + out;
    i = Math.floor((i - 1) / base);
  }
  return out;
}

// ---------------------------------------------------------------- entity links

/** Shiur counts per entity, from `.corpus/entities.json`. */
export type EntityCounts = (kind: EntityKind, key: string) => number | undefined;

/**
 * Link into the indexes: the entity's own page at the Quiet threshold, else its index anchor.
 * Hebrew keys are written as Unicode (an IRI) rather than percent-encoded: the browser requests
 * the same URL, and the href is a third of the size (concept keys are Hebrew).
 */
export function entityHref(ed: Ed, kind: EntityKind, key: string, counts?: EntityCounts): string {
  const paths = quietPaths(counts ? { entityCount: counts } : {});
  const count = counts?.(kind, key);
  const opts = count === undefined ? undefined : { count };
  const href = kind === "work" ? paths.work(ed, key, opts) : kind === "person" ? paths.person(ed, key, opts) : paths.concept(ed, key, opts);
  return iri(href);
}

/** Decodes percent-encoded non-ASCII (UTF-8) sequences only; ASCII escapes (`%20`, `%2F`) stay. */
export function iri(href: string): string {
  return href.replace(/(?:%[89A-F][0-9A-F])+/gi, (m) => {
    try {
      return decodeURIComponent(m);
    } catch {
      return m;
    }
  });
}

// ---------------------------------------------------------------- sources

export interface CitedBy {
  /** Paragraph anchor (`p{b}-{i}`). */
  readonly anchor: string;
  /** Global seconds of the paragraph, when known (for the back-link text). */
  readonly t: number | null;
  /** 1-based paragraph number in the write-up (back-link text when there is no time). */
  readonly n: number;
}

export interface SourceView {
  readonly idx: number;
  readonly anchor: string;
  readonly letter: string;
  readonly ref: SourceRefParts;
  /** Outbound text link: only for `resolved` with a Sefaria ref (decision 5). */
  readonly sefaria: string | null;
  readonly sefariaRef: string | null;
  readonly t: number | null;
  readonly workKey: string | null;
  readonly workName: string | null;
  readonly group: WorkGroup;
  readonly indexHref: string | null;
  /** Write-up paragraphs (edition language) that cite this source, in reading order. */
  readonly citedBy: readonly CitedBy[];
}

export interface SourceGroupView {
  readonly group: WorkGroup;
  readonly label: string;
  readonly sources: readonly SourceView[];
}

export interface SourcesView {
  /** Displayable sources by published idx. */
  readonly byIdx: ReadonlyMap<number, SourceView>;
  /** Grouped by kind of work, groups in traditional order, sources by letter within a group. */
  readonly groups: readonly SourceGroupView[];
  readonly count: number;
}

function groupOf(source: Pick<PublicSource, "workKey">): WorkGroup {
  if (!source.workKey) return "other";
  return workByKey(source.workKey)?.group ?? "other";
}

/**
 * The graded source list (concept-quiet §5.4 part 6). Sources without anything displayable are
 * left out (the projector already drops `unresolved` with no work; this is the same rule again so
 * a page can never show an empty line). Letters follow the published order, which is the order
 * the sources come up in the shiur.
 */
export function buildSources(notes: PublicNotes, ed: Ed, counts?: EntityCounts): SourcesView {
  const cited = new Map<number, CitedBy[]>();
  let n = 0;
  notes.writeup[ed].forEach((block, b) => {
    block.paragraphs.forEach((p, i) => {
      n += 1;
      for (const idx of new Set(p.src)) {
        const list = cited.get(idx) ?? [];
        list.push({ anchor: paragraphAnchor(b, i), t: p.t, n });
        cited.set(idx, list);
      }
    });
  });

  const byIdx = new Map<number, SourceView>();
  let letterPos = 0;
  for (const s of [...notes.sources].sort((a, b) => a.idx - b.idx)) {
    const ref = sourceRefParts(s, ed);
    if (!ref) continue;
    byIdx.set(s.idx, {
      idx: s.idx,
      anchor: sourceAnchor(s.idx),
      letter: sourceLetter(letterPos++, ed),
      ref,
      sefaria: s.resolution === "resolved" && s.sefariaRef ? sefariaUrl(s.sefariaRef) : null,
      sefariaRef: s.resolution === "resolved" ? s.sefariaRef : null,
      t: s.t,
      workKey: s.workKey,
      workName: s.work,
      group: groupOf(s),
      indexHref: s.workKey ? entityHref(ed, "work", s.workKey, counts) : null,
      citedBy: cited.get(s.idx) ?? [],
    });
  }

  const groups: SourceGroupView[] = [];
  for (const group of WORK_GROUPS) {
    const sources = [...byIdx.values()].filter((s) => s.group === group);
    if (sources.length > 0) groups.push({ group, label: WORK_GROUP_LABELS[group][ed], sources });
  }
  return { byIdx, groups, count: byIdx.size };
}

// ---------------------------------------------------------------- outline

/** Section kinds listed in a lighter weight, without a summary (concept-quiet §5.4 part 4). */
export const QUIET_KINDS = new Set(["singing", "other_speaker", "noise", "brachah"]);

export const isQuietKind = (kind: string): boolean => QUIET_KINDS.has(kind);

// ---------------------------------------------------------------- apparatus and page parts

export interface ApparatusCounts {
  readonly keyPoints: number;
  readonly questions: number;
  readonly stories: number;
  readonly insights: number;
  readonly takeaways: number;
}

export function apparatusCounts(notes: PublicNotes): ApparatusCounts {
  return {
    keyPoints: notes.summary.keyPoints.length,
    questions: notes.questions.length,
    stories: notes.stories.length,
    insights: notes.insights.length,
    takeaways: notes.takeaways.length,
  };
}

export const hasApparatus = (notes: PublicNotes): boolean =>
  Object.values(apparatusCounts(notes)).some((n) => n > 0);

export const hasWriteup = (notes: PublicNotes, ed: Ed): boolean =>
  notes.writeup[ed].some((b) => b.paragraphs.length > 0);

export type PagePart = "about" | "outline" | "writeup" | "sources" | "apparatus" | "mentioned" | "catalog";

/** The parts present on a page, in page order (for the jump list under the header). */
export function pageParts(shiur: Pick<PublicShiur, "status" | "notes">, ed: Ed, sources?: SourcesView): PagePart[] {
  const parts: PagePart[] = [];
  const notes = shiur.status === "full" ? shiur.notes : undefined;
  if (notes) {
    parts.push("about");
    if (notes.chapters.length > 0) parts.push("outline");
    if (hasWriteup(notes, ed)) parts.push("writeup");
    if ((sources ?? buildSources(notes, ed)).count > 0) parts.push("sources");
    if (hasApparatus(notes)) parts.push("apparatus");
    if (notes.people.length > 0 || notes.concepts.length > 0) parts.push("mentioned");
  }
  parts.push("catalog");
  return parts;
}

// ---------------------------------------------------------------- place in the catalog

export interface RowRef {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  readonly lang: Ed;
  readonly years: readonly number[];
  readonly n: string | null;
}

export interface PositionView {
  readonly label: string;
  readonly href: string | null;
  readonly pos: number;
  readonly count: number;
  readonly prev: RowRef | null;
  readonly next: RowRef | null;
}

export interface CatalogPlaceView {
  readonly section: PositionView | null;
  readonly series: PositionView | null;
  readonly sameOccasion: readonly RowRef[];
  /** The parsha/zman as catalogued, and its calendar page. */
  readonly occasion: { readonly raw: string; readonly href: string } | null;
}

export type RowLookup = (id: string) => Pick<IndexRow, "id" | "lang" | "years" | "catalog"> | undefined;

export function rowRef(ed: Ed, id: string, rows: RowLookup): RowRef | null {
  const row = rows(id);
  if (!row) return null;
  return {
    id,
    href: quietPaths().shiur(ed, id),
    title: row.catalog.titleOriginal,
    lang: row.lang,
    years: row.years,
    n: row.catalog.n,
  };
}

/** Section page path (`/{ed}/section/{sectionId}/`, tech-quiet §2). */
export function sectionHref(ed: Ed, sectionId: string): string {
  return `/${ed}/section/${encodeURIComponent(sectionId)}/`;
}

/**
 * Previous/next in the section and the series, and "also on פרשת נח" (other shiurim with the same
 * parsha or zman, both languages, by year). Catalog fields only: no AI-made "related shiurim".
 */
export function catalogPlace(
  ed: Ed,
  shiur: Pick<PublicShiur, "catalog" | "parsha" | "zman" | "series">,
  neighbours: Neighbours | undefined,
  rows: RowLookup,
  seriesTitle?: (id: string) => string | undefined,
): CatalogPlaceView {
  const paths = quietPaths();
  const ref = (id: string | null) => (id === null ? null : rowRef(ed, id, rows));
  const section: PositionView | null = neighbours
    ? {
        label: shiur.catalog.sectionTitle,
        href: sectionHref(ed, shiur.catalog.sectionId),
        pos: neighbours.section.pos,
        count: neighbours.section.count,
        prev: ref(neighbours.section.prev),
        next: ref(neighbours.section.next),
      }
    : null;
  const s = neighbours?.series ?? null;
  const series: PositionView | null =
    s && shiur.series
      ? {
          label: seriesTitle?.(shiur.series.id) ?? "",
          href: paths.series(ed, shiur.series.id),
          pos: s.pos,
          count: s.count,
          prev: ref(s.prev),
          next: ref(s.next),
        }
      : null;
  const sameOccasion = (neighbours?.sameOccasion ?? []).map((id) => ref(id)).filter((r): r is RowRef => r !== null);
  const occasion = shiur.parsha
    ? { raw: shiur.parsha.raw, href: paths.parsha(ed, shiur.parsha.key) }
    : shiur.zman
      ? { raw: shiur.zman.raw, href: paths.zman(ed, shiur.zman.key) }
      : null;
  return { section, series, sameOccasion, occasion };
}

// ---------------------------------------------------------------- report an error

/**
 * The plain mail link that pre-fills the shiur id (concept-quiet §5.4 part 10, C18). Null when no
 * address is configured (`EMUNAS_FEEDBACK_EMAIL`); the page then leaves the line out.
 */
export function reportHref(address: string | undefined, subject: string, body: string): string | null {
  const to = address?.trim();
  if (!to || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(to)) return null;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

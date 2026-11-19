/**
 * View models for the calendar (לוח, concept-quiet §5.5) and year (שנים, §5.6) pages. Pure
 * functions over `.corpus/index.json`, `occasions.json` and `years.json` (types only from
 * `@emunas/corpus`), so they are unit-tested without a build.
 *
 * What these pages show is catalog text (titles, section names, parsha/zman, year, language) plus
 * the one-liner of notes in the edition's language where it exists. Nothing else from the notes,
 * and nothing from transcripts, is read here.
 *
 * Ordering is the aggregate's (W2.1): parshiyos in Torah order, zmanim from Elul, shiurim on an
 * occasion by year with both languages together, a year's shiurim in calendar order. Uncatalogued
 * rows whose parsha/zman is a guess from a file name are already left out of occasions.json
 * (concept-quiet decision 7); the year pages do not label them with an occasion either.
 */
import type { OccasionShiurRef, OccasionsFile, YearsFile } from "@emunas/corpus/aggregate";
import type { CorpusIndex, IndexRow } from "@emunas/corpus/public";
import type { AudioLang } from "@emunas/i18n";
import { formatQuiet } from "@emunas/links";
import { shownText, type PickedText } from "../../lib/content.ts";
import { isHebrewScriptEdition, type Ed } from "../../lib/edition.ts";
import { sectionDisplayTitle } from "../catalog/model.ts";
import type { CalendarKey } from "./strings.ts";

export interface CalendarData {
  index: CorpusIndex;
  occasions: OccasionsFile;
  years: YearsFile;
}

export type OccasionKind = "parsha" | "zman";
export type Audience = OccasionShiurRef["audience"];

/** The edition's name for an occasion: Yiddish uses the Hebrew name; English adds it beside. */
export interface OccasionName {
  /** In the edition's language. */
  name: string;
  /** The Hebrew name, shown beside the English one in the English edition (null in Yiddish). */
  he: string | null;
}

/** One link to a shiur in a calendar or year listing. */
export interface ShiurEntry {
  id: string;
  href: string;
  /** `titleOriginal`, exactly as catalogued. */
  title: string;
  /** Spoken language of the shiur. */
  lang: AudioLang;
  years: number[];
  sectionTitle: string;
  /** Who the shiur was given for, from the catalog (null when not stated). */
  audience: Audience;
  /** `oneLiner` for the edition (its language, else the fallback, with its lang/dir), or null (catalog-only shiur). */
  oneLiner: PickedText | null;
  /** Year pages: the parsha/zman of the shiur, linked to its calendar page. Empty elsewhere. */
  occasions: { name: OccasionName; href: string | null; raw: string | null }[];
}

export interface OccasionItem extends OccasionName {
  key: string;
  kind: OccasionKind;
  href: string;
  count: number;
}

export interface ChumashGroup {
  chumash: string;
  labelKey: CalendarKey;
  items: OccasionItem[];
}

export interface OccasionPage extends OccasionName {
  key: string;
  kind: OccasionKind;
  count: number;
  /** Shiurim on the occasion itself, by year. */
  shiurim: ShiurEntry[];
  /** Sub-headings (zman pages: "at the seudah", "at a lechaim"), each by year. */
  subs: { labelKey: CalendarKey; shiurim: ShiurEntry[] }[];
}

const CHUMASH_KEYS: Readonly<Record<string, CalendarKey>> = {
  bereishis: "cal.chumash.bereishis",
  shemos: "cal.chumash.shemos",
  vayikra: "cal.chumash.vayikra",
  bamidbar: "cal.chumash.bamidbar",
  devarim: "cal.chumash.devarim",
};

const SUB_KEYS: Readonly<Record<string, CalendarKey>> = {
  seudah: "cal.sub.seudah",
  lechaim: "cal.sub.lechaim",
};

export const AUDIENCE_KEYS: Readonly<Record<NonNullable<Audience>, CalendarKey>> = {
  children: "cal.audience.children",
  bachurim: "cal.audience.bachurim",
};

/** The bucket key normalize gives to values that are not in its tables. */
const OTHER_KEY = "other";

// ---------------------------------------------------------------- paths

export function occasionHref(ed: Ed, kind: OccasionKind, key: string): string {
  return formatQuiet({ kind: "occasion", ed, key, occasion: kind });
}

/**
 * The calendar's front door (the nav's "Calendar" link and the breadcrumbs): `/{ed}/calendar/`,
 * the page with the three ways in (W4.9). `@emunas/links` has no index kind for that address (it
 * parses it as the parsha index), so it is built from the edition's home path.
 */
export function calendarHref(ed: Ed): string {
  return `${formatQuiet({ kind: "home", ed })}calendar/`;
}

export function yearsHref(ed: Ed): string {
  return formatQuiet({ kind: "index", ed, index: "years" });
}

/** `/{ed}/years/{year}/`, or `/{ed}/years/unknown/`. */
export function yearHref(ed: Ed, year: number | "unknown"): string {
  return `${yearsHref(ed)}${year}/`;
}

/** The URL segment of a year page (`5743`); only whole positive years have pages. */
export function yearSlug(year: number): string {
  return String(year);
}

// ---------------------------------------------------------------- lookups

/**
 * True when the row's parsha/zman is a guess from a file name or folder (decision 7). The same
 * rule as `isGuessedOccasion` in `@emunas/corpus/aggregate`, over an index row.
 */
export function isGuessedRow(row: Pick<IndexRow, "catalog">): boolean {
  return row.catalog.derived === "filename" || row.catalog.derived === "dir-prefix";
}

export function rowsById(index: CorpusIndex): Map<string, IndexRow> {
  return new Map(index.shiurim.map((r) => [r.id, r]));
}

interface OccasionInfo {
  kind: OccasionKind;
  he: string;
  yi: string;
  en: string;
}

export function occasionLookup(occ: OccasionsFile): Map<string, OccasionInfo> {
  const m = new Map<string, OccasionInfo>();
  for (const p of occ.parshiyos) m.set(`parsha:${p.key}`, { kind: "parsha", he: p.he, yi: p.yi, en: p.en });
  for (const z of occ.zmanim) m.set(`zman:${z.key}`, { kind: "zman", he: z.he, yi: z.yi, en: z.en });
  return m;
}

/**
 * An occasion's name in the edition: a Hebrew-script edition shows its own name (the Yiddish
 * edition the Yiddish, the Hebrew edition the Hebrew); the English edition the English name with
 * the Hebrew beside it.
 */
export function occasionName(o: Readonly<Record<Ed, string>>, ed: Ed): OccasionName {
  return isHebrewScriptEdition(ed) ? { name: o[ed], he: null } : { name: o[ed], he: o.he };
}

// ---------------------------------------------------------------- entries

export function shiurEntry(
  row: IndexRow,
  ed: Ed,
  opts: { audience?: Audience; lookup?: Map<string, OccasionInfo> } = {},
): ShiurEntry {
  const occasions: ShiurEntry["occasions"] = [];
  if (opts.lookup && !isGuessedRow(row)) {
    for (const [kind, v] of [["parsha", row.parsha], ["zman", row.zman]] as const) {
      if (!v) continue;
      const info = v.key === OTHER_KEY ? undefined : opts.lookup.get(`${kind}:${v.key}`);
      if (info) occasions.push({ name: occasionName(info, ed), href: occasionHref(ed, kind, v.key), raw: null });
      // A one-off occasion (catalog text, not in the tables): shown as printed, not linked.
      else occasions.push({ name: { name: v.raw, he: null }, href: null, raw: v.raw });
    }
  }
  return {
    id: row.id,
    href: formatQuiet({ kind: "shiur", ed, id: row.id }),
    title: row.catalog.titleOriginal,
    lang: row.lang,
    years: [...row.years].sort((a, b) => a - b),
    sectionTitle: row.catalog.sectionTitle,
    audience: opts.audience ?? null,
    oneLiner: shownText(row.oneLiner, ed),
    occasions,
  };
}

function entriesOf(refs: readonly OccasionShiurRef[], rows: Map<string, IndexRow>, ed: Ed): ShiurEntry[] {
  const out: ShiurEntry[] = [];
  for (const ref of refs) {
    const row = rows.get(ref.id);
    if (row) out.push(shiurEntry(row, ed, { audience: ref.audience }));
  }
  return out;
}

// ---------------------------------------------------------------- calendar indexes

/** The parsha index: every parsha of the table in Torah order, grouped by chumash. */
export function parshaIndex(occ: OccasionsFile, ed: Ed): ChumashGroup[] {
  const groups: ChumashGroup[] = [];
  for (const p of occ.parshiyos) {
    let g = groups.find((x) => x.chumash === p.chumash);
    if (!g) {
      g = { chumash: p.chumash, labelKey: CHUMASH_KEYS[p.chumash] ?? "cal.byParsha", items: [] };
      groups.push(g);
    }
    g.items.push({ key: p.key, kind: "parsha", href: occasionHref(ed, "parsha", p.key), count: p.count, ...occasionName(p, ed) });
  }
  return groups;
}

/** The zman index: every occasion of the table, around the year from Elul. */
export function zmanIndex(occ: OccasionsFile, ed: Ed): OccasionItem[] {
  return [...occ.zmanim]
    .sort((a, b) => a.order - b.order)
    .map((z) => ({ key: z.key, kind: "zman", href: occasionHref(ed, "zman", z.key), count: z.count, ...occasionName(z, ed) }));
}

/**
 * Catalogued shiurim on a one-off occasion (the "other" bucket), by year. The occasion is shown
 * as the catalog prints it, unlinked.
 */
export function otherOccasions(data: CalendarData, ed: Ed): ShiurEntry[] {
  const rows = rowsById(data.index);
  const out: ShiurEntry[] = [];
  for (const ref of data.occasions.other) {
    const row = rows.get(ref.id);
    if (!row) continue;
    const e = shiurEntry(row, ed, { audience: ref.audience });
    e.occasions = [{ name: { name: ref.raw, he: null }, href: null, raw: ref.raw }];
    out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------- occasion pages

export function parshaKeys(occ: OccasionsFile): string[] {
  return occ.parshiyos.map((p) => p.key);
}

export function zmanKeys(occ: OccasionsFile): string[] {
  return occ.zmanim.map((z) => z.key);
}

export function occasionPage(data: CalendarData, kind: OccasionKind, key: string, ed: Ed): OccasionPage | null {
  const rows = rowsById(data.index);
  if (kind === "parsha") {
    const p = data.occasions.parshiyos.find((x) => x.key === key);
    if (!p) return null;
    return { key, kind, count: p.count, ...occasionName(p, ed), shiurim: entriesOf(p.shiurim, rows, ed), subs: [] };
  }
  const z = data.occasions.zmanim.find((x) => x.key === key);
  if (!z) return null;
  return {
    key,
    kind,
    count: z.count,
    ...occasionName(z, ed),
    shiurim: entriesOf(z.shiurim, rows, ed),
    subs: z.subs
      .filter((s) => s.shiurim.length > 0)
      .map((s) => ({ labelKey: SUB_KEYS[s.sub] ?? "cal.sub.seudah", shiurim: entriesOf(s.shiurim, rows, ed) })),
  };
}

// ---------------------------------------------------------------- years

export interface YearRow {
  year: number;
  count: number;
  href: string;
}

export interface YearIndex {
  rows: YearRow[];
  /** Shiurim with at least one year. */
  known: number;
  total: number;
  unknown: { count: number; href: string };
}

export function yearIndex(data: CalendarData, ed: Ed): YearIndex {
  const total = data.index.shiurim.length;
  return {
    rows: data.years.years.map((y) => ({ year: y.year, count: y.count, href: yearHref(ed, y.year) })),
    known: total - data.years.unknown.count,
    total,
    unknown: { count: data.years.unknown.count, href: yearHref(ed, "unknown") },
  };
}

export function yearList(data: CalendarData): number[] {
  return data.years.years.map((y) => y.year);
}

/** A year's shiurim in calendar order, each with its parsha/zman. */
export function yearPage(data: CalendarData, year: number, ed: Ed): ShiurEntry[] | null {
  const y = data.years.years.find((x) => x.year === year);
  if (!y) return null;
  const rows = rowsById(data.index);
  const lookup = occasionLookup(data.occasions);
  const out: ShiurEntry[] = [];
  for (const id of y.shiurIds) {
    const row = rows.get(id);
    if (row) out.push(shiurEntry(row, ed, { lookup }));
  }
  return out;
}

export interface SectionGroup {
  key: string;
  title: string;
  shiurim: ShiurEntry[];
}

/** The shiurim without a year, grouped by catalog section in catalog order. */
export function unknownYearGroups(data: CalendarData, ed: Ed): SectionGroup[] {
  const lookup = occasionLookup(data.occasions);
  const unknown = new Set(data.years.unknown.shiurIds);
  const bySection = new Map<string, ShiurEntry[]>();
  // index.json rows are in catalog order.
  for (const row of data.index.shiurim) {
    if (!unknown.has(row.id)) continue;
    const key = `${row.catalog.source}:${row.catalog.sectionId}`;
    const list = bySection.get(key) ?? [];
    list.push(shiurEntry(row, ed, { lookup }));
    bySection.set(key, list);
  }
  const groups: SectionGroup[] = [];
  for (const s of data.index.sections) {
    const list = bySection.get(s.key);
    if (list) {
      groups.push({ key: s.key, title: sectionDisplayTitle(s.key, s.title, ed), shiurim: list });
      bySection.delete(s.key);
    }
  }
  // A row whose section is missing from the sections list still appears (data keeps arriving).
  for (const [key, list] of bySection) groups.push({ key, title: sectionDisplayTitle(key, list[0]?.sectionTitle ?? key, ed), shiurim: list });
  return groups;
}

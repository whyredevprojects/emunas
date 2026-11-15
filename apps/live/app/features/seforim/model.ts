/**
 * Seforim (concept-live §5.4, tech-live W14a): the shelf and the work pages, as pure functions over
 * `works.json` and `work/<key>.json`.
 *
 * - The shelf holds the corpus layer's merged works (`sourceWorkIds`, C2.6) in the layer's shelf order,
 *   grouped by its shelf group (Torah, Nevi'im, …, Shas, Midrash, …). Works below the page line sit
 *   in a collapsed row at the end of their group; generic works (a genre with no child works) are not
 *   shelved; a family hub (a genre with child works) is shelved with its children after it.
 * - A work page orders its cited places by the parsed `sefariaRef` (traditional order), groups them by
 *   chapter (or daf), and lists the moments under each place. For Chumash that is the pasuk view:
 *   Bereishis 12 lists the pesukim that are cited, in order, each with its moments. Places whose ref
 *   cannot be parsed are listed after the ordered ones; mentions without a place are "unlocated".
 */
import type { UiLang } from "@emunas/i18n";
import { hebrewNumeral } from "@emunas/i18n";
import {
  WORK_GROUP_LABELS,
  WORK_GROUPS,
  compareSortKeys,
  parseSefariaRef,
  refLabel,
  slugify,
  type ParsedRef,
  type WorkGroup,
} from "@emunas/normalize";
import type { FacetLabel, WorkCitation, WorkFile, WorkLocation, WorkSummary } from "../entities/live-data.ts";

// ------------------------------------------------------------------------------------------ shelf

export interface ShelfGroup {
  group: WorkGroup;
  label: { en: string; yi: string; he: string };
  /** Works with a page (≥3 shiurim), in shelf order: a family hub followed by its children. */
  works: WorkSummary[];
  /** Works below the page line: the collapsed "cited once or twice" row at the end of the group. */
  few: WorkSummary[];
}

const GROUPS: ReadonlySet<string> = new Set(WORK_GROUPS);
const groupOf = (w: WorkSummary): WorkGroup => (GROUPS.has(w.group) ? (w.group as WorkGroup) : "other");

/**
 * The shelf (concept-live-corpus C.5): merged corpus works in the layer's shelf order, grouped by
 * the layer's shelf group (unknown groups go to "other"), each group's works with a page first, the
 * rest in a collapsed row. Generic works (a genre with no child works) are never shelved; the emit
 * leaves them out and this drops any that slip through. Empty groups are dropped.
 */
export function shelfGroups(works: readonly (WorkSummary & { generic?: boolean })[]): ShelfGroup[] {
  const by = new Map<WorkGroup, { works: WorkSummary[]; few: WorkSummary[] }>();
  for (const w of works) {
    if (w.generic === true || w.count <= 0) continue;
    const g = groupOf(w);
    let e = by.get(g);
    if (!e) by.set(g, (e = { works: [], few: [] }));
    (w.page ? e.works : e.few).push(w);
  }
  return WORK_GROUPS.flatMap((g) => {
    const e = by.get(g);
    return e ? [{ group: g, label: WORK_GROUP_LABELS[g], works: e.works, few: e.few }] : [];
  });
}

/** True when the work sits in a family listed on the shelf (indented after its hub). */
export function isFamilyMember(w: Pick<WorkSummary, "parentId">, shelved: ReadonlySet<string>): boolean {
  return w.parentId !== null && shelved.has(w.parentId);
}

/** Only a work with a Sefaria index title offers Sefaria links, for itself or its places (C.5). */
export function offersSefaria(work: Pick<WorkFile, "sefariaIndexTitle">): boolean {
  return typeof work.sefariaIndexTitle === "string" && work.sefariaIndexTitle.trim() !== "";
}

/** Case- and nikud-insensitive match of a filter string against a work's names. */
export function matchesWork(w: WorkSummary, folded: string, fold: (s: string) => string): boolean {
  if (folded === "") return true;
  return [w.name, w.label.en, w.label.yi, w.label.he ?? "", w.key].some((s) => fold(s).includes(folded));
}

// ------------------------------------------------------------------------------------------ places

export interface Place {
  location: WorkLocation;
  /** null when the ref could not be parsed or names no place. */
  parsed: ParsedRef | null;
}

export interface ChapterGroup {
  /** URL segment for `/seforim/:workId/:chapter`. */
  key: string;
  /** Book (and section) of the group, for labels. */
  parsed: ParsedRef;
  unit: { kind: "chapter" | "daf"; n: number };
  places: Place[];
}

export interface WorkLayout {
  chapters: ChapterGroup[];
  /** Cited places whose reference could not be ordered (kept as cited, in emitted order). */
  unordered: Place[];
  unlocated: WorkCitation[];
  /** Number of citations (moments) over all places and unlocated mentions. */
  momentCount: number;
}

function placeOf(location: WorkLocation): Place {
  if (location.sefariaRef === null) return { location, parsed: null };
  const p = parseSefariaRef(location.sefariaRef);
  return { location, parsed: p.ok && p.start !== null ? p : null };
}

function partOf(p: ParsedRef): string {
  return `${p.baseWorkKey}|${p.section ?? ""}`;
}

function unitOf(p: ParsedRef): { kind: "chapter" | "daf"; n: number } {
  const s = p.start!;
  return s.kind === "daf" ? { kind: "daf", n: s.daf } : { kind: "chapter", n: s.chapter };
}

/** Orders, groups and splits a work file's places. Pure and deterministic. */
export function layoutWork(work: Pick<WorkFile, "locations" | "unlocated">): WorkLayout {
  const places = work.locations.map(placeOf);
  const ordered = places
    .map((pl, i) => ({ pl, i }))
    .filter((x): x is { pl: Place & { parsed: ParsedRef }; i: number } => x.pl.parsed !== null)
    .sort(
      (a, b) =>
        compareSortKeys(a.pl.parsed.sortKey, b.pl.parsed.sortKey) ||
        // a range after the single place it starts with
        Number(a.pl.parsed.end !== null) - Number(b.pl.parsed.end !== null) ||
        a.i - b.i,
    )
    .map((x) => x.pl);
  const parts = new Set(ordered.map((pl) => partOf(pl.parsed)));
  const multiPart = parts.size > 1;
  const chapters: ChapterGroup[] = [];
  const byKey = new Map<string, ChapterGroup>();
  for (const pl of ordered) {
    const unit = unitOf(pl.parsed);
    const prefix = multiPart ? `${slugify(`${pl.parsed.en} ${pl.parsed.section ?? ""}`)}.` : "";
    const key = `${prefix}${unit.n}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, parsed: pl.parsed, unit, places: [] };
      byKey.set(key, g);
      chapters.push(g);
    }
    g.places.push(pl);
  }
  const unordered = places.filter((pl) => pl.parsed === null);
  const momentCount = work.locations.reduce((n, l) => n + l.citations.length, 0) + work.unlocated.length;
  return { chapters, unordered, unlocated: [...work.unlocated], momentCount };
}

/** Above this many cited places with more than one chapter, the work page shows a chapter index. */
export const INLINE_PLACES_MAX = 40;

export function wantsChapterIndex(layout: WorkLayout): boolean {
  const placed = layout.chapters.reduce((n, c) => n + c.places.length, 0);
  return layout.chapters.length > 1 && placed > INLINE_PLACES_MAX;
}

// ------------------------------------------------------------------------------------------ labels

const num = (n: number, ui: UiLang): string => (ui === "en" || n < 1 || n > 999 ? String(n) : hebrewNumeral(n, "hebrew"));

/** "Bereishis 12", "Shabbos, daf 21" / "בראשית יב", "שבת דף כא". */
export function chapterLabel(g: Pick<ChapterGroup, "parsed" | "unit">, ui: UiLang): string {
  const name = ui === "en" ? g.parsed.en : g.parsed.he;
  const section = ui === "en" ? g.parsed.section : (g.parsed.sectionHe ?? g.parsed.section);
  const head = section ? `${name}, ${section}` : name;
  if (g.unit.kind === "daf") return ui === "en" ? `${head}, daf ${g.unit.n}` : `${head} דף ${num(g.unit.n, ui)}`;
  return `${head} ${num(g.unit.n, ui)}`;
}

/** Label of one cited place: the parsed ref in the interface language, else the ref as cited. */
export function placeLabel(pl: Place, ui: UiLang): { text: string; script: "he" | "en" | "cited" } {
  if (pl.parsed) return ui === "en" ? { text: refLabel(pl.parsed, "en"), script: "en" } : { text: refLabel(pl.parsed, "he"), script: "he" };
  return { text: pl.location.ref, script: "cited" };
}

/** The work's display name: Hebrew-script label in Yiddish, English otherwise. */
export function workName(label: FacetLabel, ui: UiLang): string {
  return ui === "en" ? label.en : label.he || label.yi || label.en;
}

/** Distinct shiurim citing the places of a chapter. */
export function shiurimIn(places: readonly Place[]): string[] {
  return [...new Set(places.flatMap((p) => p.location.citations.map((c) => c.shiurId)))];
}

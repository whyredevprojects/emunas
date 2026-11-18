/**
 * Page models of the stories index and the story pages (Quiet C4.5), from the corpus layer's
 * merged stories (`.corpus/layer/stories.json`) and the catalog rows (`.corpus/index.json`). Pure:
 * no Node imports, no I/O; the `.astro` files only lay these out.
 *
 * Rules kept here so they are tested once:
 *
 * - A story page exists exactly where the layer's Quiet page flag says (two or more visible
 *   tellings, counted by the layer from the visible set). Every other story is a line on the index
 *   that links straight to the place in the shiur where it is told.
 * - Tellings come only from the layer (visible shiurim, items that survived projection). A telling
 *   whose shiur the catalog does not have is dropped, so a row never links to a missing page.
 *   Rows are ordered by year where known, the undated ones last (stable within a year).
 * - People: a person id is linked (page, or the line in the index of names) only when the person
 *   is listed on Quiet; a name the pipeline could not resolve, or a person who is not listed, is
 *   plain text (Quiet C6 "Filters").
 * - The index has three parts: most retold (`MOST_RETOLD_MIN` or more tellings), by person in the
 *   groups of the index of names, and without a name (every story not under any listed person,
 *   alphabetical). Every story is listed in the second or third part, with its anchor (`#<id>`) on
 *   its first line there, which is where `@emunas/links` sends a story without a page.
 * - Yiddish and English shiurim are separate shiurim: each telling row carries its own language,
 *   and nothing pairs one telling with another.
 * - Nothing here reads transcripts or raw corpus files: only the layer's generated title and
 *   retelling, which the story page prints under its AI label.
 */
import {
  LAYER_PERSON_GROUPS,
  type IndexRow,
  type LayerMomentRef,
  type LayerPerson,
  type LayerPersonGroup,
  type LayerStory,
} from "@emunas/corpus/public";
import { corpusLabel, languageName, type CorpusLabelKey } from "@emunas/i18n";
import { formatQuiet, type LinkData } from "@emunas/links";
import { clock } from "../../lib/bidi.ts";
import type { Ed } from "../../lib/edition.ts";
import { INDEXES_ANCHOR, type Crumb } from "../../lib/nav.ts";
import { useT } from "../../i18n/index.ts";
import { headword } from "../corpus/model.ts";
import { compareNames, run, type Run } from "../indexes/model.ts";

/** Tellings from which a story is in the "most retold" part of the index (Quiet C4.5: four or more). */
export const MOST_RETOLD_MIN = 4;

/** What the models read from the layer (`QuietLayer` fits). */
export interface StoriesSource {
  readonly stories: readonly LayerStory[];
  person(id: string): LayerPerson | undefined;
  /** Whether Quiet builds a page for this entry (the layer's page flags). */
  hasPage(kind: "story" | "person", id: string): boolean;
  /** `@emunas/links` data from the layer (page flags), for entry links. */
  readonly links: LinkData;
}

/** Catalog rows by shiur id (`indexRows` of the catalog corpus). */
export type CatalogRows = ReadonlyMap<string, IndexRow>;

// ------------------------------------------------------------------ text

type Texts = { readonly en?: unknown; readonly yi?: unknown } | null | undefined;

function textOf(t: Texts, ed: Ed): string {
  const v = t?.[ed];
  return typeof v === "string" ? v.trim() : "";
}

/** The story's title in the edition's language, else the other one (a title is never blank on a page). */
export function storyTitle(story: Pick<LayerStory, "title" | "id">, ed: Ed): Run {
  const other: Ed = ed === "yi" ? "en" : "yi";
  return run(textOf(story.title, ed) || textOf(story.title, other) || story.id, ed);
}

// ------------------------------------------------------------------ addresses

export function storiesIndexHref(ed: Ed): string {
  return formatQuiet({ kind: "index", ed, index: "stories" });
}

/** The story page, or its line on the index (`#<id>`) when it has no page (from the layer's flags). */
export function storyHref(ed: Ed, id: string, links: LinkData): string {
  return formatQuiet({ kind: "entry", ed, entry: "story", id }, links);
}

/** The place in the shiur: at the telling's time (`#t=`), else the shiur itself. */
export function tellingHref(ed: Ed, ref: Pick<LayerMomentRef, "shiurId" | "t">): string {
  if (typeof ref.t === "number" && Number.isFinite(ref.t) && ref.t >= 0) return formatQuiet({ kind: "shiur", ed, id: ref.shiurId, t: ref.t });
  return formatQuiet({ kind: "shiur", ed, id: ref.shiurId });
}

export function storiesCrumbs(ed: Ed, entry?: Run): Crumb[] {
  const t = useT(ed);
  const out: Crumb[] = [
    { label: t("nav.indexes"), href: `${formatQuiet({ kind: "home", ed })}#${INDEXES_ANCHOR}` },
    { label: corpusLabel("index.stories", ed), href: storiesIndexHref(ed) },
  ];
  if (entry) out.push({ label: entry.text, lang: entry.lang, dir: entry.dir });
  return out;
}

// ------------------------------------------------------------------ tellings

/** One place where the story is told: the shiur, its occasion, its language and the time. */
export interface TellingRow {
  readonly momentId: string;
  readonly shiurId: string;
  /** The shiur page at the telling. */
  readonly href: string;
  /** The title exactly as catalogued. */
  readonly title: Run;
  /** Parsha or zman as catalogued (null: none, or the same text as the title). */
  readonly occasion: Run | null;
  /** Year of the shiur (the layer's year, else the catalog's years); empty when undated. */
  readonly years: readonly number[];
  /** Spoken language of this shiur. */
  readonly lang: Ed;
  readonly langName: string;
  readonly t: number | null;
  /** The time as printed (`12:34`), or null. */
  readonly time: string | null;
}

function yearOf(ref: LayerMomentRef): number | null {
  return typeof ref.year === "number" && Number.isFinite(ref.year) ? ref.year : null;
}

/**
 * The visible tellings as rows: by year (undated last), otherwise in the layer's order. A telling
 * whose shiur the catalog does not have, or a repeated moment, is dropped.
 */
export function tellingRows(ed: Ed, tellings: readonly LayerMomentRef[] | null | undefined, rows: CatalogRows): TellingRow[] {
  const seen = new Set<string>();
  const kept: { ref: LayerMomentRef; row: IndexRow; i: number }[] = [];
  (Array.isArray(tellings) ? tellings : []).forEach((ref, i) => {
    if (typeof ref?.shiurId !== "string") return;
    const row = rows.get(ref.shiurId);
    const key = typeof ref.momentId === "string" ? ref.momentId : `${ref.shiurId}@${String(ref.t)}`;
    if (!row || seen.has(key)) return;
    seen.add(key);
    kept.push({ ref, row, i });
  });
  kept.sort((a, b) => {
    const ya = yearOf(a.ref);
    const yb = yearOf(b.ref);
    if (ya !== yb) return ya === null ? 1 : yb === null ? -1 : ya - yb;
    return a.i - b.i;
  });
  return kept.map(({ ref, row }) => {
    const t = typeof ref.t === "number" && Number.isFinite(ref.t) && ref.t >= 0 ? ref.t : null;
    const y = yearOf(ref);
    const lang: Ed = row.lang;
    const title = row.catalog.titleOriginal;
    const occasion = (row.parsha?.raw ?? row.zman?.raw ?? "").trim();
    return {
      momentId: typeof ref.momentId === "string" ? ref.momentId : "",
      shiurId: row.id,
      href: tellingHref(ed, ref),
      title: run(title, lang),
      occasion: occasion !== "" && occasion !== title.trim() ? run(occasion, lang) : null,
      years: y !== null ? [y] : row.years,
      lang,
      langName: languageName(lang, ed),
      t,
      time: t !== null ? clock(t) : null,
    };
  });
}

// ------------------------------------------------------------------ people

export interface StoryPersonRef {
  readonly key: string;
  readonly name: Run;
  /** The person's page or line in the index of names; null: plain text. */
  readonly href: string | null;
}

/** Listed in the Quiet index of names (type `other` below the line threshold and excluded people are not). */
export function listedOnQuiet(p: Pick<LayerPerson, "listed" | "excluded">): boolean {
  return p.listed?.quiet === true && (p.excluded ?? null) === null;
}

function personName(ed: Ed, p: LayerPerson): { name: Run; alt: Run | null } {
  const h = headword(ed, { en: p.nameEn, yi: p.nameYi, he: p.nameHe });
  return { name: h.title, alt: h.alt };
}

export function personHref(ed: Ed, id: string, links: LinkData): string {
  return formatQuiet({ kind: "entry", ed, entry: "person", id }, links);
}

/**
 * The people of a story, in the layer's order: linked when listed on Quiet, else plain names. A
 * plain `{ name }` is a corpus entity's own display name (the layer leaves raw extraction names
 * out, C3.1); the pages mark every name `data-story-person` for the guard.
 */
export function storyPeople(ed: Ed, story: Pick<LayerStory, "people">, src: Pick<StoriesSource, "person" | "links">): StoryPersonRef[] {
  const out: StoryPersonRef[] = [];
  const seen = new Set<string>();
  for (const p of Array.isArray(story.people) ? story.people : []) {
    if (p && "id" in p && typeof p.id === "string") {
      const person = src.person(p.id);
      if (!person || seen.has(`id:${p.id}`)) continue;
      seen.add(`id:${p.id}`);
      const { name } = personName(ed, person);
      if (name.text === "") continue;
      out.push({ key: p.id, name, href: listedOnQuiet(person) ? personHref(ed, p.id, src.links) : null });
    } else if (p && "name" in p && typeof p.name === "string" && p.name.trim() !== "") {
      const name = p.name.trim();
      if (seen.has(`name:${name}`)) continue;
      seen.add(`name:${name}`);
      out.push({ key: `name:${name}`, name: run(name, ed), href: null });
    }
  }
  return out;
}

// ------------------------------------------------------------------ a story page

export interface StoryPageModel {
  readonly id: string;
  readonly title: Run;
  readonly people: readonly StoryPersonRef[];
  /** The tellings credit the story to different people (the page says so). */
  readonly attributionVaries: boolean;
  /** The merged retelling in the edition's language; null when blank (the label stays). */
  readonly retelling: string | null;
  /** Where he tells it. */
  readonly rows: readonly TellingRow[];
  readonly reviewed: boolean;
}

export function storyPageModel(ed: Ed, story: LayerStory, src: Pick<StoriesSource, "person" | "links">, rows: CatalogRows): StoryPageModel {
  return {
    id: story.id,
    title: storyTitle(story, ed),
    people: storyPeople(ed, story, src),
    attributionVaries: story.attributionVaries === true,
    retelling: textOf(story.retelling, ed) || null,
    rows: tellingRows(ed, story.tellings, rows),
    reviewed: story.reviewed === true,
  };
}

// ------------------------------------------------------------------ the index

export interface StoryLine {
  readonly id: string;
  /** Sort key (`compareNames`). */
  readonly key: string;
  readonly name: Run;
  /** Visible tellings the line can cite. */
  readonly tellings: number;
  /** The story page; null when it has none (the line then links to each telling). */
  readonly href: string | null;
  /** Without a page: the place in each shiur where it is told. Empty with a page. */
  readonly moments: readonly TellingRow[];
  /** This line carries the story's anchor (`id="<storyId>"`). */
  readonly anchor: boolean;
}

export interface PersonStories {
  readonly id: string;
  /** Anchor of the person's block. */
  readonly anchor: string;
  readonly name: Run;
  readonly alt: Run | null;
  /** The person's page or line in the index of names. */
  readonly href: string;
  readonly stories: readonly StoryLine[];
}

export interface PersonGroupStories {
  readonly group: LayerPersonGroup;
  readonly anchor: string;
  readonly label: string;
  readonly people: readonly PersonStories[];
}

export interface StoriesIndexModel {
  readonly mostRetold: readonly StoryLine[];
  readonly groups: readonly PersonGroupStories[];
  readonly withoutName: readonly StoryLine[];
  /** Distinct stories listed. */
  readonly total: number;
}

/** Anchors of the index's parts and blocks (`~` never occurs in a corpus id, so no clash with story anchors). */
export const STORIES_ANCHORS = {
  mostRetold: "part~most-retold",
  byPerson: "part~by-person",
  withoutName: "part~without-name",
  group: (g: string) => `group~${g}`,
  person: (id: string) => `person~${id}`,
} as const;

interface Base {
  readonly story: LayerStory;
  readonly line: Omit<StoryLine, "anchor">;
}

export function storiesIndexModel(ed: Ed, src: StoriesSource, rows: CatalogRows): StoriesIndexModel {
  const byName = compareNames(ed);
  const bases: Base[] = [];
  for (const story of src.stories) {
    if (typeof story?.id !== "string" || story.id === "") continue;
    const page = src.hasPage("story", story.id);
    const tellings = tellingRows(ed, story.tellings, rows);
    // Nothing to link to: a story without a page and without a citable telling is not listed.
    if (!page && tellings.length === 0) continue;
    const name = storyTitle(story, ed);
    bases.push({
      story,
      line: {
        id: story.id,
        key: story.id,
        name,
        tellings: tellings.length,
        href: page ? storyHref(ed, story.id, src.links) : null,
        moments: page ? [] : tellings,
      },
    });
  }

  const mostRetold = bases
    .filter((b) => b.line.tellings >= MOST_RETOLD_MIN)
    .map((b) => ({ ...b.line, anchor: false }))
    .sort((a, b) => b.tellings - a.tellings || byName(a, b));

  // By person: every listed person a story names, in the index-of-names groups.
  const perPerson = new Map<string, { person: LayerPerson; lines: Omit<StoryLine, "anchor">[] }>();
  const placed = new Set<string>();
  for (const b of bases) {
    const ids = new Set<string>();
    for (const p of Array.isArray(b.story.people) ? b.story.people : []) {
      if (p && "id" in p && typeof p.id === "string") ids.add(p.id);
    }
    for (const id of ids) {
      const person = src.person(id);
      if (!person || !listedOnQuiet(person) || personName(ed, person).name.text === "") continue;
      let entry = perPerson.get(id);
      if (!entry) {
        entry = { person, lines: [] };
        perPerson.set(id, entry);
      }
      entry.lines.push(b.line);
      placed.add(b.line.id);
    }
  }

  const anchored = new Set<string>();
  const withAnchor = (l: Omit<StoryLine, "anchor">): StoryLine => {
    const anchor = !anchored.has(l.id);
    anchored.add(l.id);
    return { ...l, anchor };
  };

  const groupOf = (p: LayerPerson): LayerPersonGroup => (LAYER_PERSON_GROUPS.includes(p.group) ? p.group : "other");
  const groups: PersonGroupStories[] = [];
  for (const group of LAYER_PERSON_GROUPS) {
    const people = [...perPerson.entries()]
      .filter(([, e]) => groupOf(e.person) === group)
      .map(([id, e]) => ({ id, key: id, ...personName(ed, e.person), lines: e.lines }))
      .sort(byName)
      .map((p) => ({
        id: p.id,
        anchor: STORIES_ANCHORS.person(p.id),
        name: p.name,
        alt: p.alt,
        href: personHref(ed, p.id, src.links),
        stories: [...p.lines].sort(byName).map(withAnchor),
      }));
    if (people.length === 0) continue;
    groups.push({
      group,
      anchor: STORIES_ANCHORS.group(group),
      label: corpusLabel(`personGroup.${group}` as CorpusLabelKey, ed),
      people,
    });
  }

  const withoutName = bases
    .filter((b) => !placed.has(b.line.id))
    .map((b) => b.line)
    .sort(byName)
    .map(withAnchor);

  return { mostRetold, groups, withoutName, total: bases.length };
}

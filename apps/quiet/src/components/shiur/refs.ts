/**
 * The shiur page's corpus-layer lines (concept-quiet-corpus C4.8, C4.5 last line, C4.2 "On the
 * shiur page"; corpus-wave-plan §3.3 per-shiur refs, C2.4): pure functions from the shiur's
 * `.corpus/layer/shiur/<id>.json` refs and the layer's entity records to what the components print.
 *
 * - `topicLine`: under the abstract, the shiur's topics with salience ≥ 0.6, at most five, as links
 *   to their topic pages. Section-level topics are never printed here (they are too fine to read).
 * - `mentionedView`: "mentioned in this shiur", people and glossary terms by corpus id, with names
 *   from the layer, so merged names ("the Sanzer Rav", "the Divrei Chaim") land on one page.
 * - `sourceLinks`: each source moment's corpus work id and its link (the work entry).
 * - `storyLines`: "told in N other shiurim →" for a story told in another visible shiur, and the
 *   merged story's people (the only names a story prints: the extraction's raw names are never
 *   printed, F.1).
 *
 * Every link goes through `@emunas/links` with the layer's page flags: an entry with a Quiet page
 * links there, one listed in its index without a page links to its index anchor, and one that is
 * in no index (a family member, a type-other person under the line threshold, a generic work) is
 * printed as plain text. The layer only holds the visible set, so a shiur that is not in it has no
 * refs and none of these lines. Records are read defensively: the pipeline's data keeps growing
 * and its shape may change.
 *
 * Browser-safe and framework-free (types only from the layer reader), so it is unit-tested
 * without Astro. Nothing here reads raw data or any transcript-bearing field.
 */
import { formatQuiet, type CorpusKind, type LinkData } from "@emunas/links";
import type { LayerConcept, LayerPerson, LayerShiurRefs, LayerStory, LayerTopicNode, LayerWork } from "@emunas/corpus/public";
import type { Ed } from "../../lib/edition.ts";
import { iri } from "./view.ts";

/** Shiur-level salience at which a topic is what the shiur is about (Quiet C4.1 grade 1, C4.8). */
export const TOPIC_LINE_MIN_SALIENCE = 0.6;
/** At most this many topics on the ענינים line (Quiet C4.8). */
export const TOPIC_LINE_MAX = 5;

/** The parts of the Quiet layer reader (`../corpus/layer.ts`) the shiur page reads. */
export interface ShiurLayer {
  topic(id: string): LayerTopicNode | undefined;
  person(id: string): LayerPerson | undefined;
  concept(id: string): LayerConcept | undefined;
  work(id: string): LayerWork | undefined;
  story(id: string): LayerStory | undefined;
  /** Page flags and concept → topic (`@emunas/links` `pageLookupFromLayer`). */
  readonly links: Pick<LinkData, "hasPage" | "conceptTopic">;
}

/** A name to print, with its link (null: plain text). */
export interface NamedLink {
  readonly id: string;
  readonly name: string;
  readonly href: string | null;
  /** The name is in Hebrew script (set right to left). */
  readonly hebrew: boolean;
}

const HEBREW = /[֐-׿]/;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const isHebrew = (s: string): boolean => HEBREW.test(s);

/** Whether an entry has a Quiet page (layer flag; read as `=== true`). */
function hasQuietPage(layer: ShiurLayer, kind: CorpusKind, id: string): boolean {
  return layer.links.hasPage?.("quiet", kind, id) === true;
}

/**
 * Whether the entry is printed in its Quiet index, so that its index anchor exists. Topics,
 * glossary entries and stories are all listed; people follow the layer's `listed` flag and the
 * family/private/owner exclusion; works are all listed except generic labels without a page
 * (`kind` genre with no child works).
 */
function listedOnQuiet(layer: ShiurLayer, kind: CorpusKind, id: string): boolean {
  switch (kind) {
    case "topic":
      return layer.topic(id) !== undefined;
    case "concept":
      return layer.concept(id) !== undefined;
    case "story":
      return layer.story(id) !== undefined;
    case "person": {
      const p = layer.person(id);
      return p !== undefined && (p.excluded ?? null) === null && p.listed?.quiet === true;
    }
    case "work": {
      const w = layer.work(id);
      return w !== undefined && w.generic !== true;
    }
    case "thread":
      return false;
  }
}

/**
 * The Quiet link of a corpus entry: its page, else its index anchor when it is listed, else null
 * (plain text). A glossary term merged into a topic links to that topic (one inyan, one entry).
 */
export function entryHref(ed: Ed, layer: ShiurLayer, kind: CorpusKind, id: string): string | null {
  if (kind === "thread" || id === "") return null;
  if (kind === "concept") {
    const topic = layer.links.conceptTopic?.(id);
    if (topic && layer.topic(topic) !== undefined) return entryHref(ed, layer, "topic", topic);
  }
  if (!hasQuietPage(layer, kind, id) && !listedOnQuiet(layer, kind, id)) return null;
  return iri(formatQuiet({ kind: "entry", ed, entry: kind, id }, layer.links));
}

// ---------------------------------------------------------------- names in the edition

/** A topic's label in the edition: English in the English edition; Yiddish (else Hebrew) in the Yiddish. */
export function topicName(ed: Ed, node: Pick<LayerTopicNode, "label">): string {
  const l = node.label ?? { en: "", yi: "" };
  const en = str(l.en);
  const yi = str(l.yi);
  const he = str(l.he);
  return ed === "en" ? en || he || yi : yi || he || en;
}

/** A person's name in the edition: `nameEn` (English), `nameYi` then `nameHe` (Yiddish). */
export function personName(ed: Ed, p: Pick<LayerPerson, "nameEn" | "nameYi" | "nameHe">): string {
  const en = str(p.nameEn);
  const yi = str(p.nameYi);
  const he = str(p.nameHe);
  return ed === "en" ? en || he || yi : yi || he || en;
}

/** A glossary term as printed on the shiur page: its Hebrew headword (else its gloss). */
export function conceptName(ed: Ed, c: Pick<LayerConcept, "canonicalHe" | "label">): string {
  const he = str(c.canonicalHe);
  return he || str(c.label?.[ed]) || str(c.label?.en);
}

// ---------------------------------------------------------------- the ענינים line

/**
 * Under the abstract: the shiur's topics at salience ≥ 0.6, highest first, at most five, each
 * linked to its topic entry. Topics missing from the tree are skipped (never a dead link).
 */
export function topicLine(ed: Ed, layer: ShiurLayer, refs: Pick<LayerShiurRefs, "topics"> | null | undefined): NamedLink[] {
  const list = Array.isArray(refs?.topics) ? refs.topics : [];
  const ranked = list
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => typeof t?.id === "string" && typeof t.salience === "number" && t.salience >= TOPIC_LINE_MIN_SALIENCE)
    .sort((a, b) => b.t.salience - a.t.salience || a.i - b.i);
  const out: NamedLink[] = [];
  const seen = new Set<string>();
  for (const { t } of ranked) {
    if (out.length >= TOPIC_LINE_MAX) break;
    if (seen.has(t.id)) continue;
    const node = layer.topic(t.id);
    if (!node) continue;
    const name = topicName(ed, node);
    const href = entryHref(ed, layer, "topic", t.id);
    if (name === "" || href === null) continue;
    seen.add(t.id);
    out.push({ id: t.id, name, href, hebrew: isHebrew(name) });
  }
  return out;
}

// ---------------------------------------------------------------- mentioned in this shiur

export interface MentionedView {
  readonly people: readonly NamedLink[];
  readonly concepts: readonly NamedLink[];
}

const collator = (ed: Ed) => new Intl.Collator(ed === "yi" ? "he" : "en", { sensitivity: "base" });

function sortByName(list: NamedLink[], ed: Ed): NamedLink[] {
  const c = collator(ed);
  return list.sort((a, b) => c.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * People and glossary terms named in the shiur, by corpus id (the layer has already followed
 * retired ids to the surviving entity, and duplicates are dropped here). Excluded people (the
 * Mashgiach's family, private persons, the owner's list) are not printed at all; anyone else without an
 * index line is printed without a link. Each list is in alphabetical order of the printed name.
 */
export function mentionedView(ed: Ed, layer: ShiurLayer, refs: Pick<LayerShiurRefs, "personIds" | "conceptIds"> | null | undefined): MentionedView {
  const people: NamedLink[] = [];
  const seenP = new Set<string>();
  for (const id of Array.isArray(refs?.personIds) ? refs.personIds : []) {
    if (typeof id !== "string" || seenP.has(id)) continue;
    seenP.add(id);
    const p = layer.person(id);
    if (!p || (p.excluded ?? null) !== null) continue;
    const name = personName(ed, p);
    if (name === "") continue;
    people.push({ id, name, href: entryHref(ed, layer, "person", id), hebrew: isHebrew(name) });
  }
  const concepts: NamedLink[] = [];
  const seenC = new Set<string>();
  for (const id of Array.isArray(refs?.conceptIds) ? refs.conceptIds : []) {
    if (typeof id !== "string" || seenC.has(id)) continue;
    seenC.add(id);
    const c = layer.concept(id);
    if (!c) continue;
    const name = conceptName(ed, c);
    if (name === "") continue;
    concepts.push({ id, name, href: entryHref(ed, layer, "concept", id), hebrew: isHebrew(name) });
  }
  return { people: sortByName(people, ed), concepts: sortByName(concepts, "yi") };
}

// ---------------------------------------------------------------- sources by work id

export interface SourceWork {
  readonly workId: string;
  /** The work entry (page or index anchor), or null when the work is in no index. */
  readonly href: string | null;
  /** The work's shelf group from the layer (null: not known). */
  readonly orderGroup: string | null;
}

/** Each resolved source moment (`<shiur>~src<i>`) → its corpus work and link. */
export function sourceLinks(ed: Ed, layer: ShiurLayer, refs: Pick<LayerShiurRefs, "sources"> | null | undefined): Map<string, SourceWork> {
  const out = new Map<string, SourceWork>();
  for (const s of Array.isArray(refs?.sources) ? refs.sources : []) {
    if (typeof s?.momentId !== "string" || typeof s.workId !== "string" || s.workId === "") continue;
    const w = layer.work(s.workId);
    out.set(s.momentId, {
      workId: s.workId,
      href: w ? entryHref(ed, layer, "work", s.workId) : null,
      orderGroup: typeof w?.orderGroup === "string" ? w.orderGroup : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------- stories told elsewhere

export interface StoryLine {
  readonly storyId: string;
  /** Other visible shiurim the story is told in (distinct shiurim; this shiur not counted). */
  readonly otherShiurim: number;
  /** The story entry (page, else index anchor). */
  readonly href: string | null;
  /**
   * The merged story's people, in the edition's spelling: a linked person (page or index line), a
   * person in no index as plain text, or a name the layer gives as plain text (a corpus entity's
   * own display name). The telling's raw extraction names are never printed: they may be ASR
   * mishearings (F.1). Excluded people (family, private) are left out.
   */
  readonly people: readonly NamedLink[];
}

/**
 * For each story moment of the shiur (`<shiur>~st<i>`): the merged story, the number of other
 * visible shiurim it is told in (distinct shiurim among the story's visible tellings in the
 * layer; a second telling in this shiur does not count), its link and its people. A story told in
 * no other shiur gets a record with `otherShiurim` 0, so the page prints no line for it.
 */
export function storyLines(ed: Ed, layer: ShiurLayer, shiurId: string, refs: Pick<LayerShiurRefs, "stories"> | null | undefined): Map<string, StoryLine> {
  const out = new Map<string, StoryLine>();
  for (const r of Array.isArray(refs?.stories) ? refs.stories : []) {
    if (typeof r?.momentId !== "string" || typeof r.storyId !== "string") continue;
    const story = layer.story(r.storyId);
    if (!story) continue;
    const tellings = Array.isArray(story.tellings) ? story.tellings : [];
    const shiurim = new Set(tellings.map((t) => t?.shiurId).filter((id): id is string => typeof id === "string"));
    shiurim.delete(shiurId);
    const people: NamedLink[] = [];
    const seen = new Set<string>();
    for (const sp of Array.isArray(story.people) ? story.people : []) {
      if (!sp || typeof sp !== "object") continue;
      let link: NamedLink | null = null;
      if ("id" in sp && typeof sp.id === "string") {
        const p = layer.person(sp.id);
        if (!p || (p.excluded ?? null) !== null) continue;
        const name = personName(ed, p);
        if (name !== "") link = { id: sp.id, name, href: entryHref(ed, layer, "person", sp.id), hebrew: isHebrew(name) };
      } else if ("name" in sp) {
        const name = str(sp.name);
        if (name !== "") link = { id: "", name, href: null, hebrew: isHebrew(name) };
      }
      if (link === null) continue;
      const key = link.id !== "" ? `id:${link.id}` : `name:${link.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      people.push(link);
    }
    out.set(r.momentId, { storyId: r.storyId, otherShiurim: shiurim.size, href: entryHref(ed, layer, "story", r.storyId), people });
  }
  return out;
}

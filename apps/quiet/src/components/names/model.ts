/**
 * שמות, the index of names, and the person pages (Quiet C4.3, C6; corpus-wave-plan C2.1), on the
 * merged people of the corpus layer.
 *
 * - The index is arranged as a sefer arranges it: one block per type group in the layer's order
 *   (תנ"ך, malachim, חז"ל, ראשונים, אחרונים, צדיקי החסידות, rulers, others), alphabetical inside a
 *   group by the edition's name (`nameYi`, else `nameHe`, in the Yiddish edition; `nameEn` in the
 *   English one, with the Hebrew beside it), articles ignored.
 * - Only people the layer lists on Quiet appear (`listed.quiet`): type `other` from 3 shiurim, the
 *   Rav's family and other excluded people never. A person with a page links to it; anyone else's
 *   line carries their shiurim. No other-type person has a page (the layer's flags say so).
 * - `aliases` show as "also: …" on the line and, in the edition's script, as "ראה" lines filed in
 *   the alphabet of the same group, pointing to the entry.
 * - A person page: names, his seforim cited (`worksAuthored`), stories (merged stories from the
 *   layer), then the shiurim; passim people (`quietAllList`) put the list on `all/`.
 */
import { personGroupLabel } from "@emunas/i18n";
import { LAYER_PERSON_GROUPS, type LayerPerson, type LayerPersonGroup } from "@emunas/corpus/public";
import { formatQuiet } from "@emunas/links";
import { headword, type Headword } from "../corpus/model.ts";
import type { EntryData } from "../indexes/entries.ts";
import {
  citeShiurim,
  compareRuns,
  entryHref,
  hasEntryPage,
  nameLetter,
  ownTextOf,
  run,
  str,
  strings,
  textOf,
} from "../indexes/entry-model.ts";
import type { Cite, Run } from "../indexes/model.ts";
import { useIndexesT } from "../indexes/strings.ts";
import type { Ed } from "../../lib/edition.ts";

/** A "see also" link (the shape EntryHead takes). */
export interface SeeAlso {
  readonly label: Run;
  readonly href: string;
}

export interface PersonLine {
  readonly kind: "person";
  readonly id: string;
  readonly name: Run;
  readonly alt: Run | null;
  readonly letter: string;
  readonly also: readonly Run[];
  readonly count: number;
  readonly countText: string;
  /** The person's page, or null (then `cites` lists the shiurim). */
  readonly href: string | null;
  readonly cites: readonly Cite[];
}

/** "Sanzer Rav, see Divrei Chaim": an alias filed in the alphabet. */
export interface SeeLine {
  readonly kind: "see";
  /** Unique within the page. */
  readonly key: string;
  readonly id: string;
  readonly name: Run;
  readonly letter: string;
  readonly target: Run;
  /** The entry: its page, or its line on this page. */
  readonly href: string;
}

export type NameLine = PersonLine | SeeLine;

export interface NameGroup {
  readonly group: LayerPersonGroup;
  /** Anchor id of the block. */
  readonly id: string;
  readonly label: string;
  readonly lines: readonly NameLine[];
}

/** Whether a person appears in the Quiet index of names (the layer's own flags). */
export function isListed(p: LayerPerson): boolean {
  return p.listed?.quiet === true && (p.excluded ?? null) === null;
}

/** The headword of a person in an edition (English: `nameEn` with `nameHe` beside it). */
export function personHeadword(ed: Ed, p: Pick<LayerPerson, "nameEn" | "nameYi" | "nameHe">): Headword {
  return headword(ed, { en: str(p.nameEn), yi: str(p.nameYi), he: str(p.nameHe) });
}

/** Aliases that are not already one of the names shown. */
function otherNames(ed: Ed, p: LayerPerson, h: Headword): Run[] {
  const shown = new Set([h.title.text, h.alt?.text].filter((x): x is string => !!x));
  const out: Run[] = [];
  for (const a of strings(p.aliases)) {
    if (shown.has(a)) continue;
    shown.add(a);
    out.push(run(a, ed));
  }
  return out;
}

const isHebrewScript = (s: string) => /[א-ת]/.test(s);

function groupOf(p: LayerPerson): LayerPersonGroup {
  return (LAYER_PERSON_GROUPS as readonly string[]).includes(p.group) ? p.group : "other";
}

/** The index of names for an edition: groups in sefer order, each alphabetical, with "ראה" lines. */
export function namesIndex(d: EntryData, ed: Ed): NameGroup[] {
  const t = useIndexesT(ed);
  const cmp = compareRuns(ed);
  const byGroup = new Map<LayerPersonGroup, NameLine[]>();
  for (const p of d.layer.people) {
    if (!isListed(p)) continue;
    const h = personHeadword(ed, p);
    if (h.title.text === "") continue;
    const page = hasEntryPage(d, "person", p.id);
    const count = Number.isInteger(p.count) ? p.count : strings(p.shiurIds).length;
    const also = otherNames(ed, p, h);
    const g = groupOf(p);
    const lines = byGroup.get(g) ?? [];
    lines.push({
      kind: "person",
      id: p.id,
      name: h.title,
      alt: h.alt,
      letter: nameLetter(h.title.text),
      also,
      count,
      countText: t("count.shiurim", { count }),
      href: page ? entryHref(d, ed, "person", p.id) : null,
      cites: page ? [] : citeShiurim(d, ed, p.shiurIds),
    });
    // "ראה" lines: aliases in the edition's script (a Latin alias would not be looked up under א-ת).
    for (const a of also) {
      if (isHebrewScript(a.text) !== (ed === "yi")) continue;
      lines.push({
        kind: "see",
        key: `see-${p.id}-${lines.length}`,
        id: p.id,
        name: a,
        letter: nameLetter(a.text),
        target: h.title,
        href: page ? entryHref(d, ed, "person", p.id) : `#${encodeURIComponent(p.id)}`,
      });
    }
    byGroup.set(g, lines);
  }
  const out: NameGroup[] = [];
  for (const g of LAYER_PERSON_GROUPS) {
    const lines = byGroup.get(g);
    if (!lines || lines.length === 0) continue;
    lines.sort((a, b) => cmp({ name: a.name, id: a.kind === "see" ? a.key : a.id }, { name: b.name, id: b.kind === "see" ? b.key : b.id }));
    out.push({ group: g, id: `group-${g}`, label: personGroupLabel(g, ed), lines });
  }
  return out;
}

// ------------------------------------------------------------------ the person page

export interface LinkLine {
  readonly id: string;
  readonly label: Run;
  readonly href: string;
  /** "3 shiurim", "retold from 2 tellings": what stands after the link. */
  readonly note: string | null;
}

export interface PersonPage {
  readonly id: string;
  readonly head: Headword;
  readonly also: readonly Run[];
  /** Generated note on who this is (shown under the AI label at the foot). */
  readonly description: string | null;
  readonly countText: string;
  readonly seforim: readonly LinkLine[];
  readonly stories: readonly LinkLine[];
  readonly seeAlso: readonly SeeAlso[];
  /** The shiurim (empty on the main page of a passim person: see `allHref`). */
  readonly shiurim: readonly Cite[];
  /** Passim: the continuation page with the full list (main page only). */
  readonly allHref: string | null;
  readonly allText: string | null;
  readonly reviewed: boolean;
}

function workTitle(ed: Ed, w: { titleEn?: unknown; titleHe?: unknown }): Run {
  const h = headword(ed, { en: str(w.titleEn), yi: str(w.titleHe), he: str(w.titleHe) });
  return h.title;
}

function topicLabel(d: EntryData, ed: Ed, id: string): Run | null {
  const topic = d.layer.topic(id);
  if (!topic) return null;
  const text = textOf(topic.label, ed);
  return text === "" ? null : run(text, ed);
}

/**
 * A person page. `all` builds the continuation page (`all/`), which has the full list; the main
 * page of a passim person shows works and stories and links there instead of listing.
 */
export function personPage(d: EntryData, ed: Ed, p: LayerPerson, all = false): PersonPage {
  const t = useIndexesT(ed);
  const head = personHeadword(ed, p);
  const count = Number.isInteger(p.count) ? p.count : strings(p.shiurIds).length;
  const seforim: LinkLine[] = [];
  for (const wid of strings(p.worksAuthored)) {
    const w = d.layer.work(wid);
    if (!w) continue;
    const label = workTitle(ed, w);
    if (label.text === "") continue;
    seforim.push({ id: w.id, label, href: entryHref(d, ed, "work", w.id), note: t("count.shiurim", { count: w.count }) });
  }
  const stories: LinkLine[] = [];
  for (const sid of strings(p.storyIds)) {
    const s = d.layer.story(sid);
    if (!s) continue;
    const title = ownTextOf(s.title, ed) || textOf(s.title, ed);
    if (title === "") continue;
    const tellings = new Set((Array.isArray(s.tellings) ? s.tellings : []).map((x) => x?.shiurId).filter((x) => typeof x === "string" && d.visible(x))).size;
    stories.push({ id: s.id, label: run(title, ed), href: entryHref(d, ed, "story", s.id), note: tellings > 1 ? t("count.shiurim", { count: tellings }) : null });
  }
  // Same subject, by explicit links only (sameAs through a topic), never by a matching slug.
  const seeAlso: SeeAlso[] = [];
  const topicId = typeof p.sameAsTopic === "string" ? p.sameAsTopic : null;
  if (topicId !== null) {
    const label = topicLabel(d, ed, topicId);
    if (label) seeAlso.push({ label, href: entryHref(d, ed, "topic", topicId) });
    const authored = new Set(seforim.map((s) => s.id));
    for (const w of d.layer.works) {
      if (w.sameAsTopic !== topicId || authored.has(w.id)) continue;
      seeAlso.push({ label: workTitle(ed, w), href: entryHref(d, ed, "work", w.id) });
    }
  }
  const passim = p.quietAllList === true;
  const listHere = all || !passim;
  return {
    id: p.id,
    head,
    also: otherNames(ed, p, head),
    description: p.description ? textOf(p.description, ed) || null : null,
    countText: t("count.shiurim", { count }),
    seforim,
    stories,
    seeAlso,
    shiurim: listHere ? citeShiurim(d, ed, p.shiurIds) : [],
    allHref: !all && passim ? formatQuiet({ kind: "entry", ed, entry: "person", id: p.id, all: true }, d.layer.links) : null,
    allText: !all && passim ? t("names.allShiurim", { count }) : null,
    reviewed: p.reviewed === true,
  };
}

/** People with a Quiet page, and those whose list goes on `all/`. */
export function personPageIds(d: EntryData): { pages: string[]; all: string[] } {
  const people = d.layer.people.filter((p) => isListed(p) && hasEntryPage(d, "person", p.id));
  return { pages: people.map((p) => p.id), all: people.filter((p) => p.quietAllList === true).map((p) => p.id) };
}

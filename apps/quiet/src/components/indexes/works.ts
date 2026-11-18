/**
 * מראי מקומות, the works index and the work pages (Quiet C4.4, C3 "Kept", C6; corpus-wave-plan
 * C2.1), on the merged works of the corpus layer.
 *
 * - The index keeps the layer's shelf order (mafteach order from the data and the normalize
 *   ordering table; each work followed by its child works), in blocks by the shelf group of its
 *   top-level work. A generic work (a genre label with no child works, "the Midrash") is listed
 *   at the end with its shiurim and has no page; works without a group come before it.
 * - A work page: headword `titleHe` (the English title with the Hebrew beside it in the English
 *   edition), the author linked to his entry in שמות, the Sefaria link only through
 *   `sefariaIndexTitle`, a one-line pointer to the person with the same subject (the author, or a
 *   person joined to it through `sameAs`; never a matching slug), then the references in the
 *   work's own order (built from each shiur's `sources[]`, filed by the corpus work id), and the
 *   shiurim that cite it without a place.
 * - A family hub (a genre work with child works: Rashi, Ramban, Tosafos) lists its child works in
 *   data order with counts, then the shiurim citing the family by its own name.
 * - Only visible shiurim are cited.
 */
import { RESOLUTION_LABELS } from "@emunas/i18n";
import type { MentionRef, WorkEntry } from "@emunas/corpus/aggregate";
import type { LayerWork } from "@emunas/corpus/public";
import { headword, type Headword } from "../corpus/model.ts";
import { isHebrewScriptEdition, type Ed } from "../../lib/edition.ts";
import type { EntryData } from "./entries.ts";
import { byCatalog, citeShiur, citeShiurim, entryHref, hasEntryPage, run, str, strings, textRun } from "./entry-model.ts";
import { sefariaHref, type Cite, type MentionLine, type OtherRefLine, type RefBlock, type Run, type WorkGroupId } from "./model.ts";
import { useIndexesT, type IndexesKey } from "./strings.ts";

const KNOWN_GROUPS: ReadonlySet<string> = new Set([
  "torah", "neviim", "kesuvim", "targum", "mishnah", "bavli", "yerushalmi", "midrash",
  "zohar", "rishonim", "acharonim", "tefillah", "other",
]);

/** The headword of a work in an edition: `titleHe`; the English edition shows `titleEn` with it beside. */
export function workHeadword(ed: Ed, w: Pick<LayerWork, "titleEn" | "titleHe">): Headword {
  return headword(ed, { en: str(w.titleEn), yi: str(w.titleHe), he: str(w.titleHe) });
}

/** Sefaria's page for a whole work (spaces as underscores, as Sefaria writes them). */
export function sefariaIndexHref(title: string): string {
  return sefariaHref(title.trim().replace(/\s+/g, "_"));
}

/** Parent chain inside the layer, nearest first (loops cut). */
function ancestors(d: EntryData, w: LayerWork): LayerWork[] {
  const out: LayerWork[] = [];
  const seen = new Set([w.id]);
  for (let p = w.parentWorkId ? d.layer.work(w.parentWorkId) : undefined; p && !seen.has(p.id); p = p.parentWorkId ? d.layer.work(p.parentWorkId) : undefined) {
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export function shelfGroupOf(d: EntryData, w: LayerWork): WorkGroupId {
  const top = ancestors(d, w).at(-1) ?? w;
  if (top.generic === true) return "general";
  const g = top.orderGroup;
  if (g === null || g === undefined) return "unmapped";
  return KNOWN_GROUPS.has(g) ? (g as WorkGroupId) : "other";
}

export interface WorkLine {
  readonly id: string;
  readonly name: Run;
  readonly alt: Run | null;
  /** Nesting depth under its family (0: top level). */
  readonly depth: number;
  readonly count: number;
  readonly countText: string;
  /** The work's page, or null (then `cites` lists its shiurim). */
  readonly href: string | null;
  readonly cites: readonly Cite[];
}

export interface WorkBlock {
  readonly group: WorkGroupId;
  readonly id: string;
  readonly label: string;
  readonly note: string | null;
  readonly works: readonly WorkLine[];
}

/** The works index: the layer's shelf order in blocks by group, generic labels last. */
export function worksIndex(d: EntryData, ed: Ed): WorkBlock[] {
  const t = useIndexesT(ed);
  const blocks = new Map<WorkGroupId, WorkLine[]>();
  for (const w of d.layer.works) {
    const h = workHeadword(ed, w);
    if (h.title.text === "") continue;
    const page = hasEntryPage(d, "work", w.id);
    const g = shelfGroupOf(d, w);
    const count = Number.isInteger(w.count) ? w.count : strings(w.shiurIds).length;
    const list = blocks.get(g) ?? [];
    list.push({
      id: w.id,
      name: h.title,
      alt: h.alt,
      depth: ancestors(d, w).length,
      count,
      countText: t("count.shiurim", { count }),
      href: page ? entryHref(d, ed, "work", w.id) : null,
      cites: page ? [] : citeShiurim(d, ed, w.shiurIds),
    });
    blocks.set(g, list);
  }
  const order: WorkGroupId[] = [...blocks.keys()].filter((g) => g !== "unmapped" && g !== "general");
  if (blocks.has("unmapped")) order.push("unmapped");
  if (blocks.has("general")) order.push("general");
  return order.map((g) => ({
    group: g,
    id: `group-${g}`,
    label: t(`work.group.${g}` as IndexesKey),
    note: g === "general" ? t("work.generalNote") : null,
    works: blocks.get(g) ?? [],
  }));
}

// ------------------------------------------------------------------ the work page

export interface WorkPageLink {
  readonly label: Run;
  readonly href: string;
}

export interface ChildLine {
  readonly id: string;
  readonly name: Run;
  readonly depth: number;
  readonly countText: string;
  /** Its page, or its line on the works index. */
  readonly href: string;
}

export interface WorkPage {
  readonly id: string;
  readonly head: Headword;
  readonly meta: string;
  /** The author; `href` null when he is not listed in the names index (plain text, never a dead anchor). */
  readonly author: { readonly label: Run; readonly href: string | null } | null;
  readonly sefaria: { readonly href: string; readonly label: string } | null;
  /** Same subject: a person joined through `sameAs`, and the topic. */
  readonly seeAlso: readonly WorkPageLink[];
  readonly aliases: readonly Run[];
  /** Family hub: its child works, in data order (empty for an ordinary work). */
  readonly children: readonly ChildLine[];
  readonly refs: readonly RefBlock[];
  readonly otherRefs: readonly OtherRefLine[];
  /** Visible shiurim citing it with no place given (or all of them when no reference is known). */
  readonly shiurim: readonly Cite[];
  /** Whether `shiurim` is the rest after the references ("Also cited, place not given"). */
  readonly shiurimAreRest: boolean;
  readonly reviewed: boolean;
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function qualifierOf(m: Pick<MentionRef, "resolution">, ed: Ed): string | null {
  return m.resolution === "inferred" ? RESOLUTION_LABELS.inferred[ed] : null;
}

/** The references of a work in the work's own order, merged over every aggregate entry filed under it. */
function references(d: EntryData, ed: Ed, entries: readonly WorkEntry[]): { refs: RefBlock[]; otherRefs: OtherRefLine[]; placed: Set<string> } {
  const catalog = byCatalog(d);
  const cmp = (a: MentionRef, b: MentionRef) => catalog(a.shiurId, b.shiurId) || (a.t ?? -1) - (b.t ?? -1);
  const line = (m: MentionRef): MentionLine | null => {
    const cite = citeShiur(d, ed, m.shiurId, typeof m.t === "number" ? m.t : null);
    return cite ? { qualifier: qualifierOf(m, ed), cite } : null;
  };
  const byRef = new Map<string, { label: { en: string; he: string }; sortKey: number[]; mentions: MentionRef[] }>();
  for (const e of entries) {
    for (const r of e.refs) {
      const key = str(r.ref);
      if (key === "") continue;
      const hit = byRef.get(key);
      if (hit) hit.mentions.push(...r.mentions);
      else byRef.set(key, { label: r.label, sortKey: Array.isArray(r.sortKey) ? r.sortKey : [], mentions: [...r.mentions] });
    }
  }
  const sortKeyCmp = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] ?? -1;
      const y = b[i] ?? -1;
      if (x !== y) return x - y;
    }
    return 0;
  };
  const placed = new Set<string>();
  const refs: RefBlock[] = [...byRef]
    .sort(([ka, a], [kb, b]) => sortKeyCmp(a.sortKey, b.sortKey) || collator.compare(ka, kb))
    .map(([ref, r]) => {
      const mentions = [...r.mentions].sort(cmp).map(line).filter((l): l is MentionLine => l !== null);
      for (const m of mentions) placed.add(m.cite.shiurId);
      const label = (isHebrewScriptEdition(ed) ? str(r.label?.he) : str(r.label?.en)) || ref;
      return {
        ref,
        label: run(label, ed),
        sefaria: r.mentions.some((m) => m.resolution === "resolved") ? sefariaHref(ref) : null,
        mentions,
      };
    })
    .filter((r) => r.mentions.length > 0);
  const unlocated = entries.flatMap((e) => e.unlocated);
  const otherRefs: OtherRefLine[] = unlocated
    .filter((m) => typeof m.ref === "string" && m.ref.trim() !== "" && m.resolution !== "unresolved")
    .sort((a, b) => collator.compare(a.ref ?? "", b.ref ?? "") || cmp(a, b))
    .flatMap((m) => {
      const l = line(m);
      if (!l) return [];
      placed.add(l.cite.shiurId);
      return [{ ...l, text: run((m.ref ?? "").trim(), ed) }];
    });
  return { refs, otherRefs, placed };
}

/** The page of a work (an ordinary work or a family hub). */
export function workPage(d: EntryData, ed: Ed, w: LayerWork): WorkPage {
  const t = useIndexesT(ed);
  const head = workHeadword(ed, w);
  const group = shelfGroupOf(d, w);
  const count = Number.isInteger(w.count) ? w.count : strings(w.shiurIds).length;
  const authorRec = typeof w.authorPersonId === "string" ? d.layer.person(w.authorPersonId) : undefined;
  const authorName = authorRec ? headword(ed, { en: str(authorRec.nameEn), yi: str(authorRec.nameYi), he: str(authorRec.nameHe) }).title : null;
  const authorListed = authorRec?.listed?.quiet === true && (authorRec.excluded ?? null) === null;
  const author = authorRec && authorName && authorName.text !== "" ? { label: authorName, href: authorListed ? entryHref(d, ed, "person", authorRec.id) : null } : null;
  const sefariaTitle = str(w.sefariaIndexTitle);
  const sefaria = sefariaTitle === "" ? null : { href: sefariaIndexHref(sefariaTitle), label: t("works.onSefariaLabel", { title: head.title.text }) };

  // Same subject through an explicit sameAs topic (never a matching slug); the author is linked above.
  const seeAlso: WorkPageLink[] = [];
  const topicId = typeof w.sameAsTopic === "string" ? w.sameAsTopic : null;
  if (topicId !== null) {
    const topic = d.layer.topic(topicId);
    const label = topic ? textRun(topic.label, ed) : null;
    if (label) seeAlso.push({ label, href: entryHref(d, ed, "topic", topicId) });
    for (const p of d.layer.people) {
      if (p.sameAsTopic !== topicId || p.id === authorRec?.id || p.listed?.quiet !== true) continue;
      const name = headword(ed, { en: str(p.nameEn), yi: str(p.nameYi), he: str(p.nameHe) }).title;
      if (name.text !== "") seeAlso.push({ label: name, href: entryHref(d, ed, "person", p.id) });
    }
  }

  // Family hub: the child works, depth first in the layer's (data) order.
  const children: ChildLine[] = [];
  const depthOf = new Map<string, number>([[w.id, 0]]);
  for (const c of d.layer.works) {
    const parent = c.parentWorkId;
    if (typeof parent !== "string" || !depthOf.has(parent)) continue;
    const depth = depthOf.get(parent)! + 1;
    depthOf.set(c.id, depth);
    const name = workHeadword(ed, c).title;
    if (name.text === "") continue;
    children.push({ id: c.id, name, depth: depth - 1, countText: t("count.shiurim", { count: c.count }), href: entryHref(d, ed, "work", c.id) });
  }

  const { refs, otherRefs, placed } = references(d, ed, d.referencesOf(w.id));
  const all = citeShiurim(d, ed, w.shiurIds);
  const anyRefs = refs.length > 0 || otherRefs.length > 0;
  const shiurim = anyRefs ? all.filter((c) => !placed.has(c.shiurId)) : all;
  return {
    id: w.id,
    head,
    meta: `${t(`work.group.${group}` as IndexesKey)} · ${t("count.shiurim", { count })}`,
    author,
    sefaria,
    seeAlso,
    aliases: strings(w.aliases).filter((a) => a !== head.title.text && a !== head.alt?.text).map((a) => run(a, ed)),
    children,
    refs,
    otherRefs,
    shiurim,
    shiurimAreRest: anyRefs,
    reviewed: w.reviewed === true,
  };
}

/** Works with a Quiet page (never a generic one: the layer's flags). */
export function workPageIds(d: EntryData): string[] {
  return d.layer.works.filter((w) => w.generic !== true && hasEntryPage(d, "work", w.id)).map((w) => w.id);
}

/**
 * Page models of the topic index, מפתח הענינים (concept-quiet-corpus C4.1; corpus-wave-plan C2.2).
 * Pure functions over the corpus layer (`.corpus/layer/topics.json`, `occasion-topics.json`,
 * `concepts.json`, people and works for "see also"), the catalog rows of `.corpus/index.json` and
 * the calendar's `occasions.json`. The `.astro` files only lay these out. Rules kept here so they
 * are tested once:
 *
 * - **Tree** (C4.1 "The tree page"): the gates (topics without a parent) as headings, their topics
 *   beneath, deeper topics run in after a dash. The Hebrew label is the headword in both editions;
 *   the English edition puts the English label beside it and sorts by it, the Yiddish edition sorts
 *   by the Hebrew. A topic with no visible shiur is left out (it has nothing to point to).
 * - **Topic page**: headword, its place in the tree, "see also" (parent, children, siblings and the
 *   same subject in the names or sources index), the generated description (absent when null), the
 *   glossary definition when the topic is `sameAs` a concept, "begin here" (the layer's hubs, at most
 *   ten) and the three grades. Every count and row comes from the layer's visible set; a shiur the
 *   catalog does not know is never linked.
 * - **Gateway** (level 1, or above `thresholds.quiet.topicGatewayAbove`: the layer's `gateway`
 *   flag): description, children with their descriptions, begin here, and a link to the complete
 *   list on the `all/` page. The grades are printed on that page only.
 * - **Grades** in catalog order, language and year stated on each row, and a mark on rows the
 *   catalog places on one of the topic's occasions (C4.1 "Topics and the calendar").
 * - **Calendar cross-line**: an occasion linked to a topic (occasion-topics.json) gets one line
 *   on its calendar page: "X is also spoken about in N shiurim said at other times → ענינים: X".
 *   N counts the topic's shiurim that the catalog does not place on any occasion of that topic.
 *
 * Yiddish and English shiurim sit in the same lists; nothing pairs them. Language is a property of
 * each row.
 */
import type { OccasionsFile } from "@emunas/corpus/aggregate";
import type {
  IndexRow,
  LayerConcept,
  LayerOccasionTopic,
  LayerPerson,
  LayerTopicDetail,
  LayerTopicNode,
  LayerWork,
} from "@emunas/corpus/public";
import type { AudioLang, LocalizedText } from "@emunas/i18n";
import { formatQuiet } from "@emunas/links";
import { LANG_SCRIPT } from "@emunas/tokens";
import { clock } from "../../lib/bidi.ts";
import { shownText, type PickedText } from "../../lib/content.ts";
import type { Ed } from "../../lib/edition.ts";
import { headword } from "../corpus/model.ts";
import { run, termRun, type Run } from "../indexes/model.ts";

export { run, termRun, type Run };

// ------------------------------------------------------------------ inputs

/** What the topic models read. Built once per build by `data.ts`; tests build it from fixtures. */
export interface TopicsSource {
  readonly topics: readonly LayerTopicNode[];
  topicDetail(id: string): LayerTopicDetail | undefined;
  readonly occasionTopics: readonly LayerOccasionTopic[];
  concept(id: string): LayerConcept | undefined;
  person(id: string): LayerPerson | undefined;
  work(id: string): LayerWork | undefined;
  /** Whether Quiet builds a page for a person or work (the layer's page flags). */
  hasPage(kind: "person" | "work" | "topic", id: string): boolean;
  /** Catalog rows by shiur id (`.corpus/index.json`). */
  readonly rows: ReadonlyMap<string, IndexRow>;
  /** The calendar's occasions (null: no calendar, so no occasion marks or lines). */
  readonly occasions: OccasionsFile | null;
  /** A chapter's title (`.corpus/shiurim/<id>.json` notes), or null. */
  chapterTitle(shiurId: string, idx: number): LocalizedText | null;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// ------------------------------------------------------------------ hrefs

export function topicsIndexHref(ed: Ed): string {
  return formatQuiet({ kind: "index", ed, index: "topics" });
}

export function topicHref(ed: Ed, id: string, all = false): string {
  return formatQuiet({ kind: "entry", ed, entry: "topic", id, ...(all ? { all: true } : {}) });
}

export function shiurHref(ed: Ed, shiurId: string): string {
  return formatQuiet({ kind: "shiur", ed, id: shiurId });
}

export function sectionHref(ed: Ed, shiurId: string, idx: number): string {
  return formatQuiet({ kind: "shiur", ed, id: shiurId, moment: { kind: "s", index: idx } });
}

export function occasionHref(ed: Ed, kind: "parsha" | "zman", key: string): string {
  return formatQuiet({ kind: "occasion", ed, key, occasion: kind });
}

// ------------------------------------------------------------------ labels and order

/** The Hebrew headword of a topic (falls back to the Yiddish, then the English label). */
export function hebrewLabel(node: Pick<LayerTopicNode, "label">): string {
  return str(node.label?.he) || str(node.label?.yi) || str(node.label?.en);
}

export interface TopicName {
  /** The Hebrew headword (every edition). */
  readonly title: Run;
  /** A Latin-script edition: the English label beside it (null when missing or the same). */
  readonly alt: Run | null;
}

const latin = (ed: Ed): boolean => LANG_SCRIPT[ed] === "latin";

export function topicName(ed: Ed, node: Pick<LayerTopicNode, "label">): TopicName {
  const he = hebrewLabel(node);
  const en = str(node.label?.en);
  const alt = latin(ed) && en !== "" && en !== he ? termRun(en) : null;
  // The headword is a Hebrew term in every edition (lang "he", not the Yiddish edition's "yi").
  return { title: termRun(he), alt };
}

const collators = {
  he: new Intl.Collator("he", { sensitivity: "base", numeric: true }),
  en: new Intl.Collator("en", { sensitivity: "base", numeric: true }),
};

/** Sort order of an edition: English label in the English edition, the Hebrew in the Yiddish and Hebrew. */
export function compareTopics(ed: Ed) {
  return (a: LayerTopicNode, b: LayerTopicNode): number => {
    const ka = latin(ed) ? str(a.label?.en) || hebrewLabel(a) : hebrewLabel(a);
    const kb = latin(ed) ? str(b.label?.en) || hebrewLabel(b) : hebrewLabel(b);
    const c = (latin(ed) ? collators.en : collators.he).compare(ka, kb);
    return c !== 0 ? c : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/** Whether a topic is listed: it has at least one visible shiur. */
export const isListed = (n: LayerTopicNode): boolean => typeof n.count === "number" && n.count > 0;

// ------------------------------------------------------------------ the tree

interface Family {
  readonly byId: ReadonlyMap<string, LayerTopicNode>;
  readonly children: ReadonlyMap<string, LayerTopicNode[]>;
  /** Topics without a (known) parent: the gates. */
  readonly roots: readonly LayerTopicNode[];
}

const familyCache = new WeakMap<readonly LayerTopicNode[], Family>();

/** Parent/child maps of the tree. A topic whose parent is missing is a root. */
export function family(topics: readonly LayerTopicNode[]): Family {
  const hit = familyCache.get(topics);
  if (hit) return hit;
  const byId = new Map(topics.map((t) => [t.id, t]));
  const children = new Map<string, LayerTopicNode[]>();
  const roots: LayerTopicNode[] = [];
  for (const t of topics) {
    const p = t.parentId;
    if (p === null || p === undefined || p === t.id || !byId.has(p)) roots.push(t);
    else {
      const list = children.get(p) ?? [];
      list.push(t);
      children.set(p, list);
    }
  }
  const f = { byId, children, roots };
  familyCache.set(topics, f);
  return f;
}

/** Ancestors of a topic, gate first (cycles cut). */
export function ancestors(topics: readonly LayerTopicNode[], id: string): LayerTopicNode[] {
  const { byId } = family(topics);
  const out: LayerTopicNode[] = [];
  const seen = new Set([id]);
  let p = byId.get(id)?.parentId ?? null;
  while (p !== null && !seen.has(p)) {
    const node = byId.get(p);
    if (!node) break;
    seen.add(p);
    out.unshift(node);
    p = node.parentId;
  }
  return out;
}

export interface TreeEntry {
  readonly id: string;
  readonly name: TopicName;
  readonly count: number;
  /** The topic page, or null when Quiet builds none. */
  readonly href: string | null;
}

export interface TreeTopic extends TreeEntry {
  /** Deeper topics, run in after a dash (all levels below, depth first). */
  readonly sub: readonly TreeEntry[];
}

export interface TreeGate extends TreeEntry {
  readonly topics: readonly TreeTopic[];
}

function entry(ed: Ed, node: LayerTopicNode, src: Pick<TopicsSource, "hasPage">): TreeEntry {
  return {
    id: node.id,
    name: topicName(ed, node),
    count: node.count,
    href: node.pages?.quiet === true && src.hasPage("topic", node.id) ? topicHref(ed, node.id) : null,
  };
}

/** The whole tree as the index page prints it. */
export function topicTree(ed: Ed, src: Pick<TopicsSource, "topics" | "hasPage">): TreeGate[] {
  const f = family(src.topics);
  const cmp = compareTopics(ed);
  const kids = (id: string): LayerTopicNode[] => (f.children.get(id) ?? []).filter(isListed).sort(cmp);
  const below = (id: string, seen: Set<string>): TreeEntry[] =>
    kids(id).flatMap((k) => {
      if (seen.has(k.id)) return [];
      seen.add(k.id);
      return [entry(ed, k, src), ...below(k.id, seen)];
    });
  return [...f.roots]
    .filter(isListed)
    .sort(cmp)
    .map((g) => ({
      ...entry(ed, g, src),
      topics: kids(g.id).map((t) => ({ ...entry(ed, t, src), sub: below(t.id, new Set([g.id, t.id])) })),
    }));
}

// ------------------------------------------------------------------ occasions

export interface OccasionRef {
  readonly kind: "parsha" | "zman";
  readonly key: string;
  /** The edition's name for it (from occasions.json, which names every occasion in every language). */
  readonly name: string;
  readonly he: string;
  readonly href: string;
}

/** occasion `kind:key` → catalogued shiur ids on it (subs included), from `occasions.json`. */
export function placedOn(occ: OccasionsFile | null): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!occ) return out;
  for (const p of Array.isArray(occ.parshiyos) ? occ.parshiyos : []) {
    out.set(`parsha:${p.key}`, new Set((p.shiurim ?? []).map((s) => s.id)));
  }
  for (const z of Array.isArray(occ.zmanim) ? occ.zmanim : []) {
    const ids = new Set((z.shiurim ?? []).map((s) => s.id));
    for (const sub of Array.isArray(z.subs) ? z.subs : []) for (const s of sub.shiurim ?? []) ids.add(s.id);
    out.set(`zman:${z.key}`, ids);
  }
  return out;
}

const placedCache = new WeakMap<OccasionsFile, Map<string, Set<string>>>();
function placed(occ: OccasionsFile | null): Map<string, Set<string>> {
  if (!occ) return new Map();
  let hit = placedCache.get(occ);
  if (!hit) placedCache.set(occ, (hit = placedOn(occ)));
  return hit;
}

function occasionInfo(occ: OccasionsFile | null, kind: "parsha" | "zman", key: string): Readonly<Record<Ed, string>> | null {
  if (!occ) return null;
  const list = kind === "parsha" ? occ.parshiyos : occ.zmanim;
  return (Array.isArray(list) ? list : []).find((o) => o.key === key) ?? null;
}

/** The occasions a topic is linked to (occasion-topics.json) that have a calendar page, in calendar order. */
export function topicOccasions(ed: Ed, src: Pick<TopicsSource, "occasionTopics" | "occasions">, topicId: string): OccasionRef[] {
  const occ = src.occasions;
  if (!occ) return [];
  const order = new Map<string, number>();
  (occ.parshiyos ?? []).forEach((p, i) => order.set(`parsha:${p.key}`, i));
  (occ.zmanim ?? []).forEach((z, i) => order.set(`zman:${z.key}`, 10_000 + (typeof z.order === "number" ? z.order : i)));
  const out: OccasionRef[] = [];
  const seen = new Set<string>();
  for (const o of src.occasionTopics) {
    if (o.topicId !== topicId) continue;
    const k = `${o.kind}:${o.key}`;
    if (seen.has(k)) continue;
    const info = occasionInfo(occ, o.kind, o.key);
    if (!info) continue;
    seen.add(k);
    out.push({ kind: o.kind, key: o.key, name: info[ed], he: info.he, href: occasionHref(ed, o.kind, o.key) });
  }
  return out.sort((a, b) => (order.get(`${a.kind}:${a.key}`) ?? 0) - (order.get(`${b.kind}:${b.key}`) ?? 0));
}

// ------------------------------------------------------------------ rows

/** One shiur on a topic page: the catalog's words for it, its language and year. */
export interface TopicRow {
  readonly shiurId: string;
  readonly href: string;
  /** `titleOriginal`, exactly as catalogued. */
  readonly title: string;
  /** Spoken language of the shiur (stated on every row). */
  readonly lang: AudioLang;
  readonly years: readonly number[];
  /** Parsha or zman as catalogued (null: none, or only a guess from a file name). */
  readonly occasion: string | null;
  readonly section: string;
  /** The catalog places this shiur on one of the topic's occasions. */
  readonly onOccasion: OccasionRef | null;
}

export interface TouchedPart {
  readonly idx: number;
  readonly t: number;
  readonly time: string;
  readonly href: string;
  /** The chapter's title for the edition (its language, else the fallback; null: unknown). */
  readonly title: PickedText | null;
}

export interface TouchedRow extends TopicRow {
  readonly parts: readonly TouchedPart[];
}

export interface TopicGrades {
  readonly main: readonly TopicRow[];
  readonly discussed: readonly TopicRow[];
  readonly touched: readonly TouchedRow[];
}

const isGuessed = (row: IndexRow): boolean => row.catalog?.derived === "filename" || row.catalog?.derived === "dir-prefix";

/** Catalog position of every row (index.json is in catalog order). */
const orderCache = new WeakMap<ReadonlyMap<string, IndexRow>, Map<string, number>>();
export function catalogOrder(rows: ReadonlyMap<string, IndexRow>): Map<string, number> {
  let hit = orderCache.get(rows);
  if (!hit) {
    hit = new Map();
    let i = 0;
    for (const id of rows.keys()) hit.set(id, i++);
    orderCache.set(rows, hit);
  }
  return hit;
}

export function topicRow(ed: Ed, row: IndexRow, occasions: readonly OccasionRef[], placedMap: Map<string, Set<string>>): TopicRow {
  const guessed = isGuessed(row);
  const occasion = guessed ? null : str(row.parsha?.raw) || str(row.zman?.raw) || null;
  const on = occasions.find((o) => placedMap.get(`${o.kind}:${o.key}`)?.has(row.id)) ?? null;
  return {
    shiurId: row.id,
    href: shiurHref(ed, row.id),
    title: str(row.catalog?.titleOriginal) || row.id,
    lang: row.lang,
    years: [...(Array.isArray(row.years) ? row.years : [])].sort((a, b) => a - b),
    occasion,
    section: str(row.catalog?.sectionTitle),
    onOccasion: on,
  };
}

/**
 * The three grades of a topic (C4.1 part 4): rows for the shiurim the catalog knows, each shiur
 * once (the highest grade wins), in catalog order within each grade.
 */
export function topicGrades(ed: Ed, src: Pick<TopicsSource, "rows" | "occasions" | "chapterTitle" | "occasionTopics">, detail: LayerTopicDetail | undefined): TopicGrades {
  const g = detail?.grades;
  const occasions = detail ? topicOccasions(ed, src, detail.id) : [];
  const placedMap = placed(src.occasions);
  const order = catalogOrder(src.rows);
  const seen = new Set<string>();
  const byCatalog = <T extends { shiurId: string }>(a: T, b: T) =>
    (order.get(a.shiurId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.shiurId) ?? Number.MAX_SAFE_INTEGER);
  const rows = (list: unknown): TopicRow[] => {
    const out: TopicRow[] = [];
    for (const r of Array.isArray(list) ? (list as { shiurId?: unknown }[]) : []) {
      if (typeof r?.shiurId !== "string" || seen.has(r.shiurId)) continue;
      const row = src.rows.get(r.shiurId);
      if (!row) continue;
      seen.add(r.shiurId);
      out.push(topicRow(ed, row, occasions, placedMap));
    }
    return out.sort(byCatalog);
  };
  const main = rows(g?.main);
  const discussed = rows(g?.discussed);
  const touched: TouchedRow[] = [];
  for (const r of Array.isArray(g?.touched) ? g.touched : []) {
    if (typeof r?.shiurId !== "string" || seen.has(r.shiurId)) continue;
    const row = src.rows.get(r.shiurId);
    if (!row) continue;
    seen.add(r.shiurId);
    const parts = (Array.isArray(r.chapters) ? r.chapters : [])
      .filter((c) => Number.isInteger(c?.idx) && c.idx >= 0 && typeof c?.t === "number" && Number.isFinite(c.t))
      .map((c) => {
        const title = src.chapterTitle(r.shiurId, c.idx);
        return {
          idx: c.idx,
          t: c.t,
          time: clock(c.t),
          href: sectionHref(ed, r.shiurId, c.idx),
          title: shownText(title, ed),
        };
      });
    touched.push({ ...topicRow(ed, row, occasions, placedMap), parts });
  }
  touched.sort(byCatalog);
  return { main, discussed, touched };
}

export function gradeTotal(g: TopicGrades): number {
  return g.main.length + g.discussed.length + g.touched.length;
}

// ------------------------------------------------------------------ the topic page

export interface SeeAlsoLink {
  readonly label: Run;
  readonly href: string;
  readonly rel: "parent" | "child" | "sibling" | "person" | "work";
}

export interface ChildEntry {
  readonly id: string;
  readonly name: TopicName;
  readonly count: number;
  readonly href: string | null;
  readonly description: PickedText | null;
}

export interface TopicPage {
  readonly id: string;
  readonly name: TopicName;
  readonly count: number;
  /** Gate first, this topic excluded. */
  readonly path: readonly { readonly id: string; readonly name: TopicName; readonly href: string | null }[];
  readonly seeAlso: readonly SeeAlsoLink[];
  /** Generated description for the edition (its language, else the fallback; null: none). */
  readonly description: PickedText | null;
  /** The glossary definition of the concept with the same subject (`sameAs.conceptId`), or null. */
  readonly definition: PickedText | null;
  readonly occasions: readonly OccasionRef[];
  /** "Begin here": hub shiur ids the catalog knows, at most ten, in the layer's order. */
  readonly hubs: readonly string[];
  readonly gateway: boolean;
  readonly children: readonly ChildEntry[];
  readonly reviewed: boolean;
}

export const MAX_HUBS = 10;

/** A generated text for the edition, trimmed; null when blank in every language. */
function textOf(l: LocalizedText | null | undefined, ed: Ed): PickedText | null {
  if (!l || typeof l !== "object") return null;
  const p = shownText(l, ed);
  return p ? { ...p, text: p.text.trim() } : null;
}

export function topicPage(ed: Ed, src: TopicsSource, id: string): TopicPage | null {
  const f = family(src.topics);
  const node = f.byId.get(id);
  if (!node) return null;
  const detail = src.topicDetail(id);
  const cmp = compareTopics(ed);
  const link = (n: LayerTopicNode): string | null => (n.pages?.quiet === true && src.hasPage("topic", n.id) ? topicHref(ed, n.id) : null);
  const path = ancestors(src.topics, id).map((a) => ({ id: a.id, name: topicName(ed, a), href: link(a) }));
  const parent = path.length > 0 ? f.byId.get(path[path.length - 1]!.id) ?? null : null;
  const children = (f.children.get(id) ?? []).filter(isListed).sort(cmp);
  const siblings = (parent ? (f.children.get(parent.id) ?? []) : []).filter((s) => s.id !== id && isListed(s)).sort(cmp);

  const seeAlso: SeeAlsoLink[] = [];
  const add = (n: LayerTopicNode, rel: SeeAlsoLink["rel"]) => {
    const href = link(n);
    if (href) seeAlso.push({ label: termRun(hebrewLabel(n)), href, rel });
  };
  if (parent) add(parent, "parent");
  // On a gateway the children are listed with their descriptions; "see also" does not repeat them.
  if (!node.gateway) for (const c of children) add(c, "child");
  for (const s of siblings) add(s, "sibling");
  const personId = node.sameAs?.personId;
  if (typeof personId === "string" && src.hasPage("person", personId)) {
    const p = src.person(personId);
    if (p) {
      const name = headword(ed, { en: p.nameEn, yi: p.nameYi, he: p.nameHe }).title;
      if (name.text) seeAlso.push({ label: name, href: formatQuiet({ kind: "entry", ed, entry: "person", id: personId }), rel: "person" });
    }
  }
  const workId = node.sameAs?.workId;
  if (typeof workId === "string" && src.hasPage("work", workId)) {
    const w = src.work(workId);
    const name = w ? str(w.titleHe) || str(w.titleEn) : "";
    if (name) seeAlso.push({ label: run(name, ed), href: formatQuiet({ kind: "entry", ed, entry: "work", id: workId }), rel: "work" });
  }

  const conceptId = node.sameAs?.conceptId;
  const concept = typeof conceptId === "string" ? src.concept(conceptId) : undefined;

  const hubs: string[] = [];
  for (const h of Array.isArray(detail?.hubs) ? detail.hubs : []) {
    if (typeof h === "string" && src.rows.has(h) && !hubs.includes(h)) hubs.push(h);
    if (hubs.length >= MAX_HUBS) break;
  }

  return {
    id,
    name: topicName(ed, node),
    count: node.count,
    path,
    seeAlso,
    description: textOf(detail?.description, ed),
    definition: concept ? textOf(concept.definition, ed) : null,
    occasions: topicOccasions(ed, src, id),
    hubs,
    gateway: node.gateway === true,
    children: children.map((c) => ({
      id: c.id,
      name: topicName(ed, c),
      count: c.count,
      href: link(c),
      description: textOf(src.topicDetail(c.id)?.description, ed),
    })),
    reviewed: node.reviewed === true,
  };
}

/** Topic ids Quiet builds a page for, and those that also get an `all/` page (gateways). */
export function topicPageIds(src: Pick<TopicsSource, "topics" | "hasPage">): { pages: string[]; all: string[] } {
  const pages = src.topics.filter((t) => t.pages?.quiet === true && src.hasPage("topic", t.id) && isListed(t)).map((t) => t.id);
  const gate = new Set(src.topics.filter((t) => t.gateway === true).map((t) => t.id));
  return { pages, all: pages.filter((id) => gate.has(id)) };
}

// ------------------------------------------------------------------ the calendar cross-line

export interface CrossLine {
  readonly topicId: string;
  readonly topic: TopicName;
  readonly href: string;
  /** The topic's shiurim the catalog does not place on any of the topic's occasions. */
  readonly count: number;
}

/**
 * The line on a calendar parsha/zman page: the topic linked to the occasion (occasion-topics.json),
 * and how many of its shiurim were said at other times. Null when the occasion has no topic, the
 * topic has no Quiet page, or every shiur of the topic is placed on its occasions.
 */
export function calendarCrossLine(ed: Ed, src: Omit<TopicsSource, "chapterTitle">, kind: "parsha" | "zman", key: string): CrossLine | null {
  const link = src.occasionTopics.find((o) => o.kind === kind && o.key === key);
  if (!link) return null;
  const node = family(src.topics).byId.get(link.topicId);
  if (!node || node.pages?.quiet !== true || !src.hasPage("topic", node.id) || !isListed(node)) return null;
  const ids = topicShiurIds(src.topicDetail(node.id), src.rows);
  const p = placed(src.occasions);
  const mine = src.occasionTopics.filter((o) => o.topicId === node.id).map((o) => p.get(`${o.kind}:${o.key}`) ?? new Set<string>());
  let count = 0;
  for (const id of ids) if (!mine.some((s) => s.has(id))) count++;
  if (count === 0) return null;
  return { topicId: node.id, topic: topicName(ed, node), href: topicHref(ed, node.id), count };
}

/** Every shiur of a topic's grades that the catalog knows (each once). */
export function topicShiurIds(detail: LayerTopicDetail | undefined, rows: ReadonlyMap<string, IndexRow>): Set<string> {
  const out = new Set<string>();
  const g = detail?.grades;
  for (const list of [g?.main, g?.discussed, g?.touched]) {
    for (const r of Array.isArray(list) ? (list as { shiurId?: unknown }[]) : []) {
      if (typeof r?.shiurId === "string" && rows.has(r.shiurId)) out.add(r.shiurId);
    }
  }
  return out;
}

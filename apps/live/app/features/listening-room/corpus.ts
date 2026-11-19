/**
 * The listening room on the corpus layer (concept-live-corpus D "Listening room", C.1, E.2, F.1, G):
 * pure helpers over the shiur file's own `corpus` block, so the room renders from `shiur/<id>.json`
 * alone. Nothing here fetches.
 *
 * - Header: the top three topics by salience (0.5 and above).
 * - Chapters: each section's topic chips.
 * - Insights: a thread mark ("taught in N other shiurim, Y1 to Y2") when the thread has a page; a
 *   two-shiur thread is one inline line with the other member, never a headline or a link to a page.
 * - Stories: "told in N other shiurim" for a merged story told more than once.
 * - Sources: grouped by the merged (corpus) work.
 * - Related, rebuilt: threads through this shiur, main topics, other years of the same occasion, then
 *   the embedding neighbours. No "counterpart in the other language" (F.1).
 * - End of shiur: the next part of its series, else a thread from it, else more on its top topic.
 *
 * The data keeps growing and its shape may change, so every optional field is read defensively and
 * counts are the visible recounts the build wrote (never `shiurCount` of the raw corpus).
 */
import type { PublicSource } from "@emunas/corpus/public";
import type { Ed, EntityChip, LocalizedText, ShiurCorpus, ShiurFile, StoryPerson } from "./data.ts";

/** Salience a shiur-level topic needs for the header line and "more on this". */
export const MAIN_TOPIC_SALIENCE = 0.5;
/** How many topics the header line shows. */
export const MAIN_TOPIC_COUNT = 3;
/** A thread mark points at a page from this many distinct shiurim (C.1 "Thresholds"). */
export const THREAD_PAGE_MIN_SHIURIM = 3;

type CorpusOf = Pick<ShiurFile, "corpus">;

function arr<T>(xs: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(xs) ? xs : [];
}

function corpusOf(shiur: CorpusOf): Partial<ShiurCorpus> {
  return shiur.corpus ?? {};
}

/** The topic chip for an id, from the file's own labels; null when the file carries no label for it. */
export function topicChip(shiur: CorpusOf, id: string): EntityChip | null {
  const labels = corpusOf(shiur).topicLabels;
  const chip = labels && Object.hasOwn(labels, id) ? labels[id] : undefined;
  if (!chip || typeof chip.label?.en !== "string" || typeof chip.label.yi !== "string") return null;
  return chip;
}

/** The shiur's main topics: salience ≥ 0.5, highest first, at most three, each with a label. */
export function mainTopics(shiur: CorpusOf, max = MAIN_TOPIC_COUNT): EntityChip[] {
  const out: EntityChip[] = [];
  const seen = new Set<string>();
  const ranked = [...arr(corpusOf(shiur).topics)]
    .filter((t) => typeof t.salience === "number" && t.salience >= MAIN_TOPIC_SALIENCE)
    .sort((a, b) => b.salience - a.salience);
  for (const t of ranked) {
    if (out.length >= max) break;
    if (seen.has(t.id)) continue;
    const chip = topicChip(shiur, t.id);
    if (!chip) continue;
    seen.add(t.id);
    out.push(chip);
  }
  return out;
}

/** Topic chips of the chapter with section index `idx` (none for other-speaker chapters). */
export function chapterTopics(shiur: CorpusOf, idx: number): EntityChip[] {
  const row = arr(corpusOf(shiur).chapters).find((c) => c.idx === idx);
  const out: EntityChip[] = [];
  for (const id of new Set(arr(row?.topicIds))) {
    const chip = topicChip(shiur, id);
    if (chip?.page) out.push(chip);
  }
  return out;
}

/** The other member of a two-shiur thread, as the shiur file carries it. */
export interface PairedInsight {
  shiurId: string;
  momentId: string;
  t: number | null;
  year: number | null;
  lang: Ed;
}

export type InsightMark =
  /** The thread has a page: "taught in N other shiurim, Y1 to Y2" opens it. */
  | { kind: "thread"; threadId: string; others: number; years: [number, number] | null }
  /** A two-shiur thread: the inline line "also taught in <shiur>, <year>" with a play button. */
  | { kind: "pair"; threadId: string; other: PairedInsight };

/** The thread mark of an insight moment, or null (not in a thread, or nothing to show). */
export function insightMark(shiur: CorpusOf, momentId: string): InsightMark | null {
  const x = arr(corpusOf(shiur).insights).find((i) => i.momentId === momentId);
  if (!x) return null;
  const count = typeof x.shiurCount === "number" ? x.shiurCount : 0;
  if (x.page === true && count >= THREAD_PAGE_MIN_SHIURIM) {
    const y = Array.isArray(x.years) && x.years.length === 2 ? ([x.years[0], x.years[1]] as [number, number]) : null;
    return { kind: "thread", threadId: x.threadId, others: count - 1, years: y };
  }
  const o = x.other;
  if (o && typeof o.shiurId === "string" && o.shiurId !== "" && typeof o.momentId === "string") {
    return {
      kind: "pair",
      threadId: x.threadId,
      other: { shiurId: o.shiurId, momentId: o.momentId, t: typeof o.t === "number" ? o.t : null, year: typeof o.year === "number" ? o.year : null, lang: o.lang },
    };
  }
  return null;
}

export interface StoryMark {
  storyId: string;
  /** Other visible shiurim the story is told in (distinct shiurim; this one not counted). */
  others: number;
  page: boolean;
}

/** "Told in N other shiurim" for a story moment of a merged story told in another shiur, else null. */
export function storyMark(shiur: CorpusOf, momentId: string): StoryMark | null {
  const x = arr(corpusOf(shiur).stories).find((s) => s.momentId === momentId);
  if (!x || typeof x.otherShiurim !== "number" || x.otherShiurim < 1) return null;
  return { storyId: x.storyId, others: x.otherShiurim, page: x.page === true };
}

/**
 * The people of a story moment: the merged story's people from the corpus layer (a chip with a
 * Live page, else a corpus entity's display name). A story moment with no merged story names no
 * one: the extraction's raw names may be ASR mishearings and are never shown (F.1).
 */
export function storyPeople(shiur: CorpusOf, momentId: string): StoryPerson[] {
  const x = arr(corpusOf(shiur).stories).find((s) => s.momentId === momentId);
  return arr(x?.people).filter(
    (p): p is StoryPerson =>
      typeof p === "object" &&
      p !== null &&
      (("id" in p && typeof p.id === "string" && typeof p.label === "object" && p.label !== null) ||
        ("name" in p && typeof p.name === "string" && p.name.trim() !== "")),
  );
}

export interface WorkGroup {
  /** Corpus work id (merged), else the source's own work key or name, else "". */
  key: string;
  /** Corpus work id when the layer resolved the sources to one work. */
  workId: string | null;
  /** Whether Live has the work's page. */
  page: boolean;
  /** The heading: the name the sources give most often (first seen on a tie), or null. */
  work: string | null;
  sources: PublicSource[];
}

/**
 * Sources in order of first appearance, grouped by merged work (concept-live-corpus D "Sources tab
 * grouped by merged work"): two spellings the layer merged ("Gemara Yoma", "Yoma") share a group.
 * Sources the layer did not resolve keep the per-shiur grouping by work key.
 */
export function groupSourcesByWork(shiur: Pick<ShiurFile, "corpus" | "notes">): WorkGroup[] {
  const sources = arr(shiur.notes?.sources);
  const byMoment = new Map<string, { workId: string; page: boolean }>();
  for (const x of arr(corpusOf(shiur).sources)) {
    if (typeof x.momentId === "string" && typeof x.workId === "string" && x.workId !== "") byMoment.set(x.momentId, { workId: x.workId, page: x.page === true });
  }
  const groups = new Map<string, WorkGroup>();
  const names = new Map<string, Map<string, number>>();
  const ordered = [...sources].sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity) || a.idx - b.idx);
  for (const s of ordered) {
    const merged = byMoment.get(s.id);
    const key = merged ? `w:${merged.workId}` : `s:${s.workKey ?? s.work ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      g = { key: merged ? merged.workId : (s.workKey ?? s.work ?? ""), workId: merged?.workId ?? null, page: merged?.page ?? false, work: null, sources: [] };
      groups.set(key, g);
      names.set(key, new Map());
    }
    g.sources.push(s);
    if (s.work) {
      const n = names.get(key)!;
      n.set(s.work, (n.get(s.work) ?? 0) + 1);
    }
  }
  for (const [key, g] of groups) {
    let best: string | null = null;
    let bestN = 0;
    for (const [name, n] of names.get(key)!) {
      if (n > bestN) {
        best = name;
        bestN = n;
      }
    }
    g.work = best;
  }
  return [...groups.values()];
}

/** The generated text of an insight-like moment of this shiur (insight, key point, takeaway). */
export function momentText(shiur: Pick<ShiurFile, "notes">, momentId: string): LocalizedText | null {
  const n = shiur.notes;
  if (!n) return null;
  const m = arr(n.insights).find((x) => x.id === momentId) ?? arr(n.summary?.keyPoints).find((x) => x.id === momentId) ?? arr(n.takeaways).find((x) => x.id === momentId);
  return m ? m.text : null;
}

export interface ThreadThrough {
  threadId: string;
  /** The insight of this shiur that sits in the thread. */
  momentId: string;
  text: LocalizedText | null;
  t: number | null;
  others: number;
  years: [number, number] | null;
}

/** Threads with a page that pass through this shiur, once each, in the order of their insights. */
export function threadsThrough(shiur: Pick<ShiurFile, "corpus" | "notes">): ThreadThrough[] {
  const out: ThreadThrough[] = [];
  const seen = new Set<string>();
  for (const x of arr(corpusOf(shiur).insights)) {
    const mark = insightMark(shiur, x.momentId);
    if (mark?.kind !== "thread" || seen.has(mark.threadId)) continue;
    seen.add(mark.threadId);
    const m = arr(shiur.notes?.insights).find((i) => i.id === x.momentId);
    out.push({ threadId: mark.threadId, momentId: x.momentId, text: momentText(shiur, x.momentId), t: m?.t ?? null, others: mark.others, years: mark.years });
  }
  return out;
}

export type EndOfShiur =
  /** The next part of the series this shiur belongs to. */
  | { kind: "next"; shiurId: string }
  /** No next part: continue a thread from this shiur. */
  | { kind: "thread"; thread: ThreadThrough }
  /** No thread either: more on the shiur's top topic. */
  | { kind: "topic"; topic: EntityChip };

/**
 * What the room offers when the shiur ends (concept-live-corpus D): the next part if the shiur is in
 * a series; otherwise a thread from this shiur or more on its top topic. It is an offer: nothing
 * auto-plays across shiurim.
 */
export function endOfShiur(shiur: Pick<ShiurFile, "corpus" | "notes" | "series" | "related">): EndOfShiur | null {
  if (shiur.series && shiur.related.next) return { kind: "next", shiurId: shiur.related.next };
  const thread = threadsThrough(shiur)[0];
  if (thread) return { kind: "thread", thread };
  const topic = mainTopics(shiur, 1)[0];
  if (topic?.page) return { kind: "topic", topic };
  return null;
}

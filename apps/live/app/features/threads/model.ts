/**
 * Thread pages (concept-live-corpus C.1, corpus-wave-plan C3.3), as pure functions over
 * `/data/thread/<id>.json`.
 *
 * - Members are ordered by Hebrew year, earliest first; members with no year form an "undated" group
 *   that always comes last. Within a year the file's order is kept.
 * - The year line is a timeline only when the build says so (the layer sets `timeline` from the
 *   owner's `threads.timelineMinDated`, 3 by default: "a timeline with one dot on it says nothing")
 *   and the page has at least two dated rows to put on it. A file without the flag (shape change)
 *   falls back to the default rule of three dated members. Otherwise it is a plain list.
 * - "Play the thread" queues every timed member in that order, keeping only the members the
 *   listener's shiur-language filter lets through, and says how many were left out per language
 *   ("3 more in Yiddish"). Language is a property of each member (F.1): nothing pairs a Yiddish
 *   member with an English one, and the page never says the wording is the same.
 */
import type { Ed, L } from "@emunas/corpus/public";
import type { CorpusMember, ThreadFile } from "../../data/index.ts";
import type { AudioFilter } from "../../shell/settings.ts";

/** A member row: the shiur, its year and language, and the shiur's own insight text. */
export type ThreadMember = CorpusMember & { text: L | null };

/** The default `threads.timelineMinDated` (corpus-wave-plan D3), used only when the file has no flag. */
export const TIMELINE_MIN_DATED = 3;

const LANGS: readonly Ed[] = ["en", "yi"];

const isYear = (y: unknown): y is number => typeof y === "number" && Number.isFinite(y);

/** The members, read defensively: rows without a shiur or moment id are dropped, duplicates once. */
export function cleanMembers(members: unknown): ThreadMember[] {
  if (!Array.isArray(members)) return [];
  const seen = new Set<string>();
  const out: ThreadMember[] = [];
  for (const m of members as Partial<ThreadMember>[]) {
    if (!m || typeof m.shiurId !== "string" || typeof m.momentId !== "string" || m.shiurId === "" || m.momentId === "") continue;
    if (seen.has(m.momentId)) continue;
    seen.add(m.momentId);
    out.push({
      shiurId: m.shiurId,
      momentId: m.momentId,
      t: typeof m.t === "number" && Number.isFinite(m.t) ? m.t : null,
      year: isYear(m.year) ? m.year : null,
      lang: m.lang === "yi" ? "yi" : "en",
      title: typeof m.title === "string" ? m.title : "",
      chapterTitle: m.chapterTitle ?? null,
      text: m.text ?? null,
    });
  }
  return out;
}

/** Year order, earliest first; undated last; the input order within a year (a stable sort). */
export function orderMembers<T extends Pick<CorpusMember, "year">>(members: readonly T[]): T[] {
  return members
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ya = a.m.year;
      const yb = b.m.year;
      if (ya === null && yb === null) return a.i - b.i;
      if (ya === null) return 1;
      if (yb === null) return -1;
      return ya - yb || a.i - b.i;
    })
    .map((x) => x.m);
}

/** One year on the line, with the members from that year. */
export interface YearGroup<T> {
  year: number;
  members: T[];
}

export interface ThreadLayout<T> {
  /** The year line as a timeline (true) or a plain list (false). */
  timeline: boolean;
  /** Dated members grouped by year, earliest first. */
  years: YearGroup<T>[];
  /** Members with no year, last. */
  undated: T[];
  /** Distinct shiurim among the members. */
  shiurCount: number;
}

/** How the page lays out its members. */
export function threadLayout<T extends Pick<CorpusMember, "year" | "shiurId">>(
  file: { timeline?: unknown },
  members: readonly T[],
): ThreadLayout<T> {
  const ordered = orderMembers(members);
  const years: YearGroup<T>[] = [];
  const undated: T[] = [];
  for (const m of ordered) {
    if (m.year === null) {
      undated.push(m);
      continue;
    }
    const last = years[years.length - 1];
    if (last && last.year === m.year) last.members.push(m);
    else years.push({ year: m.year, members: [m] });
  }
  const dated = ordered.length - undated.length;
  const flag = typeof file.timeline === "boolean" ? file.timeline : dated >= TIMELINE_MIN_DATED;
  return { timeline: flag && dated >= 2, years, undated, shiurCount: new Set(ordered.map((m) => m.shiurId)).size };
}

/** A member as the queue takes it. */
export interface ThreadQueueItem {
  shiurId: string;
  momentId: string;
  start: number;
  lang: Ed;
}

export interface ThreadQueue {
  /** In year order (undated last), only what the language filter lets through and has a time. */
  items: ThreadQueueItem[];
  /** Members the language filter left out, per language (only languages with any). */
  leftOut: { lang: Ed; count: number }[];
  /** Members the filter let through that have no time in the recording and cannot be played. */
  untimed: number;
}

/** "Play the thread": the queue for the listener's shiur-language filter. */
export function threadQueue(members: readonly Pick<CorpusMember, "shiurId" | "momentId" | "t" | "year" | "lang">[], audio: AudioFilter): ThreadQueue {
  const items: ThreadQueueItem[] = [];
  const out = new Map<Ed, number>();
  let untimed = 0;
  for (const m of orderMembers(members)) {
    if (audio !== "both" && m.lang !== audio) {
      out.set(m.lang, (out.get(m.lang) ?? 0) + 1);
      continue;
    }
    if (m.t === null) {
      untimed++;
      continue;
    }
    items.push({ shiurId: m.shiurId, momentId: m.momentId, start: m.t, lang: m.lang });
  }
  return { items, leftOut: LANGS.flatMap((lang) => (out.get(lang) ? [{ lang, count: out.get(lang)! }] : [])), untimed };
}

/** The thread file's members, cleaned. */
export function membersOf(file: Pick<ThreadFile, "members">): ThreadMember[] {
  return cleanMembers(file.members);
}

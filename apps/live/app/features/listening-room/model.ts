/**
 * Pure helpers of the listening room (no React, no DOM): deep links (`?t=` and `&m=`), moment lookup,
 * clickable catalog topics, the active write-up paragraph and Sefaria links (source grouping by merged
 * work is in `corpus.ts`).
 */
import type { PublicSource, PublicWriteupBlock, SectionKind } from "@emunas/corpus/public";
import { parseMomentId } from "@emunas/links";
import type { LiveNotes, ShiurFile } from "./data.ts";

/** Chapter kinds that are greyed and skipped by default (concept-live §5.3). */
export const SKIPPED_KINDS: ReadonlySet<SectionKind> = new Set<SectionKind>(["noise", "singing", "other_speaker"]);
/** Chapter kinds shown collapsed (summary behind a disclosure). */
export const COLLAPSED_KINDS: ReadonlySet<SectionKind> = new Set<SectionKind>(["intro", "closing", "brachah"]);

export interface TimeSpan {
  t: number;
  end: number | null;
}

/**
 * Seconds from a `?t=` value: a non-negative number (`754`, `754.5`). `h/m/s` forms (`12m34s`) are
 * accepted too because people type them. Anything else is null.
 */
export function parseTimeParam(raw: string | null): number | null {
  if (raw === null) return null;
  const v = raw.trim();
  if (/^\d+(?:\.\d+)?$/.test(v)) return Number(v);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(v);
  if (!m || v === "") return null;
  const [, h, min, s] = m;
  return Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

/** The time span of a moment of this shiur by id (`<shiurId>~<kind><n>`), null when unknown or untimed. */
export function momentSpan(shiur: Pick<ShiurFile, "id" | "notes">, momentId: string): TimeSpan | null {
  const parsed = parseMomentId(momentId);
  const notes = shiur.notes;
  if (!parsed || parsed.shiurId !== shiur.id || !notes) return null;
  const pick = (t: number | null, end: number | null): TimeSpan | null => (t === null ? null : { t, end });
  switch (parsed.kind) {
    case "s": {
      const c = notes.chapters.find((x) => x.id === momentId);
      return c ? { t: c.t, end: c.end } : null;
    }
    case "kp": {
      const m = notes.summary.keyPoints.find((x) => x.id === momentId);
      return m ? pick(m.t, m.end) : null;
    }
    case "i": {
      const m = notes.insights.find((x) => x.id === momentId);
      return m ? pick(m.t, m.end) : null;
    }
    case "tk": {
      const m = notes.takeaways.find((x) => x.id === momentId);
      return m ? pick(m.t, m.end) : null;
    }
    case "q": {
      const q = notes.questions.find((x) => x.id === momentId);
      if (!q) return null;
      if (q.tq !== null) return { t: q.tq, end: null };
      return pick(q.ta, null);
    }
    case "st": {
      const s = notes.stories.find((x) => x.id === momentId);
      return s ? pick(s.t, s.end) : null;
    }
  }
}

export interface DeepLink {
  /** Global seconds to open at, or null for "from the start / where the listener was". */
  start: number | null;
  /** The moment the link names, when it exists in this shiur (focused in the page). */
  momentId: string | null;
}

/**
 * Reads `?t=` and `&m=` (concept-live §6.3). A known, timed moment wins; otherwise `t`. Values are
 * clamped to the shiur; a `t` beyond its end is ignored.
 */
export function resolveDeepLink(shiur: Pick<ShiurFile, "id" | "notes" | "duration">, search: string | URLSearchParams): DeepLink {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const m = q.get("m");
  const span = m ? momentSpan(shiur, m) : null;
  const known = m !== null && span !== null ? m : null;
  let start = span?.t ?? parseTimeParam(q.get("t"));
  if (start !== null && (!Number.isFinite(start) || start < 0 || start >= Math.max(shiur.duration, 0.001))) start = null;
  return { start, momentId: known };
}

/**
 * For each catalog topic (the catalog title split on ';'), the start of the first chapter the
 * extraction tied to it (`catalogTopicIdx`), or null when no chapter names it.
 */
export function topicTargets(topicCount: number, notes: Pick<LiveNotes, "chapters"> | undefined): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: topicCount }, () => null);
  if (!notes) return out;
  for (const c of notes.chapters) {
    for (const i of c.catalogTopicIdx) {
      if (i >= 0 && i < topicCount && out[i] === null) out[i] = c.t;
    }
  }
  return out;
}

/** Id of the write-up paragraph being spoken about at `t` (its evidence span contains `t`), or null. */
export function activeParagraphId(blocks: readonly PublicWriteupBlock[], t: number): string | null {
  let found: string | null = null;
  for (const b of blocks) {
    for (const p of b.paragraphs) {
      if (p.t !== null && p.end !== null && p.t <= t && t < p.end) found = p.id;
    }
  }
  return found;
}

/** Index of the chapter playing at `t` in a chapters list (the last one starting at or before it). */
export function chapterAt(chapters: readonly { t: number }[], t: number): number {
  let found = -1;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i]!.t <= t + 0.05) found = i;
    else break;
  }
  return found;
}

/**
 * Sefaria URL for a resolved reference (`Deuteronomy 10:12` → `https://www.sefaria.org/Deuteronomy.10.12`,
 * `Song of Songs 2:3` → `Song_of_Songs.2.3`, `Berakhot 5a` → `Berakhot.5a`). Only resolved sources
 * link out (C8); null otherwise.
 */
export function sefariaUrl(source: Pick<PublicSource, "resolution" | "sefariaRef">): string | null {
  if (source.resolution !== "resolved" || !source.sefariaRef) return null;
  const ref = source.sefariaRef.trim();
  if (ref === "") return null;
  const m = /^(.*?)\s+(\d+[ab]?(?:[:.]\d+[ab]?)*(?:-\d+[ab]?(?:[:.]\d+)*)?)$/.exec(ref);
  const path = m ? `${m[1]!.replace(/\s+/g, "_")}.${m[2]!.replace(/:/g, ".")}` : ref.replace(/\s+/g, "_");
  return `https://www.sefaria.org/${encodeURI(path).replace(/[?#]/g, encodeURIComponent)}`;
}

/** Whether the shiur has anything the player can play. */
export function hasPlayableAudio(shiur: Pick<ShiurFile, "recordings">): boolean {
  return shiur.recordings.some((r) => r.playable);
}

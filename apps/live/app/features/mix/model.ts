/**
 * The topic mix (concept-live-corpus C.3), pure: a queue of *sections*, never shiurim.
 *
 * - The pool: the sections tagged with the topic (the topic file's first moments plus its moment
 *   pages), `main` and `story` chapters only (the data emits only those; a section that states any
 *   other kind, e.g. `other_speaker`, is dropped here too), in the listener's audio language.
 * - Best first: shiurim with the highest salience for the topic first. The data lists sections best
 *   first already (shiur salience, then year, then catalog order), so without a salience table the
 *   order of first appearance is the rank; with one, known saliences sort first.
 * - One section per shiur until the pool runs out (round robin over the ranked shiurim), then the
 *   first `size` (12) items.
 *
 * Deterministic: the same input gives the same mix. Language is a property of each item; nothing
 * pairs a Yiddish and an English section.
 */
import type { Ed, LocalizedText } from "@emunas/corpus/public";

export const MIX_SIZE = 12;

/** Chapter kinds that go into a mix (concept-live C.3). */
export const MIX_KINDS: readonly string[] = ["main", "story"];

export type AudioFilter = "both" | Ed;

/** A tagged section, as the topic file and its moment pages give it. */
export interface MixSource {
  /** `<shiurId>~s<idx>` */
  id: string;
  shiurId: string;
  t: number;
  end: number;
  lang: Ed;
  /** Present on the topic file's first moments; the later pages carry ids and times only. */
  title?: LocalizedText | null;
  year?: number | null;
  /** The chapter kind, when the source states it. */
  kind?: string;
}

export interface MixOptions {
  audio: AudioFilter;
  /** Items in the mix (default 12). */
  size?: number;
  /** Shiur id → salience for the topic (higher first); shiurim not in it follow, in input order. */
  salience?: ReadonlyMap<string, number>;
}

export interface Mix<T extends MixSource = MixSource> {
  items: T[];
  /** The pool after the kind and language filters. */
  sections: number;
  shiurim: number;
  /** Sum of the items' lengths, in seconds. */
  seconds: number;
}

/** The pool: valid, de-duplicated sections of a mix kind in the listener's language, input order kept. */
export function mixPool<T extends MixSource>(sources: readonly T[], audio: AudioFilter): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of sources) {
    if (seen.has(s.id)) continue;
    if (s.kind !== undefined && !MIX_KINDS.includes(s.kind)) continue;
    if (audio !== "both" && s.lang !== audio) continue;
    if (!Number.isFinite(s.t) || !Number.isFinite(s.end) || s.end <= s.t) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

/** Shiur ids of the pool, best first. */
export function rankShiurim(pool: readonly MixSource[], salience?: ReadonlyMap<string, number>): string[] {
  const first = new Map<string, number>();
  pool.forEach((s, i) => {
    if (!first.has(s.shiurId)) first.set(s.shiurId, i);
  });
  const sal = (id: string): number => {
    const v = salience?.get(id);
    return v === undefined || !Number.isFinite(v) ? Number.NEGATIVE_INFINITY : v;
  };
  return [...first.keys()].sort((a, b) => {
    const sa = sal(a);
    const sb = sal(b);
    if (sa !== sb) return sb > sa ? 1 : -1;
    return first.get(a)! - first.get(b)!;
  });
}

/** Round robin over the ranked shiurim: one section each per round, in each shiur's input order. */
export function interleave<T extends MixSource>(pool: readonly T[], order: readonly string[]): T[] {
  const per = new Map<string, T[]>();
  for (const s of pool) {
    let list = per.get(s.shiurId);
    if (!list) per.set(s.shiurId, (list = []));
    list.push(s);
  }
  const longest = Math.max(0, ...[...per.values()].map((l) => l.length));
  const out: T[] = [];
  for (let round = 0; round < longest; round++) {
    for (const id of order) {
      const x = per.get(id)?.[round];
      if (x) out.push(x);
    }
  }
  return out;
}

export function topicMix<T extends MixSource>(sources: readonly T[], opts: MixOptions): Mix<T> {
  const size = Math.max(0, Math.floor(opts.size ?? MIX_SIZE));
  const pool = mixPool(sources, opts.audio);
  const order = rankShiurim(pool, opts.salience);
  const items = interleave(pool, order).slice(0, size);
  return {
    items,
    sections: pool.length,
    shiurim: order.length,
    seconds: items.reduce((n, s) => n + (s.end - s.t), 0),
  };
}

/** Whole minutes for "about N minutes" (at least 1 for a non-empty mix). */
export function aboutMinutes(seconds: number): number {
  return seconds <= 0 ? 0 : Math.max(1, Math.round(seconds / 60));
}

/**
 * The occasion mix (concept-live-corpus C.3, D "Today", E.5; corpus-wave-plan C3.4), pure.
 *
 * "This week" on Today gains one button that plays a mix for the current parsha or zman. The mix is
 * a queue of *sections*, like the topic mix (`model.ts`), assembled from two sources:
 *
 * - **The head, inline in the Today file** (`today.<lang>.json`). The build takes the occasion's
 *   topic (occasion-topics of the corpus layer, D11), applies the featured rules and puts the first
 *   sections in the occasion's entry, preferring sections from the occasion's own catalog shiurim.
 *   The button plays these without another request.
 * - **The rest, from the topic's moment list** (`topic/<id>.json`, the first sections with times), on
 *   demand once the head is playing. The pool is drawn from both the occasion's catalog shiurim and
 *   the topic's section tags: sections of the occasion's own shiurim come first, then the other
 *   tagged sections, one section per shiur until the pool runs out.
 *
 * Featured eligibility (D7, E.5): no section of a shiur mostly by another speaker
 * (`otherSpeakerShare ≥ policy.featured.maxOtherSpeakerShare`) and none tagged with a topic in
 * `policy.featured.excludeTopicIds`. The build applies both to the head and names what the topic's
 * moment list holds that may not be featured in `mix.skip` (shiur ids and section ids); this module
 * drops those from every item. A mix whose topic is itself excluded is never emitted (`mix: null`).
 *
 * Deterministic: the same inputs give the same mix. Language is a property of each item (the audio
 * filter drops items, it never pairs a Yiddish and an English section). Everything optional in the
 * data is read defensively, since the data keeps growing and its shape may change.
 */
import type { Ed, LocalizedText } from "@emunas/corpus/public";
import type { ReaderText } from "../../data/types.ts";
import { MIX_SIZE, mixPool, type AudioFilter, type Mix, type MixSource } from "./model.ts";

/** The parts of a Today file mix item this module reads (the shiur is the id's prefix). */
export interface OccasionMixHead {
  id: string;
  t: number;
  end: number;
  title?: LocalizedText | ReaderText | null;
}

/** The parts of a Today file occasion mix this module reads. */
export interface OccasionMixData {
  topicId: string;
  first?: readonly OccasionMixHead[] | null;
  skip?: readonly string[] | null;
}

/** The parts of a Today file occasion this module reads. */
export interface OccasionData {
  shiurIds?: readonly string[] | null;
  moments?: readonly { id: string }[] | null;
  mix?: OccasionMixData | null;
}

/** `<shiurId>~<kind><n>` → `<shiurId>`. */
export function shiurOf(momentId: string): string {
  const at = momentId.indexOf("~");
  return at < 0 ? momentId : momentId.slice(0, at);
}

const list = <T>(x: readonly T[] | null | undefined): readonly T[] => (Array.isArray(x) ? x : []);

/**
 * Featured eligibility (D7): an item is out when its shiur or its own section id is in `skip`.
 */
export function isFeatured(item: Pick<MixSource, "id" | "shiurId">, skip: ReadonlySet<string>): boolean {
  return !skip.has(item.shiurId) && !skip.has(item.id);
}

/** The skip set of an occasion mix (read defensively). */
export function skipSet(mix: OccasionMixData | null | undefined): Set<string> {
  return new Set(list(mix?.skip).filter((x): x is string => typeof x === "string"));
}

/**
 * The occasion's catalog shiurim as the Today file knows them: its row and the shiurim of its moment
 * pool, over every key of the occasion (both parts of a combined parsha), in that order.
 */
export function occasionCatalog(occasions: readonly (OccasionData | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const o of occasions) {
    for (const id of list(o?.shiurIds)) if (typeof id === "string") out.add(id);
    for (const m of list(o?.moments)) if (typeof m?.id === "string") out.add(shiurOf(m.id));
  }
  return [...out];
}

/**
 * The head as mix sources: each inline item with its shiur and the shiur's audio language from the
 * Today file's cards. An item whose card is missing is dropped (its language is unknown).
 */
export function headSources(mix: OccasionMixData | null | undefined, langOf: (shiurId: string) => Ed | undefined): MixSource[] {
  const out: MixSource[] = [];
  for (const x of list(mix?.first)) {
    if (typeof x?.id !== "string") continue;
    const shiurId = shiurOf(x.id);
    const lang = langOf(shiurId);
    if (lang === undefined) continue;
    out.push({ id: x.id, shiurId, t: x.t, end: x.end, lang, ...(x.title ? { title: x.title } : {}) });
  }
  return out;
}

export interface OccasionMixInput<T extends MixSource = MixSource> {
  /** The inline head (Today file), in its order. */
  head: readonly T[];
  /** The topic's tagged sections (topic file moments, then any later pages), best first. */
  topic?: readonly T[];
  /** The occasion's catalog shiurim; their sections come first in the rest. */
  catalog?: Iterable<string>;
  /** Shiur and section ids that may not be featured (`mix.skip`). */
  skip?: Iterable<string>;
  audio: AudioFilter;
  /** Items in the mix (default 12, as the topic mix). */
  size?: number;
}

/**
 * The occasion mix: the eligible head in its order, then the rest of the pool, one section per shiur
 * per round (a shiur already in the head waits for the next round), catalog shiurim before the
 * others within a round, input order otherwise. `sections`/`shiurim` count the eligible pool in the
 * listener's language.
 */
export function occasionMix<T extends MixSource>(input: OccasionMixInput<T>): Mix<T> {
  const size = Math.max(0, Math.floor(input.size ?? MIX_SIZE));
  const skip = new Set(input.skip ?? []);
  const catalog = new Set(input.catalog ?? []);
  const eligible = (x: T) => isFeatured(x, skip);

  const head = mixPool(input.head, input.audio).filter(eligible);
  const inHead = new Set(head.map((x) => x.id));
  const rest = mixPool(input.topic ?? [], input.audio).filter((x) => eligible(x) && !inHead.has(x.id));

  const taken = new Map<string, number>();
  for (const x of head) taken.set(x.shiurId, (taken.get(x.shiurId) ?? 0) + 1);
  const firstSeen = new Map<string, number>();
  rest.forEach((x, i) => {
    if (!firstSeen.has(x.shiurId)) firstSeen.set(x.shiurId, i);
  });
  const rank = (shiurId: string): number => (catalog.has(shiurId) ? 0 : 1) * rest.length + (firstSeen.get(shiurId) ?? 0);

  const seenPerShiur = new Map<string, number>();
  const ordered = rest
    .map((x, i) => {
      const n = seenPerShiur.get(x.shiurId) ?? 0;
      seenPerShiur.set(x.shiurId, n + 1);
      return { x, i, round: (taken.get(x.shiurId) ?? 0) + n, rank: rank(x.shiurId) };
    })
    .sort((a, b) => a.round - b.round || a.rank - b.rank || a.i - b.i)
    .map((e) => e.x);

  const items = [...head, ...ordered].slice(0, size);
  return {
    items,
    sections: head.length + rest.length,
    shiurim: new Set([...head, ...rest].map((x) => x.shiurId)).size,
    seconds: items.reduce((n, s) => n + (s.end - s.t), 0),
  };
}

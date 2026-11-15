/**
 * Inverted index of the visible topic tags (docs/corpus-data.md "How the pieces join"): shiur-level
 * salience and section-level tags per topic, for visible shiurim only. Section tags on chapters
 * that did not survive projection or that are by another speaker are dropped (plan §3.2). Topic ids
 * are resolved through the retired-id redirects; unknown ids are counted and dropped.
 */
import { cmpStr, type LayerContext } from "./context.ts";

export interface TagIndex {
  /** topic → shiur → highest shiur-level salience. */
  shiurLevel: Map<string, Map<string, number>>;
  /** topic → shiur → tagged section indexes. */
  sectionLevel: Map<string, Map<string, Set<number>>>;
  /** shiur → section idx → topic ids (visible chapters only), in tag order. */
  sectionsOf: Map<string, Map<number, string[]>>;
  /** shiur → [topic id, salience] (shiur level), highest salience first. */
  topicsOf: Map<string, { id: string; salience: number }[]>;
  /** Tag references to topic ids that do not exist. */
  unknownTopicRefs: number;
}

export function buildTagIndex(ctx: LayerContext): TagIndex {
  const shiurLevel = new Map<string, Map<string, number>>();
  const sectionLevel = new Map<string, Map<string, Set<number>>>();
  const sectionsOf = new Map<string, Map<number, string[]>>();
  const topicsOf = new Map<string, { id: string; salience: number }[]>();
  let unknownTopicRefs = 0;
  const topic = (raw: string): string | null => {
    const id = ctx.resolve("topics", raw);
    if (id === null) unknownTopicRefs++;
    return id;
  };

  for (const shiurId of ctx.visibleIds) {
    const tags = ctx.tags(shiurId);
    if (!tags) continue;
    const own = new Map<string, number>();
    for (const t of tags.topics) {
      const id = topic(t.id);
      if (id === null) continue;
      own.set(id, Math.max(own.get(id) ?? 0, t.salience));
    }
    for (const [id, salience] of own) {
      let m = shiurLevel.get(id);
      if (!m) shiurLevel.set(id, (m = new Map()));
      m.set(shiurId, salience);
    }
    topicsOf.set(
      shiurId,
      [...own].map(([id, salience]) => ({ id, salience })).sort((a, b) => b.salience - a.salience || cmpStr(a.id, b.id)),
    );

    const secs = new Map<number, string[]>();
    for (const sec of tags.sections) {
      if (!ctx.V.isVisibleSectionTag(shiurId, sec.index)) continue;
      const ids: string[] = secs.get(sec.index) ?? [];
      for (const raw of sec.topicIds) {
        const id = topic(raw);
        if (id === null || ids.includes(id)) continue;
        ids.push(id);
        let m = sectionLevel.get(id);
        if (!m) sectionLevel.set(id, (m = new Map()));
        let s = m.get(shiurId);
        if (!s) m.set(shiurId, (s = new Set()));
        s.add(sec.index);
      }
      if (ids.length > 0) secs.set(sec.index, ids);
    }
    if (secs.size > 0) sectionsOf.set(shiurId, secs);
  }
  return { shiurLevel, sectionLevel, sectionsOf, topicsOf, unknownTopicRefs };
}

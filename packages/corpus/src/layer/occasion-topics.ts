/**
 * occasion-topics.json (D11; Live H.4, Quiet C4.1): which topic belongs to a parsha or zman.
 * A topic's own `parsha`/`zman` keys (catalog spellings, mapped to the site's occasion keys) win
 * over the derived rule. When several topics list one key, the most specific wins: the deeper
 * level, then the topic listing fewer keys of that kind, then the id. A topic whose descendants
 * list parsha keys too is a container for the parsha cycle (a sefer topic lists every parsha of
 * its sefer as a calendar join, docs/corpus-data.md), not the subject of one parsha: its parsha
 * keys give no occasion link (its zman keys do: a yom tov topic is the subject of its own days,
 * and its children's days go to the children by depth). Otherwise the link is
 * derived: among level-2/3 topics, the one tagged (shiur level, salience ≥ minSalience) on the
 * largest share of the occasion's visible catalogued shiurim, if that share is ≥ minShare.
 * Occasions with fewer than OCCASION_MIN_SHIURIM visible shiurim get no derived link (a share of
 * one shiur says nothing). Guessed parsha/zman values (file names) do not count.
 */
import { OCCASIONS, OTHER_OCCASION_KEY, PARSHIYOS, lookupParsha, lookupZman } from "@emunas/normalize";
import { isGuessedOccasion } from "../aggregate/aggregate.ts";
import type { LayerOccasionTopic, LayerOccasionTopicsFile } from "../public/corpus-layer.ts";
import { cmpStr, type LayerContext } from "./context.ts";
import type { TagIndex } from "./tag-index.ts";

export const OCCASION_MIN_SHIURIM = 3;

const PARSHA_KEYS = new Set(PARSHIYOS.map((p) => p.key));
const ZMAN_KEYS = new Set(OCCASIONS.map((o) => o.key));

/** A topic's `parsha`/`zman` value as a table key (a key as given, else looked up by name). */
function keyOf(kind: "parsha" | "zman", raw: string): string | null {
  const known = kind === "parsha" ? PARSHA_KEYS : ZMAN_KEYS;
  if (known.has(raw)) return raw;
  const m = kind === "parsha" ? lookupParsha(raw) : lookupZman(raw);
  return m.status === "mapped" ? m.key : null;
}

export function buildOccasionTopics(ctx: LayerContext, tags: TagIndex): LayerOccasionTopicsFile {
  const out = new Map<string, LayerOccasionTopic>();
  // 1. From the data.
  const claim = new Map<string, { level: number; keys: number; id: string }>();
  let unmapped = 0;
  const live = ctx.input.topics.filter((t) => ctx.isLive("topics", t.id));
  // Topics with a descendant that lists parsha keys (parent chain through live parents).
  const parshaContainers = new Set<string>();
  const parentOf = new Map(live.map((t) => [t.id, t.parentId === null ? null : ctx.resolve("topics", t.parentId)]));
  for (const t of live) {
    if (t.parsha.length === 0) continue;
    const seen = new Set([t.id]);
    for (let p = parentOf.get(t.id) ?? null; p !== null && !seen.has(p); p = parentOf.get(p) ?? null) {
      seen.add(p);
      parshaContainers.add(p);
    }
  }
  for (const t of live) {
    for (const kind of ["parsha", "zman"] as const) {
      if (kind === "parsha" && parshaContainers.has(t.id)) continue;
      const keys = new Set<string>();
      for (const raw of t[kind]) {
        const key = keyOf(kind, raw);
        if (key === null) unmapped++;
        else keys.add(key);
      }
      for (const key of keys) {
        const id = `${kind}:${key}`;
        const prev = claim.get(id);
        const mine = { level: t.level, keys: keys.size, id: t.id };
        if (!prev || mine.level > prev.level || (mine.level === prev.level && (mine.keys < prev.keys || (mine.keys === prev.keys && mine.id < prev.id)))) {
          claim.set(id, mine);
          out.set(id, { key, kind, topicId: t.id, source: "data", share: null });
        }
      }
    }
  }
  if (unmapped > 0) ctx.warnings.push(`occasion-topics: ${unmapped} topic parsha/zman values not in the occasion tables (not linked)`);

  // 2. Derived for the occasions the data does not link.
  const occasionShiurim = new Map<string, { kind: "parsha" | "zman"; key: string; ids: string[] }>();
  for (const shiurId of ctx.visibleIds) {
    const s = ctx.shiur(shiurId)!;
    if (isGuessedOccasion(s)) continue;
    for (const [kind, v] of [["parsha", s.parsha], ["zman", s.zman]] as const) {
      if (!v || v.key === OTHER_OCCASION_KEY) continue;
      const id = `${kind}:${v.key}`;
      const e = occasionShiurim.get(id) ?? { kind, key: v.key, ids: [] };
      e.ids.push(shiurId);
      occasionShiurim.set(id, e);
    }
  }
  const candidates = ctx.input.topics.filter((t) => ctx.isLive("topics", t.id) && (t.level === 2 || t.level === 3));
  const { minShare, minSalience } = ctx.policy.occasionTopic;
  for (const [id, occ] of occasionShiurim) {
    if (out.has(id) || occ.ids.length < OCCASION_MIN_SHIURIM) continue;
    let best: { topicId: string; level: number; n: number } | null = null;
    for (const t of candidates) {
      const sal = tags.shiurLevel.get(t.id);
      if (!sal) continue;
      let n = 0;
      for (const sid of occ.ids) if ((sal.get(sid) ?? 0) >= minSalience) n++;
      if (n === 0) continue;
      if (!best || n > best.n || (n === best.n && (t.level > best.level || (t.level === best.level && t.id < best.topicId)))) {
        best = { topicId: t.id, level: t.level, n };
      }
    }
    if (!best) continue;
    const share = best.n / occ.ids.length;
    if (share >= minShare) out.set(id, { key: occ.key, kind: occ.kind, topicId: best.topicId, source: "derived", share: Math.round(share * 1000) / 1000 });
  }
  const occasions = [...out.values()].sort((a, b) => cmpStr(a.kind, b.kind) || cmpStr(a.key, b.key));
  return { occasions };
}

/** topic id → occasion keys (`<kind>:<key>` is not needed: parsha and zman keys do not collide). */
export function occasionsByTopic(file: LayerOccasionTopicsFile): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const o of file.occasions) {
    const l = m.get(o.topicId) ?? [];
    if (!l.includes(o.key)) l.push(o.key);
    m.set(o.topicId, l);
  }
  return m;
}

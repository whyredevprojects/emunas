/**
 * The moments unit (tech-live §4.3): filter shiurim with the facets, then stream
 * `moments/<lang>-<n>.json` shards and keep the moments of matching shiurim. Shards are cached per
 * reading language for the session, so switching units or filters never refetches.
 *
 * Moment-level entity facets: the shards carry no per-moment entity links (W2.4 contract), so a
 * work/person/concept facet narrows moments through their shiur's entity arrays only.
 */
import type { UiLang } from "@emunas/i18n";
import { useEffect, useState } from "react";
import { loadBuild, loadMomentShard, type MomentKind, type MomentRow } from "./live-data.ts";

interface LangCache {
  shards: MomentRow[][];
  total: number | null;
  loading: Promise<void> | null;
  error: unknown;
  listeners: Set<() => void>;
}

const caches = new Map<UiLang, LangCache>();

function cacheFor(lang: UiLang): LangCache {
  let c = caches.get(lang);
  if (!c) caches.set(lang, (c = { shards: [], total: null, loading: null, error: null, listeners: new Set() }));
  return c;
}

/** Test hook: forget every loaded shard. */
export function clearMomentCache(): void {
  caches.clear();
}

function startLoading(lang: UiLang, c: LangCache): void {
  if (c.loading || (c.total !== null && c.shards.length >= c.total)) return;
  const notify = () => c.listeners.forEach((l) => l());
  c.error = null;
  c.loading = (async () => {
    try {
      const build = await loadBuild();
      c.total = build.momentShards[lang] ?? 0;
      notify();
      for (let n = c.shards.length; n < c.total; n++) {
        const shard = await loadMomentShard(lang, n);
        c.shards.push(shard.moments);
        notify();
      }
    } catch (e) {
      c.error = e;
    } finally {
      c.loading = null;
      notify();
    }
  })();
}

export interface MomentStream {
  moments: readonly MomentRow[];
  loadedShards: number;
  totalShards: number | null;
  done: boolean;
  error: unknown;
}

/** All moments of a reading language, growing as shards arrive. Inactive (no requests) when `enabled` is false. */
export function useMomentStream(lang: UiLang, enabled: boolean): MomentStream {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const c = cacheFor(lang);
    const l = () => bump((n) => n + 1);
    c.listeners.add(l);
    startLoading(lang, c);
    l();
    return () => {
      c.listeners.delete(l);
    };
  }, [lang, enabled]);
  const c = caches.get(lang);
  const shards = c?.shards ?? [];
  return {
    moments: flatten(shards),
    loadedShards: shards.length,
    totalShards: c?.total ?? null,
    done: c !== undefined && c.total !== null && shards.length >= c.total && c.loading === null,
    error: c?.error ?? null,
  };
}

const flatCache = new WeakMap<MomentRow[][], { n: number; rows: MomentRow[] }>();

function flatten(shards: MomentRow[][]): MomentRow[] {
  const hit = flatCache.get(shards);
  if (hit && hit.n === shards.length) return hit.rows;
  const rows = shards.flat();
  flatCache.set(shards, { n: shards.length, rows });
  return rows;
}

/**
 * Moments whose shiur is in `shiurIds` (null = every shiur) and whose kind is in `kinds`
 * (empty = every kind), in shard order (catalog order, then position in the shiur).
 */
export function filterMoments(
  moments: readonly MomentRow[],
  shiurIds: ReadonlySet<string> | null,
  kinds: readonly MomentKind[],
): MomentRow[] {
  const kindSet = kinds.length === 0 ? null : new Set(kinds);
  return moments.filter((m) => (shiurIds === null || shiurIds.has(m.shiurId)) && (kindSet === null || kindSet.has(m.kind)));
}

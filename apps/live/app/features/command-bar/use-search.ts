/**
 * React state for the two search paths (tech-live §4.4):
 * - `useQuickSearch`: the lazily loaded client engine (suggestions; shiur-level matching).
 * - `useSuggestions`: the engine's suggestions plus "Tanya 12" jumps from the named series' files.
 * - `useFullSearch`: `/api/search` for a committed query (with corpus-id entity filters), falling back
 *   to the client engine's shiur-level results when the browser is offline or the request fails
 *   ("showing shiur-level results").
 */
import type { Ed } from "@emunas/corpus/public";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSearch, SearchApiError, type ApiResponse, type EntityFilters } from "./api.ts";
import { seriesPartSuggestions, type QuickSearch, type ShiurHit, type Suggestion } from "./engine.ts";
import { loadExploreEntities } from "./live-data.ts";
import { loadQuickSearch, loadSeriesParts } from "./load.ts";
import { filtersKey, hasFilters, parseFiltersKey } from "./model.ts";

export type QuickStatus = "idle" | "loading" | "ready" | "error";

export interface QuickState {
  status: QuickStatus;
  engine: QuickSearch | null;
  /** Starts loading (idempotent). Call on focus. */
  ensure: () => void;
}

export function useQuickSearch(ui: Ed, eager = false): QuickState {
  const [state, setState] = useState<{ status: QuickStatus; engine: QuickSearch | null; ui: Ed }>({
    status: "idle",
    engine: null,
    ui,
  });
  const started = useRef<Ed | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const ensure = useCallback(() => {
    if (started.current === ui) return;
    started.current = ui;
    setState({ status: "loading", engine: null, ui });
    loadQuickSearch(ui).then(
      (engine) => {
        if (live.current && started.current === ui) setState({ status: "ready", engine, ui });
      },
      () => {
        if (live.current && started.current === ui) {
          started.current = null; // retry on next focus
          setState({ status: "error", engine: null, ui });
        }
      },
    );
  }, [ui]);

  useEffect(() => {
    if (eager) ensure();
  }, [eager, ensure]);

  // Interface language changed: the engine is per language.
  if (state.ui !== ui && started.current !== ui) {
    return { status: "idle", engine: null, ensure };
  }
  return { status: state.status, engine: state.engine, ensure };
}

/**
 * Suggestions for `q`: "Tanya 12" jumps first (from the named series' files, fetched on demand and
 * cached), then the engine's years, occasions, series and corpus entities. Capped at `limit`.
 */
export function useSuggestions(engine: QuickSearch | null, q: string, limit: number): Suggestion[] {
  const query = q.trim();
  const base = useMemo(() => (engine && query ? engine.suggest(query, limit) : []), [engine, query, limit]);
  const [parts, setParts] = useState<{ q: string; list: Suggestion[] }>({ q: "", list: [] });
  useEffect(() => {
    const targets = engine && query ? engine.seriesTargets(query) : [];
    if (targets.length === 0) return;
    let live = true;
    void Promise.all(
      targets.map((tg) =>
        loadSeriesParts(tg.seriesKey).then(
          (file) => seriesPartSuggestions(file, tg),
          () => [] as Suggestion[],
        ),
      ),
    ).then((lists) => {
      if (live) setParts({ q: query, list: lists.flat() });
    });
    return () => {
      live = false;
    };
  }, [engine, query]);
  return useMemo(() => [...(parts.q === query ? parts.list : []), ...base].slice(0, limit), [parts, query, base, limit]);
}

export type FallbackReason = "offline" | "failed";

export type FullState =
  | { phase: "idle" }
  | { phase: "loading"; q: string }
  | { phase: "api"; q: string; pages: ApiResponse[]; next: string | null; loadingMore: boolean; stale: boolean }
  | { phase: "fallback"; q: string; reason: FallbackReason; hits: ShiurHit[] | null; error: boolean };

export interface FullSearch {
  state: FullState;
  more: () => void;
}

export interface FullSearchOptions {
  ui: Ed;
  audio?: Ed[];
  limit?: number;
  /** Corpus-id entity filters (topic, concept, person, work); sent to the API as they are. */
  filters?: EntityFilters;
}

const PLURAL = { topic: "topics", concept: "concepts", person: "people", work: "works" } as const;

/** Shiur-level hits restricted to shiurim carrying every filtered entity (Explore's corpus ids per shiur). */
async function filterHits(hits: ShiurHit[], filters: EntityFilters): Promise<ShiurHit[]> {
  if (!hasFilters(filters)) return hits;
  const file = await loadExploreEntities();
  const kinds = Object.keys(PLURAL) as (keyof typeof PLURAL)[];
  return hits.filter((h) => {
    const e = file.shiurim[h.shiurId];
    return e !== undefined && kinds.every((k) => (filters[k] ?? []).every((id) => (e[PLURAL[k]] ?? []).includes(id)));
  });
}

function reasonOf(e: unknown): FallbackReason {
  return e instanceof SearchApiError && e.reason === "offline" ? "offline" : "failed";
}

function isAbort(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

/** Runs a full search for `q` (null or blank = idle). Re-runs when `q`, `ui` or the audio filter change. */
export function useFullSearch(q: string | null, opts: FullSearchOptions): FullSearch {
  const { ui, limit } = opts;
  const audioKey = (opts.audio ?? []).join(",");
  const fKey = filtersKey(opts.filters ?? {});
  const [state, setState] = useState<FullState>({ phase: "idle" });
  const stateRef = useRef(state);
  stateRef.current = state;
  const moreCtrl = useRef<AbortController | null>(null);
  const query = q?.trim() ?? "";

  const fallback = useCallback(
    (fq: string, reason: FallbackReason, isCurrent: () => boolean) => {
      setState({ phase: "fallback", q: fq, reason, hits: null, error: false });
      loadQuickSearch(ui)
        .then((engine) => filterHits(engine.shiurs(fq, 30), parseFiltersKey(fKey)))
        .then(
          (hits) => {
            if (isCurrent()) setState({ phase: "fallback", q: fq, reason, hits, error: false });
          },
          () => {
            if (isCurrent()) setState({ phase: "fallback", q: fq, reason, hits: [], error: true });
          },
        );
    },
    [ui, fKey],
  );

  useEffect(() => {
    moreCtrl.current?.abort();
    if (query.length === 0) {
      setState({ phase: "idle" });
      return;
    }
    const ctrl = new AbortController();
    const isCurrent = () => !ctrl.signal.aborted;
    setState({ phase: "loading", q: query });
    const audio = audioKey ? (audioKey.split(",") as Ed[]) : undefined;
    const filters = parseFiltersKey(fKey);
    fetchSearch({ q: query, ui, filters, ...(audio ? { audio } : {}), ...(limit ? { limit } : {}) }, { signal: ctrl.signal }).then(
      (res) => {
        if (isCurrent()) setState({ phase: "api", q: query, pages: [res], next: res.next, loadingMore: false, stale: false });
      },
      (e: unknown) => {
        if (isAbort(e) || !isCurrent()) return;
        fallback(query, reasonOf(e), isCurrent);
      },
    );
    return () => ctrl.abort();
  }, [query, ui, audioKey, fKey, limit, fallback]);

  const more = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "api" || !s.next || s.loadingMore) return;
    const ctrl = new AbortController();
    moreCtrl.current = ctrl;
    setState({ ...s, loadingMore: true });
    const audio = audioKey ? (audioKey.split(",") as Ed[]) : undefined;
    fetchSearch(
      { q: s.q, ui, cursor: s.next, filters: parseFiltersKey(fKey), ...(audio ? { audio } : {}), ...(limit ? { limit } : {}) },
      { signal: ctrl.signal },
    ).then(
      (res) => {
        if (ctrl.signal.aborted) return;
        setState((cur) =>
          cur.phase === "api" && cur.q === s.q
            ? { ...cur, pages: [...cur.pages, res], next: res.next, loadingMore: false }
            : cur,
        );
      },
      (e: unknown) => {
        if (isAbort(e) || ctrl.signal.aborted) return;
        const stale = e instanceof SearchApiError && e.reason === "stale";
        // Keep what is shown; a failed "more" only stops paging.
        setState((cur) => (cur.phase === "api" && cur.q === s.q ? { ...cur, next: null, loadingMore: false, stale } : cur));
      },
    );
  }, [ui, audioKey, fKey, limit]);

  useEffect(() => () => moreCtrl.current?.abort(), []);

  return { state, more };
}

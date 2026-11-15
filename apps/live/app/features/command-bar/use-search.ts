/**
 * React state for the two search paths (tech-live §4.4):
 * - `useQuickSearch`: the lazily loaded client engine (suggestions; shiur-level matching).
 * - `useFullSearch`: `/api/search` for a committed query, falling back to the client engine's
 *   shiur-level results when the browser is offline or the request fails ("showing shiur-level results").
 */
import type { Ed } from "@emunas/corpus/public";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSearch, SearchApiError, type ApiResponse } from "./api.ts";
import type { QuickSearch, ShiurHit } from "./engine.ts";
import { loadQuickSearch } from "./load.ts";

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
  const [state, setState] = useState<FullState>({ phase: "idle" });
  const stateRef = useRef(state);
  stateRef.current = state;
  const moreCtrl = useRef<AbortController | null>(null);
  const query = q?.trim() ?? "";

  const fallback = useCallback(
    (fq: string, reason: FallbackReason, isCurrent: () => boolean) => {
      setState({ phase: "fallback", q: fq, reason, hits: null, error: false });
      loadQuickSearch(ui).then(
        (engine) => {
          if (isCurrent()) setState({ phase: "fallback", q: fq, reason, hits: engine.shiurs(fq, 30), error: false });
        },
        () => {
          if (isCurrent()) setState({ phase: "fallback", q: fq, reason, hits: [], error: true });
        },
      );
    },
    [ui],
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
    fetchSearch({ q: query, ui, ...(audio ? { audio } : {}), ...(limit ? { limit } : {}) }, { signal: ctrl.signal }).then(
      (res) => {
        if (isCurrent()) setState({ phase: "api", q: query, pages: [res], next: res.next, loadingMore: false, stale: false });
      },
      (e: unknown) => {
        if (isAbort(e) || !isCurrent()) return;
        fallback(query, reasonOf(e), isCurrent);
      },
    );
    return () => ctrl.abort();
  }, [query, ui, audioKey, limit, fallback]);

  const more = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "api" || !s.next || s.loadingMore) return;
    const ctrl = new AbortController();
    moreCtrl.current = ctrl;
    setState({ ...s, loadingMore: true });
    const audio = audioKey ? (audioKey.split(",") as Ed[]) : undefined;
    fetchSearch(
      { q: s.q, ui, cursor: s.next, ...(audio ? { audio } : {}), ...(limit ? { limit } : {}) },
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
  }, [ui, audioKey, limit]);

  useEffect(() => () => moreCtrl.current?.abort(), []);

  return { state, more };
}

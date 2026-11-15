/**
 * Data for the listening room: `/data/shiur/<id>.json` (required) and the facet labels (optional,
 * for the series title and the other-language series). Loaded in the component rather than a route
 * `clientLoader` so the page renders its `h1` immediately (focus after navigation lands on it) and
 * keeps working inside the shell test router; W4.5 can add a prerender `loader` that seeds `initial`.
 */
import type { L } from "@emunas/corpus/public";
import { useCallback, useEffect, useState } from "react";
import {
  DataError,
  loadCorpus,
  loadFacets,
  loadShiur,
  loadWriteup,
  type CorpusRow,
  type Ed,
  type FacetsFile,
  type ShiurFile,
  type WriteupFile,
} from "./data.ts";

export type RoomData =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; shiur: ShiurFile; facets: FacetsFile | null };

export function useRoomData(shiurId: string): RoomData {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<RoomData>({ status: "loading" });
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setData({ status: "loading" });
    const facets = loadFacets().catch(() => null);
    loadShiur(shiurId)
      .then(async (shiur) => {
        const f = await facets;
        if (live) setData({ status: "ready", shiur, facets: f });
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof DataError && e.status === 404) setData({ status: "notFound" });
        else setData({ status: "error", retry });
      });
    return () => {
      live = false;
    };
  }, [shiurId, attempt, retry]);

  return data;
}

/** The series title (both languages) from the facets, or null. */
export function seriesTitle(shiur: Pick<ShiurFile, "series">, facets: FacetsFile | null): L | null {
  if (!shiur.series || !facets) return null;
  const v = facets.series[shiur.series.id];
  return v ? { en: v.label.en, yi: v.label.yi } : null;
}

export type WriteupState =
  | { status: "loading"; lang: Ed }
  | { status: "missing"; lang: Ed }
  | { status: "ready"; lang: Ed; file: WriteupFile };

/** The write-up in `lang` (lazy, per language). */
export function useWriteup(shiur: Pick<ShiurFile, "id" | "notes">, lang: Ed): WriteupState {
  const available = shiur.notes?.writeupLangs.includes(lang) ?? false;
  const [state, setState] = useState<WriteupState>({ status: available ? "loading" : "missing", lang });
  useEffect(() => {
    if (!available) {
      setState({ status: "missing", lang });
      return;
    }
    let live = true;
    setState({ status: "loading", lang });
    loadWriteup(shiur.id, lang)
      .then((file) => {
        if (live) setState({ status: "ready", lang, file });
      })
      .catch(() => {
        if (live) setState({ status: "missing", lang });
      });
    return () => {
      live = false;
    };
  }, [shiur.id, lang, available]);
  return state;
}

/** Corpus rows by id (titles for Related), loaded when first needed. */
export function useCorpusRows(enabled: boolean): Map<string, CorpusRow> | null {
  const [rows, setRows] = useState<Map<string, CorpusRow> | null>(null);
  useEffect(() => {
    if (!enabled || rows) return;
    let live = true;
    loadCorpus()
      .then((c) => {
        if (live) setRows(new Map(c.shiurim.map((r) => [r.id, r])));
      })
      .catch(() => {
        if (live) setRows(new Map());
      });
    return () => {
      live = false;
    };
  }, [enabled, rows]);
  return rows;
}

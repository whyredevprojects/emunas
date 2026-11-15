/**
 * Data for the listening room: `/data/shiur/<id>.json`, and nothing else on first paint. The shiur
 * file is self-contained (concept-live-corpus G.1, corpus-wave-plan §4): the series title, the titles
 * of the related shiurim and the corpus-layer labels are all inside it, so the room never waits on
 * `corpus.json`, `facets.json` or any corpus-wide file. Loaded in the component rather than a route
 * `clientLoader` so the page renders its `h1` immediately (focus after navigation lands on it) and
 * keeps working inside the shell test router; W4.5 can add a prerender `loader` that seeds `initial`.
 */
import type { L } from "@emunas/corpus/public";
import { useCallback, useEffect, useState } from "react";
import { DataError, loadShiur, loadWriteup, type Ed, type ShiurFile, type WriteupFile } from "./data.ts";

export type RoomData =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; shiur: ShiurFile };

export function useRoomData(shiurId: string): RoomData {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<RoomData>({ status: "loading" });
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setData({ status: "loading" });
    loadShiur(shiurId)
      .then((shiur) => {
        if (live) setData({ status: "ready", shiur });
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

/** The series title (both languages) from the shiur file, or null. */
export function seriesTitle(shiur: Pick<ShiurFile, "series" | "seriesTitle">): L | null {
  if (!shiur.series || !shiur.seriesTitle) return null;
  return { en: shiur.seriesTitle.en, yi: shiur.seriesTitle.yi };
}

/** Title, audio language and years of a shiur the file names (related, thread pointers). */
export type RelatedTitle = ShiurFile["related"]["titles"][string];

/** Titles of the shiurim the room links to, from the shiur file itself. */
export function relatedTitles(shiur: Pick<ShiurFile, "related">): ReadonlyMap<string, RelatedTitle> {
  return new Map(Object.entries(shiur.related.titles));
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

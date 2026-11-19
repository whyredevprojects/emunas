/**
 * Data for the listening room: `/data/shiur/<id>.json`, and nothing else on first paint. The shiur
 * file is self-contained (concept-live-corpus G.1, corpus-wave-plan §4): the series title, the titles
 * of the related shiurim and the corpus-layer labels are all inside it, so the room never waits on
 * `corpus.json`, `facets.json` or any corpus-wide file. Loaded in the component rather than a route
 * `clientLoader` so the page renders its `h1` immediately (focus after navigation lands on it) and
 * keeps working inside the shell test router; W4.5 can add a prerender `loader` that seeds `initial`.
 */
import type { LocalizedText } from "@emunas/corpus/public";
import { CONTENT_FALLBACK, type UiLang } from "@emunas/i18n";
import { useCallback, useEffect, useState } from "react";
import { DataError, loadShiur, loadWriteup, type ShiurFile, type WriteupFile } from "./data.ts";

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

/** The series title (every language it has) from the shiur file, or null. */
export function seriesTitle(shiur: Pick<ShiurFile, "series" | "seriesTitle">): LocalizedText | null {
  if (!shiur.series || !shiur.seriesTitle) return null;
  return shiur.seriesTitle;
}

/** Title, audio language and years of a shiur the file names (related, thread pointers). */
export type RelatedTitle = ShiurFile["related"]["titles"][string];

/** Titles of the shiurim the room links to, from the shiur file itself. */
export function relatedTitles(shiur: Pick<ShiurFile, "related">): ReadonlyMap<string, RelatedTitle> {
  return new Map(Object.entries(shiur.related.titles));
}

/**
 * The write-up states. `lang` is the language of the write-up shown (or about to be): the reading
 * language when the shiur has a write-up in it, else the next language along `CONTENT_FALLBACK`
 * that has one; `fallback` is true when that is not the reading language.
 */
export type WriteupState =
  | { status: "loading"; lang: UiLang; fallback: boolean }
  | { status: "missing"; lang: UiLang; fallback: boolean }
  | { status: "ready"; lang: UiLang; fallback: boolean; file: WriteupFile };

/** The language whose write-up a reader of `read` gets: the first along `CONTENT_FALLBACK` the shiur has. */
export function writeupLangFor(shiur: Pick<ShiurFile, "notes">, read: UiLang): UiLang | null {
  const have = shiur.notes?.writeupLangs ?? [];
  return CONTENT_FALLBACK[read].find((l) => have.includes(l)) ?? null;
}

/** The write-up for a reader of `read` (lazy, per language), falling back along `CONTENT_FALLBACK`. */
export function useWriteup(shiur: Pick<ShiurFile, "id" | "notes">, read: UiLang): WriteupState {
  const chosen = writeupLangFor(shiur, read);
  const lang = chosen ?? read;
  const fallback = lang !== read;
  const [state, setState] = useState<WriteupState>({ status: chosen ? "loading" : "missing", lang, fallback });
  useEffect(() => {
    if (chosen === null) {
      setState({ status: "missing", lang, fallback });
      return;
    }
    let live = true;
    setState({ status: "loading", lang, fallback });
    loadWriteup(shiur.id, chosen)
      .then((file) => {
        if (live) setState({ status: "ready", lang, fallback, file });
      })
      .catch(() => {
        if (live) setState({ status: "missing", lang, fallback });
      });
    return () => {
      live = false;
    };
  }, [shiur.id, chosen, lang, fallback]);
  return state;
}

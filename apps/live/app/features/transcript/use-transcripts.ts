/**
 * Loads the public transcript files of a shiur's recordings (`/data/transcript/<recordingId>.json`).
 * A recording without an approved file simply has none (404, or the SPA fallback's HTML): it gets no
 * text and the tab does not appear for it. Only reachable when TRANSCRIPT_VIEW is on.
 */
import { useEffect, useState } from "react";
import { parseTranscriptFile, transcriptPath, type TranscriptFile } from "./contract.ts";

export type TranscriptFetch = (input: string, init?: { signal?: AbortSignal | null }) => Promise<Response>;

let fetcher: TranscriptFetch = (input, init) => globalThis.fetch(input, init ?? undefined);

/** Tests and fixture mode replace the fetch implementation. */
export function configureTranscriptFetch(f: TranscriptFetch | null): void {
  fetcher = f ?? ((input, init) => globalThis.fetch(input, init ?? undefined));
}

/** The approved files among `recordingIds` (missing or malformed files are left out). */
export async function loadTranscripts(
  recordingIds: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, TranscriptFile>> {
  const out = new Map<string, TranscriptFile>();
  await Promise.all(
    recordingIds.map(async (id) => {
      const path = transcriptPath(id);
      if (!path) return;
      try {
        const res = await fetcher(path, { signal: signal ?? null });
        if (!res.ok) return;
        const file = parseTranscriptFile(await res.json(), id);
        if (file) out.set(id, file);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
      }
    }),
  );
  return new Map(recordingIds.filter((id) => out.has(id)).map((id) => [id, out.get(id)!]));
}

export type TranscriptsState = { status: "loading" } | { status: "ready"; files: ReadonlyMap<string, TranscriptFile> };

export function useTranscripts(shiur: { id: string; recordings: readonly { id: string }[] }): TranscriptsState {
  const [state, setState] = useState<TranscriptsState>({ status: "loading" });
  const key = shiur.recordings.map((r) => r.id).join("\n");
  useEffect(() => {
    const ctl = new AbortController();
    setState({ status: "loading" });
    loadTranscripts(key === "" ? [] : key.split("\n"), ctl.signal)
      .then((files) => setState({ status: "ready", files }))
      .catch(() => {
        if (!ctl.signal.aborted) setState({ status: "ready", files: new Map() });
      });
    return () => ctl.abort();
  }, [key]);
  return state;
}

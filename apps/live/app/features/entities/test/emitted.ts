/**
 * Test helper (Node only, not shipped): runs the real Live data emitter (W3.6, `data-build/`) over a
 * corpus built from `data/` (the @emunas/corpus mini corpus, or the repo's data) and serves the
 * emitted files through the data client's fetch hook, so the pages are tested against exactly the
 * files a deploy would publish.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readCorpusInput } from "../../../../data-build/corpus-input.ts";
import { emitLiveData } from "../../../../data-build/emit.ts";
import { GENERATED_AT, MINI_DATA, MINI_POLICY, REAL_DATA, REAL_POLICY, buildCorpusTo } from "../../../../data-build/test-helpers.ts";
import { dataFileOf, type DataFetch } from "../live-data.ts";

export type Emitted = ReadonlyMap<string, unknown>;

function emitFrom(dataDir: string, policyDir: string): Emitted {
  const corpusDir = buildCorpusTo(dataDir, policyDir);
  return emitLiveData(readCorpusInput(corpusDir), { generatedAt: GENERATED_AT }) as Emitted;
}

let mini: Emitted | null = null;
let real: Emitted | null = null;

/** The mini corpus, emitted once per test file. */
export function emittedMini(): Emitted {
  return (mini ??= emitFrom(MINI_DATA, MINI_POLICY));
}

export const HAVE_REAL_DATA = existsSync(join(REAL_DATA, "derived/ingest.json"));

/** The repo's real data, emitted once per test file (about 30 s). */
export function emittedReal(): Emitted {
  return (real ??= emitFrom(REAL_DATA, REAL_POLICY));
}

/** A `DataFetch` serving the emitted files (404 for anything else). */
export function emittedFetch(files: Emitted): DataFetch {
  return async (input) => {
    const path = new URL(input, "http://x.invalid").pathname;
    const file = dataFileOf(path);
    const body = file === null ? undefined : files.get(file);
    if (body === undefined) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
}

/** Files under `prefix` (`entity/p/`, `work/`), as keys without the `.json` suffix. */
export function keysUnder(files: Emitted, prefix: string): string[] {
  return [...files.keys()].filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes("/")).map((f) => f.slice(prefix.length, -".json".length));
}

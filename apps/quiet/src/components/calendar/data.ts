/**
 * Build-time loader for the calendar and year pages: reads `.corpus/index.json`,
 * `occasions.json` and `years.json` (integration-plan §5.1; apps read `.corpus/` only, never
 * `data/`). Runs in Astro's `getStaticPaths` and page frontmatter, never in the browser.
 *
 * Where `.corpus/` is: `EMUNAS_CORPUS_DIR` if set, else the nearest `.corpus/` with an
 * `index.json` in the build's working directory or one of its parents (the repo root when the app
 * is built with `npm run build -w @emunas/quiet`). Without a corpus (a shell-only build such as
 * the design-shell e2e test) the calendar and year pages are not generated and a warning is
 * printed once; CI always runs `corpus:build` first.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { CalendarData } from "./model.ts";

export function findCorpusDir(start: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env["EMUNAS_CORPUS_DIR"];
  if (fromEnv) return existsSync(join(fromEnv, "index.json")) ? resolve(fromEnv) : null;
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, ".corpus");
    if (existsSync(join(candidate, "index.json"))) return candidate;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function readJson<T>(dir: string, name: string): T {
  return JSON.parse(readFileSync(join(dir, name), "utf8")) as T;
}

/** Reads the three files from a corpus directory. Throws if one is missing or not JSON. */
export function readCalendarData(dir: string): CalendarData {
  return {
    index: readJson(dir, "index.json"),
    occasions: readJson(dir, "occasions.json"),
    years: readJson(dir, "years.json"),
  };
}

let cached: { dir: string | null; data: CalendarData | null } | undefined;
let warned = false;

/** The corpus for this build (memoised), or null when there is no `.corpus/`. */
export function loadCalendarData(): CalendarData | null {
  if (cached === undefined) {
    const dir = findCorpusDir();
    cached = { dir, data: dir ? readCalendarData(dir) : null };
  }
  if (!cached.data && !warned) {
    warned = true;
    console.warn("[quiet] no .corpus/ found (run `npm run corpus:build`): calendar and year pages are skipped");
  }
  return cached.data;
}

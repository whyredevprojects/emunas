/**
 * A `fetch` that serves the committed fixture tree (`./data/**`) for `/data/*` URLs. Used by tests and
 * by dev mode with `VITE_LIVE_DATA=fixtures` (see `../client.ts`); never part of a production bundle
 * (the dev branch is removed at build time and the files load lazily).
 */
import { dataFileOf } from "../paths.ts";
import type { DataFetch } from "../client.ts";

const files = import.meta.glob<unknown>("./data/**/*.json", { import: "default" });

/** Relative fixture file names (`shiur/<id>.json`, …), sorted. */
export function fixtureFileNames(): string[] {
  return Object.keys(files)
    .map((k) => k.slice("./data/".length))
    .sort();
}

export const fixtureFetch: DataFetch = async (input) => {
  const path = new URL(input, "http://fixtures.invalid").pathname;
  const file = dataFileOf(path);
  const load = file === null ? undefined : files[`./data/${file}`];
  if (!load) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
  const body = await load();
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
};

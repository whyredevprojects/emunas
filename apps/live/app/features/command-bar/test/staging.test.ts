/**
 * Smoke test against a deployed API (staging): `LIVE_STAGING_ORIGIN=https://<staging live host> npm test`.
 * The api Worker has no public hostname (workers_dev: false); it is reached through the Live site
 * Worker's `/api/*` service binding, so the origin is the staging Live site.
 *
 * Without the variable this suite does not run (there is nothing to reach from a developer machine or
 * an offline CI job); the same client code is covered against recorded responses in `api.test.ts`,
 * `command-bar.test.tsx` and `search-page.test.tsx`.
 */
import { afterAll, describe, expect, it } from "vitest";
import { ALLOWED_KEYS } from "../../../../../../workers/api/src/contract.ts";
import { configureSearchApi, fetchSearch, resetSearchApi, searchUrl } from "../api.ts";

const origin = process.env["LIVE_STAGING_ORIGIN"]?.replace(/\/+$/, "") ?? "";

describe.runIf(origin !== "")("staging /api/search", () => {
  afterAll(() => resetSearchApi());

  it("returns full results that fit the client contract for an English and a Yiddish query", async () => {
    configureSearchApi({ base: origin, timeoutMs: 15000 });
    for (const [q, ui] of [
      ["noach", "en"],
      ["תשובה", "yi"],
    ] as const) {
      // raw body: exactly the allowed keys
      const raw = (await (await fetch(searchUrl({ q, ui, limit: 5 }, origin))).json()) as Record<string, unknown>;
      expect(Object.keys(raw).sort()).toEqual([...ALLOWED_KEYS.search]);
      for (const r of raw["results"] as Record<string, unknown>[]) {
        expect(Object.keys(r).sort()).toEqual([...ALLOWED_KEYS.searchResult]);
      }
      // through the client
      const res = await fetchSearch({ q, ui, limit: 5 });
      expect(res.results.length, `${ui}: ${q}`).toBeGreaterThan(0);
      expect(res.groups.length).toBeGreaterThan(0);
    }
  });
});

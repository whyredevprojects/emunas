/**
 * The e2e server answers `/data/*` from the committed contract fixtures, whatever a local
 * `npm run data:build` left in `public/data/` (and so in `build/client/data/`): every other spec
 * asserts on fixture shiurim (W4.9).
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixture = (rel: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../app/data/fixtures/data/${rel}`, import.meta.url), "utf8"));

test("serves /data/* from the contract fixtures", async ({ request }) => {
  for (const rel of ["build.json", "corpus.json", "shiur/yi-tanya-1-01.json"]) {
    const res = await request.get(`/data/${rel}`);
    expect(res.status(), rel).toBe(200);
    expect(await res.json(), rel).toEqual(fixture(rel));
  }
});

test("a data file missing from the fixtures is a 404, not the app shell", async ({ request }) => {
  const res = await request.get("/data/shiur/no-such-shiur.json");
  expect(res.status()).toBe(404);
});

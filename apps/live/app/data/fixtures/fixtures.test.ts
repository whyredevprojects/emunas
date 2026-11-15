/**
 * The committed fixture tree (`./data/**`) is generated from the golden projected shiurim of
 * `@emunas/corpus` (`packages/corpus/test/fixtures/golden/*.json`). This test regenerates it in memory
 * and fails when the committed files are stale. To rewrite them after an intended change:
 *
 *   UPDATE_LIVE_FIXTURES=1 npx vitest run app/data/fixtures --root apps/live
 */
import { SCHEMA_VERSION } from "@emunas/corpus/public";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deriveLiveData, type DeriveOptions, type FixtureShiur } from "./derive.ts";

const here = dirname(fileURLToPath(import.meta.url));
const goldenDir = join(here, "../../../../../packages/corpus/test/fixtures/golden");
const outDir = join(here, "data");

export const FIXTURE_OPTIONS: DeriveOptions = {
  buildId: "fixtures",
  generatedAt: "2026-11-15T00:00:00.000Z",
  corpusSchemaVersion: SCHEMA_VERSION,
  seriesTitles: { "tanya-yi": { en: "Tanya", yi: "תניא" } },
  updatedAt: {
    "en-miscellaneous-en-01": "2026-11-10T08:00:00.000Z",
    "en-parsha-en-nch-01": "2026-11-12T08:00:00.000Z",
    "yi-parshas-hashavua-brshys-01": "2026-11-14T08:00:00.000Z",
    "yi-zmanim-lvl-01": "2026-11-01T08:00:00.000Z",
    "yi-zmanim-tv-bb-04": "2026-11-13T08:00:00.000Z",
  },
};

function goldens(): FixtureShiur[] {
  return readdirSync(goldenDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(goldenDir, f), "utf8")) as FixtureShiur);
}

function listFiles(dir: string, prefix = ""): string[] {
  let out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out = out.concat(listFiles(join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

const serialize = (v: unknown): string => `${JSON.stringify(v, null, 1)}\n`;

describe("live data fixtures", () => {
  const derived = deriveLiveData(goldens(), FIXTURE_OPTIONS);

  if (process.env["UPDATE_LIVE_FIXTURES"] === "1") {
    rmSync(outDir, { recursive: true, force: true });
    for (const [file, body] of derived) {
      const path = join(outDir, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, serialize(body));
    }
  }

  it("covers the golden shiurim, both statuses and a multi-recording shiur", () => {
    const ids = goldens().map((g) => g.id);
    expect(ids.length).toBeGreaterThanOrEqual(7);
    for (const id of ids) expect(derived.has(`shiur/${id}.json`)).toBe(true);
    const statuses = new Set(goldens().map((g) => g.status));
    expect(statuses).toEqual(new Set(["full", "catalog-only"]));
    expect(goldens().some((g) => g.recordings.length > 1)).toBe(true);
  });

  it("committed fixture files equal the regenerated ones", () => {
    const committed = listFiles(outDir);
    expect(committed).toEqual([...derived.keys()].sort());
    for (const [file, body] of derived) {
      expect(readFileSync(join(outDir, file), "utf8"), file).toBe(serialize(body));
    }
  });

  it("is deterministic", () => {
    const again = deriveLiveData([...goldens()].reverse(), FIXTURE_OPTIONS);
    expect([...again.keys()].sort()).toEqual([...derived.keys()].sort());
    for (const [k, v] of derived) expect(serialize(again.get(k))).toBe(serialize(v));
  });
});

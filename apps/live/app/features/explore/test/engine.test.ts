/**
 * The facet engine against a brute-force reference: for random filter combinations over a
 * 997-row corpus shaped like the real one, the result set and every facet count must equal what a
 * plain row-by-row filter gives. Also the < 5 ms budget per query (tech-live §4.3).
 */
import { describe, expect, it } from "vitest";
import { count, countAnd, emptySet, fullSet, hasBit, indices, popcount32, setBit } from "../bitset.ts";
import { FacetEngine } from "../engine.ts";
import type { ExploreRow as CorpusRow } from "../entities.ts";
import { FACET_KEYS, rowValues, SET_FACETS, UNDATED, yearMatches, type ExploreFilters, type FacetKey, type SetFacet } from "../model.ts";
import { FacetHost } from "../protocol.ts";
import { createFacetService } from "../facet-client.ts";
import { rand, syntheticRows, type Rand } from "./synthetic.ts";

// ------------------------------------------------------------------------------- the reference

function passes(row: CorpusRow, f: ExploreFilters, skip: FacetKey | null): boolean {
  for (const facet of SET_FACETS) {
    if (facet === skip) continue;
    const sel = f.sets[facet];
    if (!sel || sel.length === 0) continue;
    const vals = rowValues(row, facet);
    if (!sel.some((v) => vals.includes(v))) return false;
  }
  if (skip !== "year" && f.year !== null) {
    const yf = f.year;
    if (!rowValues(row, "year").some((v) => yearMatches(v, yf))) return false;
  }
  return true;
}

function reference(rows: readonly CorpusRow[], f: ExploreFilters) {
  const matches = rows.flatMap((r, i) => (passes(r, f, null) ? [i] : []));
  const counts = {} as Record<FacetKey, Record<string, number>>;
  for (const facet of FACET_KEYS) {
    const c: Record<string, number> = {};
    for (const r of rows) for (const v of rowValues(r, facet)) c[v] ??= 0;
    for (const r of rows) {
      if (!passes(r, f, facet)) continue;
      for (const v of new Set(rowValues(r, facet))) c[v] = (c[v] ?? 0) + 1;
    }
    counts[facet] = c;
  }
  return { matches, counts };
}

// ------------------------------------------------------------------------------- random filters

function randomFilters(R: Rand, rows: readonly CorpusRow[]): ExploreFilters {
  const sets: Partial<Record<SetFacet, string[]>> = {};
  const nFacets = R.int(4);
  for (let k = 0; k < nFacets; k++) {
    const facet = R.pick(SET_FACETS);
    // pick values that exist (from random rows) and sometimes one that does not
    const vals = new Set<string>();
    const nVals = 1 + R.int(3);
    for (let j = 0; j < nVals; j++) {
      const v = rowValues(R.pick(rows), facet);
      if (v.length) vals.add(R.pick(v));
    }
    if (R.chance(0.05)) vals.add("no-such-value");
    if (vals.size) sets[facet] = [...vals];
  }
  const yr = R.next();
  const year: ExploreFilters["year"] =
    yr < 0.6 ? null : yr < 0.75 ? { kind: "undated" } : (() => {
      const a = 5724 + R.int(57);
      return { kind: "range", from: a, to: a + R.int(15) };
    })();
  return { sets, year };
}

const rows = syntheticRows();

describe("bitsets", () => {
  it("popcount matches a naive count", () => {
    const R = rand(7);
    for (let i = 0; i < 2000; i++) {
      const x = Math.floor(R.next() * 2 ** 32) >>> 0;
      const naive = x.toString(2).split("").filter((c) => c === "1").length;
      expect(popcount32(x)).toBe(naive);
    }
  });

  it("full sets, indices and counts", () => {
    for (const size of [0, 1, 31, 32, 33, 997]) {
      const b = fullSet(size);
      expect(count(b)).toBe(size);
      expect([...indices(b)]).toEqual(Array.from({ length: size }, (_, i) => i));
    }
    const a = emptySet(100);
    const b = emptySet(100);
    [0, 31, 32, 63, 64, 99].forEach((i) => setBit(a, i));
    [31, 64, 98].forEach((i) => setBit(b, i));
    expect(countAnd(a, b)).toBe(2);
    expect(hasBit(a, 99)).toBe(true);
    expect(hasBit(a, 98)).toBe(false);
    expect([...indices(a)]).toEqual([0, 31, 32, 63, 64, 99]);
  });
});

describe("facet engine", () => {
  const engine = new FacetEngine(rows);

  it("with no filters, matches everything and counts equal the facet tallies", () => {
    const r = engine.query({ sets: {}, year: null });
    expect(r.total).toBe(rows.length);
    expect(r.counts.lang["yi"]! + r.counts.lang["en"]!).toBe(rows.length);
    // the undated lane equals the shiurim without years
    expect(r.counts.year[UNDATED]).toBe(rows.filter((x) => x.years.length === 0).length);
  });

  it("matches the brute-force reference on 400 random filter combinations", () => {
    const R = rand(42);
    for (let i = 0; i < 400; i++) {
      const f = randomFilters(R, rows);
      const got = engine.query(f);
      const want = reference(rows, f);
      expect([...got.matches], JSON.stringify(f)).toEqual(want.matches);
      expect(got.total).toBe(want.matches.length);
      expect(got.counts, JSON.stringify(f)).toEqual(want.counts);
    }
  });

  it("values within a facet are OR-ed, facets are AND-ed", () => {
    const yi = rows.filter((r) => r.lang === "yi");
    const r = engine.query({ sets: { lang: ["yi"], category: ["parsha", "zman"] }, year: null });
    expect(r.total).toBe(yi.filter((x) => x.category === "parsha" || x.category === "zman").length);
    // the category counts ignore the category selection but respect the language
    expect(r.counts.category["set"]).toBe(yi.filter((x) => x.category === "set").length);
  });

  it("answers each query in under 5 ms on 997 rows", () => {
    const R = rand(99);
    const filters = Array.from({ length: 200 }, () => randomFilters(R, rows));
    for (const f of filters.slice(0, 20)) engine.query(f); // warm up the JIT
    const times = filters.map((f) => {
      const t0 = performance.now();
      engine.query(f);
      return performance.now() - t0;
    });
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)]!;
    const p95 = times[Math.floor(times.length * 0.95)]!;
    expect(median).toBeLessThan(5);
    expect(p95).toBeLessThan(5);
  });

  it("builds its index quickly", () => {
    const t0 = performance.now();
    new FacetEngine(rows);
    expect(performance.now() - t0).toBeLessThan(250);
  });
});

describe("worker protocol", () => {
  it("answers queries after init, reports errors before it", () => {
    const host = new FacetHost();
    expect(host.handle({ type: "query", id: 1, filters: { sets: {}, year: null } })).toMatchObject({ type: "error", id: 1 });
    expect(host.handle({ type: "init", rows })).toEqual({ type: "ready", size: rows.length });
    const res = host.handle({ type: "query", id: 2, filters: { sets: { lang: ["en"] }, year: null } });
    expect(res.type).toBe("result");
    if (res.type === "result") {
      expect(res.id).toBe(2);
      expect(res.result.total).toBe(rows.filter((r) => r.lang === "en").length);
      expect(res.ms).toBeGreaterThanOrEqual(0);
    }
  });

  it("the service falls back to the in-thread engine without Worker", async () => {
    const svc = createFacetService(rows);
    expect(svc.mode).toBe("inline");
    const r = await svc.query({ sets: {}, year: { kind: "undated" } });
    expect(r.total).toBe(rows.filter((x) => x.years.length === 0).length);
    svc.dispose();
  });
});

/**
 * W3.8 acceptance: all 17 real series are listed and their parts come out in `seriesOrder`; Tanya is
 * laid out by perek; progress and the view switch behave. C1.7 (concept-live-corpus F.1): nothing
 * pairs a course with one in the other language (one series per index row, no side-by-side view).
 *
 * `real-series.json` is the real catalog's series structure (see `make-real-series.ts`).
 */
import { describe, expect, it } from "vitest";
import { LIVE_DATA_SCHEMA_VERSION, type FacetsFile, type SeriesFile, type SeriesPart } from "../../today/live-data.ts";
import { INTRO_PEREK, orderParts, parsePerek, perekGroups, seriesIndex, seriesProgress, viewFromQuery } from "../model.ts";
import real from "./real-series.json" with { type: "json" };

interface RealSeries {
  id: string;
  lang: "yi" | "en";
  parts: { shiurId: string; order: number | null; perek: string | null }[];
}
const REAL = (real as { series: RealSeries[] }).series;

function part(shiurId: string, order: number | null, perek: string | null = null): SeriesPart {
  return { shiurId, order, perek, title: shiurId, oneLiner: null, duration: 60, years: [], status: "catalog-only" };
}

/** A deterministic shuffle (so the test proves ordering, not pass-through). */
function shuffle<T>(xs: readonly T[], seed: number): T[] {
  const a = [...xs];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function toSeriesFile(r: RealSeries, seed = 7): SeriesFile {
  return {
    schemaVersion: LIVE_DATA_SCHEMA_VERSION,
    id: r.id,
    title: { en: r.id, yi: r.id },
    lang: r.lang,
    parts: shuffle(
      r.parts.map((p) => part(p.shiurId, p.order, p.perek)),
      seed,
    ),
    perekGroups: [],
  };
}

function facetsOf(series: readonly RealSeries[]): Pick<FacetsFile, "series"> {
  return {
    series: Object.fromEntries(
      series.map((s) => [s.id, { label: { en: s.id, yi: s.id }, count: s.parts.length, lang: s.lang }]),
    ),
  };
}

describe("the 17 real series", () => {
  it("are all present", () => {
    expect(REAL).toHaveLength(17);
    expect(new Set(REAL.map((s) => s.id)).size).toBe(17);
  });

  for (const r of REAL) {
    it(`${r.id}: parts in seriesOrder whatever order the file lists them`, () => {
      for (const seed of [1, 7, 42]) {
        const ordered = orderParts(toSeriesFile(r, seed).parts);
        const orders = ordered.map((p) => p.order).filter((o): o is number => o !== null);
        expect(orders).toEqual([...orders].sort((a, b) => a - b));
        expect(orders).toHaveLength(r.parts.length); // every real part has a seriesOrder
        // same sequence the corpus aggregate produced
        expect(ordered.map((p) => p.shiurId)).toEqual(r.parts.map((p) => p.shiurId));
      }
    });
  }

  it("the index lists every series once, one per row: no course is paired with another", () => {
    const rows = seriesIndex(facetsOf(REAL));
    const ids = rows.flatMap((row) => row.entries.map((e) => e.id));
    expect(ids.sort()).toEqual(REAL.map((s) => s.id).sort());
    expect(rows.every((row) => row.entries.length === 1)).toBe(true);
    expect(rows).toHaveLength(17);
  });

  it("Tanya by perek: every placed part of both languages under each perek it covers, perakim in order", () => {
    const yi = toSeriesFile(REAL.find((s) => s.id === "tanya-yi")!);
    const en = toSeriesFile(REAL.find((s) => s.id === "tanya-en")!);
    const groups = perekGroups([yi, en]);
    const numbered = groups.filter((g) => g.perek !== null).map((g) => g.perek!);
    expect(numbered).toEqual([...numbered].sort((a, b) => a - b));
    expect(numbered[0]).toBe(INTRO_PEREK);
    // perek 12 has parts in both languages (yi: י"א וי"ב, י"ב ×2; en: י"ב ×2)
    const p12 = groups.find((g) => g.perek === 12)!;
    expect(new Set(p12.parts.map((p) => p.lang))).toEqual(new Set(["yi", "en"]));
    expect(p12.parts.filter((p) => p.lang === "yi")).toHaveLength(3);
    // a range part (ו-ז) appears under 6 and 7
    const range = yi.parts.find((p) => p.perek === "ו-ז")!;
    for (const n of [6, 7]) expect(groups.find((g) => g.perek === n)!.parts.map((p) => p.part)).toContain(range);
    // every part appears at least once
    const seen = new Set(groups.flatMap((g) => g.parts.map((p) => p.part.shiurId)));
    for (const p of [...yi.parts, ...en.parts]) expect(seen.has(p.shiurId)).toBe(true);
    // English parts without a perek form the last group
    const last = groups[groups.length - 1]!;
    expect(last.perek).toBeNull();
    expect(last.parts.every((p) => p.part.perek === null)).toBe(true);
    // within a perek, series order is kept
    const p18 = groups.find((g) => g.perek === 18)!.parts.filter((p) => p.lang === "yi").map((p) => p.part.order!);
    expect(p18).toEqual([...p18].sort((a, b) => a - b));
  });

  it("series without perakim have no perek view", () => {
    expect(perekGroups([toSeriesFile(REAL.find((s) => s.id === "emunah-yi")!)])).toEqual([]);
  });

  it("every Tanya perek string in the catalog is understood", () => {
    const perakim = REAL.filter((s) => s.id.startsWith("tanya-")).flatMap((s) => s.parts.map((p) => p.perek));
    for (const p of perakim) if (p !== null) expect(parsePerek(p), p).not.toBeNull();
  });
});

describe("parsePerek", () => {
  it.each([
    ["א", [1]],
    ["י\"ב", [12]],
    ["י”ח", [18]],
    ["ט\"ו", [15]],
    ["ו-ז", [6, 7]],
    ["ט-י", [9, 10]],
    ["י\"א וי\"ב", [11, 12]],
    ["כ\"ג וכ\"ד", [23, 24]],
    ["ל”ד", [34]],
    ["הקדמה", [0]],
  ] as const)("%s → %j", (raw, expected) => {
    expect(parsePerek(raw)).toEqual(expected);
  });

  it("returns null for what it does not understand", () => {
    for (const raw of [null, "", "שער היחוד", "Chapter 3", "א-ת"]) expect(parsePerek(raw)).toBeNull();
  });
});

describe("orderParts", () => {
  it("puts parts without an order last, stably", () => {
    const parts = [part("c", null), part("b", 2), part("d", null), part("a", 1)];
    expect(orderParts(parts).map((p) => p.shiurId)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("seriesIndex", () => {
  it("keeps the facets order, one series per row", () => {
    const rows = seriesIndex({
      series: {
        a: { label: { en: "A", yi: "A" }, count: 1, lang: "yi" },
        b: { label: { en: "B", yi: "B" }, count: 1, lang: "en" },
        c: { label: { en: "C", yi: "C" }, count: 1, lang: "en" },
      },
    });
    expect(rows.map((r) => r.entries.map((e) => e.id))).toEqual([["a"], ["b"], ["c"]]);
  });
});

describe("seriesProgress", () => {
  const parts = [part("p1", 1), part("p2", 2), part("p3", 3), part("p4", 4)];

  it("nothing heard: no next", () => {
    expect(seriesProgress(parts, [])).toEqual({ total: 4, completed: 0, started: 0, next: null });
  });

  it("counts finished and started parts and continues after the furthest heard", () => {
    const p = seriesProgress(parts, [
      { shiurId: "p1", t: 3000, completed: true, updatedAt: "a" },
      { shiurId: "p2", t: 100, completed: false, updatedAt: "b" },
    ]);
    expect(p).toMatchObject({ completed: 1, started: 1 });
    expect(p.next?.shiurId).toBe("p2");
    const q = seriesProgress(parts, [{ shiurId: "p2", t: 1, completed: true, updatedAt: "a" }]);
    expect(q.next?.shiurId).toBe("p3");
    const done = seriesProgress(parts, parts.map((x) => ({ shiurId: x.shiurId, t: 1, completed: true, updatedAt: "a" })));
    expect(done.next).toBeNull();
  });
});

describe("viewFromQuery", () => {
  it("only offers views the series supports", () => {
    expect(viewFromQuery("?view=perek", { hasPerek: true })).toBe("perek");
    expect(viewFromQuery("?view=perek", { hasPerek: false })).toBe("order");
    // The side-by-side view is gone (F.1): an old link falls back to the parts in order.
    expect(viewFromQuery("?view=both", { hasPerek: true })).toBe("order");
    expect(viewFromQuery("", { hasPerek: true })).toBe("order");
  });
});

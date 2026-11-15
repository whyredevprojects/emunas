import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PARSHIYOS } from "@emunas/normalize";
import { describe, expect, it } from "vitest";
import { FacetEngine } from "../engine.ts";
import { connectionsModel, luachModel, MIN_SHARED, polar, rowHas, sharedRows, YEAR_MAX, YEAR_MIN, yearsModel } from "../lenses.ts";
import { filterMoments } from "../moments.ts";
import { rovingTarget } from "../roving.ts";
import { exploreEn, exploreYi } from "../strings.ts";
import { EXPLORE_CLASSES } from "../styles.ts";
import { windowRange } from "../virtual.ts";
import { entityFile, facetsFile, momentRows, syntheticRows } from "./synthetic.ts";

const here = dirname(fileURLToPath(import.meta.url));
const rows = syntheticRows({ n: 997, seed: 3 });
const facets = facetsFile(rows);
const counts = new FacetEngine(rows).query({ sets: {}, year: null }).counts;

describe("Luach", () => {
  it("puts the 54 parshiyos on the outer ring in Torah order, Bereishis at the top", () => {
    const m = luachModel(counts.occasion, facets);
    const singles = m.outer.filter((x) => !x.combined);
    expect(singles).toHaveLength(54);
    expect(singles[0]!.key).toBe("bereishis");
    expect(singles.at(-1)!.key).toBe("vezos-haberachah");
    expect(m.outer[0]!.turn).toBe(0);
    // combined parshiyos only appear when the data has them (the synthetic corpus has none)
    expect(m.outer.some((x) => x.combined)).toBe(false);
  });

  it("adds a combined parsha right after its first part when present", () => {
    const combined = PARSHIYOS.find((p) => p.parts !== undefined)!;
    const m = luachModel({ ...counts.occasion, [combined.key]: 2 }, facets);
    const i = m.outer.findIndex((x) => x.key === combined.key);
    expect(m.outer[i - 1]!.key).toBe(combined.parts![0]);
    expect(m.outer[i]!.combined).toBe(true);
    expect(m.outer[i]!.count).toBe(2);
  });

  it("runs the zmanim Tishrei to Elul and lists non-calendar occasions apart", () => {
    const m = luachModel(counts.occasion, facets);
    expect(m.inner[0]!.key).toBe("rosh-hashanah");
    expect(m.inner.at(-1)!.key).toBe("elul");
    expect(m.others.map((o) => o.key)).toEqual(["other"]);
    // every occasion with shiurim appears exactly once, with its count
    const all = [...m.outer, ...m.inner, ...m.others];
    for (const [key, v] of Object.entries(facets.occasion)) {
      expect(all.filter((x) => x.key === key).map((x) => x.count), key).toEqual([v.count]);
    }
  });

  it("dims nothing away: stops with zero count stay on the ring", () => {
    const m = luachModel({}, facets);
    expect(m.outer.filter((x) => !x.combined)).toHaveLength(54);
    expect(m.outer.every((x) => x.count === 0)).toBe(true);
  });
});

describe("Years", () => {
  it("has one bar per year 5724–5780 and an undated lane equal to the shiurim without years", () => {
    const m = yearsModel(counts.year);
    expect(m.bars[0]!.year).toBe(YEAR_MIN);
    expect(m.bars.at(-1)!.year).toBe(YEAR_MAX);
    expect(m.bars).toHaveLength(YEAR_MAX - YEAR_MIN + 1);
    expect(m.undated).toBe(rows.filter((r) => r.years.length === 0).length);
    expect(m.max).toBe(Math.max(...m.bars.map((b) => b.count)));
  });

  it("widens the range for years outside it", () => {
    const m = yearsModel({ "5722": 1, "5785": 2, unknown: 3 });
    expect(m.bars[0]!.year).toBe(5722);
    expect(m.bars.at(-1)!).toEqual({ year: 5785, count: 2 });
    expect(m.undated).toBe(3);
  });
});

describe("Connections", () => {
  it(`hides edges with fewer than ${MIN_SHARED} shared shiurim and the centre itself`, () => {
    const e = entityFile("c", "emunah", [
      { kind: "p", key: "a", shared: 4 },
      { kind: "p", key: "b", shared: 5 },
      { kind: "c", key: "emunah", shared: 9 },
      { kind: "o", key: "noach", shared: 12 },
      { kind: "c", key: "c", shared: 1 },
    ]);
    const edges = connectionsModel(e, facets);
    expect(edges.map((x) => [x.kind, x.key, x.shared])).toEqual([
      ["o", "noach", 12],
      ["p", "b", 5],
    ]);
    expect(edges.map((x) => x.turn)).toEqual([0, 0.5]);
    expect(edges[0]!.label.en).toBe("Noach");
  });

  it("finds the shiurim along an edge from the corpus rows", () => {
    const person = rows.find((r) => r.entities.people.length > 0)!.entities.people[0]!;
    const concept = rows.find((r) => r.entities.people.includes(person) && r.entities.concepts.length > 0)!.entities.concepts[0]!;
    const shared = sharedRows(rows, { kind: "p", key: person }, { kind: "c", key: concept });
    expect(shared.length).toBeGreaterThan(0);
    expect(shared).toEqual(rows.filter((r) => r.entities.people.includes(person) && r.entities.concepts.includes(concept)));
    const parshaRow = rows.find((r) => r.parsha !== null)!;
    expect(rowHas(parshaRow, "o", parshaRow.parsha!)).toBe(true);
  });

  it("mirrors the circle for right-to-left layouts", () => {
    const ltr = polar(100, 100, 50, 0.25);
    const rtl = polar(100, 100, 50, 0.25, true);
    expect(ltr.x).toBeCloseTo(150);
    expect(rtl.x).toBeCloseTo(50);
    expect(polar(100, 100, 50, 0).y).toBeCloseTo(50);
  });
});

describe("helpers", () => {
  it("windowRange covers the viewport plus overscan and clamps", () => {
    expect(windowRange(0, 800, 100, 1000, 2)).toEqual({ start: 0, end: 10 });
    expect(windowRange(-1000, 800, 100, 1000, 2)).toEqual({ start: 8, end: 20 });
    expect(windowRange(-99_000, 800, 100, 1000, 2)).toEqual({ start: 988, end: 1000 });
    expect(windowRange(2000, 800, 100, 1000, 2)).toEqual({ start: 0, end: 0 });
    expect(windowRange(0, 800, 100, 0, 2)).toEqual({ start: 0, end: 0 });
  });

  it("rovingTarget wraps and mirrors horizontal arrows in RTL", () => {
    expect(rovingTarget("ArrowRight", 0, 5, false)).toBe(1);
    expect(rovingTarget("ArrowRight", 0, 5, true)).toBe(4);
    expect(rovingTarget("ArrowLeft", 0, 5, false)).toBe(4);
    expect(rovingTarget("ArrowDown", 4, 5, false)).toBe(0);
    expect(rovingTarget("Home", 3, 5, true)).toBe(0);
    expect(rovingTarget("End", 0, 5, false)).toBe(4);
    expect(rovingTarget("a", 0, 5, false)).toBeNull();
    expect(rovingTarget("ArrowUp", 0, 0, false)).toBeNull();
  });

  it("filterMoments keeps matching shiurim and kinds in order", () => {
    const ms = momentRows(rows.slice(0, 50), "en");
    const ids = new Set(rows.slice(0, 10).map((r) => r.id));
    const got = filterMoments(ms, ids, ["q", "st"]);
    expect(got).toEqual(ms.filter((m) => ids.has(m.shiurId) && (m.kind === "q" || m.kind === "st")));
    expect(filterMoments(ms, null, [])).toEqual(ms);
  });

  it("Yiddish strings provide every key; the class list matches the stylesheet", () => {
    expect(Object.keys(exploreYi).sort()).toEqual(Object.keys(exploreEn).sort());
    const css = readFileSync(join(here, "../Explore.module.css"), "utf8");
    const classes = [...new Set([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9]*)\b/g)].map((m) => m[1]!))].sort();
    expect(classes).toEqual([...EXPLORE_CLASSES].sort());
  });
});

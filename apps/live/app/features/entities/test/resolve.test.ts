/**
 * The link rules of `resolve.ts` against the files the real emitter writes: every entity the resolver
 * links has a file, and every entity file is linked (on the mini corpus, and on the repo's data).
 */
import { describe, expect, it } from "vitest";
import type { FacetsFile, TodayFile } from "../live-data.ts";
import { createResolver, type LinkKind } from "../resolve.ts";
import { HAVE_REAL_DATA, emittedMini, emittedReal, keysUnder, type Emitted } from "./emitted.ts";

const DIRS: Record<LinkKind, string> = { w: "work/", p: "entity/p/", c: "entity/c/", o: "entity/o/" };
const FACET: Record<LinkKind, keyof FacetsFile> = { w: "work", p: "person", c: "concept", o: "occasion" };

function check(files: Emitted): void {
  const facets = files.get("facets.json") as FacetsFile;
  const today = files.get("today.json") as TodayFile;
  const r = createResolver(facets, today);
  for (const kind of ["w", "p", "c", "o"] as const) {
    const onDisk = new Set(keysUnder(files, DIRS[kind]));
    const facetKeys = Object.keys(facets[FACET[kind]] as Record<string, unknown>);
    const linked = facetKeys.filter((k) => r.has(kind, k));
    expect(linked.filter((k) => !onDisk.has(k)), `${kind}: linked without a file`).toEqual([]);
    expect([...onDisk].filter((k) => !r.has(kind, k)), `${kind}: file never linked`).toEqual([]);
    expect(onDisk.size).toBeGreaterThan(0);
    for (const k of linked) expect(r.href("en", kind, k)).toMatch(/^\/en\/(seforim|p|c|o)\/[^/]+$/u);
  }
  expect(r.has("p", "no-such-person")).toBe(false);
  expect(r.href("yi", "p", "no-such-person")).toBeNull();
  expect(r.has("p", "toString")).toBe(false);
}

describe("entity link resolution", () => {
  it("matches the emitted files of the mini corpus", () => check(emittedMini()));

  it("without today.json no occasion is linked", () => {
    const files = emittedMini();
    const r = createResolver(files.get("facets.json") as FacetsFile, null);
    for (const k of keysUnder(files, "entity/o/")) expect(r.has("o", k)).toBe(false);
  });

  it.runIf(HAVE_REAL_DATA)("matches the emitted files of the repo's data", () => check(emittedReal()), 300_000);
});

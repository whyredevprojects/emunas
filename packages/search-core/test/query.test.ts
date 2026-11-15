import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_QUERY_LENGTH, foldForIndex, indexTokens, normalizeQuery } from "../src/index.ts";
import { PKG } from "./helpers.ts";

const overlap = (a: string[], b: string[]) => a.filter((x) => b.includes(x));

describe("normalizeQuery", () => {
  it("'לג בעומר' and 'lag baomer' normalize to overlapping token sets", () => {
    const he = normalizeQuery("לג בעומר");
    const en = normalizeQuery("lag baomer");
    expect(overlap(he.tokens, en.tokens).length).toBeGreaterThan(0);
    expect(overlap(he.terms, en.terms)).toEqual(he.terms);
    // the other spellings people type meet there too
    for (const q of ["Lag B'Omer", "ל״ג בעומר", 'ל"ג בעומר', "ל”ג בעומר", "lag ba-omer", "LAG BAOMER"]) {
      expect(normalizeQuery(q).terms, q).toEqual(he.terms);
    }
  });

  it("names the occasion entity even when no new spelling is added", () => {
    const q = normalizeQuery("lag baomer");
    expect(q.expansions.map((e) => [e.kind, e.key])).toEqual([["occasion", expect.any(String)]]);
    expect(normalizeQuery("לג בעומר").expansions[0]?.key).toBe(q.expansions[0]?.key);
  });

  it("matches what the index side produces for the same text", () => {
    for (const s of ["Lag B'Omer", "חנוכה", "Parshas Noach", "רבי נחמן"]) {
      const q = normalizeQuery(s);
      expect(q.folded).toBe(foldForIndex(s));
      expect(q.terms).toEqual([...new Set(indexTokens(s))]);
    }
  });

  it("expands a parsha to its names in both scripts", () => {
    const q = normalizeQuery("parshas noach");
    const e = q.expansions.find((x) => x.kind === "parsha");
    expect(e?.key).toBe("noach");
    expect(q.tokens).toContain("נח");
    expect(q.variants).toContain("נח");
    const h = normalizeQuery("פרשת נח");
    expect(h.expansions[0]?.key).toBe("noach");
    expect(h.tokens).toContain("noach");
  });

  it("expands a work and a concept spelling variant", () => {
    const w = normalizeQuery("Rambam Hilchos Teshuvah");
    expect(w.expansions.some((e) => e.kind === "work")).toBe(true);
    const c = normalizeQuery("מידת הדין");
    expect(c.expansions).toEqual([expect.objectContaining({ kind: "concept" })]);
    expect(c.tokens).toContain("מדת");
  });

  it("is total: empty, punctuation, nikud and very long input", () => {
    expect(normalizeQuery("")).toEqual({ raw: "", folded: "", terms: [], expansions: [], entities: [], tokens: [], variants: [] });
    expect(normalizeQuery("  ?!  ").terms).toEqual([]);
    expect(normalizeQuery("בְּרֵאשִׁית").terms).toEqual(["בראשית"]);
    const long = normalizeQuery("noach ".repeat(500));
    expect(long.raw.length).toBeLessThanOrEqual(MAX_QUERY_LENGTH);
    expect(long.terms).toEqual(["noach"]);
    expect(long.variants.length).toBeLessThanOrEqual(9);
  });

  it("dedupes terms and keeps query order", () => {
    expect(normalizeQuery("Emuna emunah Teshuva").terms).toEqual(["emunah", "teshuvah"]);
  });
});

describe("browser safety", () => {
  it("the root entry (src/*.ts) imports no Node built-ins and nothing from ./build", () => {
    const dir = join(PKG, "src");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/from\s+["']node:/);
      expect(text, f).not.toMatch(/from\s+["']\.\/build/);
      expect(text, f).not.toMatch(/@emunas\/corpus\/build/);
    }
  });
});

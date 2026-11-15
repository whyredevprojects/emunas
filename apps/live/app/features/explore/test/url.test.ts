import { describe, expect, it } from "vitest";
import { parseSettingsQuery } from "../../../shell/settings.ts";
import type { MomentKind } from "../live-data.ts";
import { DURATION_BUCKETS, SET_FACETS, type ExploreFilters, type SetFacet } from "../model.ts";
import {
  CATEGORIES,
  connectionsHref,
  DEFAULT_STATE,
  exploreHref,
  exploreToQuery,
  LENSES,
  MOMENT_KINDS,
  parseExploreQuery,
  parseYear,
  SORTS,
  toggleValue,
  UNITS,
  type ExploreState,
} from "../url.ts";
import { rand, type Rand } from "./synthetic.ts";

const VOCAB: Record<SetFacet, readonly string[]> = {
  lang: ["en", "yi"],
  category: CATEGORIES,
  occasion: ["noach", "bereishis", "rosh-hashanah", "מסיבת לחיים (קעמפ)", "a,b"],
  series: ["tanya-yi", "emunah-en"],
  work: ["bereishis", "gemara-berachos", "rashi"],
  person: ["avraham-avinu", "dovid-hamelech", "x&y=z"],
  concept: ["ab-hrchmn-b1ecc8", "אמונה", "with space"],
  duration: DURATION_BUCKETS,
  stories: ["yes", "no"],
  ai: ["full", "catalog-only"],
  catalogued: ["catalogued", "uncatalogued"],
};

/** A random normalized state (what `parseExploreQuery` produces). */
function randomState(R: Rand): ExploreState {
  const sets: ExploreFilters["sets"] = {};
  for (const facet of SET_FACETS) {
    if (!R.chance(0.35)) continue;
    const vocab = VOCAB[facet];
    const picked = [...new Set(Array.from({ length: 1 + R.int(3) }, () => R.pick(vocab)))].sort();
    if (facet === "lang" && picked.length !== 1) continue; // both languages = no filter
    sets[facet] = picked;
  }
  const yr = R.next();
  const year: ExploreFilters["year"] =
    yr < 0.5 ? null : yr < 0.65 ? { kind: "undated" } : { kind: "range", from: 5724 + R.int(20), to: 5744 + R.int(36) };
  const kinds = MOMENT_KINDS.filter(() => R.chance(0.4));
  const center = R.chance(0.3) ? { kind: R.pick(["p", "c", "o"] as const), key: R.pick(["noach", "אמונה", "a:b", "x y"]) } : null;
  return {
    filters: { sets, year },
    lens: R.pick(LENSES),
    unit: R.pick(UNITS),
    sort: R.pick(SORTS),
    kinds: kinds.length === MOMENT_KINDS.length ? [] : kinds,
    center,
  };
}

describe("Explore URL state", () => {
  it("round-trips 500 random states", () => {
    const R = rand(5);
    for (let i = 0; i < 500; i++) {
      const s = randomState(R);
      const q = exploreToQuery(s);
      expect(parseExploreQuery(q.toString()), q.toString()).toEqual(s);
      // and the query string is a fixed point
      expect(exploreToQuery(parseExploreQuery(q)).toString()).toBe(q.toString());
    }
  });

  it("the default state is the bare URL", () => {
    expect(exploreToQuery(DEFAULT_STATE).toString()).toBe("");
    expect(parseExploreQuery("")).toEqual(DEFAULT_STATE);
    expect(exploreHref("en")).toBe("/en/explore");
  });

  it("canonicalizes: sorted, de-duplicated, unknown values dropped", () => {
    const s = parseExploreQuery("p=b&p=a&p=b&dur=forever&dur=lt30&kind=parsha&kind=nonsense&lens=hairball&unit=moments&mk=q&mk=zz&mk=s");
    expect(s.filters.sets).toEqual({ person: ["a", "b"], duration: ["lt30"], category: ["parsha"] });
    expect(s.lens).toBe("list");
    expect(s.unit).toBe("moments");
    expect(s.kinds).toEqual(["s", "q"]);
    expect(exploreToQuery(s).toString()).toBe("kind=parsha&p=a&p=b&dur=lt30&unit=moments&mk=s&mk=q");
  });

  it("all moment kinds selected is the same as no kind filter", () => {
    expect(parseExploreQuery(MOMENT_KINDS.map((k) => `mk=${k}`).join("&")).kinds).toEqual([]);
    const all: MomentKind[] = [...MOMENT_KINDS];
    expect(exploreToQuery({ ...DEFAULT_STATE, kinds: all }).toString()).toBe("");
  });

  it("the language facet is the shell's audio parameter, read the same way", () => {
    for (const q of ["audio=yi", "audio=en", "audio=yi,en", "audio=en,yi", "audio=zz", ""]) {
      const shell = parseSettingsQuery(q).audio;
      const lang = parseExploreQuery(q).filters.sets.lang ?? [];
      expect(lang.length === 1 ? lang[0] : "both", q).toBe(shell ?? "both");
    }
    const q = exploreToQuery({ ...DEFAULT_STATE, filters: { sets: { lang: ["en"] }, year: null } });
    expect(q.toString()).toBe("audio=en");
  });

  it("keeps parameters it does not own and replaces the ones it does", () => {
    const base = new URLSearchParams("read=yi&p=old&lens=years&t=12");
    const q = exploreToQuery({ ...DEFAULT_STATE, filters: { sets: { person: ["new"] }, year: null } }, base);
    expect(q.get("read")).toBe("yi");
    expect(q.get("t")).toBe("12");
    expect(q.getAll("p")).toEqual(["new"]);
    expect(q.has("lens")).toBe(false);
  });

  it("parses year filters", () => {
    expect(parseYear("5730")).toEqual({ kind: "range", from: 5730, to: 5730 });
    expect(parseYear("5740-5730")).toEqual({ kind: "range", from: 5730, to: 5740 });
    expect(parseYear("undated")).toEqual({ kind: "undated" });
    expect(parseYear("57301")).toBeNull();
    expect(parseYear("abc")).toBeNull();
  });

  it("builds Connections links for entity pages", () => {
    expect(connectionsHref("yi", "c", "אמונה")).toBe(`/yi/explore?lens=connections&center=${encodeURIComponent("c:אמונה")}`);
    expect(parseExploreQuery(new URL(connectionsHref("en", "p", "a:b"), "http://x").search).center).toEqual({ kind: "p", key: "a:b" });
    expect(parseExploreQuery("center=z:key").center).toBeNull();
  });

  it("toggles values", () => {
    let f: ExploreFilters = { sets: {}, year: null };
    f = toggleValue(f, "person", "b");
    f = toggleValue(f, "person", "a");
    expect(f.sets.person).toEqual(["a", "b"]);
    f = toggleValue(toggleValue(f, "person", "a"), "person", "b");
    expect(f.sets).toEqual({});
  });
});

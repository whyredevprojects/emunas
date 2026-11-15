import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ALLOWED_KEYS, type SearchResponse, type SearchResult } from "../src/contract.ts";
import { FakeAI, FakeVectorize, MOMENTS, flushWaitUntil, getJson, makeEnv, migrate, seed, sortedKeys } from "./helpers.ts";

const vec = new FakeVectorize();
const ai = new FakeAI();
const e = makeEnv({ vec, ai });

let revCounter = 0;
beforeAll(migrate);
beforeEach(async () => {
  // A new corpus_rev per test keeps cached pages of one test from answering another.
  revCounter++;
  vec.fail = false;
  ai.fail = false;
  await seed(vec, undefined, `rev-${revCounter}`);
});

async function search(qs: string): Promise<SearchResponse> {
  const { status, body, text } = await getJson<SearchResponse>(e, `/api/search?${qs}`);
  expect(status, text).toBe(200);
  return body;
}

/** Evaluates a filter query string against the seed data, independently of the Worker's SQL. */
function satisfies(momentId: string, filters: string): boolean {
  const m = MOMENTS.find((x) => x.id === momentId);
  if (!m) return false;
  const sp = new URLSearchParams(filters);
  const list = (k: string) => sp.get(k)?.split(",") ?? null;
  const inList = (k: string, v: string | undefined) => {
    const l = list(k);
    return l === null || (v !== undefined && l.includes(v));
  };
  const hasEntity = (type: string) => {
    const l = list(type);
    return l === null || (m.entities ?? []).some((x) => x.type === type && l.includes(x.id));
  };
  const yf = sp.get("yearFrom");
  const yt = sp.get("yearTo");
  return (
    inList("audio", m.audioLang) &&
    inList("kind", m.kind) &&
    inList("category", m.category) &&
    inList("occasion", m.occasion) &&
    inList("series", m.series) &&
    (yf === null || (m.year !== undefined && m.year >= Number(yf))) &&
    (yt === null || (m.year !== undefined && m.year <= Number(yt))) &&
    hasEntity("work") &&
    hasEntity("person") &&
    hasEntity("concept") &&
    hasEntity("topic")
  );
}

const ids = (r: SearchResponse) => r.results.map((x) => x.momentId).sort();

function expectAllowedKeys(r: SearchResponse): void {
  expect(sortedKeys(r)).toEqual([...ALLOWED_KEYS.search]);
  for (const g of r.groups) expect(sortedKeys(g)).toEqual([...ALLOWED_KEYS.group]);
  for (const x of r.results) {
    expect(sortedKeys(x)).toEqual([...ALLOWED_KEYS.searchResult]);
    expect(sortedKeys(x.title)).toEqual([...ALLOWED_KEYS.title]);
    if (x.snippet !== null) expect(sortedKeys(x.snippet)).toEqual([...ALLOWED_KEYS.snippet]);
  }
}

describe("GET /api/search: matching", () => {
  it("finds English words lexically and returns only allowed keys", async () => {
    const r = await search("q=trust&mode=lexical");
    expect(ids(r)).toEqual(["en-misc-01~tk0", "en-zman-lag-baomer-01~st0", "yi-parsha-noach-01~s0"]);
    expectAllowedKeys(r);
    expect(r.rev).toBe(`rev-${revCounter}`);
    expect(typeof r.tookMs).toBe("number");
    expect(r.next).toBeNull();
  });

  it("matches Lag BaOmer spellings in both scripts to the same moments", async () => {
    const forms = ["lag baomer", "lag ba'omer", 'ל"ג בעומר', "ל”ג בעומר", "לג בעומר"];
    const results = await Promise.all(forms.map((q) => search(`q=${encodeURIComponent(q)}&mode=lexical`)));
    for (const r of results) expect(ids(r)).toEqual(["en-zman-lag-baomer-01~s0"]);
  });

  it("finds a Hebrew word inside a prefixed form through the trigram table", async () => {
    const r = await search(`q=${encodeURIComponent("תורה")}&mode=lexical&ui=yi`);
    expect(ids(r)).toEqual(["yi-parsha-noach-01~i0"]);
    const s = r.results[0]?.snippet;
    expect(s?.lang).toBe("yi");
    const marked = s?.marks.map(([a, b]) => s.text.slice(a, b));
    expect(marked).toEqual(["בתורה"]);
  });

  it("strips nikud from the query", async () => {
    const r = await search(`q=${encodeURIComponent("בִּטָּחוֹן")}&mode=lexical`);
    expect(ids(r)).toContain("yi-parsha-noach-01~s0");
  });

  it("reports title matches and text matches", async () => {
    const r = await search("q=zohar&mode=lexical");
    expect(r.results[0]?.matched).toBe("title");
    const t = await search("q=laughed&mode=lexical");
    expect(t.results[0]?.matched).toBe("text");
  });

  it("highlights by offsets in a window of a long generated text", async () => {
    const r = await search("q=celebration&mode=lexical");
    const s = r.results[0]?.snippet;
    expect(r.results[0]?.momentId).toBe("en-zman-lag-baomer-01~st0");
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.text.startsWith("…")).toBe(true);
    expect(s.text.length).toBeLessThanOrEqual(202);
    expect(s.marks.map(([a, b]) => s.text.slice(a, b))).toEqual(["celebration"]);
  });

  it("prefers the snippet in the UI language when both match", async () => {
    const en = await search(`q=${encodeURIComponent("zohar")}&mode=lexical&ui=en`);
    expect(en.results[0]?.snippet?.lang).toBe("en");
  });

  it("returns no results for a word that is nowhere", async () => {
    const r = await search("q=xylophone&mode=lexical");
    expect(r.results).toEqual([]);
    expect(r.groups).toEqual([]);
  });
});

describe("GET /api/search: filters", () => {
  const cases: [string, string, string[]][] = [
    ["audio=yi", "q=trust", ["yi-parsha-noach-01~s0"]],
    ["audio=en", "q=trust", ["en-misc-01~tk0", "en-zman-lag-baomer-01~st0"]],
    ["audio=en,yi", "q=trust", ["en-misc-01~tk0", "en-zman-lag-baomer-01~st0", "yi-parsha-noach-01~s0"]],
    ["kind=story", "q=trust", ["en-zman-lag-baomer-01~st0"]],
    ["kind=section,takeaway", "q=trust", ["en-misc-01~tk0", "yi-parsha-noach-01~s0"]],
    ["category=misc", "q=trust", ["en-misc-01~tk0"]],
    ["category=parsha&kind=section", "q=trust", ["yi-parsha-noach-01~s0"]],
    ["occasion=noach", "q=flood", ["yi-parsha-noach-01~i0", "yi-parsha-noach-01~s0"]],
    ["occasion=lag-baomer&audio=en", "q=trust", ["en-zman-lag-baomer-01~st0"]],
    ["yearFrom=5750", "q=trust", ["en-zman-lag-baomer-01~st0"]],
    ["yearTo=5750", "q=trust", ["yi-parsha-noach-01~s0"]],
    ["yearFrom=5700&yearTo=5800", "q=trust", ["en-zman-lag-baomer-01~st0", "yi-parsha-noach-01~s0"]],
    ["work=bereishis", "q=flood", ["yi-parsha-noach-01~i0", "yi-parsha-noach-01~s0"]],
    ["concept=bitachon", "q=flood", ["yi-parsha-noach-01~i0"]],
    ["person=rashbi", "q=zohar", ["en-zman-lag-baomer-01~s0"]],
    ["person=rashbi&concept=simcha&audio=en&kind=section", "q=zohar", ["en-zman-lag-baomer-01~s0"]],
    ["person=rashbi&audio=yi", "q=zohar", []],
    ["series=tanya", "q=trust", []],
    ["work=bereishis&yearFrom=5744", "q=flood", []],
    // topic: corpus topic ids, a type of its own (a concept with the same id is not a topic hit)
    ["topic=emunah", "q=flood", ["yi-parsha-noach-01~i0", "yi-parsha-noach-01~s0"]],
    ["topic=torah-study", "q=flood", ["yi-parsha-noach-01~i0"]],
    ["topic=emunah,lag-baomer", "q=trust", ["yi-parsha-noach-01~s0"]],
    ["topic=lag-baomer", "q=zohar", ["en-zman-lag-baomer-01~s0"]],
    ["topic=simcha&concept=simcha&person=rashbi", "q=zohar", ["en-zman-lag-baomer-01~s0"]],
    ["topic=bitachon", "q=flood", []],
    ["concept=emunah", "q=flood", []],
    ["topic=emunah&audio=en", "q=flood", []],
    ["topic=emunah&work=bereishis&kind=insight", "q=flood", ["yi-parsha-noach-01~i0"]],
  ];

  for (const mode of ["lexical", "hybrid"] as const) {
    it.each(cases)(`${mode}: %s (%s)`, async (filters, q, expected) => {
      const r = await search(`${q}&${filters}&mode=${mode}`);
      if (mode === "lexical") {
        expect(ids(r)).toEqual(expected);
      } else {
        // semantic hits may add moments, but never ones that violate the filters
        expect(ids(r)).toEqual(expect.arrayContaining(expected));
        for (const x of r.results) expect(satisfies(x.momentId, filters), `${x.momentId} vs ${filters}`).toBe(true);
      }
    });
  }

  it("semantic hits that fail a D1-only filter (occasion, entity) are dropped", async () => {
    const r = await search("q=trust&mode=semantic&occasion=noach");
    for (const x of r.results) expect(x.shiurId).toBe("yi-parsha-noach-01");
    const w = await search("q=trust&mode=semantic&work=bereishis");
    for (const x of w.results) expect(x.shiurId).toBe("yi-parsha-noach-01");
    const tp = await search("q=trust&mode=semantic&topic=lag-baomer");
    for (const x of tp.results) expect(x.momentId).toBe("en-zman-lag-baomer-01~s0");
  });

  it("passes declared metadata filters to Vectorize", async () => {
    vec.queries.length = 0;
    await search("q=trust&mode=semantic&audio=en&kind=story,section&category=zman&yearFrom=5700&yearTo=5800");
    expect(vec.queries.at(-1)?.filter).toEqual({
      audio_lang: { $eq: "en" },
      kind: { $in: ["section", "story"] },
      category: { $eq: "zman" },
      year: { $gte: 5700, $lte: 5800 },
    });
    expect(vec.queries.at(-1)?.topK).toBe(50);
  });

  it("rejects malformed and unknown parameters", async () => {
    for (const qs of [
      "",
      "q=",
      `q=${"x".repeat(201)}`,
      "q=a&audio=fr",
      "q=a&kind=transcript",
      "q=a&ui=de",
      "q=a&mode=magic",
      "q=a&limit=0",
      "q=a&limit=51",
      "q=a&yearFrom=5800&yearTo=5700",
      "q=a&work=Not%20A%20Key",
      "q=a&topic=Not%20A%20Key",
      "q=a&topics=emunah",
      "q=a&heardAs=1",
      "q=a&q=b",
      "q=a&cursor=***",
      `q=a&category=${Array.from({ length: 11 }, (_, i) => `c${i}`).join(",")}`,
    ]) {
      const { status, body } = await getJson<{ error: string }>(e, `/api/search?${qs}`);
      expect(status, qs).toBe(400);
      expect(body.error).toBe("bad_request");
      expect(sortedKeys(body).every((k) => (ALLOWED_KEYS.error as readonly string[]).includes(k))).toBe(true);
    }
  });
});

describe("GET /api/search: hybrid, grouping, paging, cache", () => {
  it("hybrid adds semantic neighbours and fuses them with lexical hits", async () => {
    const lex = await search("q=trust&mode=lexical");
    const hyb = await search("q=trust&mode=hybrid");
    expect(ids(hyb)).toEqual(expect.arrayContaining(ids(lex)));
    expect(ai.calls.at(-1)).toEqual({ model: "@cf/baai/bge-m3", text: ["trust"] });
    const sem = hyb.results.filter((x) => x.matched === "semantic");
    for (const x of sem) expect(ids(lex)).not.toContain(x.momentId);
    const only = await search("q=trust&mode=semantic");
    expect(only.results.length).toBeGreaterThan(0);
    expect(only.results.every((x) => x.matched === "semantic")).toBe(true);
    // semantic results still get a snippet of generated text; marks only ever cover query words
    for (const x of only.results) {
      expect(x.snippet).not.toBeNull();
      for (const [a, b] of x.snippet?.marks ?? []) expect(x.snippet?.text.slice(a, b).toLowerCase()).toBe("trust");
    }
  });

  it("groups results by shiur, best shiur first, and reports counts", async () => {
    const r = await search("q=flood&mode=lexical");
    expect(r.groups).toEqual([{ shiurId: "yi-parsha-noach-01", count: 2 }]);
    const g = await search("q=trust&mode=hybrid&limit=50");
    const seen: string[] = [];
    for (const x of g.results) {
      if (seen.at(-1) !== x.shiurId) {
        expect(seen).not.toContain(x.shiurId);
        seen.push(x.shiurId);
      }
    }
    expect(seen).toEqual(g.groups.map((x) => x.shiurId));
    expect(g.groups.reduce((s, x) => s + x.count, 0)).toBe(g.results.length);
  });

  it("pages with an opaque cursor without repeats or gaps", async () => {
    const all = await search("q=trust&mode=hybrid&limit=50");
    const seen: SearchResult[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r: SearchResponse = await search(`q=trust&mode=hybrid&limit=1${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...r.results);
      cursor = r.next;
      pages++;
    } while (cursor !== null && pages < 20);
    expect(seen.map((x) => x.momentId)).toEqual(all.results.map((x) => x.momentId));
    expect(pages).toBe(all.results.length);
  });

  it("refuses a cursor from another corpus revision", async () => {
    const r = await search("q=trust&mode=lexical&limit=1");
    expect(r.next).not.toBeNull();
    await seed(vec, undefined, "rev-other");
    const { status, body } = await getJson<{ error: string }>(e, `/api/search?q=trust&mode=lexical&limit=1&cursor=${r.next}`);
    expect(status).toBe(409);
    expect(body.error).toBe("stale_cursor");
  });

  it("falls back to lexical when Workers AI fails in hybrid mode, and 503 in semantic mode", async () => {
    ai.fail = true;
    const r = await search("q=trust&mode=hybrid");
    expect(r.results.every((x) => x.matched !== "semantic")).toBe(true);
    expect(r.results.length).toBe(3);
    const s = await getJson<{ error: string }>(e, "/api/search?q=trust&mode=semantic");
    expect(s.status).toBe(503);
    expect(s.body).toEqual({ error: "unavailable" });
  });

  it("serves repeated queries from the Cache API keyed by query, filters and corpus_rev", async () => {
    const q = "/api/search?q=flood&mode=hybrid&audio=yi";
    const first = await getJson<SearchResponse>(e, q);
    await flushWaitUntil();
    expect(first.res.headers.get("x-emunas-cache")).toBe("miss");
    const callsBefore = ai.calls.length;
    const second = await getJson<SearchResponse>(e, q);
    expect(second.res.headers.get("x-emunas-cache")).toBe("hit");
    expect(ai.calls.length).toBe(callsBefore);
    expect(second.body.results).toEqual(first.body.results);
    // different filter order is the same key
    const third = await getJson<SearchResponse>(e, "/api/search?audio=yi&mode=hybrid&q=flood");
    expect(third.res.headers.get("x-emunas-cache")).toBe("hit");
    // a new corpus_rev misses
    await seed(vec, undefined, `rev-${revCounter}-b`);
    const fourth = await getJson<SearchResponse>(e, q);
    expect(fourth.res.headers.get("x-emunas-cache")).toBe("miss");
    expect(fourth.body.rev).toBe(`rev-${revCounter}-b`);
  });

  it("does not cache a degraded hybrid response", async () => {
    ai.fail = true;
    const q = "/api/search?q=zohar&mode=hybrid";
    await getJson(e, q);
    await flushWaitUntil();
    ai.fail = false;
    const again = await getJson(e, q);
    expect(again.res.headers.get("x-emunas-cache")).toBe("miss");
  });
});

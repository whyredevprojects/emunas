/**
 * The `/api/search` client: the allow-list copy (a response can only put generated title/snippet text
 * on the page), the request shape the Worker accepts, and every failure that leads to the fallback.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
// The Worker's public contract: the client's key lists must match it exactly.
import { ALLOWED_KEYS } from "../../../../../../workers/api/src/contract.ts";
import { parseSearchParams } from "../../../../../../workers/api/src/params.ts";
import {
  API_RESPONSE_KEYS,
  configureSearchApi,
  fetchSearch,
  parseSearchResponse,
  resetSearchApi,
  SearchApiError,
  searchUrl,
  type ApiFetch,
} from "../api.ts";
import { apiResponse, apiResult, PLANTED, poisonedBody } from "./data.ts";

afterEach(() => {
  resetSearchApi();
  vi.unstubAllGlobals();
});

/** Every key path of a JSON value, e.g. `results[].snippet.marks`. */
function keyPaths(v: unknown, prefix = ""): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => keyPaths(x, `${prefix}[]`));
  if (typeof v === "object" && v !== null) {
    return Object.entries(v).flatMap(([k, x]) => [`${prefix}.${k}`, ...keyPaths(x, `${prefix}.${k}`)]);
  }
  return [];
}

describe("response contract", () => {
  it("client key lists equal the Worker's ALLOWED_KEYS", () => {
    for (const [name, keys] of Object.entries(API_RESPONSE_KEYS)) {
      expect([...keys], name).toEqual([...ALLOWED_KEYS[name as keyof typeof ALLOWED_KEYS]]);
    }
  });

  it("copies only allowed keys and drops planted fields at every level", () => {
    const body = poisonedBody();
    const parsed = parseSearchResponse(body);
    expect(parsed).not.toBeNull();
    const out = JSON.stringify(parsed);
    for (const planted of Object.values(PLANTED)) expect(out).not.toContain(planted);

    const allowed = new Set([
      ...API_RESPONSE_KEYS.search.map((k) => `.${k}`),
      ...API_RESPONSE_KEYS.searchResult.map((k) => `.results[].${k}`),
      ...API_RESPONSE_KEYS.title.map((k) => `.results[].title.${k}`),
      ...API_RESPONSE_KEYS.snippet.map((k) => `.results[].snippet.${k}`),
      ...API_RESPONSE_KEYS.group.map((k) => `.groups[].${k}`),
    ]);
    for (const path of new Set(keyPaths(parsed))) expect(allowed.has(path), path).toBe(true);
  });

  it("the only free text in a parsed response is generated title and snippet text", () => {
    const parsed = parseSearchResponse(poisonedBody())!;
    const strings: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === "string") strings.push(path);
      else if (Array.isArray(v)) v.forEach((x) => walk(x, `${path}[]`));
      else if (typeof v === "object" && v !== null) for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(parsed, "");
    const textual = new Set(strings);
    // ids, enums and the cursor are not displayed as text
    for (const p of [".rev", ".results[].momentId", ".results[].shiurId", ".results[].kind", ".results[].matched", ".results[].snippet.lang", ".groups[].shiurId"]) {
      textual.delete(p);
    }
    expect([...textual].sort()).toEqual([".results[].snippet.text", ".results[].title.en", ".results[].title.yi"]);
  });

  it("rejects bodies that do not fit the contract", () => {
    expect(parseSearchResponse(null)).toBeNull();
    expect(parseSearchResponse({ rev: "r", tookMs: 1, results: "x", groups: [] })).toBeNull();
    expect(parseSearchResponse({ ...apiResponse([]), rev: 3 })).toBeNull();
    const bad = apiResponse([apiResult({ momentId: "a~s0", shiurId: "a" })]);
    expect(parseSearchResponse({ ...bad, results: [{ ...bad.results[0], kind: "transcript" }] })).toBeNull();
    expect(parseSearchResponse({ ...bad, results: [{ ...bad.results[0], snippet: "<b>html</b>" }] })).toBeNull();
    expect(parseSearchResponse({ ...bad, results: [{ ...bad.results[0], title: { en: 1, yi: null } }] })).toBeNull();
  });

  it("keeps the snippet but drops invalid highlight offsets", () => {
    const r = apiResult({
      momentId: "a~s0",
      shiurId: "a",
      snippet: { text: "abcdef", lang: "en", marks: [[0, 2], [4, 99], [-1, 1], [3, 3], [1.5, 2] as unknown as [number, number]] },
    });
    const parsed = parseSearchResponse(apiResponse([r]))!;
    expect(parsed.results[0]!.snippet).toEqual({ text: "abcdef", lang: "en", marks: [[0, 2]] });
  });

  it("accepts a null snippet and a null end", () => {
    const r = apiResult({ momentId: "a~s0", shiurId: "a", snippet: null, end: null });
    expect(parseSearchResponse(apiResponse([r]))!.results[0]).toMatchObject({ snippet: null, end: null });
  });
});

describe("request", () => {
  it("builds a query the Worker's strict parser accepts", () => {
    const url = searchUrl({ q: "  lag   baomer ", ui: "yi", audio: ["en"], limit: 5, cursor: "abc_DEF-1" }, "");
    expect(url.startsWith("/api/search?")).toBe(true);
    const sp = new URL(url, "http://x.invalid").searchParams;
    const p = parseSearchParams(sp);
    expect(p).toMatchObject({ q: "lag baomer", ui: "yi", limit: 5, cursor: "abc_DEF-1" });
    expect(p.filters.audio).toEqual(["en"]);
  });

  it("omits the audio filter when both languages are allowed and caps the query length", () => {
    const sp = new URL(searchUrl({ q: "x".repeat(500), ui: "en", audio: ["en", "yi"] }, ""), "http://x.invalid").searchParams;
    expect(sp.has("audio")).toBe(false);
    expect(parseSearchParams(sp).q.length).toBe(200);
  });

  it("sends corpus-id entity filters under the Worker's own names, which its parser accepts", () => {
    const url = searchUrl(
      {
        q: "emunah",
        ui: "en",
        filters: { topic: ["hester-panim", "hester-panim", "geulah"], person: ["baal-shem-tov"], concept: [], work: ["Not An Id", "tanya"] },
      },
      "",
    );
    const sp = new URL(url, "http://x.invalid").searchParams;
    expect(sp.get("topic")).toBe("hester-panim,geulah");
    expect(sp.get("person")).toBe("baal-shem-tov");
    expect(sp.has("concept")).toBe(false);
    expect(sp.get("work")).toBe("tanya");
    const p = parseSearchParams(sp);
    expect(p.filters).toMatchObject({ topic: ["geulah", "hester-panim"], person: ["baal-shem-tov"], concept: [], work: ["tanya"] });
  });

  it("caps each filter list at the Worker's limit", () => {
    const ids = Array.from({ length: 15 }, (_, i) => `t-${i}`);
    const sp = new URL(searchUrl({ q: "x", ui: "en", filters: { topic: ids } }, ""), "http://x.invalid").searchParams;
    expect(parseSearchParams(sp).filters.topic).toHaveLength(10);
  });
});

describe("failures → fallback reasons", () => {
  const ok: ApiFetch = async () => new Response(JSON.stringify(apiResponse([])), { status: 200 });

  async function reason(fetch: ApiFetch, timeoutMs = 2000): Promise<string> {
    configureSearchApi({ fetch, timeoutMs });
    try {
      await fetchSearch({ q: "noach", ui: "en" });
      return "ok";
    } catch (e) {
      return e instanceof SearchApiError ? e.reason : `other:${String(e)}`;
    }
  }

  it("succeeds on a valid response", async () => {
    expect(await reason(ok)).toBe("ok");
  });

  it("offline: does not even try the network", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const spy = vi.fn(ok);
    expect(await reason(spy)).toBe("offline");
    expect(spy).not.toHaveBeenCalled();
  });

  it("network error, HTTP error, bad JSON, wrong shape, stale cursor, timeout", async () => {
    expect(await reason(async () => Promise.reject(new TypeError("Failed to fetch")))).toBe("network");
    expect(await reason(async () => new Response("{}", { status: 503 }))).toBe("http");
    expect(await reason(async () => new Response("<html>", { status: 200 }))).toBe("invalid");
    expect(await reason(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }))).toBe("invalid");
    expect(await reason(async () => new Response(JSON.stringify({ error: "stale_cursor" }), { status: 409 }))).toBe("stale");
    const hang: ApiFetch = (_u, init) =>
      new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    expect(await reason(hang, 20)).toBe("timeout");
  });

  it("a caller abort propagates as AbortError, not as a failure", async () => {
    const hang: ApiFetch = (_u, init) =>
      new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    configureSearchApi({ fetch: hang, timeoutMs: 5000 });
    const ctrl = new AbortController();
    const p = fetchSearch({ q: "noach", ui: "en" }, { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});

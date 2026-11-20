import { describe, expect, it, vi } from "vitest";
import worker, {
  DEFAULT_UI,
  type Env,
  type FetcherLike,
  chooseUi,
  isWorkersDevHost,
  uiFromAcceptLanguage,
  uiFromCookie,
} from "../index.ts";

function fetcher(make: (r: Request) => Response): FetcherLike & { calls: Request[] } {
  const calls: Request[] = [];
  return {
    calls,
    fetch: vi.fn(async (r: Request) => {
      calls.push(r);
      return make(r);
    }),
  };
}

function env() {
  const ASSETS = fetcher(() => new Response("asset", { status: 200 }));
  const API = fetcher(
    (r) =>
      new Response(JSON.stringify({ path: new URL(r.url).pathname }), {
        status: 201,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }),
  );
  return { ASSETS, API } satisfies Env;
}

const HOST = "https://analyze.example.org";
const DEV = "https://emunas-live.acct.workers.dev";

describe("uiFromCookie", () => {
  it("reads emunas_ui among other cookies", () => {
    expect(uiFromCookie("a=1; emunas_ui=yi; b=2")).toBe("yi");
    expect(uiFromCookie("emunas_ui=he")).toBe("he");
    expect(uiFromCookie("emunas_ui=en")).toBe("en");
    expect(uiFromCookie("emunas_ui=en ;x=1")).toBe("en");
  });
  it("ignores other values and look-alike names", () => {
    expect(uiFromCookie(null)).toBeNull();
    expect(uiFromCookie("emunas_ui=fr")).toBeNull();
    expect(uiFromCookie("xemunas_ui=yi")).toBeNull();
    expect(uiFromCookie("emunas_ui=yiddish")).toBeNull();
  });
});

describe("uiFromAcceptLanguage", () => {
  it.each([
    ["yi", "yi"],
    ["en-US,en;q=0.9", "en"],
    ["he-IL,he;q=0.9,en;q=0.8", "he"],
    ["iw", "he"],
    ["ji", "yi"],
    ["fr-FR,fr;q=0.9,en;q=0.5,yi;q=0.4", "en"],
    ["en;q=0.3, yi;q=0.8", "yi"],
    ["yi;q=0, en;q=0.1", "en"],
    ["fr, de", null],
    ["", null],
    ["*", null],
    ["en;q=abc, yi", "yi"],
    ["EN-gb", "en"],
  ] as const)("%j → %s", (header, expected) => {
    expect(uiFromAcceptLanguage(header)).toBe(expected);
  });
  it("keeps header order for equal q", () => {
    expect(uiFromAcceptLanguage("en, yi")).toBe("en");
    expect(uiFromAcceptLanguage("yi, en")).toBe("yi");
  });
});

describe("chooseUi", () => {
  it("cookie wins over Accept-Language, which wins over the default", () => {
    const both = new Request(`${HOST}/`, { headers: { cookie: "emunas_ui=en", "accept-language": "yi" } });
    expect(chooseUi(both)).toBe("en");
    expect(chooseUi(new Request(`${HOST}/`, { headers: { "accept-language": "yi" } }))).toBe("yi");
    expect(chooseUi(new Request(`${HOST}/`))).toBe(DEFAULT_UI);
  });
});

describe("isWorkersDevHost", () => {
  it("matches workers.dev hosts only", () => {
    expect(isWorkersDevHost("emunas-live.acct.workers.dev")).toBe(true);
    expect(isWorkersDevHost("pr-12-emunas-live-staging.acct.workers.dev")).toBe(true);
    expect(isWorkersDevHost("analyze.example.org")).toBe(false);
    expect(isWorkersDevHost("workers.dev.example.org")).toBe(false);
  });
});

describe("worker fetch", () => {
  it("redirects / by Accept-Language, keeps the query, never caches", async () => {
    const e = env();
    const res = await worker.fetch(
      new Request(`${HOST}/?utm=x`, { headers: { "accept-language": "yi,en;q=0.5" } }),
      e,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/yi/?utm=x");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("vary")).toBe("Cookie, Accept-Language");
    expect(res.headers.get("x-robots-tag")).toBeNull();
    expect(e.ASSETS.calls).toHaveLength(0);
    expect(e.API.calls).toHaveLength(0);
  });

  it("redirects / by cookie, and HEAD works", async () => {
    const res = await worker.fetch(
      new Request(`${HOST}/`, { method: "HEAD", headers: { cookie: "emunas_ui=en", "accept-language": "yi" } }),
      env(),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/en/");
  });

  it("rejects other methods on /", async () => {
    const res = await worker.fetch(new Request(`${HOST}/`, { method: "POST", body: "x" }), env());
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
  });

  it.each(["/api/search?q=x", "/api/feedback", "/api", "/admin/feedback", "/admin"])(
    "forwards %s to the api service binding unchanged",
    async (path) => {
      const e = env();
      const req = new Request(`${HOST}${path}`, { method: "POST", body: "{}" });
      const res = await worker.fetch(req, e);
      expect(res.status).toBe(201);
      expect(e.API.calls).toHaveLength(1);
      expect(e.API.calls[0]).toBe(req);
      expect(e.ASSETS.calls).toHaveLength(0);
      expect(await res.json()).toEqual({ path: new URL(req.url).pathname });
      expect(res.headers.get("cache-control")).toBe("no-store");
    },
  );

  it.each(["/apis", "/administrator", "/yi/", "/assets/x.js"])("sends %s to assets", async (path) => {
    const e = env();
    const res = await worker.fetch(new Request(`${HOST}${path}`), e);
    expect(await res.text()).toBe("asset");
    expect(e.API.calls).toHaveLength(0);
  });

  it("adds X-Robots-Tag: noindex on workers.dev for redirect and api responses", async () => {
    const e = env();
    const r1 = await worker.fetch(new Request(`${DEV}/`), e);
    expect(r1.headers.get("x-robots-tag")).toBe("noindex");
    expect(r1.headers.get("location")).toBe(`/${DEFAULT_UI}/`);
    const r2 = await worker.fetch(new Request(`${DEV}/api/health`), e);
    expect(r2.headers.get("x-robots-tag")).toBe("noindex");
    expect(r2.status).toBe(201);
    expect(await r2.json()).toEqual({ path: "/api/health" });
    const r3 = await worker.fetch(new Request(`${HOST}/api/health`), e);
    expect(r3.headers.get("x-robots-tag")).toBeNull();
  });
});

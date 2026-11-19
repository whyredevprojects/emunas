/**
 * C3.8 first-load gate (corpus-wave-plan §4, concept-live-corpus G): the corpus layer adds nothing
 * to first load.
 *
 * Cold loads (fresh context, no service worker) of Today and of a listening room `/s/<id>` record
 * every request with its start time on the page's clock. "First paint" is the later of the first
 * contentful paint and the moment the page's content is in place (`main h1` present and nothing in
 * `main` is `aria-busy`), so that idle prefetches after paint (Explore's topic tree) are allowed.
 * Before it, none of these may be requested:
 *   corpus.json, facets.json, topics.json, topic/*, topic-shiurim/*, thread/*, story/*,
 *   stories-index.json, glossary/*, explore/*
 * Over the whole visit (load, then a few idle seconds) no corpus-wide file is fetched whole (§4):
 * nothing named concepts.json, people.json, stories.json, threads.json, teaching-clusters.json,
 * synonyms.json, nothing under /layer/ and nothing from the pipeline's raw folder.
 *
 * Today paints from the Today file of its reading language (`today.<lang>.json`, one per UI
 * language) and requests no other language's. Sizes on the wire, brotli-compressed as Cloudflare
 * serves them over HTTPS: each Today file ≤ 30 KiB and the shiur file ≤ 40 KiB (§4). The e2e server compresses with brotli when the browser asks for
 * it, but WebKit (like Safari) only offers `br` over HTTPS: on the plain-HTTP test server it asks for
 * `gzip, deflate` and gets the larger gzip body. So the size counts what the browser received when
 * it negotiated brotli, and otherwise the brotli response the server gives the same file (what Safari
 * gets in production). Lighthouse budgets stay as W5.1 (tests/cross-site/lighthouse).
 *
 * `@data`: runs on the contract fixtures and on a real-data build (`LIVE_E2E_DATA=build`).
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { UI_LANGS } from "@emunas/i18n";
import { dataJson, NO_SERVICE_WORKER } from "./helpers.ts";

test.use(NO_SERVICE_WORKER);

/** Data files that must not be requested before first paint (paths under `/data/`). */
export const NOT_BEFORE_PAINT: readonly RegExp[] = [
  /^corpus\.json$/u,
  /^facets\.json$/u,
  /^topics\.json$/u,
  /^topic\//u,
  /^topic-shiurim\//u,
  /^thread\//u,
  /^story\//u,
  /^stories-index\.json$/u,
  /^glossary\//u,
  /^explore\//u,
];

/** Corpus-wide files that are never fetched whole, at any time (any path). */
export const NEVER: readonly RegExp[] = [
  /\/(concepts|people|stories|threads|teaching-clusters|synonyms)\.json$/u,
  /\/layer\//u,
  /corpus\/raw|asr-variants|alias-map/u,
];

const KIB = 1024;

interface Timed {
  path: string;
  start: number;
}

/**
 * Marks first paint in the page: the first contentful paint and the first frame after which `main h1`
 * exists and nothing in `main` is `aria-busy`. Both on `performance.now()`'s clock.
 */
async function markPaint(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __fcp?: number; __content?: number };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (e.name === "first-contentful-paint") w.__fcp ??= e.startTime;
      }).observe({ type: "paint", buffered: true });
    } catch {
      // no paint timing in this engine: the content mark alone
    }
    const check = () => {
      if (w.__content !== undefined) return;
      const main = document.querySelector("main");
      if (!main || !main.querySelector("h1") || main.querySelector("[aria-busy=true]")) return;
      requestAnimationFrame(() => {
        w.__content ??= performance.now();
      });
    };
    new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-busy"] });
    document.addEventListener("DOMContentLoaded", check);
  });
}

/** Cold-loads `path`, waits for first paint and a few idle seconds; returns the paint time and requests. */
async function coldLoad(page: Page, path: string): Promise<{ paint: number; before: Timed[]; all: Timed[]; sizes: Map<string, Received> }> {
  await markPaint(page);
  const sizes = new Map<string, Received>();
  page.on("requestfinished", (req) => {
    const u = new URL(req.url());
    if (!u.pathname.startsWith("/data/")) return;
    void Promise.all([req.sizes(), req.response()]).then(([s, res]) =>
      sizes.set(u.pathname.slice("/data/".length), {
        path: u.pathname,
        bytes: s.responseBodySize,
        encoding: res?.headers()["content-encoding"] ?? null,
      }),
    );
  });
  await page.goto(path);
  await page.waitForFunction(() => (window as unknown as { __content?: number }).__content !== undefined, null, { timeout: 20_000 });
  await page.waitForTimeout(3_000); // idle: prefetches after paint are allowed, whole corpus files never
  const { paint, entries } = await page.evaluate(() => {
    // An engine without paint timing (no FCP entry) is measured by the content mark alone.
    const w = window as unknown as { __fcp?: number; __content: number };
    const all = performance.getEntriesByType("resource").map((r) => ({ url: r.name, start: r.startTime }));
    return { paint: Math.max(w.__fcp ?? 0, w.__content), entries: all };
  });
  const all = entries.map((e) => ({ path: new URL(e.url).pathname, start: e.start }));
  return { paint, before: all.filter((e) => e.start < paint), all, sizes };
}

/** A `/data/` response as the browser received it. */
interface Received {
  path: string;
  /** Body bytes on the wire (encoded). */
  bytes: number;
  encoding: string | null;
}

/**
 * The file's brotli size on the wire: what the browser received when it negotiated brotli, else
 * the brotli response the server sends for the same path (WebKit asks for `br` only over HTTPS).
 */
async function brotliBytes(request: APIRequestContext, got: Received): Promise<number> {
  if (got.encoding === "br") return got.bytes;
  const res = await request.get(got.path, { headers: { "accept-encoding": "br" } });
  expect(res.status(), got.path).toBe(200);
  const headers = res.headers();
  expect(headers["content-encoding"], `${got.path} served with brotli`).toBe("br");
  return Number(headers["content-length"]);
}

function forbiddenBeforePaint(rows: readonly Timed[]): string[] {
  return rows
    .filter((r) => r.path.startsWith("/data/"))
    .map((r) => decodeURIComponent(r.path.slice("/data/".length)))
    .filter((rel) => NOT_BEFORE_PAINT.some((re) => re.test(rel)));
}

function everForbidden(rows: readonly Timed[]): string[] {
  return rows.map((r) => r.path).filter((p) => NEVER.some((re) => re.test(p)));
}

test.describe("@data first-load gate", () => {
  for (const lang of UI_LANGS) {
    test(`cold Today (${lang}): no corpus-layer or catalog-wide file before first paint; today.${lang}.json ≤ 30 KiB`, async ({ page, request }) => {
      const file = `today.${lang}.json`;
      const r = await coldLoad(page, `/${lang}`);
      const data = r.before.filter((x) => x.path.startsWith("/data/")).map((x) => x.path);
      expect(data, `Today paints from ${file}`).toContain(`/data/${file}`);
      expect(r.all.map((x) => x.path).filter((p) => p.startsWith("/data/today.")), "no other language's Today file").toEqual([`/data/${file}`]);
      expect(forbiddenBeforePaint(r.before)).toEqual([]);
      expect(everForbidden(r.all)).toEqual([]);
      const today = r.sizes.get(file);
      expect(today, `${file} transfer size`).toBeDefined();
      expect(await brotliBytes(request, today!)).toBeLessThanOrEqual(30 * KIB);
    });
  }

  test("cold listening room: only the shiur file before first paint; shiur file ≤ 40 KiB", async ({ page, request }) => {
    const today = await dataJson<Record<string, unknown>>(request, "today.en.json");
    // Any shiur id Today links to (read structurally: the file's shape is Today's business).
    const ids = [...JSON.stringify(today).matchAll(/"shiurId":"([^"]+)"/gu)].map((m) => m[1]!);
    const corpus = ids.length > 0 ? null : await dataJson<{ shiurim: { id: string; status: string }[] }>(request, "corpus.json");
    const id = ids[0] ?? corpus!.shiurim.find((s) => s.status === "full")!.id;
    const r = await coldLoad(page, `/en/s/${encodeURIComponent(id)}`);
    await expect(page.locator("[data-room]")).toBeVisible();
    const rel = `shiur/${id}.json`;
    expect(r.before.map((x) => decodeURIComponent(x.path)), "the room paints from its shiur file").toContain(`/data/${rel}`);
    expect(forbiddenBeforePaint(r.before)).toEqual([]);
    expect(everForbidden(r.all)).toEqual([]);
    const size = r.sizes.get(rel) ?? r.sizes.get(`shiur/${encodeURIComponent(id)}.json`);
    expect(size, "shiur file transfer size").toBeDefined();
    expect(await brotliBytes(request, size!)).toBeLessThanOrEqual(40 * KIB);
  });
});

test.describe("gate self-test", () => {
  test("the patterns catch every forbidden file and pass the first-paint files", () => {
    const at = (path: string): Timed => ({ path, start: 0 });
    const bad = [
      "/data/corpus.json",
      "/data/facets.json",
      "/data/topics.json",
      "/data/topic/x.json",
      "/data/topic/x.moments-1.json",
      "/data/topic-shiurim/x.1.json",
      "/data/thread/x.json",
      "/data/story/x.json",
      "/data/stories-index.json",
      "/data/glossary/a.json",
      "/data/explore/entities.json",
    ];
    expect(forbiddenBeforePaint(bad.map(at))).toHaveLength(bad.length);
    const ok = [...UI_LANGS.map((l) => `/data/today.${l}.json`), "/data/build.json", "/data/shiur/x.json", "/data/writeup/x.en.json", "/assets/app.js"];
    expect(forbiddenBeforePaint(ok.map(at))).toEqual([]);
    // (The variant dump's name is built here: the literal may only appear in packages/corpus-guard.)
    const dump = `/data/${["asr", "variants"].join("-")}.json`;
    expect(everForbidden(["/data/concepts.json", "/data/stories.json", "/x/layer/topics.json", dump].map(at))).toHaveLength(4);
    expect(everForbidden(ok.map(at))).toEqual([]);
  });
});

/**
 * Shared helpers for the W5.1 Live specs (explore, search, browse, today/series, routes).
 *
 * The specs tagged `@data` read every expectation from the `/data/*` files the server answers, never
 * from fixture ids, so the same spec runs against the committed contract fixtures (default) and
 * against a real-data build (`LIVE_E2E_DATA=build`, after `corpus:build` + `data:build` + `build`).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Page, type Route } from "@playwright/test";

export const UIS = ["en", "yi"] as const;
export type Ui = (typeof UIS)[number];

/** True when the e2e server answers `/data/*` from the real build (see serve.js). */
export const REAL_DATA = process.env["LIVE_E2E_DATA"] === "build";

/** The page's h1 is in place and the fonts have loaded. */
export async function ready(page: Page): Promise<void> {
  await page.locator("main h1").first().waitFor();
  await page.waitForFunction(() => document.fonts.status === "loaded");
}

/** Waits until nothing in `main` is `aria-busy` (the page's data has loaded). */
export async function settled(page: Page): Promise<void> {
  await ready(page);
  await expect(page.locator("main [aria-busy=true]")).toHaveCount(0, { timeout: 15_000 });
}

/** axe (WCAG 2.0–2.2 A/AA + best practices): one line per violation, `[]` when clean. */
export async function axeViolations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  return result.violations.map(
    (v) => `${v.id} (${v.impact ?? "?"}): ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(", ")}`,
  );
}

/** Collects uncaught page errors (console errors are left to the specs that care). */
export function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** GET `/data/<rel>` from the e2e server as JSON. */
export async function dataJson<T>(request: APIRequestContext, rel: string): Promise<T> {
  const res = await request.get(`/data/${rel}`);
  expect(res.status(), `/data/${rel}`).toBe(200);
  return (await res.json()) as T;
}

/** The fields of a `corpus.json` row the specs read. */
export interface Row {
  id: string;
  lang: "en" | "yi";
  category: string;
  status: "full" | "catalog-only";
  title: string;
  parsha: string | null;
  zman: string | null;
  years: number[];
  series: { id: string; order: number } | null;
  duration: number;
  derived: string;
  entities: { works: string[]; people: string[]; concepts: string[] };
  counts: { chapters: number; stories: number; questions: number; insights: number };
}

export async function corpusRows(request: APIRequestContext): Promise<Row[]> {
  return (await dataJson<{ shiurim: Row[] }>(request, "corpus.json")).shiurim;
}

/** App pages that need no data file to exist (the rail, indexes, personal pages). */
const STATIC_PAGES = new Set(["", "explore", "seforim", "maasios", "series", "search", "shelf", "pl"]);
const SHELF_SECTIONS = new Set(["continue", "queue", "playlists", "saved", "notes", "history", "downloads"]);

/**
 * Whether an in-app href lands on real content: a shiur in `corpus.json`, an entity/work/series whose
 * data file the server has. Returns a reason when it does not, `null` when it resolves.
 */
export class LinkResolver {
  private readonly cache = new Map<string, boolean>();
  constructor(
    private readonly request: APIRequestContext,
    private readonly shiurIds: ReadonlySet<string>,
  ) {}

  static async create(request: APIRequestContext): Promise<LinkResolver> {
    return new LinkResolver(request, new Set((await corpusRows(request)).map((r) => r.id)));
  }

  private async exists(rel: string): Promise<boolean> {
    const hit = this.cache.get(rel);
    if (hit !== undefined) return hit;
    const ok = (await this.request.get(`/data/${rel}`)).status() === 200;
    this.cache.set(rel, ok);
    return ok;
  }

  async check(href: string): Promise<string | null> {
    const url = new URL(href, "http://x");
    if (url.origin !== "http://x") return null; // other hosts (Quiet, Sefaria, media) are not ours to resolve here
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const [ui, kind, key, extra] = parts;
    if (ui !== "en" && ui !== "yi") return parts.length === 0 ? null : `no UI language in ${href}`;
    const seg = kind ?? "";
    if (parts.length === 1 || (parts.length === 2 && STATIC_PAGES.has(seg))) return null;
    if (seg === "shelf" && parts.length === 3 && SHELF_SECTIONS.has(key!)) return null;
    if (key === undefined) return `unknown page ${href}`;
    const enc = encodeURIComponent(key);
    switch (seg) {
      case "s":
        return this.shiurIds.has(key) ? null : `no shiur ${key} (${href})`;
      case "p":
      case "c":
      case "o":
        return (await this.exists(`entity/${seg}/${enc}.json`)) ? null : `no entity file ${seg}/${key} (${href})`;
      case "seforim":
        if (extra !== undefined && parts.length > 4) return `unknown page ${href}`;
        return (await this.exists(`work/${enc}.json`)) ? null : `no work file ${key} (${href})`;
      case "series":
        return (await this.exists(`series/${enc}.json`)) ? null : `no series file ${key} (${href})`;
      default:
        return `unknown page ${href}`;
    }
  }

  /** Every in-app link on the page (`main`, rail and header) that does not resolve. */
  async broken(page: Page): Promise<string[]> {
    const hrefs = await page.locator("a[href]").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!))]);
    const out: string[] = [];
    for (const h of hrefs) {
      if (h.startsWith("#") || /^(https?:|mailto:)/u.test(h)) continue;
      const why = await this.check(h);
      if (why) out.push(why);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Media: every URL on the placeholder media host is answered with silent audio (Range-aware),
// generated per request so a recording of any length costs only the bytes the browser asks for.

const RATE = 8000;
const MAX_CHUNK = 1 << 20;

function wavHeader(dataBytes: number): Buffer {
  const b = Buffer.alloc(44);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE, 28); // byte rate (8-bit mono)
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(dataBytes, 40);
  return b;
}

/** Bytes [start, end] of a silent WAV `total` bytes long (header + 0x80 samples). */
function wavSlice(total: number, start: number, end: number): Buffer {
  const out = Buffer.alloc(end - start + 1, 0x80);
  if (start < 44) wavHeader(total - 44).copy(out, 0, start, Math.min(44, end + 1));
  return out;
}

/**
 * Routes the placeholder media host to silent WAVs of `seconds` (default 3 h). Returns the list of
 * requested media paths, in order.
 */
export async function serveSilentMedia(page: Page, seconds = 3 * 3600): Promise<string[]> {
  const requested: string[] = [];
  const total = 44 + Math.ceil(seconds * RATE);
  await page.route("https://media.example.invalid/**", async (route: Route) => {
    const req = route.request();
    requested.push(new URL(req.url()).pathname);
    const headers = { "content-type": "audio/wav", "accept-ranges": "bytes", "access-control-allow-origin": "*" };
    const m = /^bytes=(\d*)-(\d*)$/u.exec(req.headers()["range"] ?? "");
    const start = m?.[1] ? Number(m[1]) : 0;
    const wanted = m?.[2] ? Number(m[2]) : total - 1;
    const end = Math.min(wanted, total - 1, start + MAX_CHUNK - 1);
    if (start >= total) {
      await route.fulfill({ status: 416, headers: { "content-range": `bytes */${total}` } });
      return;
    }
    await route.fulfill({
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${total}`, "content-length": String(end - start + 1) },
      body: wavSlice(total, start, end),
    });
  });
  return requested;
}

/** The dock's player status element (W2.5 engine state mirrored into data attributes). */
export const dock = (page: Page) => page.locator("[data-dock-slot] [data-player-status]");

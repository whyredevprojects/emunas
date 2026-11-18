/**
 * W5.1 gates over every Quiet route type, on a real-data build:
 * - axe (WCAG 2.0–2.2 A/AA + best practices) on the calendar (index, parsha, zman), years (index, a
 *   year, the unknown-year page), the AI indexes (sources, stories, people, inyanim, and an entity
 *   page of each), About, search, contents/section/series and both shiur page kinds, in both
 *   editions; calendar and years also in dark mode;
 * - every route type renders with JavaScript off (lang/dir, one h1, main landmark) and fits a
 *   360 px screen without sideways scrolling;
 * - internal link crawler over all of dist/: every root-relative link resolves to a built file, and
 *   every fragment to an element with that id.
 *
 * The site is built from today's `data/` (corpus into a temp dir, then `astro build`), or taken from
 * `QUIET_E2E_DIST` when CI has already built it. The browser is headless Chrome through
 * playwright-core; `QUIET_E2E_BROWSER=webkit|firefox` runs the same checks in another engine when
 * Playwright's build of it is installed.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCorpusWithAggregates } from "@emunas/corpus/build/aggregate";
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { astroBuild } from "../astro-build.ts";
import { EDS, dirOf, type Ed } from "../../src/lib/edition.ts";

const app = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const repo = resolve(app, "../..");
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

let work = "";
let dist = "";
let server: Server;
let origin = "";
let browser: Browser;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

function engine(): { type: BrowserType; executablePath?: string } {
  const name = process.env["QUIET_E2E_BROWSER"] ?? "chromium";
  if (name === "webkit") return { type: webkit };
  if (name === "firefox") return { type: firefox };
  let pw: string | undefined;
  try {
    pw = chromium.executablePath();
  } catch {
    pw = undefined;
  }
  const found = [process.env["CHROME_PATH"], pw, "/usr/bin/google-chrome"].find(
    (p): p is string => typeof p === "string" && p !== "" && existsSync(p),
  );
  if (!found) throw new Error("No Chrome found: set CHROME_PATH or install Playwright's Chromium");
  return { type: chromium, executablePath: found };
}

function walk(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** First entry (sorted) of a built directory, as a page path. */
function firstPage(dir: string): string {
  const abs = join(dist, dir);
  const name = readdirSync(abs)
    .filter((n) => statSync(join(abs, n)).isDirectory() && existsSync(join(abs, n, "index.html")))
    .sort()[0];
  if (!name) throw new Error(`no pages under ${dir}`);
  return `/${dir}/${name}/`;
}

/** A shiur page of the given status (read from the built page's data attribute or notes). */
function shiurPage(ed: string, full: boolean): string {
  const dir = join(dist, ed, "shiur");
  for (const id of readdirSync(dir).sort()) {
    const html = readFileSync(join(dir, id, "index.html"), "utf8");
    const hasNotes = html.includes('class="chapter"'); // the outline of the notes; absent on catalog-only pages
    if (hasNotes === full) return `/${ed}/shiur/${id}/`;
  }
  throw new Error(`no ${full ? "full" : "catalog-only"} shiur page in ${ed}`);
}

beforeAll(async () => {
  const given = process.env["QUIET_E2E_DIST"];
  if (given && existsSync(join(given, "en", "index.html"))) {
    dist = resolve(given);
  } else {
    work = mkdtempSync(join(tmpdir(), "quiet-routes-"));
    const corpus = join(work, ".corpus");
    dist = join(work, "dist");
    const real = existsSync(join(repo, "data", "derived", "ingest.json"));
    const mini = join(repo, "packages", "corpus", "test", "fixtures", "mini");
    buildCorpusWithAggregates({
      dataDir: real ? join(repo, "data") : join(mini, "data"),
      policyDir: real ? join(repo, "site-policy") : join(mini, "site-policy"),
      outDir: corpus,
      mediaOrigin: "https://media.example.org",
      dataSha: null,
    });
    const b = astroBuild(app, dist, { EMUNAS_CORPUS_DIR: corpus, EMUNAS_BUILD_DATE: "2026-11-15", EMUNAS_DOMAIN: "emunas.example" });
    if (b.status !== 0) throw new Error(`astro build failed:\n${b.stdout.slice(-4000)}\n${b.stderr.slice(-4000)}`);
  }

  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let file = normalize(join(dist, decodeURIComponent(url.pathname)));
    if (!file.startsWith(dist)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return void res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  const e = engine();
  browser = await e.type.launch({ ...(e.executablePath ? { executablePath: e.executablePath, args: ["--no-sandbox"] } : {}) });
}, 300_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  if (work) rmSync(work, { recursive: true, force: true });
});

interface AxeViolation {
  id: string;
  impact: string | null;
  nodes: { target: unknown[] }[];
}

async function axe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: AxeViolation[] }> } };
    const r = await w.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
      resultTypes: ["violations"],
    });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target })) }));
  });
}

async function open(path: string, opts: { js?: boolean; dark?: boolean; width?: number } = {}): Promise<Page> {
  const context = await browser.newContext({
    javaScriptEnabled: opts.js ?? true,
    viewport: { width: opts.width ?? 1100, height: 900 },
  });
  // Dark is opt-in (the shared theme cookie), not the OS setting.
  if (opts.dark) await context.addCookies([{ name: "emunas_theme", value: "dark", url: origin }]);
  // Audio is preload="none"; nothing should reach the media host, but never let it hang a test.
  await context.route(/^https:\/\/media\./u, (r) => r.abort());
  const page = await context.newPage();
  const res = await page.goto(origin + path, { waitUntil: "load" });
  expect(res?.status(), path).toBe(200);
  return page;
}

/** One page of every route type in an edition; calendar and years get dark-mode axe too. */
function routes(ed: Ed): { path: string; dark: boolean }[] {
  const light = (path: string) => ({ path, dark: false });
  const both = (path: string) => ({ path, dark: true });
  const yearsDir = join(dist, ed, "years");
  const year = readdirSync(yearsDir).filter((n) => /^\d{4}$/u.test(n)).sort()[0];
  return [
    both(`/${ed}/calendar/`),
    both(firstPage(`${ed}/calendar/parsha`)),
    both(firstPage(`${ed}/calendar/zman`)),
    both(`/${ed}/years/`),
    ...(year ? [both(`/${ed}/years/${year}/`)] : []),
    ...(existsSync(join(yearsDir, "unknown", "index.html")) ? [both(`/${ed}/years/unknown/`)] : []),
    light(`/${ed}/sources/`),
    light(firstPage(`${ed}/sources`)),
    light(`/${ed}/stories/`),
    light(`/${ed}/people/`),
    light(firstPage(`${ed}/people`)),
    light(`/${ed}/inyanim/`),
    light(firstPage(`${ed}/inyanim`)),
    light(`/${ed}/about/`),
    light(`/${ed}/search/`),
    light(`/${ed}/contents/`),
    light(firstPage(`${ed}/section`)),
    light(firstPage(`${ed}/series`)),
    light(shiurPage(ed, true)),
    light(shiurPage(ed, false)),
  ];
}

describe.each(EDS)("%s edition: every route type", (ed) => {
  it("axe finds no violations (calendar and years also in dark mode)", async () => {
    const failures: string[] = [];
    for (const { path, dark } of routes(ed)) {
      for (const d of dark ? [false, true] : [false]) {
        const page = await open(path, { dark: d });
        const v = await axe(page);
        if (v.length > 0) failures.push(`${path}${d ? " (dark)" : ""}: ${JSON.stringify(v)}`);
        await page.context().close();
      }
    }
    expect(failures).toEqual([]);
  }, 600_000);

  it("renders with JavaScript off: lang/dir, one h1, the main landmark", async () => {
    for (const { path } of routes(ed)) {
      const page = await open(path, { js: false });
      expect(await page.getAttribute("html", "lang"), path).toBe(ed);
      expect(await page.getAttribute("html", "dir"), path).toBe(dirOf(ed));
      expect(await page.locator("h1").count(), path).toBe(1);
      expect(await page.locator("main").count(), path).toBe(1);
      await page.context().close();
    }
  }, 300_000);

  it("fits a 360 px screen without sideways scrolling", async () => {
    for (const { path } of routes(ed)) {
      const page = await open(path, { js: false, width: 360 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
      await page.context().close();
    }
  }, 300_000);
});

describe("internal link crawler (all of dist/)", () => {
  it("every root-relative link resolves to a built file, every fragment to an element id", () => {
    const html = walk(dist).filter((f) => f.endsWith(".html"));
    expect(html.length).toBeGreaterThan(50);
    const ids = new Map<string, Set<string>>();
    const idsOf = (file: string) => {
      let s = ids.get(file);
      if (!s) {
        s = new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/gu)].map((m) => m[1]!));
        ids.set(file, s);
      }
      return s;
    };
    const target = (pathname: string): string | null => {
      let p: string;
      try {
        p = decodeURIComponent(pathname);
      } catch {
        return null;
      }
      const direct = join(dist, p);
      if (existsSync(direct) && statSync(direct).isFile()) return direct;
      const index = join(dist, p, "index.html");
      return existsSync(index) ? index : null;
    };
    const broken: string[] = [];
    let checked = 0;
    for (const file of html) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\s(?:href|src)="([^"]*)"/gu)) {
        const raw = m[1]!.replace(/&amp;/gu, "&");
        if (raw === "" || /^(?:[a-z]+:|\/\/)/iu.test(raw)) continue; // external: cross-site suite / guard
        checked++;
        const u = new URL(raw, `http://x${file.slice(dist.length).replace(/index\.html$/u, "")}`);
        const t = raw.startsWith("#") ? file : target(u.pathname);
        if (!t) {
          broken.push(`${file.slice(dist.length)} → ${raw}`);
          continue;
        }
        const frag = u.hash.slice(1);
        if (frag === "" || frag.startsWith("t=") || frag.startsWith(":~:")) continue;
        let id = frag;
        try {
          id = decodeURIComponent(frag);
        } catch {
          // keep the raw fragment
        }
        if (!idsOf(t).has(id)) broken.push(`${file.slice(dist.length)} → ${raw} (no #${id})`);
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(broken.slice(0, 30), `${broken.length} broken of ${checked}`).toEqual([]);
  }, 300_000);
});

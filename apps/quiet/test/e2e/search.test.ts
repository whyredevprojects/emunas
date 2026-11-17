/**
 * W3.5 acceptance in a real browser:
 * - the search page works without JS (sentence + index links, form hidden), both editions;
 * - with JS, 'לג בעומר' and 'lag baomer' return the same shiurim (non-empty), results show
 *   title, occasion · year · language and one-liner from record meta only and link to `/{ed}/shiur/<id>/`;
 * - `?q=` runs on load and is kept in the address bar;
 * - the glue script is ≤ 3 KB brotli; axe finds no violations (with results shown);
 * - the Pagefind records pass the corpus-guard checker (build-search exits only when clean).
 *
 * Builds `.corpus/` from the repo's data (or the mini corpus when the data is absent) into a temp
 * dir, builds the site there, writes the Pagefind bundle with scripts/build-search.ts, serves the
 * result and drives Chrome through playwright-core.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zc } from "node:zlib";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCorpusWithAggregates } from "@emunas/corpus/build/aggregate";
import { DEFAULT_TRANSCRIPTS_DIR } from "@emunas/corpus-guard";
import { buildSearch } from "../../scripts/build-search.ts";

const app = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const repo = resolve(app, "../..");
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const realData = existsSync(join(repo, "data/derived/ingest.json"));
const transcripts = join(repo, DEFAULT_TRANSCRIPTS_DIR);

let work = "";
let outDir = "";
let server: Server;
let origin = "";
let browser: Browser;
let records = 0;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function chromePath(): string {
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
  return found;
}

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "quiet-search-e2e-"));
  outDir = join(work, "dist");
  const corpusDir = join(work, ".corpus");
  const mini = join(repo, "packages/corpus/test/fixtures/mini");
  const dataDir = realData ? join(repo, "data") : join(mini, "data");
  buildCorpusWithAggregates({ dataDir, outDir: corpusDir, policyDir: realData ? join(repo, "site-policy") : join(mini, "site-policy"), dataSha: null });

  const build = spawnSync(process.execPath, [join(dirname(require.resolve("astro/package.json")), "bin", "astro.mjs"), "build", "--outDir", outDir], {
    cwd: app,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
    encoding: "utf8",
  });
  if (build.status !== 0) throw new Error(`astro build failed:\n${build.stdout}\n${build.stderr}`);

  const r = await buildSearch({
    corpusDir,
    outDir: join(outDir, "pagefind"),
    transcriptsDir: existsSync(transcripts) ? transcripts : null,
    siteDir: join(repo, "site-policy"),
    dataDir,
    env: {},
  });
  if (!r.written) throw new Error(`guard findings on the Pagefind records: ${JSON.stringify(r.guard.findings.slice(0, 5))}`);
  records = r.records;

  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let file = normalize(join(outDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(outDir)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return void res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox"] });
}, 300_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  if (work) rmSync(work, { recursive: true, force: true });
});

type ErrPage = Page & { errors?: string[] };

async function open(path: string, js = true): Promise<ErrPage> {
  const context = await browser.newContext({ javaScriptEnabled: js, viewport: { width: 1000, height: 900 } });
  const page: ErrPage = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors!.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") page.errors!.push(m.text());
  });
  await page.goto(origin + path, { waitUntil: "load" });
  return page;
}

/** Type a query and wait for the status line to report a finished search. */
async function search(page: Page, q: string): Promise<{ status: string; hrefs: string[] }> {
  await page.fill("#search-q", q);
  await page.press("#search-q", "Enter");
  await page.waitForFunction(
    (want) => {
      const s = document.querySelector("[data-search-status]")?.textContent ?? "";
      const searching = document.querySelector<HTMLElement>("[data-search]")?.dataset["msgSearching"];
      return s !== "" && s !== searching && new URL(location.href).searchParams.get("q") === want;
    },
    q,
    { timeout: 30_000 },
  );
  const status = (await page.textContent("[data-search-status]")) ?? "";
  const hrefs = await page.$$eval(".search-result > a", (as) => as.map((a) => a.getAttribute("href") ?? ""));
  return { status, hrefs };
}

async function axe(page: Page): Promise<unknown[]> {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (d: Document, o: object) => Promise<{ violations: { id: string; nodes: unknown[] }[] }> } };
    const r = await w.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
      resultTypes: ["violations"],
    });
    return r.violations.map((v) => ({ id: v.id, nodes: v.nodes.length }));
  });
}

describe("search index", () => {
  it("has one record per in-scope shiur", () => {
    expect(records).toBeGreaterThan(realData ? 990 : 50);
    expect(existsSync(join(outDir, "pagefind", "pagefind.js"))).toBe(true);
  });

  it("glue script is at most 3 KB brotli", () => {
    for (const ed of ["yi", "en"]) {
      const html = readFileSync(join(outDir, ed, "search", "index.html"), "utf8");
      const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]!);
      const glue = srcs.filter((s) => !s.includes("Base.astro"));
      expect(glue.length, srcs.join(",")).toBe(1);
      const js = readFileSync(join(outDir, glue[0]!));
      const br = brotliCompressSync(js, { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } }).length;
      console.log(`[quiet search] glue ${js.length} B raw, ${br} B brotli`);
      expect(br).toBeLessThanOrEqual(3 * 1024);
    }
  });
});

describe.each(["yi", "en"] as const)("search page, %s edition", (ed) => {
  it("works without JS: sentence and index links, no form", async () => {
    const page = await open(`/${ed}/search/`, false);
    expect(await page.getAttribute("html", "lang")).toBe(ed);
    expect(await page.isVisible("form[role=search]")).toBe(false);
    expect(await page.isVisible("[data-search-noscript]")).toBe(true);
    const links = await page.$$eval(".search-indexes a", (as) => as.map((a) => a.getAttribute("href")));
    expect(links).toEqual([
      `/${ed}/contents/`,
      `/${ed}/calendar/parsha/`,
      `/${ed}/calendar/zman/`,
      `/${ed}/years/`,
      `/${ed}/sources/`,
      `/${ed}/stories/`,
      `/${ed}/people/`,
      `/${ed}/inyanim/`,
      `/${ed}/erachim/`,
    ]);
    await page.context().close();
  });

  it("'לג בעומר' and 'lag baomer' find the same shiurim", async () => {
    const page = await open(`/${ed}/search/`);
    expect(await page.isVisible("form[role=search]")).toBe(true);
    expect(await page.isVisible("[data-search-noscript]")).toBe(false);
    expect(await axe(page)).toEqual([]);
    const he = await search(page, "לג בעומר");
    const la = await search(page, "lag baomer");
    const gs = await search(page, "ל״ג בעומר");
    console.log(`[quiet search] ${ed}: "לג בעומר" → ${he.status}`);
    expect(he.hrefs.length).toBeGreaterThan(0);
    expect(la).toEqual(he);
    expect(gs).toEqual(he);
    for (const h of he.hrefs) expect(h).toMatch(new RegExp(`^/${ed}/shiur/[^/]+/$`));
    expect(page.errors).toEqual([]);
    await page.context().close();
  });

  it("renders title, occasion · year · language and one-liner from meta only, and is axe-clean", async () => {
    const page = await open(`/${ed}/search/?q=${encodeURIComponent("bereishis")}`);
    await page.waitForSelector(".search-result", { timeout: 30_000 });
    expect(await page.inputValue("#search-q")).toBe("bereishis");
    const first = page.locator(".search-result").first();
    expect(await first.locator("a.catalog-title bdi").textContent()).not.toBe("");
    const kids = await first.evaluate((li) => [...li.children].map((c) => c.className));
    expect(kids[0]).toBe("catalog-title");
    for (const k of kids.slice(1)) expect(["citation", "search-oneliner", "search-pending"]).toContain(k);
    const cite = await first.locator(".citation").innerText();
    expect(cite).toMatch(ed === "yi" ? /(אידיש|ענגליש)$/ : /(Yiddish|English)$/);
    expect(cite).not.toMatch(/no\. |נומ׳/);
    // no Pagefind excerpt markup anywhere
    expect(await page.locator(".search-results mark").count()).toBe(0);
    expect(await axe(page)).toEqual([]);
    expect(page.errors).toEqual([]);
    await page.context().close();
  });

  it("a query with nothing searchable in it reports no results", async () => {
    const page = await open(`/${ed}/search/`);
    const r = await search(page, "״ ״");
    expect(r.hrefs).toEqual([]);
    expect(r.status).toBe(await page.getAttribute("[data-search]", "data-msg-none"));
    await page.context().close();
  });
});

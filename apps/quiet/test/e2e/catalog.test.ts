/**
 * W3.1 acceptance in a real browser, on today's data:
 * - the title page, contents, section and series pages render with JavaScript switched off;
 * - axe: zero violations (WCAG 2.0–2.2 A/AA + best practices) in both editions;
 * - the title page carries "this week", the contents in brief and `#indexes`;
 * - with script, "this week" shows the visitor's own day from the built window, under the site CSP;
 * - in-page jump links and links between catalog pages resolve.
 *
 * Builds .corpus/ from data/ with buildCorpusWithAggregates into a temporary directory, builds the
 * site against it (EMUNAS_CORPUS_DIR, fixed EMUNAS_BUILD_DATE), serves dist/ with a tiny static
 * server and drives Chrome through playwright-core.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCorpusWithAggregates } from "@emunas/corpus/build/aggregate";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const app = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const repo = resolve(app, "../..");
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

let corpusDir = "";
let outDir = "";
let server: Server;
let origin = "";
let browser: Browser;

// The site CSP from public/_headers, sent with every HTML response; contexts bypass it unless
// they ask for it (axe is injected as an inline script).
const CSP = (/^\s*Content-Security-Policy: (.+)$/m.exec(readFileSync(join(app, "public/_headers"), "utf8"))?.[1] ?? "")
  .replace("{{EMUNAS_MEDIA_ORIGIN}}", "https://media.example.org");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
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
  corpusDir = mkdtempSync(join(tmpdir(), "quiet-catalog-corpus-"));
  buildCorpusWithAggregates({
    dataDir: join(repo, "data"),
    policyDir: join(repo, "site-policy"),
    outDir: corpusDir,
    mediaOrigin: "https://media.example.org",
    dataSha: null,
  });
  outDir = mkdtempSync(join(tmpdir(), "quiet-catalog-dist-"));
  const build = spawnSync(
    process.execPath,
    [join(dirname(require.resolve("astro/package.json")), "bin", "astro.mjs"), "build", "--outDir", outDir],
    {
      cwd: app,
      env: { ...process.env, EMUNAS_CORPUS_DIR: corpusDir, EMUNAS_BUILD_DATE: "2026-11-15", ASTRO_TELEMETRY_DISABLED: "1" },
      encoding: "utf8",
    },
  );
  if (build.status !== 0) throw new Error(`astro build failed:\n${build.stdout}\n${build.stderr}`);

  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let file = normalize(join(outDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(outDir)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return void res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    const type = TYPES[extname(file)] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type, ...(extname(file) === ".html" ? { "content-security-policy": CSP } : {}) });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox"] });
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  for (const d of [outDir, corpusDir]) if (d) rmSync(d, { recursive: true, force: true });
});

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: unknown[] }[];
}

async function axe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const w = window as unknown as {
      axe: { run: (ctx: Document, opts: object) => Promise<{ violations: AxeViolation[] }> };
    };
    const r = await w.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
      resultTypes: ["violations"],
    });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target })) }));
  });
}

interface OpenOpts {
  js?: boolean;
  dark?: boolean;
  width?: number;
  /** Enforce the site CSP (otherwise bypassed). */
  csp?: boolean;
  /** The browser clock and time zone. */
  time?: Date;
  timezoneId?: string;
}

async function open(path: string, opts: OpenOpts = {}): Promise<Page> {
  const context = await browser.newContext({
    javaScriptEnabled: opts.js ?? true,
    viewport: { width: opts.width ?? 1100, height: 900 },
    bypassCSP: !opts.csp,
    ...(opts.timezoneId ? { timezoneId: opts.timezoneId } : {}),
  });
  // Dark is opt-in (the shared theme cookie), not the OS setting.
  if (opts.dark) await context.addCookies([{ name: "emunas_theme", value: "dark", url: origin }]);
  const page = await context.newPage();
  if (opts.time) await page.clock.install({ time: opts.time });
  const res = await page.goto(origin + path, { waitUntil: "load" });
  expect(res?.status(), path).toBe(200);
  return page;
}

const pages = (ed: "yi" | "en") => [
  `/${ed}/`,
  `/${ed}/contents/`,
  `/${ed}/section/zmanim/`,
  `/${ed}/section/parsha-en/`,
  `/${ed}/section/shonos/`,
  `/${ed}/section/unc-simchos/`,
  `/${ed}/series/tanya-yi/`,
  `/${ed}/series/emunah-en/`,
];

describe.each(["yi", "en"] as const)("%s edition", (ed) => {
  it("renders every catalog page with JavaScript off: lang/dir, one h1, a main", async () => {
    for (const path of pages(ed)) {
      const page = await open(path, { js: false });
      expect(await page.getAttribute("html", "lang"), path).toBe(ed);
      expect(await page.getAttribute("html", "dir"), path).toBe(ed === "yi" ? "rtl" : "ltr");
      expect(await page.locator("h1").count(), path).toBe(1);
      expect(await page.locator("main#main").count(), path).toBe(1);
      await page.context().close();
    }
  });

  it("axe finds no violations (light and dark)", async () => {
    for (const path of pages(ed)) {
      for (const dark of [false, true]) {
        const page = await open(path, { dark });
        const v = await axe(page);
        expect(v, `${path}${dark ? " (dark)" : ""}: ${JSON.stringify(v, null, 1)}`).toEqual([]);
        await page.context().close();
      }
    }
  }, 240_000);

  it("title page: this week, the contents in brief, #indexes, the size of the collection", async () => {
    const page = await open(`/${ed}/`, { js: false });
    expect(await page.locator("#indexes h2").count()).toBe(1);
    expect(await page.locator(`.site-nav a[href="/${ed}/#indexes"]`).count()).toBe(1);
    expect(await page.locator('[data-occasion="vayeitzei"] a[href*="/calendar/parsha/vayeitzei/"]').count()).toBeGreaterThan(0);
    expect(await page.locator('[data-occasion="chanukah"] li').count()).toBe(5);
    expect(await page.locator("[data-section]").count()).toBeGreaterThan(10);
    // The total follows the data (build.json), so it is read from the corpus this suite built.
    const { counts } = JSON.parse(readFileSync(join(corpusDir, "build.json"), "utf8")) as { counts: { total: number } };
    expect(await page.locator(".standing").innerText()).toContain(new Intl.NumberFormat("en-US").format(counts.total));
    expect(await page.locator("[data-coverage]").count()).toBe(0);
    expect(await page.locator("#indexes .count").count()).toBe(0);
    await page.context().close();
  });

  it("this week: carries the build day −1…+3, each referenced block once", async () => {
    const page = await open(`/${ed}/`, { js: false });
    const built = await page.locator("[data-this-week]").evaluate((root) => {
      const days = (root.querySelector("template[data-week-days]") as HTMLTemplateElement).content.querySelectorAll<HTMLElement>("[data-day]");
      const blocks = Array.from(root.querySelectorAll<HTMLTemplateElement>("template[data-week-block]"), (t) => t.dataset["weekBlock"]);
      return { date: (root as HTMLElement).dataset["weekDate"], days: Array.from(days, (d) => [d.dataset["day"], d.dataset["blocks"]]), blocks };
    });
    expect(built.date).toBe("2026-11-15");
    expect(built.days.map(([d]) => d)).toEqual(["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18"]);
    const referenced = new Set(built.days.flatMap(([, b]) => (b ?? "").split(" ").filter(Boolean)));
    expect(new Set(built.blocks)).toEqual(referenced);
    expect(built.blocks).toHaveLength(referenced.size);
    await page.context().close();
  });

  it("this week: shows the visitor's own day under the site CSP, else the build day", async () => {
    const shown = async (time: Date, timezoneId = "America/New_York") => {
      const page = await open(`/${ed}/`, { csp: true, time, timezoneId });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      await page.reload({ waitUntil: "load" }); // module scripts have run by load
      const out = {
        date: await page.locator("[data-this-week]").getAttribute("data-week-date"),
        lead: await page.locator("[data-week-lead]").innerText(),
        occasions: await page.locator("[data-week-grid] [data-occasion]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset["occasion"])),
        errors,
      };
      await page.context().close();
      return out;
    };
    const yiDay: Record<number, string> = { 4: "ד'", 5: "ה'", 6: "ו'", 7: "ז'" };
    const kislev = (day: number) => (ed === "en" ? `${day} Kislev 5787` : `${yiDay[day]} כסלו תשפ"ז`);

    // Motzei Shabbos 4 Kislev (the day before the build day): Toldos is still the parsha of the week.
    const sat = await shown(new Date("2026-11-14T22:00:00-05:00"));
    expect(sat).toMatchObject({ date: "2026-11-14", occasions: ["toldos", "chanukah"], errors: [] });
    expect(sat.lead).toContain(kislev(4));

    const tue = await shown(new Date("2026-11-17T09:00:00-05:00"));
    expect(tue).toMatchObject({ date: "2026-11-17", occasions: ["vayeitzei", "chanukah"], errors: [] });
    expect(tue.lead).toContain(kislev(7));

    // Already the 16th in Jerusalem while it is still the 15th in New York.
    const jlm = await shown(new Date("2026-11-15T22:30:00Z"), "Asia/Jerusalem");
    expect(jlm).toMatchObject({ date: "2026-11-16", errors: [] });
    expect(jlm.lead).toContain(kislev(6));

    // Outside the window: the build day stays.
    const later = await shown(new Date("2026-12-01T09:00:00-05:00"));
    expect(later).toMatchObject({ date: "2026-11-15", occasions: ["vayeitzei", "chanukah"], errors: [] });
    expect(later.lead).toContain(kislev(5));
  }, 60_000);

  it("this week: axe finds no violations after the swap", async () => {
    const page = await open(`/${ed}/`, { time: new Date("2026-11-17T09:00:00-05:00"), timezoneId: "America/New_York" });
    expect(await page.locator("[data-this-week]").getAttribute("data-week-date")).toBe("2026-11-17");
    const v = await axe(page);
    expect(v, JSON.stringify(v, null, 1)).toEqual([]);
    await page.context().close();
  });

  it("section page: jump list targets exist, catalog-only rows have an empty notes cell, greyed rows say so", async () => {
    const page = await open(`/${ed}/section/zmanim/`, { js: false });
    const targets = await page.locator(".jump-list a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).hash.slice(1)));
    expect(targets.length).toBeGreaterThan(10);
    for (const id of targets) expect(await page.locator(`[id="${id}"]`).count(), id).toBe(1);
    await page.context().close();
    // the few shiurim without notes yet are in the simchos of the other recordings (today's data)
    const simchos = await open(`/${ed}/section/unc-simchos/`, { js: false });
    const pendingNotes = await simchos
      .locator('tr[data-status="catalog-only"] td.col-notes')
      .evaluateAll((tds) => tds.map((td) => td.textContent?.trim() ?? ""));
    expect(pendingNotes.every((t) => t === "")).toBe(true);
    await simchos.context().close();
    // the three shiurim whose only recording is a .WMA: not playable from the media host unless
    // site-policy/audio-transcoded.json lists an MP3 sibling for it
    const transcoded = (JSON.parse(readFileSync(join(repo, "site-policy/audio-transcoded.json"), "utf8")) as { mp3Siblings: string[] }).mp3Siblings;
    const unc = await open(`/${ed}/section/unc-zmanim/`, { js: false });
    expect(await unc.locator("tr.no-recording .no-recording-note").count()).toBe(3 - new Set(transcoded).size);
    expect(await unc.locator(".unc-mark, .col-num, [data-gap]").count()).toBe(0);
    await unc.context().close();
  });

  it("series page: Tanya by perek, no link pairing it with the other language", async () => {
    const page = await open(`/${ed}/series/tanya-yi/`, { js: false });
    expect(await page.locator("section.group h2").count()).toBeGreaterThan(10);
    expect(await page.locator(`a[data-sibling], a[href="/${ed}/series/tanya-en/"]`).count()).toBe(0);
    const parts = await page.locator("tbody .col-num").allInnerTexts();
    expect(parts.map((p) => Number(p.trim()))).toEqual(parts.map((_, i) => i + 1));
    await page.context().close();
  });

  it("fits a phone screen without sideways scrolling", async () => {
    for (const path of pages(ed)) {
      const page = await open(path, { js: false, width: 360 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
      await page.context().close();
    }
  });
});

describe("built output", () => {
  const files = () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    return walk(outDir).filter((f) => f.endsWith(".html"));
  };

  it("links between catalog pages resolve to built pages", () => {
    const html = files();
    expect(html.length).toBeGreaterThan(60);
    const missing: string[] = [];
    for (const f of html) {
      for (const m of readFileSync(f, "utf8").matchAll(/href="(\/(?:yi|en)\/(?:contents|section|series)\/[^"#?]*)/g)) {
        const target = join(outDir, m[1]!, "index.html");
        if (!existsSync(target)) missing.push(`${f.slice(outDir.length)} → ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("has no inline script or style for the CSP to block (an inline script needs its hash in the CSP)", () => {
    const allowed = new Set(Array.from(CSP.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g), (m) => m[1]!));
    const bad: string[] = [];
    for (const f of files()) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (/\bsrc=/.test(m[1]!)) continue;
        const hash = `sha256-${createHash("sha256").update(m[2]!, "utf8").digest("base64")}`;
        if (!allowed.has(hash)) bad.push(`${f.slice(outDir.length)}: <script${m[1]}> (${hash} not in the CSP)`);
      }
      if (/<style\b/.test(text)) bad.push(`${f.slice(outDir.length)}: <style>`);
      if (/\sstyle="/.test(text)) bad.push(`${f.slice(outDir.length)}: style=""`);
    }
    expect(bad).toEqual([]);
  });

  it("carries no transcript-derived field names or paths", () => {
    for (const f of files()) {
      const text = readFileSync(f, "utf8");
      for (const bad of ["heardAs", "asrNotes", "transcriptKey", "audioKey", "transcripts/", ["input", "txt"].join("."), "/audio/"]) {
        expect(text.includes(bad), `${f.slice(outDir.length)} contains ${bad}`).toBe(false);
      }
    }
  });
});

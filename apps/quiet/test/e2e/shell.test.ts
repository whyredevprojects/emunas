/**
 * W2.3 acceptance, in a real browser:
 * - the sample page renders in both editions (lang/dir, layout) and is screenshotted;
 * - axe: zero violations (WCAG 2.0–2.2 A/AA + best practices), light and dark;
 * - print media hides nav, edition switch, breadcrumb and player, keeps times as text;
 * - the edition switch keeps the path, and with script the hash and query.
 *
 * Builds the site with EMUNAS_SHELL_SAMPLE=1 into a temporary directory, serves it with a tiny
 * static server, drives Chrome through playwright-core.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const app = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const shotDir = process.env["QUIET_SCREENSHOT_DIR"] ?? join(tmpdir(), "quiet-shell-screenshots");

let outDir = "";
let server: Server;
let origin = "";
let browser: Browser;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function chromePath(): string {
  const candidates = [process.env["CHROME_PATH"], safe(() => chromium.executablePath()), "/usr/bin/google-chrome"];
  const found = candidates.find((p): p is string => typeof p === "string" && p !== "" && existsSync(p));
  if (!found) throw new Error("No Chrome found: set CHROME_PATH or install Playwright's Chromium");
  return found;
}
function safe<T>(f: () => T): T | undefined {
  try {
    return f();
  } catch {
    return undefined;
  }
}

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "quiet-shell-dist-"));
  const build = spawnSync(process.execPath, [join(dirname(require.resolve("astro/package.json")), "bin", "astro.mjs"), "build", "--outDir", outDir], {
    cwd: app,
    env: { ...process.env, EMUNAS_SHELL_SAMPLE: "1", ASTRO_TELEMETRY_DISABLED: "1" },
    encoding: "utf8",
  });
  if (build.status !== 0) throw new Error(`astro build failed:\n${build.stdout}\n${build.stderr}`);

  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let file = normalize(join(outDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(outDir)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return void res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox"] });
  mkdirSync(shotDir, { recursive: true });
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: unknown[]; failureSummary?: string }[];
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
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({ target: n.target, ...(n.failureSummary ? { failureSummary: n.failureSummary } : {}) })),
    }));
  });
}

async function open(path: string, opts: { js?: boolean; dark?: boolean; width?: number } = {}): Promise<Page> {
  const context = await browser.newContext({
    javaScriptEnabled: opts.js ?? true,
    colorScheme: opts.dark ? "dark" : "light",
    viewport: { width: opts.width ?? 1100, height: 900 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("requestfailed", (r) => {
    // the sample's media host does not exist; preload="none" means nothing should request it
    errors.push(`request failed: ${r.url()}`);
  });
  await page.goto(origin + path, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  (page as Page & { errors?: string[] }).errors = errors;
  return page;
}
const errorsOf = (page: Page) => (page as Page & { errors?: string[] }).errors ?? [];

describe.each(["yi", "en"] as const)("sample page, %s edition", (ed) => {
  const path = `/${ed}/shell-sample/`;

  it("renders with the edition's lang and dir, nav, switch and both voices", async () => {
    const page = await open(path);
    expect(await page.getAttribute("html", "lang")).toBe(ed);
    expect(await page.getAttribute("html", "dir")).toBe(ed === "yi" ? "rtl" : "ltr");
    expect(await page.locator(".site-nav a").count()).toBe(5);
    expect(await page.locator("h1").count()).toBe(1);
    expect(await page.locator("audio[preload=none]").count()).toBe(2);
    expect(await page.locator(".voice-catalog").count()).toBeGreaterThan(0);
    expect(await page.locator(".voice-notes .notes-label").count()).toBe(1);
    expect(await page.locator("blockquote, q").count()).toBe(0);

    // Yiddish: the nav starts at the right edge; English: at the left.
    const nav = await page.locator(".site-nav li").first().boundingBox();
    const last = await page.locator(".site-nav li").last().boundingBox();
    expect(nav && last).toBeTruthy();
    if (ed === "yi") expect(nav!.x).toBeGreaterThan(last!.x);
    else expect(nav!.x).toBeLessThan(last!.x);

    // Header, breadcrumb, main and footer share one column.
    const boxes = await page.$$eval(".site-header, .breadcrumb, main, .site-footer", (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.right)];
      }),
    );
    expect(new Set(boxes.map((b) => b.join(","))).size, JSON.stringify(boxes)).toBe(1);

    // The body face is the self-hosted one.
    const family = await page.evaluate(() => getComputedStyle(document.querySelector("main p")!).fontFamily);
    expect(family).toContain(ed === "yi" ? "Frank Ruhl Libre" : "Source Serif 4");

    await page.screenshot({ path: join(shotDir, `shell-sample-${ed}.png`), fullPage: true });
    await page.context().close();
    const narrow = await open(path, { width: 375 });
    const overflow = await narrow.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await narrow.screenshot({ path: join(shotDir, `shell-sample-${ed}-mobile.png`), fullPage: true });
    expect(errorsOf(narrow)).toEqual([]);
    await narrow.context().close();
  });

  it("has zero axe violations (light and dark)", async () => {
    for (const dark of [false, true]) {
      const page = await open(path, { dark });
      const violations = await axe(page);
      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
      if (dark) await page.screenshot({ path: join(shotDir, `shell-sample-${ed}-dark.png`), fullPage: true });
      expect(errorsOf(page)).toEqual([]);
      await page.context().close();
    }
  });

  it("print media hides nav, edition switch, breadcrumb and player; times stay as text", async () => {
    const page = await open(path);
    await page.emulateMedia({ media: "print" });
    const display = (sel: string) =>
      page.$$eval(sel, (els) => els.map((e) => getComputedStyle(e).display));
    for (const sel of [".site-nav", ".edition-switch", ".breadcrumb", ".listen", "audio", ".skip-link", ".footer-links"]) {
      const values = await display(sel);
      expect(values.length, sel).toBeGreaterThan(0);
      expect(new Set(values), sel).toEqual(new Set(["none"]));
    }
    expect(await display("main")).toEqual(["block"]);
    expect(await display(".print-source")).toEqual(["block"]);
    const [timeColor, bodyColor, bg] = await page.evaluate(() => [
      getComputedStyle(document.querySelector("a.time")!).color,
      getComputedStyle(document.body).color,
      getComputedStyle(document.documentElement).backgroundColor,
    ]);
    expect(timeColor).toBe(bodyColor);
    expect(bg).toBe("rgb(255, 255, 255)");
    await page.screenshot({ path: join(shotDir, `shell-sample-${ed}-print.png`), fullPage: true });
    const pdf = await page.pdf({ format: "A4" });
    expect(pdf.byteLength).toBeGreaterThan(1000);
    await page.context().close();
  });
});

describe("edition switch", () => {
  it("keeps the path without script", async () => {
    const page = await open("/en/shell-sample/#s2", { js: false });
    const hrefs = await page.$$eval("a[data-edition-switch]", (as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toEqual(["/yi/shell-sample/", "/yi/shell-sample/"]);
    // the no-JS time link opens the media file at the recording-local time, fractional seconds kept
    expect(await page.locator("#s2 a.time").getAttribute("href")).toBe(
      "https://media.example.org/Sample%20Folder/Part%202.mp3#t=269.5",
    );
    await page.context().close();
  });

  it("keeps path and hash with script, also after the hash changes", async () => {
    const page = await open("/en/shell-sample/#s2");
    expect(await page.locator(".edition-switch a").getAttribute("href")).toBe("/yi/shell-sample/#s2");

    await page.evaluate(() => (location.hash = "#t=754"));
    await page.waitForFunction(() => document.querySelector(".edition-switch a")?.getAttribute("href")?.endsWith("#t=754"));

    // a hash set by replaceState (no hashchange event) is picked up on activation
    await page.evaluate(() => history.replaceState(null, "", "#s1"));
    await page.locator(".edition-switch a").click();
    await page.waitForURL(`${origin}/yi/shell-sample/#s1`);
    expect(await page.getAttribute("html", "lang")).toBe("yi");
    expect(await page.locator("#s1").count()).toBe(1);

    // and back again from the footer link
    await page.evaluate(() => (location.hash = "#s0"));
    await page.locator(".footer-links a[data-edition-switch]").click();
    await page.waitForURL(`${origin}/en/shell-sample/#s0`);
    expect(errorsOf(page)).toEqual([]);
    await page.context().close();
  });
});

describe("axe harness", () => {
  it("does report violations (guard against a silent checker)", async () => {
    const page = await open("/en/shell-sample/");
    await page.evaluate(() => {
      const img = document.createElement("img");
      img.src = "/favicon.svg";
      document.querySelector("main")!.append(img);
    });
    expect((await axe(page)).map((v) => v.id)).toContain("image-alt");
    await page.context().close();
  });
});

describe("root edition chooser", () => {
  it("offers both editions, Yiddish on the right, with zero axe violations", async () => {
    const page = await open("/");
    const yi = await page.locator("#chooser-yi").boundingBox();
    const en = await page.locator("#chooser-en").boundingBox();
    expect(yi!.x).toBeGreaterThan(en!.x);
    expect(await page.locator('a[href="/yi/"]').count()).toBeGreaterThan(0);
    expect(await page.locator('a[href="/en/"]').count()).toBeGreaterThan(0);
    expect(await axe(page)).toEqual([]);
    await page.screenshot({ path: join(shotDir, "root-chooser.png"), fullPage: true });
    await page.context().close();
  });
});

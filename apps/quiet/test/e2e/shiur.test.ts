/**
 * W3.2 acceptance in a real browser (headless Chrome via playwright-core):
 * - the 7 sample shiurim build and render in every edition, axe-clean (light and dark), at phone
 *   and desktop width without sideways scrolling;
 * - with JS off, every recording is a native `<audio>` and nothing docks;
 * - with JS on: playing docks the player (sticky) with Media Session metadata, `#t=<global>` on
 *   load seeks without playing (the deep links from topic, story and index pages), a `#t=` in
 *   part 2 switches tracks, the end of part 1 continues into part 2, keyboard works only on the
 *   focused dock;
 * - improved audio: the version line's button switches every part between the improved copy and
 *   the original keeping position, play state and speed, announces it, remembers it across pages,
 *   and a failing improved file falls back once to the original; downloads follow the version that plays;
 * - player script ≤ 6 KB brotli; every shiur page ≤ 120 KB raw / ≤ 30 KB brotli; no transcript
 *   UI in any built file; print hides the player and the links, keeps the notes.
 *
 * Builds a corpus from the mini fixture (media origin = a local media server with Range support
 * serving silent mp3s of each recording's length, made with ffmpeg), builds the site into a
 * temporary directory and serves it from a second origin.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PublicShiur } from "@emunas/corpus/public";
import { EDS, dirOf } from "../../src/lib/edition.ts";

const app = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const repo = join(app, "..", "..");
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const shotDir = process.env["QUIET_SCREENSHOT_DIR"] ?? join(tmpdir(), "quiet-shiur-screenshots");

const SAMPLES = [
  "yi-parshas-hashavua-brshys-01",
  "en-parsha-en-nch-01",
  "yi-zmanim-tv-bb-04",
  "yi-tanya-1-01",
  "yi-zmanim-lvl-01",
  "yi-zmanim-msybs-lchyym-bkmp-01-c",
  "en-miscellaneous-en-01",
] as const;
const MULTI = "yi-zmanim-tv-bb-04";

let work = "";
let outDir = "";
let corpusDir = "";
let site: Server;
let media: Server;
let origin = "";
let mediaOrigin = "";
let browser: Browser;
/** media path → generated mp3 file */
const audioFiles = new Map<string, string>();
/** media paths that answer 404 (a removed improved copy, for the fallback test) */
const missing = new Set<string>();

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
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

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const a = server.address();
  return typeof a === "object" && a ? a.port : 0;
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const r = spawnSync(cmd, args, { cwd: app, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`${cmd} could not be started (${r.error.message}); is it installed and on PATH?`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
}

const norm = (x: string | null) => (x ?? "").replace(/[\s\u200e\u200f]+/gu, " ").trim();
const shiurJson = (id: string) => JSON.parse(readFileSync(join(corpusDir, "shiurim", `${id}.json`), "utf8")) as PublicShiur;

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "quiet-shiur-e2e-"));
  outDir = join(work, "dist");
  corpusDir = join(work, "corpus");

  // Media host: Range-capable static server for the generated mp3s (cross-origin to the site).
  media = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const file = missing.has(path) ? undefined : audioFiles.get(path);
    if (!file) return void res.writeHead(404).end();
    const size = statSync(file).size;
    const headers = { "content-type": "audio/mpeg", "accept-ranges": "bytes", "access-control-allow-origin": "*" };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range) {
      const start = range[1] === "" ? size - Number(range[2]) : Number(range[1]);
      const end = range[1] !== "" && range[2] !== "" ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
      return void res.end(req.method === "HEAD" ? undefined : readFileSync(file).subarray(start, end + 1));
    }
    res.writeHead(200, { ...headers, "content-length": size });
    res.end(req.method === "HEAD" ? undefined : readFileSync(file));
  });
  mediaOrigin = `http://localhost:${await listen(media)}`;

  const mini = join(repo, "packages", "corpus", "test", "fixtures", "mini");
  run(process.execPath, [
    "--import",
    require.resolve("tsx"),
    join(repo, "packages", "corpus", "src", "cli.ts"),
    "--data-dir",
    join(mini, "data"),
    "--policy-dir",
    join(mini, "site-policy"),
    "--out",
    corpusDir,
    "--media-origin",
    mediaOrigin,
  ]);

  // Silent mp3s of each sample recording's real length (8 kHz mono, 8 kbps: small and fast).
  mkdirSync(join(work, "media"));
  for (const id of ["yi-zmanim-tv-bb-04", "en-parsha-en-nch-01"]) {
    for (const rec of shiurJson(id).recordings) {
      if (!rec.audioUrl) continue;
      const file = join(work, "media", `${rec.id}.mp3`);
      run("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono", "-t", String(rec.duration), "-c:a", "libmp3lame", "-b:a", "8k", file]);
      audioFiles.set(decodeURIComponent(new URL(rec.audioUrl).pathname), file);
      if (rec.cleanedUrl) audioFiles.set(decodeURIComponent(new URL(rec.cleanedUrl).pathname), file);
    }
  }

  // The site, served from its own origin.
  site = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let file = normalize(join(outDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(outDir)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return void res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  origin = `http://127.0.0.1:${await listen(site)}`;

  run(process.execPath, [join(dirname(require.resolve("astro/package.json")), "bin", "astro.mjs"), "build", "--outDir", outDir], {
    ...process.env,
    ASTRO_TELEMETRY_DISABLED: "1",
    EMUNAS_CORPUS_DIR: corpusDir,
    EMUNAS_HOME_ORIGIN: "http://localhost:4322",
    EMUNAS_QUIET_ORIGIN: origin,
    EMUNAS_LIVE_ORIGIN: "http://localhost:5173",
    EMUNAS_FEEDBACK_EMAIL: "errors@example.org",
  });

  browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
  mkdirSync(shotDir, { recursive: true });
}, 600_000);

afterAll(async () => {
  await browser?.close();
  for (const s of [site, media]) await new Promise<void>((resolve) => (s ? s.close(() => resolve()) : resolve()));
  if (work) rmSync(work, { recursive: true, force: true });
});

interface AxeViolation {
  id: string;
  help: string;
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
    return r.violations.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target })) }));
  });
}

const errors = new WeakMap<Page, string[]>();
async function open(path: string, opts: { js?: boolean; dark?: boolean; width?: number } = {}): Promise<Page> {
  const context = await browser.newContext({
    javaScriptEnabled: opts.js ?? true,
    viewport: { width: opts.width ?? 1100, height: 900 },
  });
  // Dark is opt-in (the shared theme cookie), not the OS setting.
  if (opts.dark) await context.addCookies([{ name: "emunas_theme", value: "dark", url: origin }]);
  const page = await context.newPage();
  const list: string[] = [];
  errors.set(page, list);
  page.on("pageerror", (e) => list.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") list.push(m.text());
  });
  await page.goto(origin + path, { waitUntil: "load" });
  return page;
}

/** State of the player's audio elements. */
const audioState = (page: Page) =>
  page.$$eval("audio.listen-audio", (els) =>
    (els as HTMLAudioElement[]).map((a) => ({ paused: a.paused, t: a.currentTime, current: a.closest(".track")?.hasAttribute("data-current") ?? false })),
  );

/** Starts the first recording (as its own play button would) and waits until it is really playing. */
async function playingFirst(page: Page): Promise<void> {
  await page.evaluate(() => void document.querySelector<HTMLAudioElement>("audio.listen-audio")!.play());
  await page.waitForFunction(() => {
    const a = document.querySelector<HTMLAudioElement>("audio.listen-audio")!;
    return !a.paused && a.readyState >= 1 && a.currentTime > 0;
  });
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("build output", () => {
  it("has a page per shiur and edition, within the size budget, with no transcript UI", () => {
    const index = JSON.parse(readFileSync(join(corpusDir, "index.json"), "utf8")) as { shiurim: { id: string }[] };
    for (const ed of EDS) {
      for (const { id } of index.shiurim) {
        const file = join(outDir, ed, "shiur", id, "index.html");
        expect(existsSync(file), file).toBe(true);
        const html = readFileSync(file);
        expect(html.length, file).toBeLessThanOrEqual(120 * 1024);
        expect(brotliCompressSync(html).length, file).toBeLessThanOrEqual(30 * 1024);
      }
    }
    for (const f of walk(outDir).filter((x) => /\.(html|js|css)$/.test(x))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/transcri|heardAs|asrNotes|audioKey|input\.txt/i);
    }
  });

  it("keeps the player script within 6 KB brotli", () => {
    const html = readFileSync(join(outDir, "en", "shiur", MULTI, "index.html"), "utf8");
    const scripts = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]!);
    const player = scripts.find((s) => s.includes("ShiurPage"));
    expect(player, scripts.join(", ")).toBeTruthy();
    const size = brotliCompressSync(readFileSync(join(outDir, player!))).length;
    expect(size).toBeLessThanOrEqual(6 * 1024);
  });
});

describe.each(EDS)("the 7 sample shiurim, %s edition", (ed) => {
  it.each(SAMPLES)("%s renders and is axe-clean", async (id) => {
    for (const dark of [false, true]) {
      const page = await open(`/${ed}/shiur/${id}/`, { dark });
      expect(await page.getAttribute("html", "dir")).toBe(dirOf(ed));
      expect(await page.locator("h1").count()).toBe(1);
      const violations = await axe(page);
      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
      if (id === MULTI || id === "yi-tanya-1-01") {
        await page.screenshot({ path: join(shotDir, `shiur-${id}-${ed}${dark ? "-dark" : ""}.png`), fullPage: true });
      }
      // the last crumb is the title, cut short on screen only
      const crumb = page.locator('.breadcrumb [aria-current="page"] bdi');
      expect(norm(await crumb.textContent())).toBe(norm(shiurJson(id).catalog.titleOriginal));
      expect(errors.get(page)).toEqual([]);
      await page.context().close();
    }
  });
});

describe("layout", () => {
  it.each([360, 1100])("has no sideways scroll at %ipx, in every edition", async (width) => {
    for (const ed of EDS) {
      const page = await open(`/${ed}/shiur/${MULTI}/`, { width });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: join(shotDir, `shiur-${MULTI}-${ed}-${width}.png`), fullPage: true });
      await page.context().close();
    }
  });
});

describe("without script", () => {
  it("plays each recording in its own native control and docks nothing", async () => {
    const page = await open(`/en/shiur/${MULTI}/`, { js: false });
    const shiur = shiurJson(MULTI);
    const [p1, p2] = shiur.recordings;
    // each part plays the AI-improved copy; the version line is a plain link to the original file
    const srcs = await page.$$eval("audio[preload=none]", (els) => els.map((a) => a.getAttribute("src")));
    expect(srcs).toEqual([p1!.cleanedUrl, p2!.cleanedUrl]);
    expect(await page.locator("a.listen-version-switch").getAttribute("href")).toBe(p1!.audioUrl);
    expect(await page.locator("a.download").evaluateAll((els) => els.map((e) => e.getAttribute("href")))).toEqual([p1!.cleanedUrl, p2!.cleanedUrl]);
    expect(await page.locator(".listen[data-docked]").count()).toBe(0);
    await page.context().close();
  });
});

describe("player", () => {
  it("docks the player once it plays, and sets the Media Session metadata", async () => {
    const page = await open(`/en/shiur/${MULTI}/`);
    const shiur = shiurJson(MULTI);
    expect(await page.locator(".listen[data-docked]").count()).toBe(0);
    await playingFirst(page);
    expect(await page.locator(".listen[data-docked]").count()).toBe(1);
    expect(await page.$eval(".listen", (el) => getComputedStyle(el).position)).toBe("sticky");

    // the dock stays in view while reading further down
    await page.locator(".prev-next").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shotDir, "shiur-docked.png") });

    const meta = await page.evaluate(() => navigator.mediaSession.metadata?.title ?? null);
    expect(meta).toBe(`${shiur.catalog.titleOriginal} (1/2)`);
    expect(errors.get(page)).toEqual([]);
    await page.context().close();
  });

  it("seeks a `#t=` in part 2 on hashchange (a deep link followed on the page) and switches tracks", async () => {
    const page = await open(`/yi/shiur/${MULTI}/`);
    const shiur = shiurJson(MULTI);
    const p2 = shiur.recordings[1]!;
    const g = Math.round(p2.offset + 60);
    await playingFirst(page);
    await page.evaluate((h) => (window.location.hash = h), `#t=${g}`);
    await page.waitForFunction(() => {
      const [a, b] = Array.from(document.querySelectorAll<HTMLAudioElement>("audio.listen-audio"));
      return a!.paused && b !== undefined && b.readyState >= 1 && b.currentTime > 0;
    });
    const [one, two] = await audioState(page);
    expect(one!.current).toBe(false);
    expect(two!.current).toBe(true);
    expect(Math.abs(two!.t - (g - p2.offset))).toBeLessThan(1);
    // the docked player shows only the current track
    expect(await page.locator(".track:not([data-current]) audio").isVisible()).toBe(false);
    expect(errors.get(page)).toEqual([]);
    await page.context().close();
  });

  it("seeks to #t= on load without playing", async () => {
    const shiur = shiurJson(MULTI);
    const p2 = shiur.recordings[1]!;
    const g = Math.round(p2.offset + 100);
    const page = await open(`/en/shiur/${MULTI}/#t=${g}`);
    await page.waitForFunction(() => {
      const b = document.querySelectorAll<HTMLAudioElement>("audio.listen-audio")[1];
      return b !== undefined && b.readyState >= 1 && b.currentTime > 0;
    });
    const [one, two] = await audioState(page);
    expect(one!.paused && two!.paused).toBe(true);
    expect(two!.current).toBe(true);
    expect(Math.abs(two!.t - (g - p2.offset))).toBeLessThan(1);
    await page.context().close();
  });

  it("continues into the next recording when one ends", async () => {
    const page = await open(`/en/shiur/${MULTI}/`);
    await playingFirst(page);
    await page.evaluate(() => {
      const a = document.querySelector<HTMLAudioElement>("audio.listen-audio")!;
      a.currentTime = a.duration - 0.6;
    });
    await page.waitForFunction(
      () => {
        const [a, b] = Array.from(document.querySelectorAll<HTMLAudioElement>("audio.listen-audio"));
        return a!.ended && b !== undefined && !b.paused;
      },
      undefined,
      { timeout: 15_000 },
    );
    const [, two] = await audioState(page);
    expect(two!.current).toBe(true);
    expect(two!.t).toBeLessThan(10);
    await page.context().close();
  });

  it("answers the keyboard only while the dock has focus", async () => {
    const page = await open(`/en/shiur/en-parsha-en-nch-01/`);
    await playingFirst(page);
    // focus elsewhere: Space/K do nothing to the player
    await page.locator("h1").click();
    await page.keyboard.press("k");
    expect((await audioState(page))[0]!.paused).toBe(false);
    // focused dock: K pauses, → moves 10 s, Space plays again
    await page.locator(".listen").focus();
    await page.keyboard.press("k");
    await page.waitForFunction(() => document.querySelector<HTMLAudioElement>("audio.listen-audio")!.paused);
    const before = (await audioState(page))[0]!.t;
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction((b) => document.querySelector<HTMLAudioElement>("audio.listen-audio")!.currentTime >= b + 9.5, before);
    await page.keyboard.press(" ");
    await page.waitForFunction(() => !document.querySelector<HTMLAudioElement>("audio.listen-audio")!.paused);
    expect(errors.get(page)).toEqual([]);
    await page.context().close();
  });

  it("print hides the player and the links, keeps the notes", async () => {
    const page = await open(`/en/shiur/${MULTI}/`);
    await page.emulateMedia({ media: "print" });
    for (const sel of [".listen", ".open-live", ".report-error"]) {
      expect(await page.$eval(sel, (el) => getComputedStyle(el).display), sel).toBe("none");
    }
    expect(await page.$eval("#about", (el) => getComputedStyle(el).display)).toBe("block");
    await page.context().close();
  });
});

describe("improved audio", () => {
  const srcs = (page: Page) => page.$$eval("audio.listen-audio", (els) => els.map((a) => a.getAttribute("src")));

  it("switches every part to the original and back, keeping position, play state and speed", async () => {
    const page = await open(`/en/shiur/${MULTI}/`);
    const shiur = shiurJson(MULTI);
    const [p1, p2] = shiur.recordings;
    expect(await srcs(page)).toEqual([p1!.cleanedUrl, p2!.cleanedUrl]);
    const button = page.locator("button.listen-version-switch");
    expect(await button.textContent()).toBe("Switch to the original");
    expect(await page.locator("a.listen-version-switch").count()).toBe(0);
    expect(await page.locator(".listen-version > span").first().textContent()).toBe("Sound improved by AI");
    const reportBody = async () => new URL((await page.locator(".report-error a").getAttribute("href"))!).searchParams.get("body") ?? "";
    expect(await reportBody()).toMatch(/\n\nNow playing the version improved by AI\.$/);

    await playingFirst(page);
    await page.evaluate(() => {
      const a = document.querySelector<HTMLAudioElement>("audio.listen-audio")!;
      a.playbackRate = 1.5;
      a.currentTime = 120;
    });
    await page.waitForFunction(() => document.querySelector<HTMLAudioElement>("audio.listen-audio")!.currentTime >= 120);

    // docked, the line stays visible; the button keeps focus and its place
    expect(await page.locator(".listen[data-docked] .listen-version").isVisible()).toBe(true);
    await button.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => {
      const a = document.querySelector<HTMLAudioElement>("audio.listen-audio")!;
      return !a.paused && a.readyState >= 1 && a.currentTime >= 119;
    });
    expect(await srcs(page)).toEqual([p1!.audioUrl, p2!.audioUrl]);
    const [one] = await audioState(page);
    expect(one!.t).toBeLessThan(126);
    expect(await page.$eval("audio.listen-audio", (a) => (a as HTMLAudioElement).playbackRate)).toBe(1.5);
    expect(await button.textContent()).toBe("Listen to it");
    expect(await page.locator(".listen-version > span").first().textContent()).toBe("A version with the sound improved by AI is also available");
    expect(await page.evaluate(() => document.activeElement?.className)).toBe("listen-version-switch");
    await page.waitForFunction(() => document.querySelector(".listen-version [role=status]")?.textContent === "Now playing the original recording.");
    expect(await reportBody()).toMatch(/\n\nNow playing the original recording\.$/);
    expect(await page.evaluate(() => localStorage.getItem("emunas.audioVersion"))).toBe("original");
    // downloads follow the switch
    expect(await page.locator("a.download").evaluateAll((els) => els.map((e) => e.getAttribute("href")))).toEqual([p1!.audioUrl, p2!.audioUrl]);
    await page.screenshot({ path: join(shotDir, "shiur-version-original.png") });

    // paused stays paused across a switch back
    await page.evaluate(() => document.querySelector<HTMLAudioElement>("audio.listen-audio")!.pause());
    await button.click();
    await page.waitForFunction(() => document.querySelector<HTMLAudioElement>("audio.listen-audio")!.readyState >= 1);
    expect(await srcs(page)).toEqual([p1!.cleanedUrl, p2!.cleanedUrl]);
    expect(await page.locator("a.download").evaluateAll((els) => els.map((e) => e.getAttribute("href")))).toEqual([p1!.cleanedUrl, p2!.cleanedUrl]);
    const [back] = await audioState(page);
    expect(back!.paused).toBe(true);
    expect(back!.t).toBeGreaterThanOrEqual(119);
    await page.waitForFunction(() => document.querySelector(".listen-version [role=status]")?.textContent === "Now playing the version improved by AI.");
    expect(await page.evaluate(() => localStorage.getItem("emunas.audioVersion"))).toBe("cleaned");
    const violations = await axe(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    expect(errors.get(page)).toEqual([]);
    await page.context().close();
  });

  it("remembers the choice on the next page, in the Yiddish wording", async () => {
    const page = await open(`/yi/shiur/${MULTI}/`);
    await page.locator("button.listen-version-switch").click();
    await page.goto(`${origin}/yi/shiur/en-parsha-en-nch-01/`, { waitUntil: "load" });
    const rec = shiurJson("en-parsha-en-nch-01").recordings[0]!;
    await page.waitForFunction(() => document.querySelector("button.listen-version-switch") !== null);
    expect(await srcs(page)).toEqual([rec.audioUrl]);
    expect(await page.locator("a.download").getAttribute("href")).toBe(rec.audioUrl);
    expect(await page.locator("button.listen-version-switch").textContent()).toBe("הערט זי");
    // the swap on load fetches nothing (preload=none)
    expect(await page.$eval("audio.listen-audio", (a) => (a as HTMLAudioElement).readyState)).toBe(0);
    await page.context().close();
  });

  it("falls back once to the original when the improved file fails, without changing the choice", async () => {
    const rec = shiurJson("en-parsha-en-nch-01").recordings[0]!;
    const path = decodeURIComponent(new URL(rec.cleanedUrl!).pathname);
    missing.add(path);
    try {
      const page = await open(`/en/shiur/en-parsha-en-nch-01/`);
      await page.evaluate(() => void document.querySelector<HTMLAudioElement>("audio.listen-audio")!.play());
      await page.waitForFunction(() => {
        const a = document.querySelector<HTMLAudioElement>("audio.listen-audio")!;
        return !a.paused && a.readyState >= 1;
      });
      expect(await srcs(page)).toEqual([rec.audioUrl]);
      expect(await page.locator("a.download").getAttribute("href")).toBe(rec.audioUrl);
      expect(await page.locator("button.listen-version-switch").textContent()).toBe("Listen to it");
      expect(await page.evaluate(() => localStorage.getItem("emunas.audioVersion"))).toBeNull();
      await page.context().close();
    } finally {
      missing.delete(path);
    }
  });
});

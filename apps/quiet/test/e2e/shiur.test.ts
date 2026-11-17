/**
 * W3.2 acceptance in a real browser (headless Chrome via playwright-core):
 * - the 7 sample shiurim build and render in both editions, axe-clean (light and dark);
 * - with JS off, time links are `audioUrl#t=<local>` links on the media host;
 * - with JS on: a time link seeks the docked player (sticky), the margin mark follows, the address
 *   gets `#t=<global>`, a time in part 2 switches tracks, `#t=` on load seeks without playing,
 *   the end of part 1 continues into part 2, keyboard works only on the focused dock, Media
 *   Session metadata is set;
 * - player script ≤ 6 KB brotli; every shiur page ≤ 120 KB raw / ≤ 30 KB brotli; no transcript
 *   UI in any built file; print hides the player and the jump list.
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
import { round3, type PublicShiur } from "@emunas/corpus/public";

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

const shiurJson = (id: string) => JSON.parse(readFileSync(join(corpusDir, "shiurim", `${id}.json`), "utf8")) as PublicShiur;

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "quiet-shiur-e2e-"));
  outDir = join(work, "dist");
  corpusDir = join(work, "corpus");

  // Media host: Range-capable static server for the generated mp3s (cross-origin to the site).
  media = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const file = audioFiles.get(path);
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

/**
 * Waits until the first recording is really playing. `paused` turns false as soon as play() is
 * called, which can be before the metadata arrives; the player then applies the time link's seek on
 * `loadedmetadata`, and a position set by the test in between would be undone. Once `currentTime`
 * has moved, that seek has run.
 */
async function playingFirst(page: Page): Promise<void> {
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
    for (const ed of ["yi", "en"]) {
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

describe.each(["yi", "en"] as const)("the 7 sample shiurim, %s edition", (ed) => {
  it.each(SAMPLES)("%s renders and is axe-clean", async (id) => {
    for (const dark of [false, true]) {
      const page = await open(`/${ed}/shiur/${id}/`, { dark });
      expect(await page.getAttribute("html", "dir")).toBe(ed === "yi" ? "rtl" : "ltr");
      expect(await page.locator("h1").count()).toBe(1);
      const violations = await axe(page);
      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
      if (id === MULTI || id === "yi-tanya-1-01") {
        await page.screenshot({ path: join(shotDir, `shiur-${id}-${ed}${dark ? "-dark" : ""}.png`), fullPage: true });
      }
      expect(errors.get(page)).toEqual([]);
      await page.context().close();
    }
  });
});

describe("without script", () => {
  it("time links open the recording at the exact local time (fractional seconds) on the media host", async () => {
    const page = await open(`/en/shiur/${MULTI}/`, { js: false });
    const shiur = shiurJson(MULTI);
    const [p1, p2] = shiur.recordings;
    expect(await page.locator("#s0 a.time").getAttribute("href")).toBe(`${p1!.audioUrl}#t=0`);
    const late = shiur.notes!.chapters.find((c) => c.t >= p2!.offset)!;
    expect(await page.locator(`#s${late.idx} a.time`).getAttribute("href")).toBe(`${p2!.audioUrl}#t=${round3(late.t - p2!.offset)}`);
    expect(await page.locator("audio[preload=none]").count()).toBe(2);
    expect(await page.locator(".listen[data-docked]").count()).toBe(0);
    await page.context().close();
  });
});

describe("player", () => {
  it("seeks the docked player from a time link, marks the item and records #t=", async () => {
    const page = await open(`/en/shiur/${MULTI}/`);
    const shiur = shiurJson(MULTI);
    const chapter = shiur.notes!.chapters[2]!;
    await page.locator(`#s${chapter.idx} a.time`).click();
    await page.waitForFunction(() => {
      const a = document.querySelector<HTMLAudioElement>("audio.listen-audio");
      return a !== null && !a.paused && a.currentTime > 0;
    });
    const [first] = await audioState(page);
    // the seek keeps the fractional second: playback starts at the item, not the whole second before it
    expect(first!.t).toBeGreaterThanOrEqual(chapter.t - 0.05);
    expect(first!.t).toBeLessThan(chapter.t + 5);
    expect(new URL(page.url()).hash).toBe(`#t=${round3(chapter.t)}`);
    expect(await page.locator(".listen[data-docked]").count()).toBe(1);
    expect(await page.$eval(".listen", (el) => getComputedStyle(el).position)).toBe("sticky");
    expect(await page.locator(`#s${chapter.idx} a.time[aria-current="time"]`).count()).toBe(1);
    expect(await page.locator('.outline-list a.time[aria-current="time"]').count()).toBe(1);
    // the write-up paragraph being heard carries the margin mark too
    expect(await page.locator('.writeup-text a.time[aria-current="time"]').count()).toBe(1);

    // the dock stays in view while reading further down
    await page.locator("#sources").scrollIntoViewIfNeeded();
    const box = await page.locator(".listen").boundingBox();
    expect(box!.y).toBeLessThanOrEqual(1);
    await page.screenshot({ path: join(shotDir, "shiur-docked.png") });

    // Media Session metadata
    const meta = await page.evaluate(() => navigator.mediaSession.metadata?.title ?? null);
    expect(meta).toBe(`${shiur.catalog.titleOriginal} (1/2)`);
    expect(errors.get(page)).toEqual([]);
    await page.context().close();
  });

  it("switches tracks for a time in part 2 and keeps one playing", async () => {
    const page = await open(`/yi/shiur/${MULTI}/`);
    const shiur = shiurJson(MULTI);
    const p2 = shiur.recordings[1]!;
    const late = shiur.notes!.chapters.find((c) => c.t >= p2.offset)!;
    await page.locator("#s0 a.time").click();
    await page.waitForFunction(() => !document.querySelector<HTMLAudioElement>("audio.listen-audio")!.paused);
    await page.locator(`#s${late.idx} a.time`).click();
    await page.waitForFunction(() => {
      const [a, b] = Array.from(document.querySelectorAll<HTMLAudioElement>("audio.listen-audio"));
      return a!.paused && b !== undefined && !b.paused && b.currentTime > 0;
    });
    const [one, two] = await audioState(page);
    expect(one!.current).toBe(false);
    expect(two!.current).toBe(true);
    expect(two!.t).toBeGreaterThanOrEqual(Math.floor(late.t - p2.offset) - 0.5);
    expect(await page.locator(`#s${late.idx} a.time[aria-current="time"]`).count()).toBe(1);
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
    const expected = shiur.notes!.chapters.filter((c) => c.t <= g).at(-1)!;
    expect(await page.locator(`#s${expected.idx} a.time[aria-current="time"]`).count()).toBe(1);
    await page.context().close();
  });

  it("continues into the next recording when one ends", async () => {
    const page = await open(`/en/shiur/${MULTI}/`);
    await page.locator("#s0 a.time").click();
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
    await page.locator("#s0 a.time").click();
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

  it("print hides the player and the jump list, keeps the notes", async () => {
    const page = await open(`/en/shiur/${MULTI}/`);
    await page.emulateMedia({ media: "print" });
    for (const sel of [".listen", ".jump-list", ".open-live", ".report-error"]) {
      expect(await page.$eval(sel, (el) => getComputedStyle(el).display), sel).toBe("none");
    }
    expect(await page.$eval("#writeup", (el) => getComputedStyle(el).display)).toBe("block");
    await page.context().close();
  });
});

/**
 * W4.8 acceptance in a real browser (integration-plan §8 W4.8): the service worker precaches the
 * shell, so the app loads offline (Playwright offline mode); a downloaded shiur opens offline and its
 * audio plays and seeks from Cache Storage, answered by the worker with 206 (Range) responses.
 *
 * The fixture recordings point at `https://media.example.invalid/`, served here as silent WAV files
 * with CORS and Range, like the media host (Amendment A1). Requests that reach that handler after the
 * browser went offline are counted: the offline checks require zero, so they cannot pass through the
 * test's own route instead of the worker.
 */
import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHIUR = "yi-zmanim-msybs-lchyym-bkmp-01-c"; // one recording, 227 s, catalog-only
const shiur = JSON.parse(readFileSync(join(appDir, "app", "data", "fixtures", "data", "shiur", `${SHIUR}.json`), "utf8")) as {
  recordings: { audioUrl: string; duration: number }[];
};
const AUDIO_URL = shiur.recordings[0]!.audioUrl;
const RATE = 8000;

/** A silent 8 kHz 8-bit mono WAV of `seconds`. */
function silentWav(seconds: number): Buffer {
  const n = Math.ceil(seconds * RATE);
  const buf = Buffer.alloc(44 + n, 0x80);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + n, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(n, 40);
  return buf;
}

const WAV = silentWav(shiur.recordings[0]!.duration);

interface Media {
  offline: boolean;
  hitsWhileOffline: number;
  fullGets: number;
}

async function serveMedia(route: Route, media: Media): Promise<void> {
  if (media.offline) {
    media.hitsWhileOffline++;
    await route.abort("internetdisconnected");
    return;
  }
  if (route.request().url() !== AUDIO_URL) {
    await route.fulfill({ status: 404, body: "" });
    return;
  }
  const headers = { "content-type": "audio/wav", "accept-ranges": "bytes", "access-control-allow-origin": "*" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(route.request().headers()["range"] ?? "");
  if (!range) {
    media.fullGets++;
    await route.fulfill({ status: 200, headers: { ...headers, "content-length": String(WAV.length) }, body: WAV });
    return;
  }
  const start = range[1] ? Number(range[1]) : 0;
  const end = Math.min(range[2] ? Number(range[2]) : WAV.length - 1, WAV.length - 1);
  const slice = WAV.subarray(start, end + 1);
  await route.fulfill({
    status: 206,
    headers: { ...headers, "content-range": `bytes ${start}-${end}/${WAV.length}`, "content-length": String(slice.length) },
    body: slice,
  });
}

async function setup(context: BrowserContext): Promise<Media> {
  const media: Media = { offline: false, hitsWhileOffline: 0, fullGets: 0 };
  await context.route("https://media.example.invalid/**", (route) => serveMedia(route, media));
  return media;
}

/** Waits until the worker is active, has precached the shell and controls the page. */
async function controlled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

async function goOffline(context: BrowserContext, media: Media): Promise<void> {
  media.offline = true;
  await context.setOffline(true);
}

test("the shell loads offline", async ({ page, context }) => {
  const media = await setup(context);
  await page.goto("/en/");
  await page.locator("main h1").first().waitFor();
  await controlled(page);
  expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining([expect.stringMatching(/^shell-/)]));

  await goOffline(context, media);
  const res = await page.reload();
  expect(res?.fromServiceWorker()).toBe(true);
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.locator("[data-dock-slot]")).toBeVisible();

  // A page that was never opened online and is not prerendered: the SPA fallback renders it.
  const deep = await page.goto("/yi/maasios");
  expect(deep?.fromServiceWorker()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("main h1").first()).toBeVisible();

  // The browser really is offline: a request the worker does not answer fails.
  expect(await page.evaluate(() => fetch("/api/health").then(() => "ok", () => "failed"))).toBe("failed");

  // Client navigation offline: every route chunk is precached.
  await page.getByRole("navigation").locator("a").nth(1).click();
  await expect(page.locator("main h1").first()).toBeVisible();
  expect(media.hitsWhileOffline).toBe(0);
});

test("a downloaded shiur opens and plays with seeking offline", async ({ page, context }) => {
  const media = await setup(context);
  await page.goto(`/en/s/${SHIUR}`);
  await page.locator("[data-room]").waitFor();
  await controlled(page);

  // Not downloaded: the worker leaves media requests alone (network-only).
  expect(await page.evaluate(() => caches.open("audio-v1").then((c) => c.keys()).then((k) => k.length))).toBe(0);

  await page.locator("[data-offline=download]").click();
  await expect(page.locator("[data-offline-status]")).toHaveAttribute("data-offline-status", "complete", {
    timeout: 20_000,
  });
  await expect(page.locator("[data-offline=remove]")).toBeVisible();
  expect(media.fullGets).toBe(1);
  expect(await page.evaluate(() => caches.open("audio-v1").then((c) => c.keys()).then((k) => k.map((r) => r.url)))).toEqual([
    AUDIO_URL,
  ]);

  // My Shelf lists it (the store record written through putDownload).
  await page.getByRole("navigation").getByRole("link", { name: "My Shelf", exact: true }).click();
  await page.locator("main h1").first().waitFor();

  await goOffline(context, media);
  await page.goto(`/en/s/${SHIUR}?t=120`);
  await page.locator("[data-room]").waitFor();

  // Range request answered by the worker from the cached blob.
  const ranged = await page.evaluate(async (url) => {
    const r = await fetch(url, { headers: { range: "bytes=1000-1999" } });
    return { status: r.status, range: r.headers.get("content-range"), length: (await r.arrayBuffer()).byteLength };
  }, AUDIO_URL);
  expect(ranged).toEqual({ status: 206, range: `bytes 1000-1999/${WAV.length}`, length: 1000 });

  // The real player: starts at ?t=120 and plays on, then seeks back.
  const dock = page.locator("[data-dock-slot] [data-player-status]");
  await expect(dock).toHaveAttribute("data-player-status", "paused", { timeout: 10_000 });
  await page.locator("[data-room-play]").click();
  await expect(dock).toHaveAttribute("data-player-status", "playing", { timeout: 10_000 });
  await page.waitForTimeout(1500);
  const t = Number(await dock.getAttribute("data-player-t"));
  expect(t).toBeGreaterThanOrEqual(120);
  expect(t).toBeLessThan(130);

  // Seek with the dock's position slider, forward to 200 s and back to 30 s; playback continues.
  const position = page.locator("[data-dock-slot]").getByRole("slider", { name: "Position" });
  for (const to of [200, 30]) {
    await position.fill(String(to));
    await page.waitForTimeout(1200);
    await expect(dock).toHaveAttribute("data-player-status", "playing");
    const at = Number(await dock.getAttribute("data-player-t"));
    expect(at, `after seeking to ${to}`).toBeGreaterThanOrEqual(to);
    expect(at, `after seeking to ${to}`).toBeLessThan(to + 5);
  }
  expect(media.hitsWhileOffline).toBe(0);
});

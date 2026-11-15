/**
 * W3.7 acceptance in a real browser (integration-plan §8 W3.7): `?t=754` starts within 1 s of 754;
 * audio continues across 5 route changes; chapter next/prev; a catalog-only shiur plays; the client
 * bundle carries no transcript component; axe is clean on the room in en and yi.
 *
 * The fixture recordings point at `https://media.example.invalid/`; this spec serves them as silent
 * WAV files of the recording's length, with Range support, so seeking works like on the media host.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureShiurDir = join(appDir, "app", "data", "fixtures", "data", "shiur");

/** Media URL → recording length (seconds), from the fixture shiur files. */
const lengths = new Map<string, number>();
for (const f of readdirSync(fixtureShiurDir)) {
  const shiur = JSON.parse(readFileSync(join(fixtureShiurDir, f), "utf8")) as {
    recordings: { audioUrl: string | null; duration: number }[];
  };
  for (const r of shiur.recordings) if (r.audioUrl) lengths.set(r.audioUrl, r.duration);
}

const RATE = 8000;
const wavCache = new Map<number, Buffer>();

/** A silent 8 kHz 8-bit mono WAV of `seconds`. */
function silentWav(seconds: number): Buffer {
  const n = Math.ceil(seconds * RATE);
  const cached = wavCache.get(n);
  if (cached) return cached;
  const buf = Buffer.alloc(44 + n, 0x80);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + n, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE, 28); // byte rate
  buf.writeUInt16LE(1, 32); // block align
  buf.writeUInt16LE(8, 34); // bits
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(n, 40);
  wavCache.set(n, buf);
  return buf;
}

async function serveMedia(route: Route): Promise<void> {
  const url = route.request().url();
  const seconds = lengths.get(url);
  if (seconds === undefined) {
    await route.fulfill({ status: 404, body: "" });
    return;
  }
  const body = silentWav(seconds);
  const headers = { "content-type": "audio/wav", "accept-ranges": "bytes", "access-control-allow-origin": "*" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(route.request().headers()["range"] ?? "");
  if (!range) {
    await route.fulfill({ status: 200, headers: { ...headers, "content-length": String(body.length) }, body });
    return;
  }
  const start = range[1] ? Number(range[1]) : 0;
  const end = Math.min(range[2] ? Number(range[2]) : body.length - 1, body.length - 1);
  const slice = body.subarray(start, end + 1);
  await route.fulfill({
    status: 206,
    headers: { ...headers, "content-range": `bytes ${start}-${end}/${body.length}`, "content-length": String(slice.length) },
    body: slice,
  });
}

test.beforeEach(async ({ page }) => {
  await page.route("https://media.example.invalid/**", serveMedia);
});

const dock = (page: Page) => page.locator("[data-dock-slot] [data-player-status]");

async function playerT(page: Page): Promise<number> {
  return Number(await dock(page).getAttribute("data-player-t"));
}

async function waitStatus(page: Page, status: string): Promise<void> {
  await expect(dock(page)).toHaveAttribute("data-player-status", status, { timeout: 10_000 });
}

async function openRoom(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.locator("[data-room]").waitFor();
}

test("?t=754 starts within 1 s of 754", async ({ page }) => {
  await openRoom(page, "/en/s/yi-zmanim-tv-bb-04?t=754");
  await waitStatus(page, "paused");
  expect(Math.abs((await playerT(page)) - 754)).toBeLessThanOrEqual(1);
  await page.locator("[data-room-play]").click();
  await waitStatus(page, "playing");
  const t = await playerT(page);
  expect(t).toBeGreaterThanOrEqual(753);
  expect(t).toBeLessThanOrEqual(755);
});

test("audio continues across 5 route changes", async ({ page }) => {
  await openRoom(page, "/en/s/yi-zmanim-tv-bb-04");
  await page.locator("[data-room-play]").click();
  await waitStatus(page, "playing");
  await dock(page).evaluate((el) => {
    (el as HTMLElement & { __probe?: number }).__probe = 42;
  });
  let last = await playerT(page);
  for (const name of ["Explore", "Seforim", "Maasios", "Series", "My Shelf"]) {
    await page.getByRole("navigation").getByRole("link", { name, exact: true }).click();
    await page.locator("main h1").first().waitFor();
    await page.waitForTimeout(400);
    await waitStatus(page, "playing");
    const probe = await dock(page).evaluate((el) => (el as HTMLElement & { __probe?: number }).__probe);
    expect(probe, name).toBe(42);
    const t = await playerT(page);
    expect(t, name).toBeGreaterThan(last);
    last = t;
  }
});

test("chapter next and previous", async ({ page }) => {
  await openRoom(page, "/en/s/yi-zmanim-tv-bb-04?t=300");
  await waitStatus(page, "paused");
  const slot = page.locator("[data-dock-slot]");
  await slot.getByRole("button", { name: "Play", exact: true }).click();
  await waitStatus(page, "playing");
  await expect(dock(page)).toHaveAttribute("data-player-chapter", "1");
  // Chapter 2 is noise and skipped by default: next goes to chapter 3 (795.79 s).
  await slot.getByRole("button", { name: "Next chapter" }).click();
  await expect(dock(page)).toHaveAttribute("data-player-chapter", "3");
  expect(Math.abs((await playerT(page)) - 795.79)).toBeLessThanOrEqual(1.5);
  await page.waitForTimeout(3500);
  // More than 3 s in: previous restarts the chapter; again: the chapter before (noise passed over).
  await slot.getByRole("button", { name: "Previous chapter" }).click();
  await expect(dock(page)).toHaveAttribute("data-player-chapter", "3");
  expect(Math.abs((await playerT(page)) - 795.79)).toBeLessThanOrEqual(1.5);
  await slot.getByRole("button", { name: "Previous chapter" }).click();
  await expect(dock(page)).toHaveAttribute("data-player-chapter", "1");
});

test("a catalog-only shiur plays", async ({ page }) => {
  await openRoom(page, "/en/s/yi-tanya-1-01");
  await expect(page.locator("[data-room]")).toHaveAttribute("data-status", "catalog-only");
  await expect(page.getByText("Notes for this shiur have not been prepared yet.")).toBeVisible();
  await page.locator("[data-room-play]").click();
  await waitStatus(page, "playing");
  await page.waitForTimeout(1200);
  expect(await playerT(page)).toBeGreaterThan(0.5);
});

test("the client bundle carries no transcript component", async () => {
  const assets = join(appDir, "build", "client", "assets");
  const offenders = readdirSync(assets)
    .filter((f) => f.endsWith(".js"))
    .filter((f) => /transcript/i.test(readFileSync(join(assets, f), "utf8")));
  expect(offenders).toEqual([]);
});

for (const ui of ["en", "yi"] as const) {
  test(`axe is clean in the listening room (${ui})`, async ({ page }) => {
    for (const path of ["s/yi-zmanim-tv-bb-04?t=300", "s/yi-tanya-1-01"]) {
      await openRoom(page, `/${ui}/${path}`);
      await page.waitForFunction(() => document.fonts.status === "loaded");
      const tabs = page.locator("[data-room-tabs] [role=tab]");
      const count = await tabs.count();
      for (let i = 0; i < count; i++) {
        await tabs.nth(i).click();
        const result = await new AxeBuilder({ page }).analyze();
        expect(
          result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
          `${ui}/${path} tab ${i}`,
        ).toEqual([]);
      }
    }
  });
}

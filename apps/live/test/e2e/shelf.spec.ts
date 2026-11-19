/**
 * W3.9 acceptance in a real browser:
 *  - the queue of moments plays across shiurim (real <audio>, the W2.5 engine, media served by a
 *    route that answers Range requests with a short silent WAV);
 *  - a shared playlist link round-trips (queue → share → open → same list) and the shelf survives a
 *    reload (IndexedDB);
 *  - with IndexedDB and localStorage blocked (a private window that refuses storage) every shelf page
 *    works, says that nothing is kept, and throws no errors.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { shelfEn, shelfYi, type ShelfKey } from "../../app/features/shelf/strings.ts";

const B = "en-parsha-en-nch-01";
const C = "yi-tanya-1-01";
const A = "yi-parshas-hashavua-brshys-01";

/** base64url(JSON) exactly as the app encodes `/pl#…` (tech-live §4.2). */
function playlistHash(items: (string | number)[][]): string {
  return Buffer.from(JSON.stringify(items)).toString("base64url");
}

/** A silent 8 kHz 8-bit mono WAV. */
function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n, 128);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28); // byte rate
  b.writeUInt16LE(1, 32); // block align
  b.writeUInt16LE(8, 34); // bits
  b.write("data", 36);
  b.writeUInt32LE(n, 40);
  return b;
}

const WAV = silentWav(40);

/** Serves every fixture media URL (`https://media.example.invalid/…`) with Range support; logs requests. */
async function serveMedia(page: Page): Promise<string[]> {
  const requested: string[] = [];
  await page.route("https://media.example.invalid/**", async (route) => {
    const req = route.request();
    requested.push(new URL(req.url()).pathname);
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers()["range"] ?? "");
    const headers = {
      "content-type": "audio/wav",
      "accept-ranges": "bytes",
      "access-control-allow-origin": "*",
    };
    if (!range) {
      await route.fulfill({ status: 200, headers: { ...headers, "content-length": String(WAV.length) }, body: WAV });
      return;
    }
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), WAV.length - 1) : WAV.length - 1;
    await route.fulfill({
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${WAV.length}`, "content-length": String(end - start + 1) },
      body: WAV.subarray(start, end + 1),
    });
  });
  return requested;
}

async function ready(page: Page): Promise<void> {
  await page.locator("main h1").first().waitFor();
}

const queueItems = (page: Page) => page.getByTestId("queue-list").locator("> li");

test.describe("queue of moments", () => {
  test("plays moments back to back across shiurim", async ({ page }) => {
    const media = await serveMedia(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Build a queue from a shared link: two moments in two different shiurim.
    await page.goto(`/en/pl#${playlistHash([[B, 2, 4], [C, 1, 3]])}`);
    await ready(page);
    await page.getByRole("button", { name: "Add to queue" }).click();

    // Client-side navigation to the queue (the engine and its <audio> survive route changes).
    await page.getByRole("navigation").getByRole("link", { name: "My Shelf" }).click();
    await page.locator("section[data-section=queue] h2 a").click();
    await expect(page.locator("main h1")).toHaveText("Queue");
    await expect(queueItems(page)).toHaveCount(2);

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(queueItems(page).nth(0)).toHaveAttribute("aria-current", "true");
    await expect(queueItems(page).nth(0)).toContainText("Now playing");

    // The first moment ends at 4 s; the second, in another shiur, takes over.
    await expect(queueItems(page).nth(1)).toContainText("Now playing", { timeout: 10_000 });
    await expect(queueItems(page).nth(0)).not.toContainText("Now playing");
    // ... and when it ends at 3 s the queue is done.
    await expect(page.getByText("The queue has finished.")).toBeVisible({ timeout: 10_000 });

    expect(media.filter((p) => p.endsWith(".mp3")).map((p) => p.split("/").pop())).toEqual(
      expect.arrayContaining([
        "e-parsha-bereshes-02-01-noach-english-the-special-qualities-of-the-teivah.mp3",
        "y-sets-tanya-01-1-tanya.mp3",
      ]),
    );
    const firstB = media.findIndex((p) => p.includes("noach"));
    const firstC = media.findIndex((p) => p.includes("tanya"));
    expect(firstB).toBeGreaterThanOrEqual(0);
    expect(firstC).toBeGreaterThan(firstB);

    // Listening was recorded: the history lists both shiurim, most recent first.
    await page.locator("a", { hasText: "My Shelf" }).first().click();
    await page.locator("section[data-section=history] h2 a").click();
    const history = page.locator("main ol > li a");
    await expect(history.first()).toHaveAttribute("href", new RegExp(`/en/s/${C}`));
    await expect(history.nth(1)).toHaveAttribute("href", new RegExp(`/en/s/${B}`));
    expect(errors).toEqual([]);
  });
});

test.describe("shared playlists and persistence", () => {
  test("queue → share link → open → same list; the shelf survives a reload", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
    await page.goto(`/en/pl#${playlistHash([[A, 754, 812.5], [B, 0], [C, 30, 60]])}`);
    await ready(page);
    await page.getByRole("button", { name: "Add to queue" }).click();
    await page.getByLabel("Playlist name").fill("Elul");
    await page.getByRole("button", { name: "Save as playlist" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved to your playlists.");

    // Reload: everything came back from IndexedDB.
    await page.goto("/en/shelf/queue");
    await ready(page);
    await expect(queueItems(page)).toHaveCount(3);
    await expect(page.getByTestId("storage-notice")).toHaveCount(0);

    await page.getByRole("button", { name: "Share link" }).click();
    const url = await page.getByTestId("share-url").inputValue();
    expect(url).toMatch(/\/en\/pl#[A-Za-z0-9_-]+$/);

    await page.goto("/en/shelf/playlists");
    await expect(page.locator("main")).toContainText("Elul");

    // Open the shared link in a fresh page: the same three moments, in order.
    const other = await context.newPage();
    await other.goto(url);
    await ready(other);
    const hrefs = await other.getByTestId("shared-list").locator("> li a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toEqual([`/en/s/${A}?t=754`, `/en/s/${B}`, `/en/s/${C}?t=30`]);
    await expect(other.getByTestId("shared-list").locator("> li").first()).toContainText("12:34–13:3");
  });

  test("a broken link explains itself", async ({ page }) => {
    await page.goto("/yi/pl#garbage!!");
    await ready(page);
    await expect(page.getByTestId("shared-list")).toHaveCount(0);
    await expect(page.locator("main")).toContainText("דער לינק האט נישט קיין ליסטע");
  });
});

test.describe("storage blocked (private window)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const deny = () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      };
      for (const name of ["indexedDB", "localStorage", "sessionStorage"]) {
        Object.defineProperty(window, name, { configurable: true, get: deny });
      }
    });
  });

  for (const ui of ["en", "yi"] as const) {
    test(`every shelf page works and says nothing is kept (${ui})`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/${ui}/pl#${playlistHash([[B, 5, 9], [C, 0]])}`);
      await ready(page);
      await page.getByRole("button").filter({ hasText: ui === "en" ? "Add to queue" : "צולייגן צו דער ריי" }).click();

      const table = ui === "en" ? shelfEn : shelfYi;
      const pages: [string, ShelfKey][] = [
        ["shelf", "shelf.title"],
        ["shelf/queue", "section.queue"],
        ["shelf/playlists", "section.playlists"],
        ["shelf/saved", "section.saved"],
        ["shelf/notes", "section.notes"],
        ["shelf/history", "section.history"],
        ["shelf/continue", "section.continue"],
      ];
      for (const [p, title] of pages) {
        // Client-side navigation keeps the in-memory shelf, as a private-window session would.
        await page.evaluate((to) => {
          window.history.pushState({}, "", to);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, `/${ui}/${p}`);
        await expect(page.locator("main h1")).toHaveText(table[title] as string);
        await expect(page.getByTestId("storage-notice")).toBeVisible();
        const axe = await new AxeBuilder({ page }).include("main").analyze();
        expect(axe.violations.map((v) => v.id), p).toEqual([]);
      }
      await page.evaluate((to) => {
        window.history.pushState({}, "", to);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, `/${ui}/shelf/queue`);
      await expect(queueItems(page)).toHaveCount(2);
      expect(errors).toEqual([]);
    });
  }
});

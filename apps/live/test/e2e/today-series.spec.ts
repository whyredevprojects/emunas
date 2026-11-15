/**
 * W3.8 acceptance in a real browser (Today and series; run by W5.1):
 * - `?date=` pins the day: the week's parsha matches the calendar for fixed dates (5787), the moment
 *   of the day is the same on every load of one date, and the corpus counter matches `corpus.json`;
 * - the Israel toggle is a pressed/unpressed button that survives a reload;
 * - every series in `facets.json` is on the series index; every series page lists its parts in
 *   `order`, a series with perakim (Tanya) groups them by perek, and the other-language sibling link
 *   resolves;
 * - axe is clean on Today, the series index and series pages in en and yi.
 *
 * `@data`: expectations come from the served `/data/*`, so this also runs on a real-data build.
 */
import { expect, test, type Page } from "@playwright/test";
import { axeViolations, corpusRows, dataJson, NO_SERVICE_WORKER, pageErrors, settled, UIS } from "./helpers.ts";

test.use(NO_SERVICE_WORKER);

/**
 * Shabbos parshiyos of 5787 (diaspora), from the printed luach: a weekday maps to the coming
 * Shabbos. Simchas Torah 5787 is Sunday 4 October 2026.
 */
const WEEKS: readonly (readonly [date: string, parsha: string])[] = [
  ["2026-10-06", "bereishis"],
  ["2026-10-13", "noach"],
  ["2026-10-20", "lech-lecha"],
  ["2026-11-15", "vayeitzei"],
  ["2026-12-29", "shemos"],
  ["2027-01-05", "vaeira"],
];

interface SeriesFile {
  id: string;
  title: { en: string; yi: string };
  lang: "en" | "yi";
  sibling: string | null;
  parts: { shiurId: string; order: number | null; perek: string | null }[];
}

async function openToday(page: Page, ui: string, date: string): Promise<void> {
  await page.goto(`/${ui}/?date=${date}`);
  await settled(page);
  await expect(page.getByTestId("corpus-counter")).toBeVisible({ timeout: 15_000 });
}

test.describe("@data Today", () => {
  test("the week's parsha follows the luach for fixed dates", async ({ page }) => {
    for (const [date, parsha] of WEEKS) {
      await openToday(page, "en", date);
      await expect(page.locator("[data-parsha]"), date).toHaveAttribute("data-parsha", parsha);
      await expect(page.locator(`[data-parsha] a[href="/en/o/${parsha}"]`), date).toBeVisible();
    }
  });

  test("the moment of the day is stable for a date and the counter matches corpus.json", async ({ page, request }) => {
    const rows = await corpusRows(request);
    const errors = pageErrors(page);
    const seen: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      await openToday(page, "en", "2026-10-06");
      const m = page.locator("[data-moment]");
      seen.push((await m.count()) > 0 ? await m.first().getAttribute("data-moment") : null);
    }
    expect(new Set(seen).size, seen.join(" | ")).toBe(1);
    if (seen[0]) {
      // The moment belongs to a shiur with notes and links into its listening room at its time.
      const shiurId = seen[0].split("~")[0]!;
      expect(rows.find((r) => r.id === shiurId)?.status).toBe("full");
      await expect(page.locator(`[data-moment] a[href^="/en/s/${shiurId}?t="]`)).toBeVisible();
    }
    const full = rows.filter((r) => r.status === "full").length;
    const counter = await page.getByTestId("corpus-counter").innerText();
    expect(counter.replace(/[,\s]/gu, "")).toContain(String(full));
    expect(counter.replace(/[,\s]/gu, "")).toContain(String(rows.length));
    expect(errors).toEqual([]);
  });

  test("every shiur card on Today opens a shiur in corpus.json", async ({ page, request }) => {
    const ids = new Set((await corpusRows(request)).map((r) => r.id));
    for (const [date] of WEEKS) {
      await openToday(page, "en", date);
      const cards = await page.locator("main a[data-shiur]").evaluateAll((as) => as.map((a) => a.getAttribute("data-shiur")!));
      for (const id of cards) expect(ids.has(id), `${date}: ${id}`).toBe(true);
    }
  });

  test("the Israel toggle is a toggle button and survives a reload", async ({ page }) => {
    await openToday(page, "en", "2026-10-06");
    const toggle = page.locator("main button[aria-pressed]").first();
    const before = await toggle.getAttribute("aria-pressed");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
    await page.reload();
    await settled(page);
    await expect(page.locator("main button[aria-pressed]").first()).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
  });
});

test.describe("@data series", () => {
  test("the series index lists every series in facets.json", async ({ page, request }) => {
    const facets = await dataJson<{ series: Record<string, unknown> }>(request, "facets.json");
    await page.goto("/en/series");
    await settled(page);
    const listed = await page.locator("[data-testid=series-index] [data-series]").evaluateAll((els) => els.map((e) => e.getAttribute("data-series")!));
    const linked = await page.locator("[data-testid=series-index] a[href^='/en/series/']").evaluateAll((as) =>
      as.map((a) => decodeURIComponent(a.getAttribute("href")!.slice("/en/series/".length))),
    );
    for (const id of Object.keys(facets.series)) {
      expect(listed.includes(id) || linked.includes(id), id).toBe(true);
    }
  });

  test("every series page lists its parts in order; perakim group Tanya; sibling links resolve", async ({ page, request }) => {
    const facets = await dataJson<{ series: Record<string, unknown> }>(request, "facets.json");
    let checked = 0;
    for (const id of Object.keys(facets.series)) {
      const res = await request.get(`/data/series/${encodeURIComponent(id)}.json`);
      if (res.status() === 404) continue; // the fixtures carry one series file; a real build has all
      expect(res.status(), id).toBe(200);
      const file = (await res.json()) as SeriesFile;
      checked++;

      await page.goto(`/en/series/${encodeURIComponent(id)}?view=order`);
      await settled(page);
      await expect(page.locator("main h1")).toHaveText(file.title.en);
      const orders = await page.locator("main ol > li[data-order]").evaluateAll((lis) => lis.map((li) => li.getAttribute("data-order")!));
      expect(orders.length, id).toBe(file.parts.length);
      const numeric = orders.filter((o) => o !== "").map(Number);
      expect(numeric, `${id}: parts in order`).toEqual([...numeric].sort((a, b) => a - b));
      const shown = await page.locator("main ol > li[data-order] a[data-shiur]").evaluateAll((as) => as.map((a) => a.getAttribute("data-shiur")!));
      expect(new Set(shown), id).toEqual(new Set(file.parts.map((p) => p.shiurId)));

      if (file.parts.some((p) => p.perek !== null)) {
        // One group per perek across the series and its sibling (when that file exists).
        const sibRes = file.sibling ? await request.get(`/data/series/${encodeURIComponent(file.sibling)}.json`) : null;
        const sibParts = sibRes?.status() === 200 ? ((await sibRes.json()) as SeriesFile).parts : [];
        await page.goto(`/en/series/${encodeURIComponent(id)}?view=perek`);
        await settled(page);
        // Groups run in perek order (a range like א-ב sits in each of its perakim); unplaced parts last.
        const keys = await page.locator("main section[data-perek]").evaluateAll((els) => els.map((e) => e.getAttribute("data-perek")!));
        expect(keys.length, `${id}: perek groups`).toBeGreaterThan(0);
        const nums = keys.filter((k) => k !== "other").map(Number);
        expect(nums, `${id}: perek order`).toEqual([...nums].sort((a, b) => a - b));
        expect(new Set(nums).size, `${id}: one group per perek`).toBe(nums.length);
        if (keys.includes("other")) expect(keys.at(-1)).toBe("other");
        const inGroups = await page.locator("main section[data-perek] a[data-shiur]").evaluateAll((as) => as.map((a) => a.getAttribute("data-shiur")!));
        expect(new Set(inGroups), id).toEqual(new Set([...file.parts, ...sibParts].map((p) => p.shiurId)));
      }
      if (file.sibling) {
        const sib = await request.get(`/data/series/${encodeURIComponent(file.sibling)}.json`);
        if (sib.status() === 200) {
          await page.goto(`/en/series/${encodeURIComponent(id)}`);
          await settled(page);
          await expect(page.locator(`main a[href="/en/series/${file.sibling}"]`).first()).toBeVisible();
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

test.describe("accessibility", () => {
  for (const ui of UIS) {
    test(`axe is clean on Today, the series index and a series page (${ui})`, async ({ page, request }) => {
      await openToday(page, ui, "2026-10-06");
      expect(await axeViolations(page), `${ui} Today`).toEqual([]);
      await page.goto(`/${ui}/series`);
      await settled(page);
      expect(await axeViolations(page), `${ui} series index`).toEqual([]);
      const facets = await dataJson<{ series: Record<string, unknown> }>(request, "facets.json");
      for (const id of Object.keys(facets.series)) {
        if ((await request.get(`/data/series/${encodeURIComponent(id)}.json`)).status() !== 200) continue;
        for (const view of ["order", "perek", "both"]) {
          await page.goto(`/${ui}/series/${encodeURIComponent(id)}?view=${view}`);
          await settled(page);
          expect(await axeViolations(page), `${ui} series ${id} ${view}`).toEqual([]);
        }
        break; // one series per language (all views); the per-series checks above cover the rest
      }
    });
  }
});

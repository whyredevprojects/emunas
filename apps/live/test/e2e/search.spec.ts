/**
 * W4.3 acceptance in a real browser (integration-plan §8 W4.3, run by W5.1):
 * - the command bar gives suggestions (occasions, sefarim, years) from the client MiniSearch engine
 *   with the network off;
 * - full results come from `/api/search` (a stand-in answering in the Worker's contract here; the
 *   staging run is `command-bar/test/staging.test.ts`), grouped by shiur with the matched field;
 * - when the API fails, times out, answers garbage or the browser is offline, the search page and the
 *   bar fall back to the client engine, labelled "shiur-level results";
 * - planted keys in an API response (`heardAs`, `transcript`, …) never reach the page: everything a
 *   result shows comes from the allowed keys or from `corpus.json`;
 * - the input runs right to left for a Hebrew query in the English UI; axe is clean (en/yi).
 *
 * `@data`: queries and expectations come from the served `/data/*`, so this also runs on real data.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { axeViolations, corpusRows, dataJson, pageErrors, ready, UIS, type Row } from "./helpers.ts";

interface FacetValue {
  label: { en: string; yi: string };
  count: number;
}
type Facets = Record<"occasion" | "work" | "year", Record<string, FacetValue>>;

const PLANTED = "PLANTED-TRANSCRIPT-TEXT";

/**
 * The most common value of a facet with a short label: plain Latin text when there is one (real
 * data spells parshiyos in English), else any short label (the fixtures label them in Hebrew).
 */
function topLatin(map: Record<string, FacetValue>): [string, FacetValue] {
  const byCount = Object.entries(map)
    .filter(([k]) => k !== "other")
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  const e =
    byCount.find(([, v]) => /^[A-Za-z][A-Za-z '-]{2,}$/u.test(v.label.en)) ??
    byCount.find(([, v]) => [...v.label.en].length >= 2 && [...v.label.en].length <= 24);
  if (!e) throw new Error("no usable label in this facet");
  return e;
}

/** A stand-in `/api/search` answer for `rows`, in the Worker's contract plus planted extra keys. */
function apiBody(rows: readonly Row[]): unknown {
  const results = rows.map((r, i) => ({
    momentId: `${r.id}~s0`,
    shiurId: r.id,
    kind: "section",
    t: 60 + i,
    end: 120 + i,
    // Every interface language, as the Worker sends it (a string or null each).
    title: { en: `Stand-in chapter ${i}`, yi: `שטעל-אין קאפיטל ${i}`, he: `פרק לדוגמה ${i}` },
    matched: "text",
    snippet: { text: `Stand-in snippet ${i} about the matched words`, lang: "en", marks: [[0, 8]] },
    score: 1 - i / 10,
    heardAs: PLANTED,
    asrNotes: PLANTED,
  }));
  return {
    rev: "stand-in",
    tookMs: 3,
    results,
    groups: rows.map((r) => ({ shiurId: r.id, count: 1, transcript: PLANTED })),
    next: null,
    transcript: PLANTED,
    segments: [{ text: PLANTED }],
  };
}

async function routeApi(page: Page, handler: (route: Route) => Promise<void>): Promise<string[]> {
  const seen: string[] = [];
  await page.route("**/api/search?**", async (route) => {
    seen.push(route.request().url());
    await handler(route);
  });
  return seen;
}

const searchStatus = (page: Page) => page.getByTestId("search-status");

test.describe("@data command bar", () => {
  test("suggestions come from the client engine with the network off", async ({ page, context, request }) => {
    const facets = await dataJson<Facets>(request, "facets.json");
    const [occKey, occ] = topLatin(facets.occasion);
    const [workKey, work] = topLatin(facets.work);
    const [year] = Object.entries(facets.year)
      .filter(([k]) => /^\d{4}$/u.test(k))
      .sort((a, b) => b[1].count - a[1].count)[0]!;
    const errors = pageErrors(page);
    await page.goto("/en/");
    await ready(page);
    const bar = page.getByRole("combobox", { name: "Search or go to" });
    await bar.focus(); // lazy-loads the engine
    await page.waitForLoadState("networkidle");
    await context.setOffline(true);
    await routeApi(page, (route) => route.abort("internetdisconnected"));

    for (const [q, href] of [
      [occ.label.en, `/en/o/${encodeURIComponent(occKey)}`],
      [work.label.en, `/en/seforim/${encodeURIComponent(workKey)}`],
      [year, null],
    ] as const) {
      await bar.fill(q);
      const options = page.locator('[role=listbox] [role=option][data-kind="suggestion"]');
      await expect(options.first(), q).toBeVisible();
      if (href) {
        const hrefs = await options.evaluateAll((els) => els.map((e) => e.getAttribute("data-href")));
        expect(hrefs, q).toContain(href);
      }
    }
    expect(errors, "no errors while suggesting offline").toEqual([]);
    // Arrow down + Enter follows the first suggestion (client navigation; the page it opens needs
    // the network for its data, which is not this test's concern).
    await bar.fill(occ.label.en);
    await bar.press("ArrowDown");
    const first = await page.locator('[role=option][aria-selected="true"]').getAttribute("data-href");
    await context.setOffline(false);
    await bar.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${first!.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`));
  });

  test("after 250 ms idle the bar shows shiur-level results, labelled, when the API fails", async ({ page, request }) => {
    const rows = await corpusRows(request);
    const titled = rows.find((r) => /^[A-Za-z]/u.test(r.title) && r.title.split(/\s+/u).length >= 2) ?? rows[0]!;
    const word = titled.title.split(/\s+/u).find((w) => /^[A-Za-z]{4,}$/u.test(w)) ?? titled.title.slice(0, 6);
    const calls = await routeApi(page, (route) => route.fulfill({ status: 503, body: "unavailable" }));
    await page.goto("/en/");
    await ready(page);
    const bar = page.getByRole("combobox", { name: "Search or go to" });
    await bar.focus();
    await bar.fill(word);
    await expect(page.getByTestId("fallback-label")).toHaveText("Showing shiur-level results");
    expect(calls.length).toBeGreaterThan(0);
    expect(new URL(calls.at(-1)!).searchParams.get("q")).toBe(word);
    await expect(page.locator('[role=option][data-kind="shiur"]').first()).toBeVisible();
  });

  test("a Hebrew query in the English interface runs right to left", async ({ page }) => {
    await page.goto("/en/");
    await ready(page);
    const bar = page.getByRole("combobox", { name: "Search or go to" });
    // `ready` waits for the prerendered h1, so a fill can land before hydration and be reset by it:
    // fill and read again until the direction follows the text.
    const dirAfter = async (l: typeof bar, text: string, want: string) =>
      expect(async () => {
        await l.fill(text);
        expect(await l.evaluate((el) => getComputedStyle(el).direction)).toBe(want);
      }).toPass();
    await dirAfter(bar, "בראשית", "rtl");
    await dirAfter(bar, "bereishis", "ltr");
    await page.goto("/en/search");
    await ready(page);
    const input = page.locator("#search-q");
    await dirAfter(input, "תשובה", "rtl");
  });
});

test.describe("@data search page", () => {
  test("full results from the API, grouped by shiur with the matched field; planted keys never show", async ({ page, request }) => {
    const rows = await corpusRows(request);
    const picks = rows.filter((r) => r.status === "full").slice(0, 3);
    expect(picks.length).toBeGreaterThan(0);
    const calls = await routeApi(page, (route) => route.fulfill({ status: 200, json: apiBody(picks) }));
    const errors = pageErrors(page);
    await page.goto("/en/search?q=teshuvah");
    await ready(page);
    const results = page.locator('[data-testid=search-results][data-source="api"]');
    await expect(results).toBeVisible();
    expect(new URL(calls[0]!).searchParams.get("q")).toBe("teshuvah");
    expect(new URL(calls[0]!).searchParams.get("ui")).toBe("en");
    await expect(results.locator("> li[data-shiur]")).toHaveCount(picks.length);
    for (const [i, r] of picks.entries()) {
      const group = results.locator(`> li[data-shiur="${r.id}"]`);
      await expect(group).toContainText(`Stand-in snippet ${i}`);
      await expect(group.locator(`[data-moment="${r.id}~s0"]`)).toHaveCount(1);
      await expect(group.locator(`a[href*="/en/s/${r.id}"]`).first()).toBeVisible();
    }
    await expect(searchStatus(page)).toContainText(`${picks.length} moment`);
    const text = await page.locator("main").innerText();
    expect(text).not.toContain(PLANTED);
    expect(await page.content()).not.toContain(PLANTED);
    expect(errors).toEqual([]);
  });

  for (const [why, handler, label] of [
    ["the API answers 500", (r: Route) => r.fulfill({ status: 500, body: "boom" }), "Full search is not available right now"],
    ["the API answers HTML (SPA fallback, no Worker)", (r: Route) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><p>app</p>" }), "Full search is not available right now"],
    ["the API answers JSON outside the contract", (r: Route) => r.fulfill({ status: 200, json: { results: "nope", heardAs: PLANTED } }), "Full search is not available right now"],
    ["the network drops the request", (r: Route) => r.abort("failed"), "Full search is not available right now"],
  ] as const) {
    test(`fallback when ${why}: shiur-level results, labelled`, async ({ page, request }) => {
      const rows = await corpusRows(request);
      const r = rows.find((x) => /[A-Za-z]{5,}/u.test(x.title)) ?? rows[0]!;
      const word = /[A-Za-z]{5,}/u.exec(r.title)?.[0] ?? r.title;
      await routeApi(page, handler);
      await page.goto(`/en/search?q=${encodeURIComponent(word)}`);
      await ready(page);
      const notice = page.getByTestId("fallback-notice");
      await expect(notice).toContainText("Showing shiur-level results");
      await expect(notice).toContainText(label);
      const list = page.locator('[data-testid=search-results][data-source="fallback"]');
      await expect(list).toBeVisible();
      // Every fallback hit is a shiur from corpus.json, linked to its listening room.
      const ids = await list.locator("> li[data-shiur]").evaluateAll((els) => els.map((e) => e.getAttribute("data-shiur")!));
      expect(ids.length).toBeGreaterThan(0);
      const known = new Set(rows.map((x) => x.id));
      for (const id of ids) expect(known.has(id), id).toBe(true);
      expect(await page.content()).not.toContain(PLANTED);
    });
  }

  test("offline: the page says so and searches titles and summaries on the device", async ({ page, context, request }) => {
    const rows = await corpusRows(request);
    const r = rows.find((x) => /[A-Za-z]{5,}/u.test(x.title)) ?? rows[0]!;
    const word = /[A-Za-z]{5,}/u.exec(r.title)?.[0] ?? r.title;
    const calls = await routeApi(page, (route) => route.abort("internetdisconnected"));
    await page.goto("/en/search");
    await ready(page);
    await page.waitForLoadState("networkidle");
    await context.setOffline(true);
    await page.locator("#search-q").fill(word);
    await page.locator("#search-q").press("Enter");
    const notice = page.getByTestId("fallback-notice");
    await expect(notice).toContainText("Showing shiur-level results");
    await expect(notice).toContainText("You are offline");
    await expect(page.locator('[data-testid=search-results][data-source="fallback"] > li').first()).toBeVisible();
    expect(calls).toEqual([]); // offline: no request is even tried
    await context.setOffline(false);
  });

  test("typing searches after the idle pause and keeps ?q= in the address bar", async ({ page }) => {
    const calls = await routeApi(page, (route) => route.fulfill({ status: 200, json: apiBody([]) }));
    await page.goto("/en/search");
    await ready(page);
    await page.locator("#search-q").pressSequentially("chesed", { delay: 30 });
    await expect(page).toHaveURL(/[?&]q=chesed/);
    await expect(searchStatus(page)).toContainText("chesed");
    expect(calls.map((c) => new URL(c).searchParams.get("q"))).toContain("chesed");
  });
});

test.describe("accessibility", () => {
  for (const ui of UIS) {
    test(`axe is clean on the search page and with the command bar open (${ui})`, async ({ page, request }) => {
      const rows = await corpusRows(request);
      await routeApi(page, (route) => route.fulfill({ status: 200, json: apiBody(rows.filter((r) => r.status === "full").slice(0, 2)) }));
      await page.goto(`/${ui}/search?q=teshuvah`);
      await ready(page);
      await expect(page.getByTestId("search-results")).toBeVisible();
      expect(await axeViolations(page), `${ui}/search (api)`).toEqual([]);

      await page.unroute("**/api/search?**");
      await routeApi(page, (route) => route.fulfill({ status: 503, body: "" }));
      await page.goto(`/${ui}/search?q=${encodeURIComponent(rows[0]!.title.slice(0, 12))}`);
      await ready(page);
      await expect(page.getByTestId("fallback-notice")).toBeVisible();
      expect(await axeViolations(page), `${ui}/search (fallback)`).toEqual([]);

      const bar = page.getByRole("combobox");
      await bar.focus();
      await bar.fill(ui === "en" ? "bereishis" : "בראשית");
      await expect(page.locator("[role=listbox]")).toBeVisible();
      expect(await axeViolations(page), `${ui} command bar open`).toEqual([]);
    });
  }
});

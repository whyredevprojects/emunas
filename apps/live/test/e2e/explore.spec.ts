/**
 * W4.1 acceptance in a real browser (integration-plan §8 W4.1, run by W5.1):
 * - facet counts match a brute-force reference computed here from `corpus.json` (no app code);
 * - filtering takes < 5 ms in the facet worker (the page reports each query's time);
 * - URL state round-trips: a filter set by clicking lands in the URL, and opening that URL fresh
 *   shows the same selection and the same count; back walks through filter changes;
 * - the Years lens's undated lane equals the shiurim without years; the Connections lens hides
 *   every edge with fewer than 5 shared shiurim (also when the entity file carries one);
 * - keyboard: a facet value toggles with Space; lens links and lens buttons are reachable with Tab;
 * - axe is clean on every lens in en and yi.
 *
 * `@data`: every expectation comes from the served `/data/*`, so this also runs on a real-data build.
 */
import { expect, test, type Page } from "@playwright/test";
import { axeBudget, axeViolations, corpusRows, dataJson, entityRows, NO_SERVICE_WORKER, pageErrors, ready, UIS, type EntityRow } from "./helpers.ts";

test.use(NO_SERVICE_WORKER);

const UNDATED = "unknown";

function bucket(seconds: number): string {
  const m = seconds / 60;
  return m < 30 ? "lt30" : m < 60 ? "30to60" : m < 90 ? "60to90" : "gte90";
}

/** Independent reference for the facet values of a row (tech-live §4.3 semantics). */
function values(r: EntityRow, facet: string): string[] {
  switch (facet) {
    case "lang":
      return [r.lang];
    case "category":
      return [r.category];
    case "occasion":
      return [...new Set([r.parsha, r.zman].filter((x): x is string => x !== null))];
    case "series":
      return r.series ? [r.series.id] : [];
    case "work":
      return r.entities.works;
    case "person":
      return r.entities.people;
    case "concept":
      return r.entities.concepts;
    case "duration":
      return [bucket(r.duration)];
    case "stories":
      return [r.counts.stories > 0 ? "yes" : "no"];
    case "ai":
      return [r.status];
    case "catalogued":
      return [r.derived === "catalog" ? "catalogued" : "uncatalogued"];
    case "year":
      return r.years.length === 0 ? [UNDATED] : r.years.map(String);
    default:
      throw new Error(facet);
  }
}

/** Disjunctive counts for `facet` with every *other* selected facet applied (OR within, AND across). */
function referenceCounts(rows: readonly EntityRow[], facet: string, selected: Record<string, string[]>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const passes = Object.entries(selected).every(
      ([f, vs]) => f === facet || vs.length === 0 || values(r, f).some((v) => vs.includes(v)),
    );
    if (!passes) continue;
    for (const v of values(r, facet)) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

/** The counts the page shows for a facet's visible values. */
async function shownCounts(page: Page, facet: string): Promise<Map<string, number>> {
  const items = await page
    .locator(`fieldset[data-facet="${facet}"] li[data-value]`)
    .evaluateAll((lis) => lis.map((li) => [li.getAttribute("data-value")!, Number(li.getAttribute("data-count"))] as const));
  return new Map(items);
}

/**
 * Opens Explore's facet view. Explore opens on the topic map (C.2 "The map"); the facets, lenses and
 * results are one tap behind it (`view=browse`, implied by any filter, lens or list setting).
 */
async function openExplore(page: Page, query = "", ui = "en"): Promise<void> {
  await page.goto(`/${ui}/explore${query === "" ? "?view=browse" : query}`);
  await ready(page);
  await expect(page.getByTestId("explore-status")).not.toHaveText("", { timeout: 15_000 });
}

const total = (page: Page) => page.getByTestId("explore-status").getAttribute("data-total").then(Number);

test.describe("@data facets", () => {
  test("facet counts equal a brute-force reference, with and without a filter", async ({ page, request }) => {
    const rows = await entityRows(request);
    const errors = pageErrors(page);
    await openExplore(page);
    expect(await total(page)).toBe(rows.length);

    const fixedFacets = ["lang", "category", "duration", "stories", "ai", "catalogued"];
    for (const facet of fixedFacets) {
      const ref = referenceCounts(rows, facet, {});
      const shown = await shownCounts(page, facet);
      expect(shown.size, facet).toBeGreaterThan(0);
      for (const [v, n] of shown) expect(n, `${facet}=${v}`).toBe(ref.get(v) ?? 0);
    }
    // Data-keyed facets show a preview; every shown value must still be exact.
    for (const facet of ["occasion", "series", "work", "person", "concept"]) {
      const ref = referenceCounts(rows, facet, {});
      for (const [v, n] of await shownCounts(page, facet)) expect(n, `${facet}=${v}`).toBe(ref.get(v) ?? 0);
    }

    // Select the most common category: the other facets narrow, the category facet does not.
    const byCat = referenceCounts(rows, "category", {});
    const [cat] = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const catBox = page.locator(`fieldset[data-facet="category"] li[data-value="${cat}"] input`);
    await catBox.click();
    await expect(catBox).toBeChecked();
    await expect(page).toHaveURL(new RegExp(`[?&]kind=${cat}(&|$)`));
    await expect.poll(() => total(page)).toBe(byCat.get(cat));
    const sel = { category: [cat] };
    for (const facet of ["lang", "category", "ai", "duration", "stories"]) {
      const ref = referenceCounts(rows, facet, sel);
      const shown = await shownCounts(page, facet);
      for (const [v, n] of shown) expect(n, `${facet}=${v} | kind=${cat}`).toBe(ref.get(v) ?? 0);
    }
    // The year facet's undated count, under the same filter.
    const undated = referenceCounts(rows, "year", sel).get(UNDATED) ?? 0;
    await expect(page.locator('fieldset[data-facet="year"] label').filter({ has: page.locator("input[type=checkbox]") })).toContainText(
      String(undated),
    );
    expect(errors).toEqual([]);
  });

  test("filtering takes less than 5 ms in the facet worker", async ({ page, request }) => {
    const rows = await entityRows(request);
    const langs = [...new Set(rows.map((r) => r.lang))].sort();
    const cats = [...referenceCounts(rows, "category", {}).keys()].sort();
    const queries = ["?view=browse", `?kind=${cats[0]}`, `?kind=${cats[0]}&ai=full`, `?audio=${langs[0]}&dur=gte90`, "?y=undated", "?stories=yes"];
    const times: number[] = [];
    await openExplore(page);
    // Three passes: the first warms the worker's JIT (and is not measured); each query's time is the
    // best of the other two, so a CPU shared with parallel test workers does not decide the result.
    const PASSES = 3;
    for (const q of Array.from({ length: PASSES }, () => queries).flat()) {
      // Client-side navigation: the worker is already warm, as when someone clicks a facet.
      await page.evaluate(async (to) => {
        const w = window as unknown as { __reactRouterDataRouter: { navigate(to: string): Promise<void> } };
        await w.__reactRouterDataRouter.navigate(to);
      }, `/en/explore${q}`);
      await expect(page.getByTestId("explore-status")).not.toHaveText("");
      await page.waitForTimeout(50);
      times.push(Number(await page.getByTestId("explore-status").getAttribute("data-ms")));
    }
    for (const ms of times) expect(ms).toBeGreaterThanOrEqual(0);
    const n = queries.length;
    const best = queries.map((_, i) => Math.min(...Array.from({ length: PASSES - 1 }, (_, p) => times[(p + 1) * n + i]!)));
    const note = `cold: ${times.slice(0, n).join(", ")}; best warm: ${best.join(", ")}`;
    expect(Math.max(...best), `per-query ms (${note})`).toBeLessThan(5);
  });

  test("URL state round-trips: click → URL → fresh load shows the same selection; back undoes it", async ({ page, request }) => {
    const rows = await entityRows(request);
    await openExplore(page);
    const ai = referenceCounts(rows, "ai", {});
    const value = (ai.get("full") ?? 0) > 0 ? "full" : "catalog-only";
    const aiBox = page.locator(`fieldset[data-facet="ai"] li[data-value="${value}"] input`);
    await aiBox.click();
    await expect(aiBox).toBeChecked();
    const dur = [...referenceCounts(rows, "duration", { ai: [value] }).entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const durBox = page.locator(`fieldset[data-facet="duration"] li[data-value="${dur}"] input`);
    await durBox.click();
    await expect(durBox).toBeChecked();
    await page.locator("[data-lens-link=years]").click();
    await expect(page).toHaveURL(/lens=years/);
    const url = page.url();
    expect(new URL(url).searchParams.getAll("ai")).toEqual([value]);
    expect(new URL(url).searchParams.getAll("dur")).toEqual([dur]);
    const expected = rows.filter((r) => r.status === value && bucket(r.duration) === dur).length;
    await expect.poll(() => total(page)).toBe(expected);

    // Fresh load of the same URL: same selection, same lens, same total.
    const other = await page.context().newPage();
    await other.goto(url);
    await ready(other);
    await expect(other.getByTestId("explore-status")).not.toHaveText("", { timeout: 15_000 });
    await expect(other.locator(`fieldset[data-facet="ai"] li[data-value="${value}"] input`)).toBeChecked();
    await expect(other.locator(`fieldset[data-facet="duration"] li[data-value="${dur}"] input`)).toBeChecked();
    await expect(other.locator("[data-lens-link=years]")).toHaveAttribute("aria-current", "true");
    expect(await total(other)).toBe(expected);
    await other.close();

    // Back: the lens, then the duration filter, come off again.
    await page.goBack();
    await expect(page).not.toHaveURL(/lens=years/);
    await page.goBack();
    await expect(page).not.toHaveURL(/dur=/);
    await expect(page.locator(`fieldset[data-facet="duration"] li[data-value="${dur}"] input`)).not.toBeChecked();
  });
});

test.describe("@data lenses", () => {
  test("the Years lens's undated lane equals the shiurim without years", async ({ page, request }) => {
    const rows = await entityRows(request);
    const undated = rows.filter((r) => r.years.length === 0).length;
    await openExplore(page, "?lens=years");
    const lane = page.locator('[data-lens=years] [data-year="undated"]');
    await expect(lane).toHaveAttribute("data-count", String(undated));
    // every dated bar equals the reference for its year
    const ref = referenceCounts(rows, "year", {});
    const bars = await page
      .locator("[data-lens=years] [data-bars] [data-year]")
      .evaluateAll((els) => els.map((e) => [e.getAttribute("data-year")!, Number(e.getAttribute("data-count"))] as const));
    expect(bars.length).toBeGreaterThan(0);
    for (const [y, n] of bars) expect(n, y).toBe(ref.get(y) ?? 0);
    // Choosing the lane filters to exactly those shiurim.
    await lane.click();
    await expect(page).toHaveURL(/y=undated/);
    await expect.poll(() => total(page)).toBe(undated);
  });

  test("the Connections lens hides every edge with fewer than 5 shared shiurim", async ({ page, request }) => {
    const rows = await entityRows(request);
    // The person who appears in the most shiurim is the centre.
    const people = referenceCounts(rows, "person", {});
    const top = [...people.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    test.skip(!top, "no person in this data");
    const key = top![0];
    const entity = await dataJson<{ related: { kind: string; key: string; shared: number }[] }>(
      request,
      `entity/p/${encodeURIComponent(key)}.json`,
    );
    // Plant a weak edge (4 shared) next to the real ones: it must not be drawn or listed.
    const planted = { kind: "c", key: "planted-weak-edge", shared: 4 };
    await page.route(`**/data/entity/p/${encodeURIComponent(key)}.json`, async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as typeof entity;
      await route.fulfill({ response: res, json: { ...body, related: [...body.related, planted] } });
    });
    await openExplore(page, `?lens=connections&center=${encodeURIComponent(`p:${key}`)}`);
    await expect(page.locator(`[data-lens=connections][data-center="p:${key}"]`)).toBeVisible();
    const expected = entity.related
      .filter((r) => r.shared >= 5 && !(r.kind === "p" && r.key === key))
      .map((r) => `${r.kind}:${r.key}`)
      .sort();
    if (expected.length === 0) {
      await expect(page.getByTestId("connections-none")).toBeVisible();
    } else {
      await expect(page.getByTestId("connections-list").locator("li[data-edge]")).toHaveCount(expected.length);
    }
    const listed = await page.locator("[data-testid=connections-list] li[data-edge]").evaluateAll((els) => els.map((e) => e.getAttribute("data-edge")!));
    expect(listed.sort()).toEqual(expected);
    const shared = await page.locator("svg [data-edge]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-shared"))));
    for (const n of shared) expect(n).toBeGreaterThanOrEqual(5);
    await expect(page.locator('[data-edge="c:planted-weak-edge"]')).toHaveCount(0);
  });
});

test.describe("keyboard", () => {
  test("a facet value toggles with Space; lens links are reachable and followed with Enter", async ({ page }) => {
    await openExplore(page);
    const box = page.locator('fieldset[data-facet="ai"] li[data-value] input').first();
    const value = await box.evaluate((el) => el.closest("li")!.getAttribute("data-value")!);
    await box.focus();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(new RegExp(`[?&]ai=${value}`));
    await expect(box).toBeFocused();
    await expect(box).toBeChecked();
    await expect.poll(() => total(page)).toBeLessThanOrEqual((await corpusRows(page.request)).length);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Space");
    await expect(box).not.toBeChecked();
    await expect(page).not.toHaveURL(/[?&]ai=/);

    // Tab forward from the page heading until the Luach lens link has focus.
    await page.locator("main h1").focus();
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      await page.keyboard.press("Tab");
      found = await page.evaluate(() => document.activeElement?.getAttribute("data-lens-link") === "luach");
    }
    expect(found, "the Luach lens link is reachable with Tab").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/lens=luach/);
    // The Luach's stops are buttons in the tab order (or roving), each with a name.
    const stop = page.locator("[data-lens=luach] [data-stop]").first();
    await expect(stop).toBeVisible();
    expect(await stop.getAttribute("aria-label")).toBeTruthy();
  });
});

test.describe("accessibility", () => {
  for (const ui of UIS) {
    test(`axe is clean on every lens and the moments unit (${ui})`, async ({ page }) => {
      const lenses = ["", "?lens=luach", "?lens=years", "?lens=connections", "?unit=moments"];
      axeBudget(1 + lenses.length);
      // The topic map Explore opens on.
      await page.goto(`/${ui}/explore`);
      await ready(page);
      await expect(page.getByTestId("topic-map")).toBeVisible({ timeout: 15_000 });
      expect(await axeViolations(page), `${ui}/explore (map)`).toEqual([]);
      for (const q of lenses) {
        await openExplore(page, q, ui);
        if (q === "?unit=moments") await expect(page.getByTestId("moments-progress")).toHaveCount(0, { timeout: 15_000 });
        expect(await axeViolations(page), `${ui}/explore${q}`).toEqual([]);
      }
    });
  }
});

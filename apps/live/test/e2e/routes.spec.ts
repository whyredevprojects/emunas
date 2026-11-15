/**
 * W5.1 gates over the whole Live route table, in a real browser:
 * - internal link crawler: breadth-first from Today, Explore, Seforim, Maasios and Series in both UI
 *   languages; every in-app link on every visited page must resolve (shiur in corpus.json; entity,
 *   work and series data file present), and every visited page must render its own content, not the
 *   "page not found" view, without an uncaught error;
 * - axe on the first page of every route type the crawl reaches, in en and yi.
 *
 * `@data`: runs on the fixtures and on a real-data build (`LIVE_E2E_DATA=build`), where the crawl is
 * capped per language so the run stays within a few minutes.
 */
import { expect, test, type Page } from "@playwright/test";
import { axeViolations, LinkResolver, NO_SERVICE_WORKER, pageErrors, REAL_DATA, settled, UIS } from "./helpers.ts";

test.use(NO_SERVICE_WORKER);

const MAX_PAGES = REAL_DATA ? 45 : 80;

/** Route type of an in-app path (`s`, `p`, `seforim/work`, …), or null for paths the crawl skips. */
function routeType(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 1) return "today";
  const [, kind, , extra] = parts;
  if (kind === "shelf" || kind === "pl") return null; // personal pages: shelf.spec.ts
  if (kind === "seforim") return parts.length === 2 ? "seforim" : extra === undefined ? "seforim/work" : "seforim/chapter";
  if (kind === "series") return parts.length === 2 ? "series" : "series/one";
  return kind ?? null;
}

async function notFoundTitle(page: Page, ui: string): Promise<string> {
  await page.goto(`/${ui}/this-page-does-not-exist`);
  await settled(page);
  return (await page.locator("main h1").innerText()).trim();
}

for (const ui of UIS) {
  test(`@data crawl (${ui}): every in-app link resolves and every page renders`, async ({ page, request }) => {
    test.setTimeout(REAL_DATA ? 300_000 : 180_000);
    const resolver = await LinkResolver.create(request);
    const notFound = await notFoundTitle(page, ui);
    const errors = pageErrors(page);

    const start = [`/${ui}/?date=2026-10-06`, `/${ui}/explore`, `/${ui}/seforim`, `/${ui}/maasios`, `/${ui}/series`];
    const queue = [...start];
    const seen = new Set(queue.map((p) => new URL(p, "http://x").pathname));
    const axed = new Set<string>();
    const broken: string[] = [];
    let visited = 0;
    // Visit route types round-robin so a capped crawl still reaches every kind of page.
    const byType = new Map<string, string[]>();

    while (visited < MAX_PAGES) {
      let next = queue.shift();
      if (next === undefined) {
        const lane = [...byType.values()].find((l) => l.length > 0);
        if (!lane) break;
        next = lane.shift()!;
      }
      const path = next;
      await page.goto(path);
      await settled(page);
      visited++;
      const h1 = (await page.locator("main h1").first().innerText()).trim();
      expect(h1, `${path} renders the not-found view`).not.toBe(notFound);

      for (const why of await resolver.broken(page)) broken.push(`${path}: ${why}`);

      const type = routeType(new URL(path, "http://x").pathname);
      if (type && !axed.has(type)) {
        axed.add(type);
        expect(await axeViolations(page), `axe ${path}`).toEqual([]);
      }

      const hrefs = await page
        .locator("main a[href^='/'], nav a[href^='/']")
        .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!))]);
      for (const h of hrefs) {
        const u = new URL(h, "http://x");
        if (!u.pathname.startsWith(`/${ui}/`) && u.pathname !== `/${ui}`) continue;
        if (seen.has(u.pathname)) continue;
        const t = routeType(u.pathname);
        if (t === null) continue;
        seen.add(u.pathname);
        const lane = byType.get(t) ?? [];
        lane.push(u.pathname + u.search);
        byType.set(t, lane);
      }
      // Next from the least-visited lane.
      const lanes = [...byType.entries()].filter(([, l]) => l.length > 0);
      if (lanes.length > 0 && queue.length === 0) {
        const [t, lane] = lanes.sort((a, b) => (axed.has(a[0]) ? 1 : 0) - (axed.has(b[0]) ? 1 : 0))[0]!;
        queue.push(lane.shift()!);
        byType.set(t, lane);
      }
    }

    expect(broken).toEqual([]);
    expect(errors).toEqual([]);
    // The crawl reached every content route type.
    for (const t of ["today", "explore", "seforim", "seforim/work", "maasios", "series", "s", "p", "o"]) {
      expect([...axed], `route type ${t} reached`).toContain(t);
    }
  });
}

test("the link resolver catches planted broken links (self-test)", async ({ page, request }) => {
  const resolver = await LinkResolver.create(request);
  await page.goto("/en/seforim");
  await settled(page);
  expect(await resolver.broken(page)).toEqual([]);
  const planted = ["/en/s/no-such-shiur", "/en/p/no-such-person", "/en/seforim/no-such-work/1", "/en/series/no-such-series", "/en/nowhere/x"];
  await page.evaluate((hrefs) => {
    for (const href of hrefs) {
      const a = document.createElement("a");
      a.setAttribute("href", href);
      a.textContent = href;
      document.querySelector("main")!.append(a);
    }
  }, planted);
  const broken = await resolver.broken(page);
  expect(broken).toHaveLength(planted.length);
  for (const k of ["no-such-shiur", "no-such-person", "no-such-work", "no-such-series", "nowhere"]) {
    expect(broken.some((b) => b.includes(k)), k).toBe(true);
  }
});

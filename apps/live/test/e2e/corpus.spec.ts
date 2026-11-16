/**
 * C3.8: the corpus-layer pages of Live in a real browser (corpus-wave-plan C3.8 (1), concept-live-
 * corpus C.1, C.2, C.4, E.3):
 * - Explore opens on the topic map: the level-1 topics of `topics.json` as tiles, most shiurim first;
 *   a tile opens to its level-2 topics and links to its topic page;
 * - a topic page shows the topic's label, its visible count and the AI label once, and every link on
 *   it resolves;
 * - the topic mix starts playback (the dock reaches "playing");
 * - a thread page shows its label and summary under the AI label, lists its members linking to their
 *   shiurim, and is noindex with no canonical (D8);
 * - a story page's telling switcher plays the telling chosen, and marks it as the current one;
 * - an unknown topic, thread, story, concept or person id is "not found", with no page error.
 *
 * `@data`: every expectation comes from the served `/data/*` files, so the same spec runs on the
 * contract fixtures and on a real-data build (`LIVE_E2E_DATA=build`, after `npm run site:chain`).
 * The thread test needs a thread page in the data; the committed fixtures have none, so it runs on
 * real data only (as the other data-dependent specs do, the skip names the reason).
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { dataJson, dock, NO_SERVICE_WORKER, pageErrors, serveSilentMedia, settled } from "./helpers.ts";

test.use(NO_SERVICE_WORKER);

interface L {
  en: string;
  yi: string;
}
type TopicRow = [id: string, parentId: string | null, en: string, yi: string, he: string | null, count: number];
interface TopicFile {
  id: string;
  label: L;
  count: number;
  reviewed: boolean;
  threads: { id: string; label: L; shiurCount: number; page: boolean }[];
  stories: { id: string; title: L; tellings: number; page: boolean }[];
  moments: { shiurId: string }[];
  momentTotal: number;
}
interface ThreadFile {
  id: string;
  label: L;
  summary: L;
  reviewed: boolean;
  members: { shiurId: string; momentId: string }[];
}
interface StoryFile {
  id: string;
  title: L;
  tellings: { shiurId: string; momentId: string; t: number | null; lang: "en" | "yi" }[];
}
interface StoriesIndexFile {
  stories: { id: string; tellings: number; page: boolean }[];
}

/** The English text a `Text` shows for an `L` (English, else the Yiddish fallback). */
const en = (l: L) => (l.en.trim() !== "" ? l.en.trim() : l.yi.trim());

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await settled(page);
}

async function topicTree(request: APIRequestContext): Promise<TopicRow[]> {
  return (await dataJson<{ topics: TopicRow[] }>(request, "topics.json")).topics;
}

/** Topic files, largest topics first, up to `n`. */
async function bigTopics(request: APIRequestContext, n: number): Promise<TopicFile[]> {
  const rows = [...(await topicTree(request))].sort((a, b) => b[5] - a[5]).slice(0, n);
  const out: TopicFile[] = [];
  for (const r of rows) {
    const res = await request.get(`/data/topic/${encodeURIComponent(r[0])}.json`);
    if (res.ok()) out.push((await res.json()) as TopicFile);
  }
  return out;
}

test.describe("@data topic map and topic pages", () => {
  test("Explore opens on the level-1 topics, most shiurim first; a tile opens to its children and its page", async ({ page, request }) => {
    const tree = await topicTree(request);
    const roots = tree.filter((r) => r[1] === null);
    expect(roots.length).toBeGreaterThan(0);
    const errors = pageErrors(page);
    await open(page, "/en/explore");
    const map = page.getByTestId("topic-map");
    await expect(map).toBeVisible();
    const tiles = map.locator("li[data-tile]");
    await expect(tiles).toHaveCount(roots.length);
    const counts = await tiles.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-count"))));
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    const firstId = await tiles.first().getAttribute("data-tile");
    const first = roots.find((r) => r[0] === firstId)!;
    expect(first, "the first tile is a level-1 topic").toBeDefined();
    expect(Number(await tiles.first().getAttribute("data-count"))).toBe(first[5]);

    await tiles.first().locator("button").click();
    await expect(tiles.first()).toHaveAttribute("data-open", "true");
    const kids = tree.filter((r) => r[1] === firstId).map((r) => r[0]);
    await expect(tiles.first().locator("li[data-child]")).toHaveCount(kids.length);
    await tiles.first().locator(`a[data-topic-page="${firstId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/en/t/${firstId}$`, "u"));
    await settled(page);
    await expect(page.locator("main h1")).toContainText(first[2].trim() || first[3].trim());
    expect(errors).toEqual([]);
  });

  test("a topic page shows its label, visible count and the AI label once; its links resolve", async ({ page, request }) => {
    const [topic] = await bigTopics(request, 1);
    expect(topic, "a topic file").toBeDefined();
    const errors = pageErrors(page);
    for (const ui of ["en", "yi"] as const) {
      const path = `/${ui}/t/${encodeURIComponent(topic!.id)}`;
      await open(page, path);
      await expect(page.locator(`main [data-topic="${topic!.id}"]`)).toBeVisible();
      if (ui === "en") await expect(page.locator("main h1")).toContainText(en(topic!.label));
      await expect(page.getByTestId("topic-count")).toBeVisible();
      if (!topic!.reviewed) await expect(page.locator("main [data-corpus-label]")).toHaveCount(1);
      // Thread and story rows only link where there is a page (E.1: below threshold is a line).
      for (const th of topic!.threads) {
        const row = page.locator(`main [data-thread="${th.id}"]`);
        if ((await row.count()) === 0) continue;
        await expect(row.locator(`a[href$="/th/${encodeURIComponent(th.id)}"]`)).toHaveCount(th.page ? 1 : 0);
      }
    }
    // Every shiur link on the page is a shiur the data has.
    const corpus = await dataJson<{ shiurim: { id: string }[] }>(request, "corpus.json");
    const ids = new Set(corpus.shiurim.map((s) => s.id));
    const linked = await page.locator("main a[href*='/s/']").evaluateAll((as) =>
      as.map((a) => decodeURIComponent(new URL((a as HTMLAnchorElement).href).pathname.split("/")[3] ?? "")),
    );
    expect(linked.length).toBeGreaterThan(0);
    expect(linked.filter((id) => !ids.has(id))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("the topic mix starts playback", async ({ page, request, browserName }) => {
    // Playwright's WebKit on Linux leaves the stand-in media "loading" (see the matrix config).
    test.skip(browserName === "webkit", "stand-in media does not play in Playwright's WebKit on Linux");
    const topic = (await bigTopics(request, 5)).find((t) => t.momentTotal > 0);
    expect(topic, "a topic with a mix").toBeDefined();
    await serveSilentMedia(page);
    const errors = pageErrors(page);
    await open(page, `/en/t/${encodeURIComponent(topic!.id)}`);
    const mix = page.getByTestId("topic-mix");
    await expect(mix).toBeVisible();
    await mix.getByTestId("mix-play").click();
    await expect(dock(page)).toHaveAttribute("data-player-status", "playing", { timeout: 15_000 });
    expect(errors).toEqual([]);
  });
});

test.describe("@data threads and stories", () => {
  test("a thread page: label, summary and members under the AI label; noindex, no canonical", async ({ page, request }) => {
    let thread: ThreadFile | null = null;
    for (const t of await bigTopics(request, 12)) {
      const th = t.threads.find((x) => x.page);
      if (!th) continue;
      thread = await dataJson<ThreadFile>(request, `thread/${encodeURIComponent(th.id)}.json`);
      break;
    }
    test.skip(thread === null, "no thread page in this data (the contract fixtures have none)");
    const f = thread!;
    const errors = pageErrors(page);
    const path = `/en/th/${encodeURIComponent(f.id)}`;
    await open(page, path);
    await expect(page.locator("main h1")).toContainText(en(f.label));
    if (!f.reviewed) await expect(page.locator("main [data-corpus-label]")).toHaveCount(1);
    const members = new Set(f.members.map((m) => m.shiurId));
    expect(members.size).toBeGreaterThanOrEqual(3);
    const linked = new Set(
      await page.locator("main a[href*='/s/']").evaluateAll((as) =>
        as.map((a) => decodeURIComponent(new URL((a as HTMLAnchorElement).href).pathname.split("/")[3] ?? "")),
      ),
    );
    for (const id of members) expect(linked.has(id), `member ${id} linked`).toBe(true);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/u);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a story page's telling switcher plays the chosen telling", async ({ page, request, browserName }) => {
    const index = await dataJson<StoriesIndexFile>(request, "stories-index.json");
    const row = index.stories.filter((s) => s.page && s.tellings >= 2).sort((a, b) => b.tellings - a.tellings)[0];
    expect(row, "a story told at least twice").toBeDefined();
    const story = await dataJson<StoryFile>(request, `story/${encodeURIComponent(row!.id)}.json`);
    const errors = pageErrors(page);
    await serveSilentMedia(page);
    await open(page, `/en/maasios/${encodeURIComponent(story.id)}`);
    await expect(page.locator("main h1")).toContainText(en(story.title));
    const tellings = page.getByTestId("story-tellings").locator("> li[data-telling]");
    await expect(tellings).toHaveCount(story.tellings.length);
    // Language is a property of each telling (F.1): every row says which.
    const langs = await tellings.evaluateAll((els) => els.map((e) => e.getAttribute("data-lang")));
    expect(langs).toEqual(story.tellings.map((t) => t.lang));

    const playable = story.tellings.map((t, i) => ({ t, i })).filter((x) => x.t.t !== null);
    const pick = playable[1] ?? playable[0];
    expect(pick, "a telling with a time").toBeDefined();
    const target = tellings.nth(pick!.i);
    await target.locator("button[data-action=play-telling]").click();
    await expect(target).toHaveAttribute("aria-current", "true");
    await expect(target.locator("button[data-action=play-telling]")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('main li[data-telling][aria-current="true"]')).toHaveCount(1);
    if (browserName !== "webkit") {
      await expect(dock(page)).toHaveAttribute("data-player-status", "playing", { timeout: 15_000 });
    }
    expect(errors).toEqual([]);
  });
});

test.describe("@data unknown ids", () => {
  for (const [kind, path] of [
    ["topic", "/en/t/no-such-topic-anywhere"],
    ["thread", "/en/th/no-such-thread-anywhere"],
    ["story", "/en/maasios/no-such-story-anywhere"],
    ["concept", "/en/c/no-such-concept-anywhere"],
    ["person", "/en/p/no-such-person-anywhere"],
  ] as const) {
    test(`an unknown ${kind} id is not found`, async ({ page }) => {
      const errors = pageErrors(page);
      await open(page, path);
      await expect(page.locator("main")).toContainText(/There is no page at this address|Page not found/u);
      expect(errors).toEqual([]);
    });
  }
});

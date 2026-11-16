/**
 * C3.8: the corpus-layer pages of Live in a real browser (corpus-wave-plan C3.8 (1), concept-live-
 * corpus C.1, C.2, C.4, E.3):
 * - Explore opens on the topic map: the level-1 topics of `topics.json` as tiles, most shiurim first;
 *   a tile opens to its level-2 topics and links to its topic page;
 * - a topic page shows the topic's label, its visible count and the AI label once, and every link on
 *   it resolves;
 * - the topic mix starts playback (the dock reaches "playing");
 * - a thread page (C3.3) shows its heading, label and summary under the AI label, the count of its
 *   shiurim and its topic links, every member once on the year line (or a plain list) linking to its
 *   moment, plays the thread, and is noindex with no canonical (D8);
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
  topics: { id: string; label: L }[];
  members: { shiurId: string; momentId: string; t: number | null; year: number | null; lang: "en" | "yi" }[];
  timeline: boolean;
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
  test("a thread page (C3.3): heading, label, AI label, summary, count, topics, members on the year line, play; noindex", async ({
    page,
    request,
    browserName,
  }) => {
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
    await serveSilentMedia(page);
    const path = `/en/th/${encodeURIComponent(f.id)}`;
    await open(page, path);
    const main = page.locator("main");
    await expect(main.locator(`article[data-thread="${f.id}"]`)).toHaveCount(1);

    // Heading ("A teaching the Rav returns to"), the cluster label, the AI label once, the summary.
    await expect(page.getByTestId("thread-heading")).toBeVisible();
    await expect(main.locator("h1")).toHaveCount(1);
    await expect(main.locator("h1")).toContainText(en(f.label));
    await expect(main.locator("[data-corpus-label]")).toHaveCount(f.reviewed ? 0 : 1);
    if (en(f.summary) !== "") await expect(main).toContainText(en(f.summary).slice(0, 60));

    // "In N shiurim": distinct member shiurim.
    const members = f.members;
    const shiurim = new Set(members.map((m) => m.shiurId));
    expect(shiurim.size).toBeGreaterThanOrEqual(3);
    await expect(page.getByTestId("thread-count")).toContainText(`In ${shiurim.size} shiurim`);

    // Its topics link to their topic pages.
    for (const t of f.topics) {
      await expect(page.getByTestId("thread-topics").locator(`a[data-topic-link="${t.id}"]`)).toHaveAttribute(
        "href",
        `/en/t/${encodeURIComponent(t.id)}`,
      );
    }

    // Every member is one row, on the year line (timeline) or a plain list as the build says; a row
    // links to its moment in the shiur, and its language is its own (never paired with another).
    const rows = page.getByTestId("thread-members").locator("li[data-member]");
    await expect(rows).toHaveCount(members.length);
    await expect(page.getByTestId("thread-members")).toHaveAttribute("data-layout", f.timeline ? "timeline" : "list");
    if (f.timeline) {
      const years = await page
        .getByTestId("thread-members")
        .locator("li[data-year]")
        .evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-year"))));
      expect(years.length).toBeGreaterThan(0);
      expect(years, "the year line runs earliest first").toEqual([...years].sort((a, b) => a - b));
    }
    for (const m of members) {
      const row = page.locator(`li[data-member="${m.momentId}"]`);
      await expect(row, m.momentId).toHaveCount(1);
      await expect(row).toHaveAttribute("data-lang", m.lang);
      const href = await row.locator(`a[data-moment="${m.momentId}"]`).getAttribute("href");
      const url = new URL(href!, "http://x.invalid");
      expect(decodeURIComponent(url.pathname), m.momentId).toBe(`/en/s/${m.shiurId}`);
      expect(url.searchParams.get("m"), m.momentId).toBe(m.momentId);
    }
    if (members.some((m) => m.year === null)) await expect(page.getByTestId("thread-undated")).toBeVisible();

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/u);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

    // "Play the thread" queues the timed members and starts playing.
    if (members.some((m) => m.t !== null)) {
      const play = page.getByTestId("thread-play").locator("button[data-action=play-thread]");
      await expect(play).toContainText(/Play the thread \(\d+ shiur(im)?\)/u);
      await play.click();
      await expect(page.getByTestId("thread-play").getByRole("status")).toContainText(/Playing \d+ parts? in the queue/u);
      if (browserName !== "webkit") await expect(dock(page)).toHaveAttribute("data-player-status", "playing", { timeout: 15_000 });
    }
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

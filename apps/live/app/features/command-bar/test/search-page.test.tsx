// @vitest-environment jsdom
/**
 * `/:ui/search?q=`: API results grouped by shiur with the matched field and client-side highlights;
 * paging; the labelled shiur-level fallback when offline or when the API fails; the allow-list (no text
 * beyond generated/catalog fields); URL state.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { apiResponse, apiResult, PLANTED, poisonedBody } from "./data.ts";
import { apiMock, jsonResponse, noAxeViolations, renderAt, setOnline, setup, sleep, teardown, waitForSelector } from "./harness.tsx";

afterEach(teardown);

const NOACH = "en-parsha-noach-01";
const LAG = "yi-zmanim-lag-01";

const page1 = apiResponse(
  [
    apiResult({ momentId: `${NOACH}~s0`, shiurId: NOACH }),
    apiResult({
      momentId: `${LAG}~i2`,
      shiurId: LAG,
      kind: "insight",
      matched: "semantic",
      t: 61,
      title: { en: null, yi: "די שמחה פון רבי שמעון" },
      snippet: null,
    }),
    apiResult({ momentId: `${NOACH}~wen3.1`, shiurId: NOACH, kind: "writeup", matched: "title", t: 1200, snippet: null }),
  ],
  "cursor_2",
);

const page2 = apiResponse([
  apiResult({
    momentId: `${LAG}~st0`,
    shiurId: LAG,
    kind: "story",
    t: 300,
    title: { en: "A story of the lion", yi: null },
    snippet: { text: "דער לייב", lang: "yi", marks: [[4, 8]] },
  }),
]);

function groups(): [string, string[]][] {
  return [...document.querySelectorAll("[data-testid=search-results] > li")].map((g) => [
    g.getAttribute("data-shiur")!,
    [...g.querySelectorAll("[data-moment]")].map((h) => h.getAttribute("data-moment")!),
  ]);
}

describe("search page", () => {
  it("shows API results grouped by shiur, with matched field, highlights and play links", async () => {
    const api = apiMock((url) => jsonResponse(url.searchParams.get("cursor") === "cursor_2" ? page2 : page1));
    setup(api);
    const { container } = await renderAt("/en/search?q=lion");
    await waitForSelector(container, "[data-testid=search-results][data-source=api]");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Search");
    expect(groups()).toEqual([
      [NOACH, [`${NOACH}~s0`, `${NOACH}~wen3.1`]],
      [LAG, [`${LAG}~i2`]],
    ]);
    // shiur title comes from the catalog (corpus.json), not from the API
    await waitFor(() => expect(container.querySelector(`[data-shiur="${NOACH}"] h2`)!.textContent).toBe("The Holiness of the Teivah"));
    const hit = container.querySelector(`[data-moment="${NOACH}~s0"]`)!;
    expect(hit.querySelector("a")!.getAttribute("href")).toBe(`/en/s/${NOACH}?t=754&m=${NOACH}~s0`);
    expect(hit.textContent).toContain("Matched: Chapter text");
    expect([...hit.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["lion"]);
    expect(hit.querySelector("p")!.getAttribute("lang")).toBe("en");
    // a write-up paragraph id is not a page moment id: the link carries the time only
    expect(container.querySelector(`[data-moment="${NOACH}~wen3.1"] a`)!.getAttribute("href")).toBe(`/en/s/${NOACH}?t=1200`);
    // English reading language, Yiddish-only title: shown in Yiddish with lang/dir
    const yiTitle = container.querySelector(`[data-moment="${LAG}~i2"] bdi`)!;
    expect(yiTitle.getAttribute("lang")).toBe("yi");
    expect(container.querySelector(`[data-moment="${LAG}~i2"]`)!.textContent).toContain("Insight, similar in meaning");
    expect(screen.getByTestId("search-status").textContent).toBe("3 moments in 2 shiurim");
    expect(container.textContent).toContain("Notes prepared by AI");
    await noAxeViolations();

    // paging
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "More results" }));
    });
    await waitFor(() => expect(groups()[1]![1]).toEqual([`${LAG}~i2`, `${LAG}~st0`]));
    expect(api.calls.map((u) => u.searchParams.get("cursor"))).toEqual([null, "cursor_2"]);
    expect(screen.queryByRole("button", { name: "More results" })).toBeNull();
  });

  it("passes the audio-language filter from settings", async () => {
    const api = apiMock(() => jsonResponse(apiResponse([])));
    setup(api);
    await renderAt("/en/search?q=lion&audio=yi");
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(0));
    expect(api.calls.at(-1)!.searchParams.get("audio")).toBe("yi");
    await waitFor(() => expect(screen.getByTestId("search-status").textContent).toBe("No results for “lion”."));
  });

  it("falls back to shiur-level results when the API fails, and says so", async () => {
    setup(apiMock(() => jsonResponse({ error: "internal" }, 503)));
    const { container } = await renderAt("/en/search?q=lag%20baomer");
    await waitForSelector(container, "[data-testid=search-results][data-source=fallback]");
    const notice = screen.getByTestId("fallback-notice");
    expect(notice.textContent).toContain("Showing shiur-level results");
    expect(notice.textContent).toContain("Full search is not available right now");
    expect(groups().map(([id]) => id)).toEqual([LAG]);
    expect(container.querySelector(`[data-shiur="${LAG}"]`)!.textContent).toContain("Matched: catalog title, parsha or occasion");
    await noAxeViolations();
  });

  it("offline: never calls the API and searches shiur titles and summaries", async () => {
    const api = apiMock(() => jsonResponse(apiResponse([])));
    setup(api);
    setOnline(false);
    const { container } = await renderAt("/en/search?q=tzaddikim");
    await waitForSelector(container, "[data-testid=search-results][data-source=fallback]");
    expect(screen.getByTestId("fallback-notice").textContent).toContain("You are offline");
    expect(groups().map(([id]) => id)).toEqual(["en-misc-kedushah-01"]);
    expect(container.textContent).toContain("The kedushah of tzaddikim and learning lishmah.");
    expect(api.calls).toEqual([]);
  });

  it("falls back on a malformed response too", async () => {
    setup(apiMock(() => jsonResponse({ results: [{ text: PLANTED.transcript }] })));
    const { container } = await renderAt("/en/search?q=teivah");
    await waitForSelector(container, "[data-testid=search-results][data-source=fallback]");
    expect(document.body.innerHTML).not.toContain(PLANTED.transcript);
  });

  it("renders nothing beyond the allowed response keys", async () => {
    setup(apiMock(() => jsonResponse(poisonedBody())));
    const { container } = await renderAt("/en/search?q=lion");
    await waitForSelector(container, "[data-testid=search-results][data-source=api]");
    const html = document.body.innerHTML;
    for (const p of Object.values(PLANTED)) expect(html).not.toContain(p);
    expect(container.querySelector("[data-testid=search-results] img")).toBeNull();
  });

  it("typing searches after idle and keeps the query in the URL; Enter searches at once", async () => {
    const api = apiMock(() => jsonResponse(apiResponse([])));
    setup(api);
    const { router } = await renderAt("/en/search");
    expect(screen.getByTestId("search-status").textContent).toContain("Type a word");
    const input = document.getElementById("search-q") as HTMLInputElement;
    expect(input.getAttribute("dir")).toBe("auto");
    await act(async () => {
      fireEvent.change(input, { target: { value: "לייב" } });
    });
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("q")).toBe("לייב"));
    await waitFor(() => expect(api.calls.map((u) => u.searchParams.get("q"))).toEqual(["לייב"]));
    await act(async () => {
      fireEvent.change(input, { target: { value: "ab" } });
    });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("q")).toBe("ab"));
    await sleep(50);
    expect(api.calls.map((u) => u.searchParams.get("q"))).toEqual(["לייב", "ab"]);
  });

  it("offers suggestions as links above the results", async () => {
    setup(apiMock(() => jsonResponse(apiResponse([]))));
    const { container } = await renderAt("/en/search?q=noach");
    const chips = await waitForSelector(container, "[data-testid=search-suggestions]");
    expect([...chips.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(
      expect.arrayContaining(["/en/o/noach", "/en/p/noach"]),
    );
  });

  it("loads corpus.json on the search route (shiur rows), and only there", async () => {
    const elsewhere = setup(apiMock(() => jsonResponse(apiResponse([]))));
    await renderAt("/en/");
    await sleep(30);
    expect(elsewhere.requests).not.toContain("/data/corpus.json");
    teardown();
    const data = setup(apiMock(() => jsonResponse(page1)));
    await renderAt("/en/search?q=lion");
    await waitFor(() => expect(data.requests).toContain("/data/corpus.json"));
  });

  it("entity suggestions link to the corpus routes and offer 'Search within'; filters use corpus ids", async () => {
    const api = apiMock(() => jsonResponse(apiResponse([])));
    setup(api);
    const { container, router } = await renderAt("/en/search?q=hester");
    const chips = await waitForSelector(container, "[data-testid=search-suggestions]");
    expect([...chips.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/en/t/hester-panim"]);
    // the corpus label, once
    expect(container.querySelectorAll("[data-testid=entity-label]")).toHaveLength(1);
    expect(screen.getByTestId("entity-label").textContent).toBe("Grouped and named by AI across all the shiurim. Not reviewed by a person.");
    const within = chips.querySelector("[data-filter='topic:hester-panim']") as HTMLButtonElement;
    expect(within.textContent).toBe("Search within Hester Panim and Suffering");
    await act(async () => {
      fireEvent.click(within);
    });
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("topic")).toBe("hester-panim"));
    await waitFor(() => expect(api.calls.at(-1)!.searchParams.get("topic")).toBe("hester-panim"));
    expect(api.calls.at(-1)!.searchParams.get("q")).toBe("hester");
    // the active filter is a chip labelled from the quick index, and the offer is gone
    const active = await waitForSelector(container, "[data-active-filter='topic:hester-panim']");
    expect(active.textContent).toContain("Topic: Hester Panim and Suffering");
    expect(chips.querySelector("[data-filter]")).toBeNull();
    await noAxeViolations();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove the filter Hester Panim and Suffering" }));
    });
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).has("topic")).toBe(false));
    await waitFor(() => expect(api.calls.at(-1)!.searchParams.has("topic")).toBe(false));
  });

  it("filters from the URL go to the API; invalid ids are dropped", async () => {
    const api = apiMock(() => jsonResponse(apiResponse([])));
    setup(api);
    const { container } = await renderAt("/en/search?q=emunah&person=baal-shem-tov&work=Bad%20Id");
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(0));
    const sp = api.calls.at(-1)!.searchParams;
    expect(sp.get("person")).toBe("baal-shem-tov");
    expect(sp.has("work")).toBe(false);
    const chip = await waitForSelector(container, "[data-active-filter='person:baal-shem-tov']");
    await waitFor(() => expect(chip.textContent).toContain("Person: the Baal Shem Tov"));
  });

  it("offline with a filter: the shiur-level fallback keeps only shiurim carrying the entity", async () => {
    setup(apiMock(() => jsonResponse(apiResponse([]))));
    setOnline(false);
    const { container } = await renderAt("/en/search?q=teivah&topic=hester-panim");
    await waitForSelector(container, "[data-testid=search-results][data-source=fallback]");
    expect(groups().map(([id]) => id)).toEqual([NOACH]);
    teardown();
    setup(apiMock(() => jsonResponse(apiResponse([]))));
    setOnline(false);
    const other = await renderAt("/en/search?q=tzaddikim&topic=hester-panim");
    await waitFor(() => expect(other.container.textContent).toContain("No results for “tzaddikim”."));
  });

  it("renders in Yiddish", async () => {
    setup(apiMock(() => jsonResponse(page1)));
    const { container } = await renderAt("/yi/search?q=lion");
    await waitForSelector(container, "[data-testid=search-results][data-source=api]");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("זוכן");
    expect(container.querySelector(`[data-moment="${LAG}~i2"]`)!.textContent).toContain("ענליך אין באדייט");
    // Yiddish reading language prefers the yi title
    expect(container.querySelector(`[data-moment="${NOACH}~s0"] bdi`)!.textContent).toBe("דער לייב האט געגעסן גראז");
    await noAxeViolations();
  });
});

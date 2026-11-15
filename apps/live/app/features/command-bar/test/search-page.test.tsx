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
    expect(container.textContent).toContain("Summary written by AI");
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

  it("renders in Yiddish", async () => {
    setup(apiMock(() => jsonResponse(page1)));
    const { container } = await renderAt("/yi/search?q=lion");
    await waitForSelector(container, "[data-testid=search-results][data-source=api]");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("זוכן");
    expect(container.querySelector(`[data-moment="${LAG}~i2"]`)!.textContent).toContain("ענלעך אין באדייט");
    // Yiddish reading language prefers the yi title
    expect(container.querySelector(`[data-moment="${NOACH}~s0"] bdi`)!.textContent).toBe("דער לייב האט געגעסן גראז");
    await noAxeViolations();
  });
});

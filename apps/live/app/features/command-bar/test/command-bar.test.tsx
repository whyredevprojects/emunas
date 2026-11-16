// @vitest-environment jsdom
/**
 * The command bar in the real shell: lazy loading on focus, instant suggestions without the network,
 * the idle full search, the labelled shiur-level fallback, keyboard use and the `/` shortcut.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { apiResponse, apiResult, dataServer, PLANTED, poisonedBody } from "./data.ts";
import { apiMock, jsonResponse, renderAt, setOnline, setup, sleep, teardown } from "./harness.tsx";

afterEach(teardown);

const lionHit = apiResult({ momentId: "en-parsha-noach-01~s0", shiurId: "en-parsha-noach-01" });

function bar(): HTMLInputElement {
  return screen.getByRole("combobox") as HTMLInputElement;
}

async function type(value: string) {
  await act(async () => {
    fireEvent.change(bar(), { target: { value } });
  });
}

function optionTexts(kind?: string): string[] {
  const list = document.getElementById(bar().getAttribute("aria-controls")!)!;
  return [...list.querySelectorAll(`[role=option]${kind ? `[data-kind=${kind}]` : ""}`)].map((o) => o.textContent ?? "");
}

describe("command bar", () => {
  it("is in the shell header on every page, with an RTL-capable input", async () => {
    setup(apiMock(() => jsonResponse(apiResponse([]))));
    await renderAt("/en/");
    const input = bar();
    expect(input.closest("header")).not.toBeNull();
    expect(input.getAttribute("dir")).toBe("auto");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("loads the quick index lazily, on first focus only", async () => {
    const data = setup(apiMock(() => jsonResponse(apiResponse([]))));
    await renderAt("/en/series");
    await sleep(50);
    expect(data.requests.filter((p) => p.includes("quick-index"))).toEqual([]);
    await act(async () => bar().focus());
    await waitFor(() => expect(data.requests).toContain("/data/quick-index.en.json"));
  });

  it("gives suggestions with the network off and labels the shiur-level fallback", async () => {
    const api = apiMock(() => jsonResponse(apiResponse([lionHit])));
    setup(api);
    await renderAt("/en/");
    setOnline(false); // the /data files still come from the service-worker cache (here: the data mock)
    await act(async () => bar().focus());
    await type("lag baomer");
    await waitFor(() => expect(optionTexts("suggestion").join(" ")).toContain("Lag BaOmer"));
    expect(bar().getAttribute("aria-expanded")).toBe("true");
    // after the idle delay the bar would ask the API; offline it falls back to shiur-level results
    await waitFor(() => expect(screen.getByTestId("fallback-label").textContent).toBe("Showing shiur-level results"));
    expect(optionTexts("shiur")).toEqual(["ל\"ג בעומר תשמ\"ג"]);
    expect(api.calls).toEqual([]);
  });

  it("falls back when the API fails", async () => {
    const api = apiMock(() => jsonResponse({ error: "internal" }, 500));
    setup(api);
    await renderAt("/en/");
    await act(async () => bar().focus());
    await type("teivah");
    await waitFor(() => expect(screen.getByTestId("fallback-label")).toBeTruthy());
    expect(optionTexts("shiur")).toEqual(["The Holiness of the Teivah"]);
    expect(api.calls).toHaveLength(1);
  });

  it("runs the full search after 250 ms idle with at least 3 characters", async () => {
    const api = apiMock(() => jsonResponse(apiResponse([lionHit])));
    setup(api);
    await renderAt("/en/");
    await act(async () => bar().focus());
    await type("li");
    await sleep(400);
    expect(api.calls).toHaveLength(0);
    await type("lio");
    await type("lion");
    await waitFor(() => expect(optionTexts("moment")).toHaveLength(1));
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]!.pathname).toBe("/api/search");
    expect(api.calls[0]!.searchParams.get("q")).toBe("lion");
    expect(api.calls[0]!.searchParams.get("ui")).toBe("en");
    expect(optionTexts("moment")[0]).toContain("The lion ate grass");
    expect(optionTexts("moment")[0]).toContain("Chapter text");
    expect(optionTexts("all")).toEqual(["All results for “lion”"]);
  });

  it("never renders text outside the allowed response keys", async () => {
    setup(apiMock(() => jsonResponse(poisonedBody())));
    await renderAt("/en/");
    await act(async () => bar().focus());
    await type("lion");
    await waitFor(() => expect(optionTexts("moment")).toHaveLength(1));
    const html = document.body.innerHTML;
    for (const p of Object.values(PLANTED)) expect(html).not.toContain(p);
    expect(document.querySelector("img")).toBeNull();
  });

  it("arrow keys move the active option; Enter opens it", async () => {
    setup(apiMock(() => jsonResponse(apiResponse([]))));
    const { router } = await renderAt("/en/");
    await act(async () => bar().focus());
    await type("noach");
    await waitFor(() => expect(optionTexts("suggestion").length).toBeGreaterThan(0));
    await act(async () => {
      fireEvent.keyDown(bar(), { key: "ArrowDown" });
    });
    const activeId = bar().getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    const active = document.getElementById(activeId!)!;
    expect(active.getAttribute("aria-selected")).toBe("true");
    const href = active.getAttribute("data-href")!;
    expect(href).toBe("/en/o/noach");
    await act(async () => {
      fireEvent.keyDown(bar(), { key: "Enter" });
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/en/o/noach"));
    expect(bar().value).toBe("");
  });

  it("Enter without a selection opens the search page; the last option is 'All results'", async () => {
    setup(apiMock(() => jsonResponse(apiResponse([]))));
    const { router } = await renderAt("/yi/");
    await act(async () => bar().focus());
    await type("תשובה");
    await act(async () => {
      fireEvent.keyDown(bar(), { key: "Enter" });
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/yi/search"));
    expect(new URLSearchParams(router.state.location.search).get("q")).toBe("תשובה");
  });

  it("Tanya 12 and a year are offered as jumps", async () => {
    setup(apiMock(() => jsonResponse(apiResponse([]))));
    await renderAt("/en/");
    await act(async () => bar().focus());
    await type("Tanya 12");
    await waitFor(() => expect(optionTexts("suggestion")[0]).toContain("perek 12"));
    await type("תשל\"ו");
    await waitFor(() => expect(optionTexts("suggestion")[0]).toContain("תשל\"ו (1975–76)"));
  });

  it("suggests corpus entities by id and links to their Live routes", async () => {
    setup(apiMock(() => jsonResponse(apiResponse([]))));
    await renderAt("/en/");
    await act(async () => bar().focus());
    await type("hester");
    await waitFor(() => expect(optionTexts("suggestion")).toHaveLength(1));
    const option = document.querySelector("[data-kind=suggestion]")!;
    expect(option.getAttribute("data-href")).toBe("/en/t/hester-panim");
    expect(option.textContent).toContain("Hester Panim and Suffering");
    expect(option.textContent).toContain("Topic · 2 shiurim");
    await type("the besht");
    await waitFor(() => expect(document.querySelector("[data-kind=suggestion]")?.getAttribute("data-href")).toBe("/en/p/baal-shem-tov"));
    // An ASR mishearing names nobody.
    await type("hashem tov");
    await sleep(20);
    expect(optionTexts("suggestion")).toEqual([]);
  });

  it("never loads corpus.json: the bar works from the quick index, facets and series files", async () => {
    const data = setup(apiMock(() => jsonResponse(apiResponse([]))));
    setOnline(false);
    await renderAt("/en/");
    await act(async () => bar().focus());
    await type("Tanya 12");
    await waitFor(() => expect(optionTexts("suggestion")[0]).toContain("perek 12"));
    await type("teivah");
    await waitFor(() => expect(optionTexts("shiur")).toEqual(["The Holiness of the Teivah"]));
    expect(data.requests).toContain("/data/quick-index.en.json");
    expect(data.requests).toContain("/data/series/tanya-yi.json");
    expect(data.requests).not.toContain("/data/corpus.json");
  });

  it("'/' focuses the bar, except while typing in another field", async () => {
    setup(apiMock(() => jsonResponse(apiResponse([]))));
    await renderAt("/en/search");
    (document.activeElement as HTMLElement | null)?.blur();
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "/" });
    });
    expect(document.activeElement).toBe(bar());
    const pageInput = document.getElementById("search-q") as HTMLInputElement;
    await act(async () => pageInput.focus());
    await act(async () => {
      fireEvent.keyDown(pageInput, { key: "/" });
    });
    expect(document.activeElement).toBe(pageInput);
  });

  it("Escape closes the list, a second Escape clears the field", async () => {
    setup(apiMock(() => jsonResponse(apiResponse([]))), dataServer());
    await renderAt("/en/");
    await act(async () => bar().focus());
    await type("noach");
    expect(bar().getAttribute("aria-expanded")).toBe("true");
    await act(async () => {
      fireEvent.keyDown(bar(), { key: "Escape" });
    });
    expect(bar().getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      fireEvent.keyDown(bar(), { key: "Escape" });
    });
    expect(bar().value).toBe("");
  });
});

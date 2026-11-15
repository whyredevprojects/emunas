// @vitest-environment jsdom
/**
 * The series pages in the real route tree. Data: the W2.4 fixture files, with `tanya-yi` given an
 * English sibling and a few more (shuffled) parts so ordering, the perek view and the side-by-side
 * view have something to show.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureData, LIVE_DATA_SCHEMA_VERSION, resetDataConfig, type DataFetch, type FacetsFile, type SeriesFile, type SeriesPart } from "../../today/live-data.ts";
import { facetsFixture, fixtureFetch } from "../../today/test/fixtures.ts";
import { settingsStore } from "../../../shell/settings.ts";
import { createTestRouter } from "../../../shell/test-router.tsx";
import { registerProgressSource } from "../../today/personal.ts";

function part(shiurId: string, order: number, perek: string | null, oneLiner = true): SeriesPart {
  return {
    shiurId,
    order,
    perek,
    title: `Title ${shiurId}`,
    oneLiner: oneLiner ? { en: `About ${shiurId}`, yi: `וועגן ${shiurId}` } : null,
    duration: 1800,
    years: [5760],
    status: oneLiner ? "full" : "catalog-only",
  };
}

const TANYA_YI: SeriesFile = {
  schemaVersion: LIVE_DATA_SCHEMA_VERSION,
  id: "tanya-yi",
  title: { en: "Tanya (Yiddish)", yi: "ספר התניא" },
  lang: "yi",
  sibling: "tanya-en",
  // deliberately out of order
  parts: [part("yi-tanya-1-03", 3, "י\"א וי\"ב"), part("yi-tanya-1-01", 1, "הקדמה", false), part("yi-tanya-1-02", 2, "א")],
  perekGroups: [],
};

const TANYA_EN: SeriesFile = {
  schemaVersion: LIVE_DATA_SCHEMA_VERSION,
  id: "tanya-en",
  title: { en: "Tanya (English)", yi: "ספר התניא" },
  lang: "en",
  sibling: "tanya-yi",
  parts: [part("en-tanya-02", 2, "י\"ב"), part("en-tanya-01", 1, "א"), part("en-tanya-03", 3, null)],
  perekGroups: [],
};

const FACETS: FacetsFile = {
  ...(facetsFixture as unknown as FacetsFile),
  series: {
    "tanya-yi": { label: { en: "Tanya (Yiddish)", yi: "ספר התניא" }, count: 3, lang: "yi", sibling: "tanya-en" },
    "emunah-yi": { label: { en: "Emunah (Yiddish)", yi: "אמונה" }, count: 27, lang: "yi", sibling: null },
    "tanya-en": { label: { en: "Tanya (English)", yi: "ספר התניא" }, count: 3, lang: "en", sibling: "tanya-yi" },
  },
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const dataFetch: DataFetch = async (input, init) => {
  const path = new URL(input, "http://x.invalid").pathname;
  if (path === "/data/series/tanya-yi.json") return json(TANYA_YI);
  if (path === "/data/series/tanya-en.json") return json(TANYA_EN);
  if (path === "/data/facets.json") return json(FACETS);
  return fixtureFetch(input, init);
};

let restore: () => void = () => {};

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  configureData({ fetch: dataFetch });
  settingsStore.getState().reset();
});

afterEach(() => {
  cleanup();
  restore();
  restore = () => {};
  resetDataConfig();
});

async function renderAt(path: string, ready: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await act(async () => {});
  await waitFor(() => expect(utils.container.querySelector(ready)).not.toBeNull());
  return { router, ...utils };
}

const shiurIds = (root: Element) => [...root.querySelectorAll("a[data-shiur]")].map((a) => a.getAttribute("data-shiur"));

async function noAxeViolations(): Promise<void> {
  const result = await axe.run(document, { rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

describe("series index", () => {
  it("lists every series, siblings on one row", async () => {
    const { container } = await renderAt("/en/series", "[data-testid=series-index]");
    const rows = [...container.querySelectorAll("[data-testid=series-index] > li")];
    expect(rows.map((r) => [...r.querySelectorAll("[data-series]")].map((e) => e.getAttribute("data-series")))).toEqual([
      ["tanya-yi", "tanya-en"],
      ["emunah-yi"],
    ]);
    expect(container.querySelector('[data-series="emunah-yi"] a')!.getAttribute("href")).toBe("/en/series/emunah-yi");
    expect(container.textContent).toContain("27 parts");
    await noAxeViolations();
  });

  it("renders in Yiddish", async () => {
    const { container } = await renderAt("/yi/series", "[data-testid=series-index]");
    expect(container.querySelector('[data-series="tanya-yi"] a bdi')!.getAttribute("lang")).toBe("yi");
    expect(container.textContent).toContain("27 טיילן");
    await noAxeViolations();
  });
});

describe("series page", () => {
  it("lists the parts in seriesOrder with one-liners and part numbers", async () => {
    const { container } = await renderAt("/en/series/tanya-yi", "ol");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tanya (Yiddish)");
    expect(shiurIds(container.querySelector("ol")!)).toEqual(["yi-tanya-1-01", "yi-tanya-1-02", "yi-tanya-1-03"]);
    const items = [...container.querySelectorAll("ol > li")];
    expect(items.map((li) => li.getAttribute("data-order"))).toEqual(["1", "2", "3"]);
    expect(items[0]!.textContent).toContain("Part 1");
    expect(items[0]!.textContent).toContain("Notes not prepared yet");
    expect(items[1]!.textContent).toContain("About yi-tanya-1-02");
    expect(container.textContent).toContain("Parts you hear are marked here.");
    expect(container.querySelector('a[href="/en/series/tanya-en"]')).not.toBeNull();
    await noAxeViolations();
  });

  it("shows progress and continue from the personal store", async () => {
    restore = registerProgressSource({
      progress: () =>
        Promise.resolve([
          { shiurId: "yi-tanya-1-01", t: 1800, completed: true, updatedAt: "2026-11-10T00:00:00Z" },
          { shiurId: "yi-tanya-1-02", t: 300, completed: false, updatedAt: "2026-11-11T00:00:00Z" },
        ]),
    });
    const { container } = await renderAt("/en/series/tanya-yi", "[data-testid=series-progress]");
    const prog = screen.getByTestId("series-progress");
    expect(prog.textContent).toContain("1 of 3 parts heard");
    expect(prog.querySelector("progress")!.getAttribute("value")).toBe("1");
    expect(prog.querySelector("a")!.getAttribute("href")).toBe("/en/s/yi-tanya-1-02");
    const items = [...container.querySelectorAll("ol > li")];
    expect(items[0]!.textContent).toContain("Heard");
    expect(items[1]!.textContent).toContain("Started");
    // the started part's card resumes where the listener stopped
    expect(items[1]!.querySelector("a")!.getAttribute("href")).toBe("/en/s/yi-tanya-1-02?t=300");
    await noAxeViolations();
  });

  it("lays Tanya out by perek, both languages under each perek", async () => {
    const { container } = await renderAt("/en/series/tanya-yi?view=perek", "[data-perek]");
    const groups = [...container.querySelectorAll("section[data-perek]")];
    expect(groups.map((g) => g.getAttribute("data-perek"))).toEqual(["0", "1", "11", "12", "other"]);
    expect(groups.map((g) => g.querySelector("h2")!.textContent)).toEqual([
      "Introduction",
      "Perek א׳",
      "Perek י״א",
      "Perek י״ב",
      "Other parts",
    ]);
    const p12 = groups[3]!;
    expect(shiurIds(p12)).toEqual(["yi-tanya-1-03", "en-tanya-02"]);
    expect([...p12.querySelectorAll("li")].map((li) => li.getAttribute("data-lang"))).toEqual(["yi", "en"]);
    expect(shiurIds(groups[1]!)).toEqual(["yi-tanya-1-02", "en-tanya-01"]);
    const current = container.querySelector('nav a[aria-current="true"]')!;
    expect(current.textContent).toBe("By perek");
    await noAxeViolations();
  });

  it("shows both languages side by side, each in its own order", async () => {
    const { container } = await renderAt("/en/series/tanya-yi?view=both", "[data-column]");
    const cols = [...container.querySelectorAll("[data-column]")];
    expect(cols.map((c) => c.getAttribute("data-column"))).toEqual(["yi", "en"]);
    expect(shiurIds(cols[0]!)).toEqual(["yi-tanya-1-01", "yi-tanya-1-02", "yi-tanya-1-03"]);
    expect(shiurIds(cols[1]!)).toEqual(["en-tanya-01", "en-tanya-02", "en-tanya-03"]);
    await noAxeViolations();
  });

  it("view links keep other query parameters", async () => {
    const { container } = await renderAt("/en/series/tanya-yi?audio=yi", "nav[aria-label=Show]");
    const hrefs = [...container.querySelectorAll("nav[aria-label=Show] a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/en/series/tanya-yi?audio=yi", "/en/series/tanya-yi?audio=yi&view=perek", "/en/series/tanya-yi?audio=yi&view=both"]);
  });

  it("a series without perakim or sibling has no view switch (fixture series)", async () => {
    configureData({
      fetch: async (input, init) => {
        const path = new URL(input, "http://x.invalid").pathname;
        if (path === "/data/series/emunah-yi.json") {
          return json({ ...TANYA_YI, id: "emunah-yi", sibling: null, parts: TANYA_YI.parts.map((p) => ({ ...p, perek: null })) });
        }
        return dataFetch(input, init);
      },
    });
    const { container } = await renderAt("/en/series/emunah-yi", "ol");
    expect(container.querySelector("nav[aria-label=Show]")).toBeNull();
  });

  it("renders in Yiddish", async () => {
    const { container } = await renderAt("/yi/series/tanya-yi?view=perek", "[data-perek]");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ספר התניא");
    expect(container.textContent).toContain("פרק י״ב");
    await noAxeViolations();
  });

  it("says so for an unknown series, keeping one h1", async () => {
    const { container } = await renderAt("/en/series/no-such-series", "article[aria-busy=false]");
    expect(container.textContent).toContain("There is no series at this address.");
    expect(container.querySelectorAll("main h1")).toHaveLength(1);
  });
});

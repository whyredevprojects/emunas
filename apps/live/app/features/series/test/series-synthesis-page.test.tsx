// @vitest-environment jsdom
/**
 * C3.5 (concept-live-corpus C.6, E.3, F.1): the series page with and without a synthesis, in the real
 * route tree. With one, the page carries the AI label once, the generated title and overview, the
 * key themes as plain text, and the arc line of each visible part; a part that is not visible keeps
 * its row with no line. Without one there is no synthesis UI. Nothing pairs the course with the
 * other-language one. The real `tanya-yi` file (`make-real-tanya.ts`) is rendered and snapshotted.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureData, LIVE_DATA_SCHEMA_VERSION, resetDataConfig, type DataFetch, type SeriesFile, type SeriesPart, type SeriesSynthesis } from "../../today/live-data.ts";
import { fixtureFetch } from "../../today/test/fixtures.ts";
import { settingsStore } from "../../../shell/settings.ts";
import { createTestRouter } from "../../../shell/test-router.tsx";
import realTanya from "./real-tanya-yi.json" with { type: "json" };

function part(shiurId: string, order: number, full: boolean, perek: string | null = null): SeriesPart {
  return {
    shiurId,
    order,
    perek,
    title: `Title ${shiurId}`,
    oneLiner: full ? { en: `Own line ${shiurId}`, yi: `אייגענע שורה ${shiurId}` } : null,
    duration: 1800,
    years: [5760],
    status: full ? "full" : "catalog-only",
  };
}

const SYNTHESIS: SeriesSynthesis = {
  title: { en: "Tanya: the two souls", yi: "תניא: די צוויי נפשות" },
  overview: { en: "From the oath in chapter one to the hidden love.", yi: "פון דער שבועה אין פרק א׳ ביז דער אהבה מסותרת." },
  keyThemes: [
    { en: "The two souls", yi: "די צוויי נפשות" },
    { en: "The beinoni", yi: "דער בינוני" },
  ],
  arc: [
    { shiurId: "yi-tanya-2-01", oneLiner: { en: "The series opens with the oath.", yi: "די סדרה עפנט מיט דער שבועה." } },
    { shiurId: "yi-tanya-2-03", oneLiner: { en: "Then the beinoni.", yi: "דערנאך דער בינוני." } },
  ],
  reviewed: false,
};

const BASE: SeriesFile = {
  schemaVersion: LIVE_DATA_SCHEMA_VERSION,
  id: "tanya-yi",
  title: { en: "Tanya (Yiddish)", yi: "ספר התניא" },
  lang: "yi",
  parts: [part("yi-tanya-2-03", 3, true, "ב"), part("yi-tanya-2-01", 1, true, "א"), part("yi-tanya-2-02", 2, false, "א")],
  perekGroups: [],
};

const WITH: SeriesFile = { ...BASE, synthesis: SYNTHESIS };
const REAL: SeriesFile = { ...(realTanya as unknown as SeriesFile), schemaVersion: LIVE_DATA_SCHEMA_VERSION };

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

function serve(file: SeriesFile): { requested: string[] } {
  const requested: string[] = [];
  const fetch: DataFetch = async (input, init) => {
    const path = new URL(input, "http://x.invalid").pathname;
    requested.push(path);
    if (path === `/data/series/${file.id}.json`) return json(file);
    return fixtureFetch(input, init);
  };
  configureData({ fetch });
  return { requested };
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  settingsStore.getState().reset();
});

afterEach(() => {
  cleanup();
  resetDataConfig();
});

async function renderAt(path: string, ready: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await act(async () => {});
  await waitFor(() => expect(utils.container.querySelector(ready)).not.toBeNull());
  return { router, ...utils };
}

async function noAxeViolations(): Promise<void> {
  const result = await axe.run(document, { rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** A part row, linked (visible) or plain text (not visible). */
const rowOf = (root: Element, id: string) => root.querySelector(`[data-shiur="${id}"]`)!;
const lineText = (a: Element) => a.querySelector("p")?.textContent ?? null;

/** No pairing UI: no link to another series, no other-language part, no side-by-side column. */
function expectNoPairing(root: Element): void {
  const seriesLinks = [...root.querySelectorAll("a[href*='/series/']")].map((a) => a.getAttribute("href"));
  expect(seriesLinks.every((h) => /\/series$/.test(h!) || /\/series\?/.test(h!) || /\/series\/tanya-yi(\?|$)/.test(h!))).toBe(true);
  expect(root.querySelector('a[data-shiur^="en-"]')).toBeNull();
  expect(root.querySelector("[data-column]")).toBeNull();
  expect(root.textContent).not.toMatch(/also (given )?in|side by side/i);
}

describe("series page with a synthesis", () => {
  it("opens with the AI label once, the generated title and overview, and the key themes as plain text", async () => {
    serve(WITH);
    const { container } = await renderAt("/en/series/tanya-yi", "ol");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tanya (Yiddish)");
    const labels = container.querySelectorAll("[data-corpus-label]");
    expect(labels).toHaveLength(1);
    expect(labels[0]!.getAttribute("data-corpus-label")).toBe("ai");
    expect(labels[0]!.textContent).toBe("Grouped and named by AI across all the shiurim. Not reviewed by a person.");
    const synth = screen.getByTestId("series-synthesis");
    expect(synth.getAttribute("aria-label")).toBe("About this series");
    expect(synth.querySelector("h2")!.textContent).toBe("Tanya: the two souls");
    expect(synth.textContent).toContain("From the oath in chapter one to the hidden love.");
    // the label comes before the synthesis
    expect(labels[0]!.compareDocumentPosition(synth) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const themes = screen.getByTestId("series-themes");
    expect([...themes.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["The two souls", "The beinoni"]);
    expect(themes.querySelector("a")).toBeNull();
    expect(synth.querySelector("a")).toBeNull();
    expectNoPairing(container);
    await noAxeViolations();
  });

  it("the ordered path reads the arc lines; a part that is not visible keeps its row without a line", async () => {
    serve(WITH);
    const { container } = await renderAt("/en/series/tanya-yi", "ol");
    const ol = container.querySelector("ol")!;
    expect([...ol.querySelectorAll("[data-shiur]")].map((a) => a.getAttribute("data-shiur"))).toEqual(["yi-tanya-2-01", "yi-tanya-2-02", "yi-tanya-2-03"]);
    // only the visible parts are links
    expect([...ol.querySelectorAll("a[data-shiur]")].map((a) => a.getAttribute("data-shiur"))).toEqual(["yi-tanya-2-01", "yi-tanya-2-03"]);
    expect(lineText(rowOf(ol, "yi-tanya-2-01"))).toBe("The series opens with the oath.");
    expect(lineText(rowOf(ol, "yi-tanya-2-03"))).toBe("Then the beinoni.");
    expect(container.textContent).not.toContain("Own line");
    const missing = rowOf(ol, "yi-tanya-2-02");
    expect(missing.getAttribute("data-line")).toBe("none");
    expect(missing.textContent).toContain("Part 2");
    expect(missing.textContent).toContain("Title yi-tanya-2-02");
    expect(lineText(missing)).toBeNull();
    expect(missing.textContent).not.toContain("Notes not prepared yet");
    expect(missing.tagName).toBe("DIV");
    expect(missing.closest("a")).toBeNull();
  });

  it("the perek view uses the arc lines too", async () => {
    serve(WITH);
    const { container } = await renderAt("/en/series/tanya-yi?view=perek", "[data-perek]");
    expect(lineText(rowOf(container, "yi-tanya-2-01"))).toBe("The series opens with the oath.");
    expect(lineText(rowOf(container, "yi-tanya-2-02"))).toBeNull();
    expect(container.querySelectorAll("[data-corpus-label]")).toHaveLength(1);
  });

  it("follows the reading language and mirrors in Yiddish", async () => {
    serve(WITH);
    const { container } = await renderAt("/yi/series/tanya-yi", "ol");
    const synth = screen.getByTestId("series-synthesis");
    expect(synth.querySelector("h2")!.getAttribute("lang")).toBe("yi");
    expect(synth.textContent).toContain("פון דער שבועה");
    expect(screen.getByText("די הויפט ענינים")).toBeTruthy();
    expect(lineText(rowOf(container, "yi-tanya-2-01"))).toBe("די סדרה עפנט מיט דער שבועה.");
    await noAxeViolations();
  });

  it("a reviewed synthesis says Reviewed instead", async () => {
    serve({ ...WITH, synthesis: { ...SYNTHESIS, reviewed: true } });
    const { container } = await renderAt("/en/series/tanya-yi", "ol");
    const label = container.querySelector("[data-corpus-label]")!;
    expect(label.getAttribute("data-corpus-label")).toBe("reviewed");
    expect(label.textContent).toBe("Reviewed");
  });

  it("a suppressed overview leaves the label and the rest", async () => {
    serve({ ...WITH, synthesis: { ...SYNTHESIS, overview: { en: "", yi: "" } } });
    const { container } = await renderAt("/en/series/tanya-yi", "ol");
    expect(container.querySelectorAll("[data-corpus-label]")).toHaveLength(1);
    const synth = screen.getByTestId("series-synthesis");
    expect(synth.querySelector("p")).toBeNull();
    expect(synth.querySelector("h2")!.textContent).toBe("Tanya: the two souls");
  });
});

describe("series page without a synthesis", () => {
  it("renders the plain list with the parts' own one-liners and no synthesis UI", async () => {
    serve(BASE);
    const { container } = await renderAt("/en/series/tanya-yi", "ol");
    expect(container.querySelector("[data-testid=series-synthesis]")).toBeNull();
    expect(container.querySelector("[data-corpus-label]")).toBeNull();
    expect(container.textContent).not.toContain("About this series");
    expect(container.textContent).not.toContain("Key themes");
    expect(container.textContent).not.toMatch(/overview/i);
    const ol = container.querySelector("ol")!;
    expect(lineText(rowOf(ol, "yi-tanya-2-01"))).toBe("Own line yi-tanya-2-01");
    expect(rowOf(ol, "yi-tanya-2-02").textContent).toContain("Notes not prepared yet");
    expectNoPairing(container);
    await noAxeViolations();
  });
});

describe("the real tanya-yi series", () => {
  it("renders the course map (snapshot)", async () => {
    const { requested } = serve(REAL);
    const { container } = await renderAt("/en/series/tanya-yi", "ol");
    const synth = screen.getByTestId("series-synthesis");
    const rows = [...container.querySelectorAll("ol > li")].map((li) => {
      const a = li.querySelector("[data-shiur]")!;
      return {
        order: li.getAttribute("data-order"),
        shiur: a.getAttribute("data-shiur"),
        linked: a.tagName === "A",
        line: a.getAttribute("data-line"),
        text: lineText(a),
      };
    });
    expect(rows).toHaveLength(REAL.parts.length);
    // the visible parts read their arc lines; the part that is not visible has none
    expect(rows.filter((r) => r.line === "none").map((r) => r.shiur)).toEqual(REAL.parts.filter((p) => p.status !== "full").map((p) => p.shiurId));
    // and only the visible parts are links
    expect(rows.filter((r) => !r.linked).map((r) => r.shiur)).toEqual(REAL.parts.filter((p) => p.status !== "full").map((p) => p.shiurId));
    expect(screen.getByTestId("series-themes").querySelector("a")).toBeNull();
    expectNoPairing(container);
    expect(requested.filter((p) => p.startsWith("/data/series/"))).toEqual(["/data/series/tanya-yi.json"]);
    expect({
      h1: screen.getByRole("heading", { level: 1 }).textContent,
      label: container.querySelector("[data-corpus-label]")!.textContent,
      title: synth.querySelector("h2")!.textContent,
      overview: synth.querySelector("p")!.textContent,
      keyThemes: [...screen.getByTestId("series-themes").querySelectorAll("li")].map((li) => li.textContent),
      rows,
    }).toMatchSnapshot();
    await noAxeViolations();
  });
});

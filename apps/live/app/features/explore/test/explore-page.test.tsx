// @vitest-environment jsdom
/**
 * Explore in the real route tree with a synthetic data set served through the data client:
 * facets drive the URL and the URL drives the page, lenses are keyboard navigable SVG with text
 * alternatives, and nothing has serious axe violations.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { byUiLang, type UiLang } from "@emunas/i18n";
import { RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { settingsStore } from "../../../shell/settings.ts";
import { createTestRouter } from "../../../shell/test-router.tsx";
import { FacetEngine } from "../engine.ts";
import type { ExploreRow } from "../entities.ts";
import { clearDataCache, configureData, resetDataConfig, type DataFetch, type EntityFile } from "../live-data.ts";
import { clearMomentCache } from "../moments.ts";
import { parseExploreQuery } from "../url.ts";
import { buildFile, corpusFile, entityFile, exploreEntitiesFile, facetsFile, momentShards, syntheticRows, topicsFile } from "./synthetic.ts";

let rows: ExploreRow[] = syntheticRows({ n: 160, seed: 11, people: 30, concepts: 30, works: 30 });
let entities: Record<string, EntityFile> = {};
let requests: string[] = [];

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

function serve(): DataFetch {
  return async (input) => {
    const path = decodeURIComponent(new URL(input, "http://x.invalid").pathname);
    requests.push(path);
    const shards = byUiLang((l) => momentShards(rows, l));
    if (path === "/data/corpus.json") return json(corpusFile(rows));
    if (path === "/data/facets.json") return json(facetsFile(rows));
    if (path === "/data/topics.json") return json(topicsFile(rows));
    if (path === "/data/explore/entities.json") return json(exploreEntitiesFile(rows));
    if (path === "/data/build.json") return json(buildFile(rows, byUiLang((l) => shards[l].length)));
    const m = /^\/data\/moments\/([a-z]+)-(\d+)\.json$/u.exec(path);
    if (m) {
      const shard = shards[m[1] as UiLang][Number(m[2])];
      return shard ? json(shard) : new Response("", { status: 404 });
    }
    const e = /^\/data\/entity\/([pco])\/(.+)\.json$/u.exec(path);
    if (e && entities[`${e[1]}:${e[2]}`]) return json(entities[`${e[1]}:${e[2]}`]);
    return new Response("", { status: 404 });
  };
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  rows = syntheticRows({ n: 160, seed: 11, people: 30, concepts: 30, works: 30 });
  entities = {};
  requests = [];
  clearDataCache();
  clearMomentCache();
  configureData({ fetch: serve() });
  settingsStore.getState().reset();
});

afterEach(() => {
  cleanup();
  resetDataConfig();
});

async function renderAt(path: string, ready = "[data-testid=explore-status]:not(:empty)") {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await act(async () => {});
  await waitFor(() => expect(utils.container.querySelector(ready)).not.toBeNull());
  return { router, ...utils };
}

const search = (router: ReturnType<typeof createTestRouter>) => router.state.location.search;
const status = (c: HTMLElement) => c.querySelector("[data-testid=explore-status]")!;
const shownIds = (c: HTMLElement) => [...c.querySelectorAll("[data-testid=explore-shiurim] a[data-shiur]")].map((a) => a.getAttribute("data-shiur"));

async function noAxeViolations(): Promise<void> {
  const result = await axe.run(document, { rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

describe("Explore list", () => {
  it("lists every shiur with facet counts, virtualized", async () => {
    const { container } = await renderAt("/en/explore?view=browse");
    expect(status(container).textContent).toBe(`${rows.length} shiurim of ${rows.length}`);
    const list = container.querySelector("[data-testid=explore-shiurim]")!;
    expect(list.getAttribute("data-count")).toBe(String(rows.length));
    const items = list.querySelectorAll(":scope > li");
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(rows.length);
    expect(items[0]!.getAttribute("aria-setsize")).toBe(String(rows.length));
    expect(shownIds(container)[0]).toBe(rows[0]!.id);
    const yi = container.querySelector('[data-facet="lang"] [data-value="yi"]')!;
    expect(yi.getAttribute("data-count")).toBe(String(rows.filter((r) => r.lang === "yi").length));
    await noAxeViolations();
  });

  it("a facet click writes the URL and the counts follow the brute-force reference", async () => {
    const { container, router } = await renderAt("/en/explore?view=browse");
    const box = container.querySelector<HTMLInputElement>('[data-facet="category"] [data-value="zman"] input')!;
    await act(async () => {
      fireEvent.click(box);
    });
    await waitFor(() => expect(search(router)).toBe("?kind=zman"));
    const zman = rows.filter((r) => r.category === "zman");
    await waitFor(() => expect(status(container).textContent).toBe(`${zman.length} shiurim of ${rows.length}`));
    expect(container.querySelector<HTMLInputElement>('[data-facet="category"] [data-value="zman"] input')!.checked).toBe(true);
    // other facets count within the selection; the category facet itself does not
    expect(container.querySelector('[data-facet="lang"] [data-value="en"]')!.getAttribute("data-count")).toBe(
      String(zman.filter((r) => r.lang === "en").length),
    );
    expect(container.querySelector('[data-facet="category"] [data-value="parsha"]')!.getAttribute("data-count")).toBe(
      String(rows.filter((r) => r.category === "parsha").length),
    );
  });

  it("a shared URL reproduces the view and stays as it was (round trip)", async () => {
    const person = rows.flatMap((r) => r.entities.people)[0]!;
    const url = `/en/explore?kind=parsha&kind=zman&p=${person}&y=5730-5770&sort=year`;
    const { container, router } = await renderAt(url);
    const state = parseExploreQuery(search(router));
    const want = new FacetEngine(rows).query(state.filters);
    expect(status(container).getAttribute("data-total")).toBe(String(want.total));
    expect(search(router)).toBe(new URL(url, "http://x").search);
    expect(container.querySelector<HTMLInputElement>(`[data-facet="person"] [data-value="${person}"] input`)!.checked).toBe(true);
    expect(container.querySelector('nav a[aria-current="true"][href*="sort=year"]')).not.toBeNull();
    // sorted by year: the shown rows are in non-decreasing first year
    const firstYears = shownIds(container).map((id) => Math.min(...rows.find((r) => r.id === id)!.years));
    expect(firstYears).toEqual([...firstYears].sort((a, b) => a - b));
  });

  it("the language facet sets the shell's audio filter", async () => {
    const { container, router } = await renderAt("/en/explore?view=browse");
    await act(async () => {
      fireEvent.click(container.querySelector('[data-facet="lang"] [data-value="en"] input')!);
    });
    await waitFor(() => expect(search(router)).toBe("?audio=en&view=browse"));
    expect(settingsStore.getState().audio).toBe("en");
    await waitFor(() => expect(status(container).textContent).toBe(`${rows.filter((r) => r.lang === "en").length} shiurim of ${rows.length}`));
  });

  it("dims zero-count values instead of hiding them", async () => {
    const { container } = await renderAt("/en/explore?kind=parsha");
    const zmanOccasion = rows.find((r) => r.zman !== null && r.zman !== "other")!.zman!;
    // a zman occasion has no shiurim among parsha shiurim, but it is still listed under its facet filter
    const input = container.querySelector<HTMLInputElement>('[data-facet="occasion"] input[type=search]')!;
    await act(async () => {
      fireEvent.change(input, { target: { value: zmanOccasion } });
    });
    const li = container.querySelector(`[data-facet="occasion"] [data-value="${zmanOccasion}"]`)!;
    expect(li.getAttribute("data-count")).toBe("0");
    expect(li.className).toMatch(/dimmed/);
  });

  it("renders mirrored in Yiddish", async () => {
    const { container } = await renderAt("/yi/explore?view=browse");
    expect(container.querySelector("[data-ui=yi]")!.getAttribute("dir")).toBe("rtl");
    expect(status(container).textContent).toContain("שיעורים");
    await noAxeViolations();
  });
});

describe("moments unit", () => {
  it("streams the shards of the reading language and keeps the moments of matching shiurim", async () => {
    const { container } = await renderAt("/en/explore?unit=moments&kind=parsha", "[data-testid=explore-moments] li");
    const parsha = new Set(rows.filter((r) => r.category === "parsha").map((r) => r.id));
    const expected = momentShards(rows, "en").flatMap((s) => s.moments).filter((m) => parsha.has(m.shiurId));
    await waitFor(() => expect(container.querySelector("[data-testid=explore-moments]")!.getAttribute("data-count")).toBe(String(expected.length)));
    expect(requests.filter((p) => p.startsWith("/data/moments/"))).toEqual(["/data/moments/en-0.json"]);
    const first = container.querySelector("[data-testid=explore-moments] [data-moment]")!;
    expect(first.getAttribute("data-moment")).toBe(expected[0]!.id);
    const play = first.querySelector("a")!;
    if (expected[0]!.t === null) expect(play.getAttribute("href")).toBe(`/en/s/${expected[0]!.shiurId}`);
    else expect(play.getAttribute("href")).toContain(`/en/s/${expected[0]!.shiurId}?t=`);
    await noAxeViolations();
  });

  it("filters by kind of moment, and the reading language picks the shard", async () => {
    const { container, router } = await renderAt("/en/explore?unit=moments&read=yi", "[data-testid=explore-moments] li");
    expect(requests.some((p) => p === "/data/moments/yi-0.json")).toBe(true);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-kind-button="q"]')!);
    });
    await waitFor(() => expect(parseExploreQuery(search(router)).kinds).toEqual(["s", "i", "st", "tk", "kp"]));
    expect(new URLSearchParams(search(router)).get("read")).toBe("yi");
    await waitFor(() =>
      expect([...container.querySelectorAll("[data-testid=explore-moments] [data-moment]")].every((el) => !/~q\d+$/u.test(el.getAttribute("data-moment")!))).toBe(true),
    );
  });
});

describe("Luach lens", () => {
  it("shows every parsha and zman as a keyboard-reachable stop and filters on choice", async () => {
    const { container, router } = await renderAt("/en/explore?lens=luach", "[data-lens=luach]");
    const outer = [...container.querySelectorAll('[data-ring="outer"] [role=button]')];
    expect(outer).toHaveLength(54);
    expect(outer.filter((el) => el.getAttribute("tabindex") === "0")).toHaveLength(1);
    const noach = container.querySelector<SVGElement>('[data-stop="noach"]')!;
    expect(noach.getAttribute("data-count")).toBe(String(rows.filter((r) => r.parsha === "noach").length));
    // arrow keys move focus around the ring
    const first = outer[0] as SVGElement;
    first.focus();
    await act(async () => {
      fireEvent.keyDown(first, { key: "ArrowRight" });
    });
    expect(document.activeElement).toBe(outer[1]);
    await act(async () => {
      fireEvent.keyDown(outer[1]!, { key: "Enter" });
    });
    const key = outer[1]!.getAttribute("data-stop")!;
    await waitFor(() => expect(search(router)).toBe(`?o=${key}&lens=luach`));
    await waitFor(() => expect(container.querySelector(`[data-stop="${key}"]`)!.getAttribute("aria-pressed")).toBe("true"));
    // the stack under the ring: that occasion's shiurim, by year
    const ids = shownIds(container);
    expect(ids.length).toBe(rows.filter((r) => r.parsha === key).length);
    // a text alternative lists the same stops
    expect(container.querySelectorAll('[data-table="outer"] tbody tr')).toHaveLength(54);
    await noAxeViolations();
  });
});

describe("Years lens", () => {
  it("counts the undated lane as the shiurim without years, under the active filters", async () => {
    const { container, router } = await renderAt("/en/explore?lens=years&audio=yi", "[data-lens=years]");
    const undated = rows.filter((r) => r.lang === "yi" && r.years.length === 0).length;
    expect(container.querySelector('[data-year="undated"]')!.getAttribute("data-count")).toBe(String(undated));
    const bars = [...container.querySelectorAll("[data-bars] [role=button]")];
    expect(bars).toHaveLength(5780 - 5724 + 1);
    // End reaches the undated lane by keyboard; Enter chooses it
    (bars[0] as SVGElement).focus();
    await act(async () => {
      fireEvent.keyDown(bars[0]!, { key: "End" });
    });
    const lane = container.querySelector<SVGElement>('[data-year="undated"]')!;
    expect(document.activeElement).toBe(lane);
    await act(async () => {
      fireEvent.keyDown(lane, { key: " " });
    });
    await waitFor(() => expect(parseExploreQuery(search(router)).filters.year).toEqual({ kind: "undated" }));
    await waitFor(() => expect(status(container).getAttribute("data-total")).toBe(String(undated)));
    // a bar keeps only that year
    const y = rows.find((r) => r.lang === "yi" && r.years.length > 0)!.years[0]!;
    await act(async () => {
      fireEvent.click(container.querySelector(`[data-year="${y}"]`)!);
    });
    await waitFor(() => expect(new URLSearchParams(search(router)).get("y")).toBe(String(y)));
    await noAxeViolations();
  });
});

describe("Connections lens", () => {
  it("hides edges with fewer than 5 shared shiurim and lists the shiurim along an edge", async () => {
    const [person, concept] = (() => {
      for (const r of rows) if (r.entities.people[0] && r.entities.concepts[0]) return [r.entities.people[0], r.entities.concepts[0]];
      throw new Error("no row with both");
    })();
    entities[`p:${person}`] = entityFile("p", person!, [
      { kind: "c", key: concept!, shared: 7 },
      { kind: "o", key: "noach", shared: 5 },
      { kind: "p", key: "weak-link", shared: 4 },
    ]);
    const { container } = await renderAt(`/en/explore?lens=connections&center=p:${person}`, "[data-edge]");
    const edges = [...container.querySelectorAll("svg [data-edge]")].map((e) => e.getAttribute("data-edge"));
    expect(edges).toEqual([`c:${concept}`, "o:noach"]);
    expect(container.querySelector('[data-edge="p:weak-link"]')).toBeNull();
    const node = container.querySelector<SVGElement>(`svg [data-edge="c:${concept}"]`)!;
    await act(async () => {
      fireEvent.click(node);
    });
    const along = container.querySelector("[data-testid=edge-shiurim]")!;
    const want = rows.filter((r) => r.entities.people.includes(person!) && r.entities.concepts.includes(concept!)).map((r) => r.id);
    expect([...along.querySelectorAll("a[data-shiur]")].map((a) => a.getAttribute("data-shiur"))).toEqual(want);
    // the text alternative re-centres through the URL
    const recentre = container.querySelector(`[data-testid=connections-list] [data-edge="c:${concept}"] a`)!;
    expect(recentre.getAttribute("href")).toContain(`center=${encodeURIComponent(`c:${concept}`)}`);
    await noAxeViolations();
  });

  it("without a centre, offers the selected entities as centres; a missing entity file is explained", async () => {
    const person = rows.flatMap((r) => r.entities.people)[0]!;
    const { container } = await renderAt(`/en/explore?lens=connections&p=${person}`, "[data-testid=connections-pick]");
    const pick = container.querySelector(`[data-center="p:${person}"]`)!;
    expect(pick.getAttribute("href")).toContain("center=");
    cleanup();
    const again = await renderAt("/en/explore?lens=connections&center=c:nothing-here", "[data-lens=connections]");
    await waitFor(() => expect(again.container.textContent).toContain("needs at least two shiurim"));
  });
});

describe("large result sets", () => {
  it("renders only a window of a 997-row list", async () => {
    rows = syntheticRows({ n: 997, seed: 1 });
    configureData({ fetch: serve() });
    const { container } = await renderAt("/en/explore?view=browse");
    expect(status(container).textContent).toBe("997 shiurim of 997");
    const items = container.querySelectorAll("[data-testid=explore-shiurim] > li");
    expect(items.length).toBeLessThan(40);
  });
});

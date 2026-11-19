// @vitest-environment jsdom
/**
 * Explore on the corpus layer, in the real route tree with a fetch spy over synthetic data: Explore
 * opens on the level-1 topic tiles with counts, which open in place to level 2; the facet view is one
 * tap behind; the Topic facet is a three-level picker on explore/entities.json; person, concept and
 * sefer facets use merged ids, never list a type-`other` person, and drop concepts above a quarter
 * of the shiurim; and opening a topic page from Explore loads only that topic's file (the tree is
 * already there).
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import axe from "axe-core";
import type { UiLang } from "@emunas/i18n";
import { RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import hischadshus from "../../../data/fixtures/data/topic/hischadshus.json" with { type: "json" };
import { settingsStore } from "../../../shell/settings.ts";
import { createTestRouter } from "../../../shell/test-router.tsx";
import { FacetEngine } from "../engine.ts";
import { droppedConcepts, type ExploreRow } from "../entities.ts";
import { clearDataCache, configureData, resetDataConfig, topicNodes, type DataFetch, type FacetsFile, type TopicFile } from "../live-data.ts";
import { clearMomentCache } from "../moments.ts";
import { parseExploreQuery } from "../url.ts";
import { buildFile, corpusFile, exploreEntitiesFile, facetsFile, momentShards, syntheticRows, topicsFile } from "./synthetic.ts";

let rows: ExploreRow[] = [];
let facets: FacetsFile;
let requests: string[] = [];
const OTHER_PERSON = "vladimir-putin";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

function serve(): DataFetch {
  return async (input) => {
    const path = decodeURIComponent(new URL(input, "http://x.invalid").pathname);
    requests.push(path);
    if (path === "/data/corpus.json") return json(corpusFile(rows));
    if (path === "/data/facets.json") return json(facets);
    if (path === "/data/topics.json") return json(topicsFile(rows));
    if (path === "/data/build.json") return json(buildFile(rows, { en: 1, yi: 1, he: 1 }));
    if (path === "/data/explore/entities.json") {
      // The entity file names a person of type `other`; facets.json (Live-listed only) does not.
      const f = exploreEntitiesFile(rows);
      for (const id of Object.keys(f.shiurim).slice(0, 40)) f.shiurim[id]!.people.push(OTHER_PERSON);
      return json(f);
    }
    const m = /^\/data\/moments\/([a-z]+)-0\.json$/u.exec(path);
    if (m) return json(momentShards(rows, m[1] as UiLang)[0]);
    const t = /^\/data\/topic\/([^/]+)\.json$/u.exec(path);
    if (t) {
      const f = structuredClone(hischadshus) as TopicFile;
      f.id = t[1]!;
      f.label = { en: `Topic ${t[1]}`, yi: `ענין ${t[1]}` };
      return json(f);
    }
    return new Response("", { status: 404 });
  };
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  rows = syntheticRows({ n: 200, seed: 21, people: 25, concepts: 25, works: 25 });
  facets = facetsFile(rows);
  requests = [];
  clearDataCache();
  clearMomentCache();
  configureData({ fetch: serve() });
  settingsStore.getState().reset();
});

afterEach(() => {
  cleanup();
  resetDataConfig();
  document.documentElement.removeAttribute("lang");
  document.documentElement.removeAttribute("dir");
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

const tree = () => topicNodes(topicsFile(rows));

describe("the topic map", () => {
  it("opens on the level-1 tiles with counts, most shiurim first, from the tree and Explore's file only", async () => {
    const { container } = await renderAt("/en/explore", "[data-testid=topic-map] [data-tile]");
    const roots = tree().filter((n) => n.parentId === null);
    const tiles = [...container.querySelectorAll("[data-tile]")];
    expect(tiles.map((t) => t.getAttribute("data-tile")).sort()).toEqual(roots.map((n) => n.id).sort());
    const counts = tiles.map((t) => Number(t.getAttribute("data-count")));
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    for (const t of tiles) {
      const n = roots.find((r) => r.id === t.getAttribute("data-tile"))!;
      expect(Number(t.getAttribute("data-count"))).toBe(n.count);
      expect(t.textContent).toContain(n.label.en);
      // the loshon-hakodesh name beside the label
      expect(t.textContent).toContain(n.label.he ?? n.label.yi);
    }
    // the AI label sits once on the map
    expect(container.querySelectorAll("[data-corpus-label]")).toHaveLength(1);
    await waitFor(() => expect(requests).toContain("/data/explore/entities.json"));
    expect(requests).toContain("/data/topics.json");
    expect(requests.filter((p) => p === "/data/corpus.json" || p === "/data/facets.json")).toEqual([]);
    await noAxeViolations();
  });

  it("a tile opens in place to its level-2 topics, each linking to its page", async () => {
    const { container, router } = await renderAt("/en/explore", "[data-tile]");
    const tile = container.querySelector("[data-tile]")!;
    const id = tile.getAttribute("data-tile")!;
    const button = tile.querySelector("button")!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const kids = tree().filter((n) => n.parentId === id);
    const shown = [...tile.querySelectorAll("[data-child]")];
    expect(shown.map((li) => li.getAttribute("data-child")).sort()).toEqual(kids.map((k) => k.id).sort());
    for (const li of shown) {
      const k = kids.find((x) => x.id === li.getAttribute("data-child"))!;
      expect(li.getAttribute("data-count")).toBe(String(k.count));
      expect(li.querySelector("a")!.getAttribute("href")).toBe(`/en/t/${k.id}`);
    }
    expect(tile.querySelector(`[data-topic-page="${id}"]`)!.getAttribute("href")).toBe(`/en/t/${id}`);
    expect(tile.querySelector(`[data-topic-filter="${id}"]`)!.getAttribute("href")).toBe(`/en/explore?topic=${id}`);
    expect(router.state.location.search).toBe("");
  });

  it("opening a topic page from Explore loads only that topic's file", async () => {
    const { container, router } = await renderAt("/en/explore", "[data-tile]");
    await waitFor(() => expect(requests).toContain("/data/explore/entities.json"));
    const tile = container.querySelector("[data-tile]")!;
    await act(async () => {
      fireEvent.click(tile.querySelector("button")!);
    });
    const link = tile.querySelector<HTMLAnchorElement>("[data-child] a")!;
    const id = link.closest("[data-child]")!.getAttribute("data-child")!;
    const before = requests.length;
    await act(async () => {
      fireEvent.click(link);
    });
    await waitFor(() => expect(container.querySelector(`article[data-topic="${id}"][aria-busy=false]`)).not.toBeNull());
    expect(router.state.location.pathname).toBe(`/en/t/${id}`);
    expect(requests.slice(before)).toEqual([`/data/topic/${id}.json`]);
  });

  it("the facet view is one tap behind, and the map is one tap back", async () => {
    const { container, router } = await renderAt("/en/explore", "[data-testid=explore-browse]");
    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid=explore-browse]")!);
    });
    await waitFor(() => expect(container.querySelector("[data-testid=explore-status]:not(:empty)")).not.toBeNull());
    expect(router.state.location.search).toBe("?view=browse");
    expect(container.querySelector("[data-facet=topic]")).not.toBeNull();
    expect(container.querySelector("[data-testid=topic-map]")).toBeNull();
    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid=explore-map-link]")!);
    });
    await waitFor(() => expect(container.querySelector("[data-testid=topic-map]")).not.toBeNull());
    expect(router.state.location.search).toBe("");
  });

  it("renders mirrored in Yiddish with Yiddish labels", async () => {
    const { container } = await renderAt("/yi/explore", "[data-tile]");
    expect(container.querySelector("[data-ui=yi]")!.getAttribute("dir")).toBe("rtl");
    const root = tree().find((n) => n.parentId === null)!;
    expect(container.querySelector(`[data-tile="${root.id}"]`)!.textContent).toContain(root.label.yi);
    await noAxeViolations();
  });
});

describe("the facet view on merged ids", () => {
  const status = (c: HTMLElement) => c.querySelector("[data-testid=explore-status]")!;

  it("the Topic facet is a three-level picker; a topic counts and filters with everything under it", async () => {
    const { container, router } = await renderAt("/en/explore?view=browse", "[data-facet=topic] [data-level='1']");
    const facet = container.querySelector("[data-facet=topic]")!;
    const nodes = tree();
    const root = nodes.find((n) => n.parentId === null && nodes.some((c) => c.parentId === n.id && nodes.some((g) => g.parentId === c.id)))!;
    const li = facet.querySelector(`[data-value="${root.id}"]`)!;
    await waitFor(() => expect(li.getAttribute("data-count")).toBe(String(rows.filter((r) => r.entities.topics.includes(root.id)).length)));
    expect(facet.querySelectorAll("[data-level='2']")).toHaveLength(0);
    // open level 1, then level 2
    await act(async () => {
      fireEvent.click(li.querySelector(`[data-expand="${root.id}"]`)!);
    });
    const child = nodes.find((n) => n.parentId === root.id && nodes.some((g) => g.parentId === n.id))!;
    const childLi = facet.querySelector(`[data-value="${child.id}"]`)!;
    expect(childLi.getAttribute("data-level")).toBe("2");
    await act(async () => {
      fireEvent.click(childLi.querySelector(`[data-expand="${child.id}"]`)!);
    });
    const leaf = nodes.find((n) => n.parentId === child.id)!;
    const leafLi = facet.querySelector(`[data-value="${leaf.id}"]`)!;
    expect(leafLi.getAttribute("data-level")).toBe("3");
    expect(leafLi.querySelector("[data-expand]")).toBeNull();
    // choose the level-2 topic: the list is every shiur tagged with it or under it
    await act(async () => {
      fireEvent.click(childLi.querySelector("input")!);
    });
    await waitFor(() => expect(router.state.location.search).toBe(`?topic=${child.id}`));
    const want = new FacetEngine(rows).query(parseExploreQuery(`topic=${child.id}`).filters).total;
    expect(want).toBe(rows.filter((r) => r.entities.topics.includes(child.id)).length);
    await waitFor(() => expect(status(container).getAttribute("data-total")).toBe(String(want)));
    await noAxeViolations();
  });

  it("a shared topic link opens the facet view with the picker open on the chosen topic", async () => {
    const leaf = tree().find((n) => n.level === 3)!;
    const { container } = await renderAt(`/en/explore?topic=${leaf.id}`, `[data-facet=topic] [data-value="${leaf.id}"]`);
    expect(container.querySelector<HTMLInputElement>(`[data-facet=topic] [data-value="${leaf.id}"] input`)!.checked).toBe(true);
    await waitFor(() => expect(status(container).getAttribute("data-total")).toBe(String(rows.filter((r) => r.entities.topics.includes(leaf.id)).length)));
  });

  it("no person of type other is ever a facet value; concepts above a quarter of the shiurim are dropped", async () => {
    const { container } = await renderAt("/en/explore?view=browse", "[data-facet=person] [data-value]");
    await waitFor(() => expect(status(container).getAttribute("data-total")).toBe(String(rows.length)));
    const person = container.querySelector("[data-facet=person]")!;
    const search = person.querySelector<HTMLInputElement>("input[type=search]")!;
    await act(async () => {
      fireEvent.change(search, { target: { value: "putin" } });
    });
    expect(container.querySelector(`[data-value="${OTHER_PERSON}"]`)).toBeNull();
    expect(facets.person[OTHER_PERSON]).toBeUndefined();

    const dropped = droppedConcepts(rows);
    expect(dropped.size).toBeGreaterThan(0);
    const concept = container.querySelector("[data-facet=concept]")!;
    // show every concept value
    for (let i = 0; i < 5; i++) {
      const more = [...concept.querySelectorAll("button")].find((b) => /Show \d+ more/u.test(b.textContent ?? ""));
      if (!more) break;
      await act(async () => {
        fireEvent.click(more);
      });
    }
    const shown = new Set([...concept.querySelectorAll("[data-value]")].map((li) => li.getAttribute("data-value")));
    for (const c of dropped) expect(shown.has(c), c).toBe(false);
    const kept = Object.keys(facets.concept).filter((c) => !dropped.has(c));
    for (const c of kept) expect(shown.has(c), c).toBe(true);
  });
});

// @vitest-environment jsdom
/**
 * The seforim, maasios and entity pages in the real route tree, against the files the real emitter
 * (W3.6) writes for the @emunas/corpus mini corpus:
 * - the shelf leaves genre labels off; the Bereishis chapter view lists its pesukim in order with
 *   their moments;
 * - every link to a sefer, chapter, person, concept or occasion on every page resolves to a data file
 *   (a crawl over every work and entity page);
 * - a person page splits cited / in stories / discussed;
 * - axe finds no violations in either interface language.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { RouterProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { settingsStore } from "../../../shell/settings.ts";
import { createTestRouter } from "../../../shell/test-router.tsx";
import { setPersonal } from "../../../store/personal.ts";
import { setQueuePlayer } from "../../../store/queue-player.ts";
import { layoutWork } from "../../seforim/model.ts";
import { configureData, resetDataConfig, type EntityFile, type WorkFile, type WorksFile } from "../live-data.ts";
import { HAVE_REAL_DATA, emittedFetch, emittedMini, emittedReal, keysUnder, type Emitted } from "./emitted.ts";

let files: Emitted;

beforeAll(() => {
  files = emittedMini();
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  configureData({ fetch: emittedFetch(files) });
  settingsStore.getState().reset();
});

afterEach(() => {
  cleanup();
  resetDataConfig();
});

afterAll(() => {
  setQueuePlayer(null);
  setPersonal(null);
});

async function renderAt(path: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await act(async () => {});
  // A page is ready when it stops loading, or when it is the not-found page (no aria-busy).
  await waitFor(() => expect(utils.container.querySelector("article[aria-busy=false], article:not([aria-busy])")).not.toBeNull());
  return { router, ...utils };
}

async function noAxeViolations(): Promise<void> {
  const result = await axe.run(document, { rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

const get = <T,>(f: string): T => files.get(f) as T;

// ---------------------------------------------------------------------------------- link checking

const ENTITY_LINK = /^\/(en|yi)\/(seforim|p|c|o)\/([^/?#]+)(?:\/([^/?#]+))?$/u;

/** Why a link on a page does not resolve to data, or null when it does. */
function unresolved(href: string): string | null {
  const m = ENTITY_LINK.exec(href);
  if (!m) return null;
  const [, , seg, rawKey, rawChapter] = m;
  const key = decodeURIComponent(rawKey!);
  if (seg === "seforim") {
    const work = files.get(`work/${key}.json`) as WorkFile | undefined;
    if (!work) return `${href}: no work file`;
    if (rawChapter !== undefined) {
      const ch = decodeURIComponent(rawChapter);
      if (!layoutWork(work).chapters.some((c) => c.key === ch)) return `${href}: no chapter ${ch}`;
    }
    return null;
  }
  if (rawChapter !== undefined) return `${href}: unexpected segment`;
  return files.has(`entity/${seg}/${key}.json`) ? null : `${href}: no entity file`;
}

function entityLinks(root: ParentNode): string[] {
  return [...root.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!).filter((h) => ENTITY_LINK.test(h));
}

// ---------------------------------------------------------------------------------- seforim

describe("seforim", () => {
  it("shelves merged works by group, those below the page line in a collapsed row, every link resolving", async () => {
    const { container } = await renderAt("/en/seforim");
    const groups = [...container.querySelectorAll("section[data-group]")].map((s) => s.getAttribute("data-group"));
    expect(groups[0]).toBe("torah");
    expect(groups.length).toBeGreaterThan(1);
    const shelved = [...container.querySelectorAll("[data-work]")].map((e) => e.getAttribute("data-work"));
    const few = [...container.querySelectorAll("[data-work-few]")].map((e) => e.getAttribute("data-work-few"));
    const listed = get<WorksFile>("works.json").works;
    expect(shelved).toEqual(listed.filter((w) => w.page).map((w) => w.key));
    expect(new Set(few)).toEqual(new Set(listed.filter((w) => !w.page).map((w) => w.key)));
    expect(few.length).toBeGreaterThan(0);
    // The collapsed rows are closed and hold no links (those works have no page).
    for (const d of container.querySelectorAll("details[data-testid=shelf-few]")) {
      expect(d.hasAttribute("open")).toBe(false);
      expect(d.querySelectorAll("a").length).toBe(0);
    }
    const links = entityLinks(container);
    expect(links.length).toBe(shelved.length);
    expect(links.map(unresolved).filter(Boolean)).toEqual([]);
    await noAxeViolations();
  });

  it("filters the shelf by name, in Yiddish too", async () => {
    const { container } = await renderAt("/yi/seforim");
    const input = container.querySelector("input[type=search]") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "בראשית" } });
    const shelved = [...container.querySelectorAll("[data-work]")].map((e) => e.getAttribute("data-work"));
    expect(shelved).toContain("bereishis");
    expect(shelved).not.toContain("shemos");
    await noAxeViolations();
  });

  it("Bereishis opens on a chapter index whose links all resolve", async () => {
    const { container } = await renderAt("/en/seforim/bereishis");
    expect(container.querySelector("h1")!.textContent).toBe("Bereishis");
    const chapters = [...container.querySelectorAll("[data-testid=chapter-index] a")].map((a) => a.getAttribute("data-chapter"));
    const nums = chapters.map(Number);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
    expect(chapters.slice(0, 3)).toEqual(["1", "2", "3"]);
    expect(entityLinks(container).map(unresolved).filter(Boolean)).toEqual([]);
    await noAxeViolations();
  });

  it("the Genesis chapter view lists the pesukim in order, each with its moments", async () => {
    const { container } = await renderAt("/en/seforim/bereishis/2");
    expect(container.querySelector("h1")!.textContent).toBe("Bereishis 2");
    const places = [...container.querySelectorAll("li[data-place]")];
    expect(places.map((p) => p.getAttribute("data-place"))).toEqual([
      "Genesis 2:16",
      "Genesis 2:18",
      "Genesis 2:19",
      "Genesis 2:20",
      "Genesis 2:21",
      "Genesis 2:21-22",
      "Genesis 2:23",
    ]);
    const work = get<WorkFile>("work/bereishis.json");
    for (const p of places) {
      const loc = work.locations.find((l) => l.sefariaRef === p.getAttribute("data-place"))!;
      const moments = [...p.querySelectorAll("li[data-citation]")];
      expect(moments.map((m) => m.getAttribute("data-citation"))).toEqual(loc.citations.map((c) => c.sourceId));
      // each moment plays from its time in the listening room
      for (const [i, m] of moments.entries()) {
        const c = loc.citations[i]!;
        const href = m.querySelector("a")!.getAttribute("href")!;
        expect(href).toBe(c.t === null ? `/en/s/${c.shiurId}` : `/en/s/${c.shiurId}?t=${Math.round(c.t * 1000) / 1000}`);
      }
    }
    expect(places[0]!.textContent).toContain("Bereishis 2:16");
    // prev / next chapters
    expect(container.querySelector("a[rel=prev]")!.getAttribute("href")).toBe("/en/seforim/bereishis/1");
    expect(container.querySelector("a[rel=next]")!.getAttribute("href")).toBe("/en/seforim/bereishis/3");
    await noAxeViolations();
  });

  it("the chapter view in Yiddish uses Hebrew references", async () => {
    const { container } = await renderAt("/yi/seforim/bereishis/2");
    expect(container.querySelector("h1")!.textContent).toBe("בראשית ב׳");
    expect(container.querySelector("li[data-place] strong")!.getAttribute("lang")).toBe("he");
    await noAxeViolations();
  });

  it("an unknown work is the not-found page; an unknown chapter says so", async () => {
    const a = await renderAt("/en/seforim/no-such-work");
    expect(a.container.querySelector("h1")!.textContent).toBe("Page not found");
    cleanup();
    const b = await renderAt("/en/seforim/bereishis/999");
    expect(b.container.textContent).toContain("Nothing is cited in this chapter.");
  });

  it("every link on every work page resolves", async () => {
    const bad: string[] = [];
    let unlocated = 0;
    let checked = 0;
    for (const key of keysUnder(files, "work/")) {
      const { container } = await renderAt(`/en/seforim/${encodeURIComponent(key)}`);
      const links = entityLinks(container);
      checked += links.length;
      bad.push(...links.flatMap((h) => unresolved(h) ?? []));
      if (container.querySelector("[data-testid=unlocated]")) unlocated++;
      cleanup();
    }
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThan(100);
    expect(unlocated).toBeGreaterThan(0);
  }, 120_000);
});

// ---------------------------------------------------------------------------------- entities

describe("entity pages", () => {
  for (const kind of ["p", "c", "o"] as const) {
    it(`every link on every ${kind} page resolves`, async () => {
      const bad: string[] = [];
      let checked = 0;
      const keys = keysUnder(files, `entity/${kind}/`);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        const { container } = await renderAt(`/en/${kind}/${encodeURIComponent(key)}`);
        expect(container.querySelector("h1")!.textContent).not.toBe("");
        const links = entityLinks(container);
        checked += links.length;
        bad.push(...links.flatMap((h) => unresolved(h) ?? []));
        cleanup();
      }
      expect(bad).toEqual([]);
      expect(checked).toBeGreaterThan(0);
    }, 120_000);
  }

  it("a person page: names, also called, his seforim, then cited / in stories / discussed", async () => {
    const key = "chasam-sofer";
    const entity = get<EntityFile>(`entity/p/${key}.json`);
    const person = entity.person!;
    expect(person.works.length).toBeGreaterThan(0);
    expect(person.stories.length).toBeGreaterThan(0);
    const { container } = await renderAt(`/en/p/${key}`);
    expect(container.querySelector("[data-testid=person-names]")!.textContent).toContain(person.names.he);
    expect(container.querySelector("[data-testid=also-called]")!.textContent).toContain("Rabbi Moshe Sofer");
    const seforim = container.querySelector("[data-testid=his-seforim]")!;
    for (const w of person.works) {
      const linked = seforim.querySelector(`a[data-work="${w.id}"]`);
      expect(linked !== null, w.id).toBe(w.page);
      if (linked) expect(linked.getAttribute("href")).toBe(`/en/seforim/${w.id}`);
    }
    const splits = [...container.querySelectorAll("section[data-split]")].map((s) => s.getAttribute("data-split"));
    expect(splits).toEqual(["cited", "stories", "discussed"]);
    const cited = container.querySelector("section[data-split=cited]")!;
    const citedShown = [...cited.querySelectorAll("a[data-shiur]")].map((a) => a.getAttribute("data-shiur")!);
    expect(citedShown.length).toBe(Math.min(20, person.cited.length));
    for (const id of citedShown) expect(person.cited).toContain(id);
    const stories = [...container.querySelectorAll("section[data-split=stories] li[data-story]")];
    expect(stories.map((li) => li.getAttribute("data-story"))).toEqual(person.stories.map((x) => x.id));
    for (const [i, li] of stories.entries()) {
      const st = person.stories[i]!;
      const href = li.querySelector("a")!.getAttribute("href")!;
      if (st.page) expect(href).toBe(`/en/maasios/${st.id}`);
      else expect(href.startsWith(`/en/s/${st.first.shiurId}`)).toBe(true);
    }
    const discussed = container.querySelector("section[data-split=discussed]")!;
    for (const a of discussed.querySelectorAll("a[data-shiur]")) expect(entity.shiurIds).toContain(a.getAttribute("data-shiur"));
    expect(container.querySelector("svg[role=img]")!.getAttribute("aria-label")).toMatch(/shiur/u);
    await noAxeViolations();
  });

  it("a concept is headed by its Hebrew term, then its definition, examples as play buttons, then shiurim", async () => {
    const keys = keysUnder(files, "entity/c/");
    const key = keys.find((k) => get<EntityFile>(`entity/c/${k}.json`).moments.some((m) => m.t !== null))!;
    expect(key).toBeDefined();
    const entity = get<EntityFile>(`entity/c/${key}.json`);
    const { container } = await renderAt(`/yi/c/${encodeURIComponent(key)}`);
    const h1 = container.querySelector("h1 bdi")!;
    expect(h1.getAttribute("lang")).toBe("he");
    expect(h1.textContent).toBe(entity.label.he ?? entity.label.yi);
    expect(container.querySelector("[data-testid=definition]")!.textContent).toContain(entity.concept!.definition.yi);
    const examples = [...container.querySelectorAll("[data-testid=examples] li[data-example]")].map((li) => li.getAttribute("data-example"));
    expect(examples).toEqual(entity.moments.filter((m) => m.t !== null).map((m) => m.id));
    expect(container.querySelectorAll("button[data-action=play-example]").length).toBe(examples.length);
    // The definition comes before the examples, the examples before the shiurim.
    const order = ["[data-testid=definition]", "[data-testid=examples]", "#shiurim-title"].map((q) => container.querySelector(q)!);
    expect(order[0]!.compareDocumentPosition(order[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1]!.compareDocumentPosition(order[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await noAxeViolations();
  });

  it("an occasion lists its shiurim by year and its moments by shiur", async () => {
    const key = keysUnder(files, "entity/o/")[0]!;
    const entity = get<EntityFile>(`entity/o/${key}.json`);
    const { container } = await renderAt(`/en/o/${encodeURIComponent(key)}`);
    const groups = [...container.querySelectorAll("[data-group]")].map((g) => g.getAttribute("data-group"));
    expect(groups).toEqual([...new Set(entity.moments.map((m) => m.shiurId))].slice(0, 15));
    const firstGroup = container.querySelector("[data-group]")!;
    const button = [...firstGroup.querySelectorAll("button")].find((b) => b.textContent === "Show what each moment is")!;
    fireEvent.click(button);
    await waitFor(() => expect(firstGroup.querySelector("li bdi[lang=en]")).not.toBeNull());
    await noAxeViolations();
  });

  it("an unknown entity is the not-found page", async () => {
    const { container } = await renderAt("/en/p/no-such-person");
    expect(container.querySelector("h1")!.textContent).toBe("Page not found");
    expect(container.textContent).toContain("There is no page at this address.");
  });
});

// ---------------------------------------------------------------------------------- real data

describe.runIf(HAVE_REAL_DATA)("on the repo's data", () => {
  beforeAll(() => {
    files = emittedReal();
  }, 300_000);

  afterAll(() => {
    files = emittedMini();
  });

  it("Bereishis 12 lists its pesukim in order, with moments, links resolving", async () => {
    const { container } = await renderAt("/en/seforim/bereishis/12");
    const refs = [...container.querySelectorAll("li[data-place]")].map((li) => li.getAttribute("data-place")!);
    expect(refs.length).toBeGreaterThan(3);
    const start = (r: string) => Number(/^Genesis 12:(\d+)/u.exec(r)?.[1] ?? 0);
    expect(refs.map(start)).toEqual([...refs.map(start)].sort((a, b) => a - b));
    for (const li of container.querySelectorAll("li[data-place]")) expect(li.querySelectorAll("li[data-citation]").length).toBeGreaterThan(0);
    expect(entityLinks(container).map(unresolved).filter(Boolean)).toEqual([]);
    await noAxeViolations();
  });

  it("a person who wrote a sefer and appears in stories has all three parts", async () => {
    const { container } = await renderAt("/en/p/chofetz-chaim");
    const splits = [...container.querySelectorAll("section[data-split]")].map((s) => s.getAttribute("data-split"));
    expect(splits).toEqual(["cited", "stories", "discussed"]);
    expect(container.querySelector("[data-testid=his-seforim] a[href^='/en/seforim/']")).not.toBeNull();
    expect(entityLinks(container).map(unresolved).filter(Boolean)).toEqual([]);
    await noAxeViolations();
  });
});

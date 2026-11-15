// @vitest-environment jsdom
/**
 * The seforim, maasios and entity pages in the real route tree, against the files the real emitter
 * (W3.6) writes for the @emunas/corpus mini corpus:
 * - the shelf leaves genre labels off; the Bereishis chapter view lists its pesukim in order with
 *   their moments;
 * - every link to a sefer, chapter, person, concept or occasion on every page resolves to a data file
 *   (a crawl over every work and entity page);
 * - a person page splits cited / in stories / discussed;
 * - the maasios "stories only" mode plays the listed stories back to back through the queue;
 * - axe finds no violations in either interface language.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { RouterProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPlayerEngine } from "../../../player-engine/engine.ts";
import { FakeAudio, FakeClock } from "../../../player-engine/test/fakes.ts";
import type { PlayerEngine, PlayerShiur } from "../../../player-engine/types.ts";
import { settingsStore } from "../../../shell/settings.ts";
import { createTestRouter } from "../../../shell/test-router.tsx";
import { MemoryBackend } from "../../../store/backend.ts";
import { createPersonal, setPersonal, type Personal } from "../../../store/personal.ts";
import { createQueuePlayer, setQueuePlayer } from "../../../store/queue-player.ts";
import { isGenreWork, layoutWork } from "../../seforim/model.ts";
import { configureData, resetDataConfig, type CorpusFile, type EntityFile, type StoriesFile, type WorkFile, type WorksFile } from "../live-data.ts";
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
  await waitFor(() => expect(utils.container.querySelector("article[aria-busy=false]")).not.toBeNull());
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
  it("shelves works by group, without genre labels, every link resolving", async () => {
    const { container } = await renderAt("/en/seforim");
    const groups = [...container.querySelectorAll("section[data-group]")].map((s) => s.getAttribute("data-group"));
    expect(groups[0]).toBe("torah");
    // C1.7: the shelf holds corpus works with a Live page (≥3 shiurim); the mini corpus cites no
    // tractate that often, so the groups are the Tanach ones and later.
    expect(groups.length).toBeGreaterThan(1);
    const shelved = [...container.querySelectorAll("[data-work]")].map((e) => e.getAttribute("data-work"));
    const listed = get<WorksFile>("works.json").works.map((w) => w.key);
    expect(new Set(shelved)).toEqual(new Set(listed.filter((k) => !isGenreWork(k))));
    expect(listed.some(isGenreWork) || shelved.length === listed.length).toBe(true);
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
        expect(href).toBe(c.t === null ? `/en/s/${c.shiurId}` : `/en/s/${c.shiurId}?t=${Math.round(c.t)}`);
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

  it("unknown works and chapters say so", async () => {
    const a = await renderAt("/en/seforim/no-such-work");
    expect(a.container.textContent).toContain("There is no sefer at this address.");
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

  it("a person page splits cited / in stories / discussed", async () => {
    // A person in stories in the mini corpus; give one shiur a citation of the person's own sefer.
    const stories = get<StoriesFile>("stories.json").stories;
    const people = keysUnder(files, "entity/p/");
    const key = people.find((k) => stories.some((s) => s.peopleKeys.includes(k)))!;
    expect(key).toBeDefined();
    const entity = get<EntityFile>(`entity/p/${key}.json`);
    const corpus = get<CorpusFile>("corpus.json");
    const citing = corpus.shiurim.find((r) => r.status === "full")!;
    const patched: CorpusFile = {
      ...corpus,
      shiurim: corpus.shiurim.map((r) => (r.id === citing.id ? { ...r, entities: { ...r.entities, works: [...r.entities.works, key] } } : r)),
    };
    const base = emittedFetch(files);
    configureData({
      fetch: async (input, init) =>
        new URL(input, "http://x.invalid").pathname === "/data/corpus.json"
          ? new Response(JSON.stringify(patched), { status: 200 })
          : base(input, init),
    });
    const { container } = await renderAt(`/en/p/${encodeURIComponent(key)}`);
    const splits = [...container.querySelectorAll("section[data-split]")].map((s) => s.getAttribute("data-split"));
    expect(splits[0]).toBe("cited");
    expect(splits).toContain("stories");
    const cited = container.querySelector("section[data-split=cited]")!;
    expect([...cited.querySelectorAll("a[data-shiur]")].map((a) => a.getAttribute("data-shiur"))).toEqual([citing.id]);
    const inStories = [...container.querySelectorAll("section[data-split=stories] li[data-story]")].map((li) => li.getAttribute("data-story"));
    expect(inStories).toEqual(stories.filter((s) => s.peopleKeys.includes(key)).map((s) => s.id));
    const discussed = container.querySelector("section[data-split=discussed]");
    const discussedIds = discussed ? [...discussed.querySelectorAll("a[data-shiur]")].map((a) => a.getAttribute("data-shiur")) : [];
    for (const id of discussedIds) expect(entity.shiurIds).toContain(id);
    expect(container.querySelector("svg[role=img]")!.getAttribute("aria-label")).toMatch(/shiur/u);
    await noAxeViolations();
  });

  it("a concept is headed by its Hebrew term and renders in Yiddish", async () => {
    const key = keysUnder(files, "entity/c/")[0]!;
    const entity = get<EntityFile>(`entity/c/${key}.json`);
    const { container } = await renderAt(`/yi/c/${encodeURIComponent(key)}`);
    const h1 = container.querySelector("h1 bdi")!;
    expect(h1.getAttribute("lang")).toBe("he");
    expect(h1.textContent).toBe(entity.label.he ?? entity.label.yi);
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

  it("an unknown entity says so", async () => {
    const { container } = await renderAt("/en/p/no-such-person");
    expect(container.textContent).toContain("There is no page at this address.");
  });
});

// ---------------------------------------------------------------------------------- maasios

describe("maasios", () => {
  it("lists every story, facets by person, links resolving", async () => {
    const stories = get<StoriesFile>("stories.json").stories;
    const { container, router } = await renderAt("/en/maasios");
    expect([...container.querySelectorAll("li[data-story]")].length).toBe(Math.min(30, stories.length));
    expect(container.textContent).toContain(`${stories.length} of ${stories.length} stories`);
    const chip = container.querySelector("a[data-person]")!;
    const person = chip.getAttribute("data-person")!;
    await act(async () => {
      await router.navigate(chip.getAttribute("href")!);
    });
    const shown = [...container.querySelectorAll("li[data-story]")].map((li) => li.getAttribute("data-story"));
    expect(shown).toEqual(stories.filter((s) => s.peopleKeys.includes(person)).map((s) => s.id).slice(0, 30));
    expect(chip.getAttribute("aria-current")).toBe("true");
    expect(entityLinks(container).map(unresolved).filter(Boolean)).toEqual([]);
    await noAxeViolations();
  });

  it("follows the audio-language setting", async () => {
    settingsStore.getState().setAudio("en");
    const stories = get<StoriesFile>("stories.json").stories.filter((s) => s.lang === "en");
    const { container } = await renderAt("/yi/maasios");
    expect([...container.querySelectorAll("li[data-story]")].map((li) => li.getAttribute("data-story"))).toEqual(stories.map((s) => s.id).slice(0, 30));
    await noAxeViolations();
  });

  describe("stories only", () => {
    let clock: FakeClock;
    let engine: PlayerEngine;
    let personal: Personal;

    beforeEach(() => {
      clock = new FakeClock();
      const stories = get<StoriesFile>("stories.json").stories;
      const ids = [...new Set(stories.map((s) => s.shiurId))];
      const shiur = (id: string): PlayerShiur => ({
        id,
        lang: id.startsWith("en") ? "en" : "yi",
        duration: 6000,
        catalog: { titleOriginal: id },
        recordings: [{ id: `${id}-r`, offset: 0, duration: 6000, audioUrl: `https://media.example.invalid/${id}.mp3` }],
      });
      const audio = new FakeAudio(clock, Object.fromEntries(ids.map((id) => [`https://media.example.invalid/${id}.mp3`, 6000])));
      engine = createPlayerEngine({ audio, clock, lifecycle: null, mediaSession: null });
      personal = createPersonal({ open: async () => ({ backend: new MemoryBackend(), fallbackReason: null }), channel: null });
      setPersonal(personal);
      setQueuePlayer(createQueuePlayer({ engine, personal, loadShiur: async (id) => shiur(id) }));
    });

    afterEach(() => {
      setQueuePlayer(null);
      engine.destroy();
    });

    async function run(seconds: number): Promise<void> {
      for (let i = 0; i < seconds * 10; i++) {
        clock.tick(100);
        await new Promise((r) => setImmediate(r));
      }
    }

    it("queues the listed stories and plays them back to back", async () => {
      const stories = get<StoriesFile>("stories.json").stories.filter((s) => s.t !== null && s.end !== null);
      const { container } = await renderAt("/en/maasios");
      const play = container.querySelector("button[data-action=play-all]")!;
      expect(play.textContent).toBe(`Play ${stories.length} back to back`);
      await act(async () => {
        fireEvent.click(play);
      });
      await waitFor(() => expect(personal.store.getState().queue.length).toBe(stories.length));
      expect(personal.store.getState().queue.map((q) => q.momentId)).toEqual(stories.map((s) => s.id));

      // Three stories in a row: each starts at its own time and gives way to the next at its end.
      for (const [i, st] of stories.slice(0, 3).entries()) {
        await act(async () => {
          await run(0.5);
        });
        expect(engine.getState().shiurId, `story ${i}`).toBe(st.shiurId);
        expect(engine.getState().t).toBeGreaterThanOrEqual(st.t! - 0.01);
        expect(engine.getState().t).toBeLessThan(st.end!);
        await act(async () => {
          await run(st.end! - engine.getState().t + 0.3);
        });
      }
      expect(engine.getState().shiurId).toBe(stories[3]!.shiurId);
      expect(container.textContent).toContain(`Playing ${stories.length} in the queue.`);
    }, 120_000);
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
    expect(container.querySelector('section[data-split=cited] a[href="/en/seforim/chofetz-chaim"]')).not.toBeNull();
    expect(entityLinks(container).map(unresolved).filter(Boolean)).toEqual([]);
    await noAxeViolations();
  });

  it("the maasios person facet and its links resolve", async () => {
    const { container } = await renderAt("/yi/maasios?p=baal-shem-tov");
    expect(container.querySelectorAll("li[data-story]").length).toBe(30);
    expect(entityLinks(container).map(unresolved).filter(Boolean)).toEqual([]);
    await noAxeViolations();
  });
});

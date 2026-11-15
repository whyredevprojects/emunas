// @vitest-environment jsdom
/**
 * C2.6: the Live person, concept and work pages on the corpus layer's merged entities, in the real
 * route tree, against the files the real emitter writes for the mini corpus:
 * - an unknown or retired id is the not-found page after exactly one request (no redirect lookup);
 * - no page of a type-other person (or any person of the `other` group) is reachable;
 * - links to a concept merged into a topic go to the topic;
 * - the corpus label sits once under the title, with the reviewed variant when reviewed;
 * - the shelf's "cited once or twice" row is collapsed; a family hub lists its children then the
 *   family's shiurim; Sefaria links only with a Sefaria index title;
 * - a 1–2-shiur person chip opens a small list, with no page;
 * - a concept's example plays its section through the queue.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { corpusLabel } from "@emunas/i18n";
import { MemoryRouter, RouterProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { validateFile } from "../../../../data-build/schemas.ts";
import { settingsStore } from "../../../shell/settings.ts";
import { createTestRouter } from "../../../shell/test-router.tsx";
import { MemoryBackend } from "../../../store/backend.ts";
import { createPersonal, setPersonal, type Personal } from "../../../store/personal.ts";
import { setQueuePlayer, type QueuePlayer } from "../../../store/queue-player.ts";
import { FewRow } from "../../seforim/ShelfPage.tsx";
import { ConceptChip, PersonChip, conceptHref, personChipMode } from "../chips.tsx";
import {
  configureData,
  resetDataConfig,
  type DataFetch,
  type EntityFile,
  type FacetsFile,
  type GlossaryShardFile,
  type WorkFile,
  type WorksFile,
} from "../live-data.ts";
import { emittedFetch, emittedMini, keysUnder, type Emitted } from "./emitted.ts";

let files: Emitted;
let requests: string[];

/** Serves `files` (plus `extra` overrides) and records every `/data/` path requested. */
function spyFetch(extra: Record<string, unknown> = {}): DataFetch {
  const base = emittedFetch(files);
  return async (input, init) => {
    const path = new URL(input, "http://x.invalid").pathname;
    requests.push(path);
    const file = path.replace(/^\/data\//u, "");
    if (Object.hasOwn(extra, file)) return new Response(JSON.stringify(extra[file]), { status: 200 });
    return base(input, init);
  };
}

beforeAll(() => {
  files = emittedMini();
});

beforeEach(() => {
  requests = [];
  configureData({ fetch: spyFetch() });
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

const get = <T,>(f: string): T => files.get(f) as T;

async function renderAt(path: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await act(async () => {});
  await waitFor(() => expect(utils.container.querySelector("article[aria-busy=false], article:not([aria-busy])")).not.toBeNull());
  return { router, ...utils };
}

const isNotFound = (root: ParentNode) => root.querySelector("h1")?.textContent === "Page not found";

// ---------------------------------------------------------------------------------- not found

describe("unknown and retired ids", () => {
  const cases: [string, string, string][] = [
    ["an unknown person", "/en/p/no-such-person", "/data/entity/p/no-such-person.json"],
    // Merged upstream into `abudraham` (mergedInto): the layer resolves references, no redirect.
    ["a retired person id", "/en/p/syn-merged-person", "/data/entity/p/syn-merged-person.json"],
    ["an unknown concept", "/en/c/no-such-concept", "/data/entity/c/no-such-concept.json"],
    ["an unknown work", "/en/seforim/no-such-work", "/data/work/no-such-work.json"],
    ["a chapter of an unknown work", "/en/seforim/no-such-work/3", "/data/work/no-such-work.json"],
  ];
  for (const [what, url, file] of cases) {
    it(`${what} is the not-found page after one request`, async () => {
      const { container } = await renderAt(url);
      expect(isNotFound(container)).toBe(true);
      expect(requests).toEqual([file]);
    });
  }

  it("a known person loads the entity file first, then the corpus-wide files", async () => {
    const key = keysUnder(files, "entity/p/")[0]!;
    await renderAt(`/en/p/${key}`);
    expect(requests[0]).toBe(`/data/entity/p/${key}.json`);
    expect(new Set(requests.slice(1))).toEqual(new Set(["/data/corpus.json", "/data/facets.json"]));
  });
});

describe("people of the other group", () => {
  // Type `other` (chashmonaim, syn-other-one-shiur) and private individuals (syn-individual, 3 shiurim).
  const OTHER = ["chashmonaim", "syn-other-one-shiur", "syn-individual"];

  it("have no page, no facet entry and are never linked", async () => {
    const facets = get<FacetsFile>("facets.json");
    for (const id of OTHER) {
      expect(files.has(`entity/p/${id}.json`), id).toBe(false);
      expect(Object.hasOwn(facets.person, id), id).toBe(false);
    }
    // No emitted file links to them as a page: work authors and story people carry page: false.
    const linked: string[] = [];
    const walk = (x: unknown, f: string): void => {
      if (Array.isArray(x)) for (const y of x) walk(y, f);
      else if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        if (typeof o["id"] === "string" && OTHER.includes(o["id"]) && (o["page"] === true || Array.isArray(o["shiurim"]))) linked.push(`${f}: ${o["id"]}`);
        for (const v of Object.values(o)) walk(v, f);
      }
    };
    for (const [f, body] of files) walk(body, f);
    expect(linked).toEqual([]);
    for (const id of OTHER) {
      cleanup();
      requests = [];
      const { container } = await renderAt(`/en/p/${id}`);
      expect(isNotFound(container), id).toBe(true);
      expect(requests).toEqual([`/data/entity/p/${id}.json`]);
    }
  });
});

// ---------------------------------------------------------------------------------- merged concepts

describe("concepts merged into a topic", () => {
  const merged = () =>
    keysUnder(files, "glossary/")
      .flatMap((k) => get<GlossaryShardFile>(`glossary/${k}.json`).concepts)
      .filter((c) => c.topicId !== null);

  it("have no concept page; their links go to the topic", async () => {
    const list = merged();
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) {
      expect(files.has(`entity/c/${c.id}.json`), c.id).toBe(false);
      expect(conceptHref("en", c), c.id).toBe(`/en/t/${c.topicId}`);
      expect(files.has(`topic/${c.topicId}.json`), c.topicId!).toBe(true);
    }
    const c = list[0]!;
    const { container } = render(
      <MemoryRouter>
        <ConceptChip concept={c} ui="yi" />
      </MemoryRouter>,
    );
    const a = container.querySelector(`a[data-concept="${c.id}"]`)!;
    expect(a.getAttribute("href")).toBe(`/yi/t/${c.topicId}`);
    expect(a.querySelector("bdi")!.getAttribute("lang")).toBe("he");
  });

  it("a page concept links to its page; a concept with neither is plain text", () => {
    expect(conceptHref("en", { id: "klipah", page: true, topicId: null })).toBe("/en/c/klipah");
    expect(conceptHref("en", { id: "x", page: false })).toBeNull();
    const { container } = render(
      <MemoryRouter>
        <ConceptChip concept={{ id: "x", he: "איקס", page: false, topicId: null }} ui="en" />
      </MemoryRouter>,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[data-concept-text=x]")!.textContent).toBe("איקס");
  });

  it("a merged concept's address is the not-found page (no redirect lookup)", async () => {
    const c = merged()[0]!;
    const { container } = await renderAt(`/en/c/${c.id}`);
    expect(isNotFound(container)).toBe(true);
    expect(requests).toEqual([`/data/entity/c/${c.id}.json`]);
  });
});

// ---------------------------------------------------------------------------------- the label

describe("the corpus label", () => {
  const grouped = corpusLabel("label.grouped", "en");

  it("sits once, under the title, on person, concept and work pages; not on occasion pages", async () => {
    const pages = [
      `/en/p/${keysUnder(files, "entity/p/")[0]!}`,
      `/en/c/${keysUnder(files, "entity/c/")[0]!}`,
      `/en/seforim/${keysUnder(files, "work/")[0]!}`,
    ];
    for (const url of pages) {
      const { container } = await renderAt(url);
      const labels = container.querySelectorAll("[data-corpus-label]");
      expect(labels.length, url).toBe(1);
      expect(labels[0]!.getAttribute("data-corpus-label")).toBe("ai");
      expect(labels[0]!.textContent).toBe(grouped);
      // directly after the title
      expect(container.querySelector("h1")!.nextElementSibling).toBe(labels[0]);
      cleanup();
    }
    const { container } = await renderAt(`/en/o/${keysUnder(files, "entity/o/")[0]!}`);
    expect(container.querySelectorAll("[data-corpus-label]").length).toBe(0);
  });

  it("shows the reviewed wording for a reviewed entity alone", async () => {
    const key = keysUnder(files, "entity/p/")[0]!;
    const work = keysUnder(files, "work/")[0]!;
    configureData({
      fetch: spyFetch({
        [`entity/p/${key}.json`]: { ...get<EntityFile>(`entity/p/${key}.json`), reviewed: true },
        [`work/${work}.json`]: { ...get<WorkFile>(`work/${work}.json`), reviewed: true },
      }),
    });
    for (const url of [`/yi/p/${key}`, `/en/seforim/${work}`]) {
      const { container } = await renderAt(url);
      const labels = container.querySelectorAll("[data-corpus-label]");
      expect(labels.length, url).toBe(1);
      expect(labels[0]!.getAttribute("data-corpus-label")).toBe("reviewed");
      expect(labels[0]!.textContent).toBe(corpusLabel("label.grouped.reviewed", url.startsWith("/yi") ? "yi" : "en"));
      cleanup();
    }
    const other = keysUnder(files, "entity/p/")[1]!;
    const { container } = await renderAt(`/en/p/${other}`);
    expect(container.querySelector("[data-corpus-label]")!.getAttribute("data-corpus-label")).toBe("ai");
  });
});

// ---------------------------------------------------------------------------------- seforim

describe("seforim on merged works", () => {
  it("the collapsed row starts closed, opens while a filter matches inside it, and links nowhere", async () => {
    const few = get<WorksFile>("works.json").works.filter((w) => !w.page);
    const { container } = render(
      <MemoryRouter>
        <FewRow works={few.slice(0, 3)} ui="en" open={false} />
      </MemoryRouter>,
    );
    const d = container.querySelector("details")!;
    expect(d.hasAttribute("open")).toBe(false);
    expect(d.querySelector("summary")!.textContent).toBe("Cited once or twice (3 seforim)");
    expect(d.querySelectorAll("[data-work-few]").length).toBe(3);
    expect(d.querySelectorAll("a").length).toBe(0);
    cleanup();

    const target = few[0]!;
    const page = await renderAt("/en/seforim");
    const input = page.container.querySelector("input[type=search]") as HTMLInputElement;
    fireEvent.change(input, { target: { value: target.label.en } });
    const row = page.container.querySelector(`[data-work-few="${target.key}"]`)!;
    expect(row.closest("details")!.hasAttribute("open")).toBe(true);
  });

  it("a family hub lists its children in data order with counts, then the family's shiurim", async () => {
    const children = get<WorksFile>("works.json").works.filter((w) => w.key.startsWith("rashi-on-"));
    expect(children.some((w) => w.page)).toBe(true);
    expect(children.some((w) => !w.page)).toBe(true);
    const shiurIds = [...new Set(children.flatMap((c) => (c.page ? get<WorkFile>(`work/${c.key}.json`).shiurIds : [])))];
    const hub: WorkFile = {
      ...get<WorkFile>(`work/${children.find((c) => c.page)!.key}.json`),
      key: "rashi",
      name: "Rashi",
      label: { en: "Rashi", yi: "רש\"י" },
      sefariaIndexTitle: null,
      parent: null,
      children: children.map((c) => ({ id: c.key, label: c.label, page: c.page, count: c.count })),
      shiurIds,
    };
    expect(validateFile("work/rashi.json", hub)).toBeNull();
    configureData({ fetch: spyFetch({ "work/rashi.json": hub }) });
    const { container } = await renderAt("/en/seforim/rashi");
    const rows = [...container.querySelectorAll("[data-testid=family] li[data-child]")];
    expect(rows.map((li) => li.getAttribute("data-child"))).toEqual(children.map((c) => c.key));
    for (const [i, li] of rows.entries()) {
      const c = children[i]!;
      const a = li.querySelector("a");
      expect(a?.getAttribute("href") ?? null).toBe(c.page ? `/en/seforim/${c.key}` : null);
      expect(li.textContent).toContain(`${c.count} shiur`);
    }
    const shown = [...container.querySelectorAll("[data-testid=family-shiurim] a[data-shiur]")].map((a) => a.getAttribute("data-shiur"));
    expect(new Set(shown)).toEqual(new Set(shiurIds.slice(0, 20)));
    // No Sefaria index title: no Sefaria link, not even on resolved places.
    expect(container.querySelector("a[href^='https://www.sefaria.org']")).toBeNull();
  });

  it("offers Sefaria links only with a Sefaria index title", async () => {
    const ber = get<WorkFile>("work/bereishis.json");
    expect(ber.sefariaIndexTitle).not.toBeNull();
    const a = await renderAt("/en/seforim/bereishis/2");
    expect(a.container.querySelector("a[href^='https://www.sefaria.org']")).not.toBeNull();
    cleanup();
    const b = await renderAt("/en/seforim/bereishis");
    expect(b.container.querySelector("[data-testid=work-sefaria]")!.getAttribute("href")).toBe(`https://www.sefaria.org/${encodeURIComponent(ber.sefariaIndexTitle!)}`);
    cleanup();
    configureData({ fetch: spyFetch({ "work/bereishis.json": { ...ber, sefariaIndexTitle: null } }) });
    const c = await renderAt("/en/seforim/bereishis/2");
    expect(c.container.querySelector("a[href^='https://www.sefaria.org']")).toBeNull();
  });
});

// ---------------------------------------------------------------------------------- person chips

describe("person chips", () => {
  it("a person with one or two shiurim and no page opens a small list, with no page", async () => {
    const key = keysUnder(files, "work/").find((k) => {
      const a = get<WorkFile>(`work/${k}.json`).author;
      return a !== null && !a.page && (a.shiurim?.length ?? 0) > 0;
    })!;
    expect(key).toBeDefined();
    const author = get<WorkFile>(`work/${key}.json`).author!;
    const { container } = await renderAt(`/en/seforim/${key}`);
    const chip = container.querySelector(`details[data-person-list="${author.id}"]`)!;
    expect(chip).not.toBeNull();
    expect(chip.hasAttribute("open")).toBe(false);
    expect([...chip.querySelectorAll("a[data-shiur]")].map((a) => a.getAttribute("href"))).toEqual(author.shiurim!.map((x) => `/en/s/${x.id}`));
    expect(container.querySelector(`a[href="/en/p/${author.id}"]`)).toBeNull();
    expect(files.has(`entity/p/${author.id}.json`)).toBe(false);
  });

  it("renders a page link, a list or plain text", () => {
    const label = { en: "Onkelos", yi: "אונקלוס" };
    expect(personChipMode({ page: true })).toBe("page");
    expect(personChipMode({ page: false, shiurim: [{ id: "yi-a-01", title: "t", lang: "yi", years: [] }] })).toBe("list");
    expect(personChipMode({ page: false, shiurim: [] })).toBe("text");
    expect(personChipMode({ page: false })).toBe("text");
    const { container } = render(
      <MemoryRouter>
        <PersonChip chip={{ id: "a", label, page: true }} ui="en" />
        <PersonChip chip={{ id: "b", label, page: false }} ui="yi" />
      </MemoryRouter>,
    );
    expect(container.querySelector("a[data-person=a]")!.getAttribute("href")).toBe("/en/p/a");
    expect(container.querySelector("[data-person-text=b]")!.textContent).toBe("אונקלוס");
    expect(container.querySelector("a[href='/yi/p/b']")).toBeNull();
  });
});

// ---------------------------------------------------------------------------------- concept examples

describe("concept examples", () => {
  let personal: Personal;
  const played: string[] = [];

  beforeEach(() => {
    personal = createPersonal({ open: async () => ({ backend: new MemoryBackend(), fallbackReason: null }), channel: null });
    setPersonal(personal);
    setQueuePlayer({
      destroy: () => {},
      play: async (key: string) => {
        played.push(key);
      },
    } as unknown as QueuePlayer);
  });

  it("each example plays its own section through the queue", async () => {
    const key = keysUnder(files, "entity/c/").find((k) => get<EntityFile>(`entity/c/${k}.json`).moments.some((m) => m.t !== null))!;
    const timed = get<EntityFile>(`entity/c/${key}.json`).moments.filter((m) => m.t !== null);
    const { container } = await renderAt(`/en/c/${key}`);
    const button = container.querySelectorAll("button[data-action=play-example]")[timed.length - 1]!;
    await act(async () => {
      fireEvent.click(button);
    });
    const m = timed[timed.length - 1]!;
    await waitFor(() => expect(personal.store.getState().queue.map((q) => q.momentId)).toEqual([m.id]));
    const q = personal.store.getState().queue[0]!;
    expect([q.shiurId, q.start, q.end]).toEqual([m.shiurId, m.t, m.end]);
    expect(played.length).toBe(1);
  });
});

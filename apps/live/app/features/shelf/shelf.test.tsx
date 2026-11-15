// @vitest-environment jsdom
/**
 * My Shelf and the shared playlist page in a DOM, inside the real shell and route table: sections
 * render the stored data with catalog titles, queue editing works, a shared link decodes and can be
 * saved, export → import round-trips through the file input, the storage notice shows when nothing
 * can be kept, and axe finds no violations in either interface language.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RouterProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
// eslint-disable-next-line no-restricted-imports -- app/data is the Live data contract (W2.4), not the pipeline data folder
import { configureData, resetDataConfig } from "../../data/index.ts";
// eslint-disable-next-line no-restricted-imports -- app/data is the Live data contract (W2.4), not the pipeline data folder
import { fixtureFetch } from "../../data/fixtures/fetch.ts";
import { createTestRouter } from "../../shell/test-router.tsx";
import { MemoryBackend } from "../../store/backend.ts";
import { encodePlaylist } from "../../store/playlist-link.ts";
import { createPersonal, dumpFromData, setPersonal, type Personal } from "../../store/personal.ts";
import { serializeExport } from "../../store/transfer.ts";
import { shelfEn, shelfT } from "./strings.ts";
import { SHELF_CLASSES } from "./styles.ts";

const A = "yi-parshas-hashavua-brshys-01";
const B = "en-parsha-en-nch-01";
const C = "yi-tanya-1-01";
const B_TITLE = "The Special Holiness of נח תיבת: a Microcosm of the עולם התיקון";

let personal: Personal;

function install(persistent: boolean): Personal {
  let n = 0;
  const p = createPersonal({
    open: async () => ({ backend: new MemoryBackend(), fallbackReason: persistent ? null : "test: storage blocked" }),
    channel: null,
    newId: () => `id-${++n}`,
  });
  setPersonal(p);
  if (persistent) {
    // A memory backend standing in for IndexedDB: report it as persistent once loaded.
    void p.ready().then(() => p.store.setState({ persistent: true, fallbackReason: null }));
  }
  return p;
}

async function seed(p: Personal): Promise<void> {
  await p.recordProgress({ shiurId: A, t: 600, duration: 3000, completedChapters: [0, 1] });
  await p.replaceQueue([
    { shiurId: B, start: 30, end: 90, momentId: `${B}~s1` },
    { shiurId: C, start: 0 },
    { shiurId: A, start: 754, end: 800 },
  ]);
  await p.createPlaylist("Purim", [{ shiurId: B, start: 5, end: 10 }]);
  await p.saveMoment({ shiurId: C, start: 42 });
  await p.addNote(A, 61, "ask about the mashal");
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
  configureData({ fetch: fixtureFetch });
});

afterAll(() => {
  resetDataConfig();
});

beforeEach(() => {
  personal = install(true);
});

afterEach(() => {
  cleanup();
  setPersonal(null);
  document.documentElement.removeAttribute("lang");
  document.documentElement.removeAttribute("dir");
});

async function renderAt(path: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await settle();
  return { router, ...utils };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const main = () => document.querySelector("main#main") as HTMLElement;

describe("overview", () => {
  it("shows every section with stored items and catalog titles", async () => {
    await seed(personal);
    await renderAt("/en/shelf");
    const m = main();
    expect(within(m).getByRole("heading", { level: 1 }).textContent).toBe("My Shelf");
    const sections = [...m.querySelectorAll("section[data-section]")].map((s) => s.getAttribute("data-section"));
    expect(sections).toEqual(["continue", "queue", "playlists", "saved", "notes", "history", "downloads"]);
    const queue = m.querySelector('section[data-section="queue"]') as HTMLElement;
    expect(within(queue).getAllByRole("listitem")).toHaveLength(3);
    await waitFor(() => expect(queue.textContent).toContain(B_TITLE));
    expect(queue.textContent).toContain("0:30–1:30");
    const cont = m.querySelector('section[data-section="continue"]') as HTMLElement;
    expect(cont.textContent).toContain("10:00 of 50:00");
    expect(cont.textContent).toContain("2 chapters finished");
    expect(m.querySelector('section[data-section="notes"]')!.textContent).toContain("ask about the mashal");
    expect(m.querySelector('section[data-section="downloads"]')!.textContent).toContain(shelfEn["empty.downloads"]);
    // Titles link to the listening room at the item's time.
    const link = within(queue).getByRole("link", { name: B_TITLE });
    expect(link.getAttribute("href")).toBe(`/en/s/${B}?t=30`);
    expect(screen.queryByTestId("storage-notice")).toBeNull();
  });

  it("says so when storage is unavailable, and still works", async () => {
    setPersonal(null);
    personal = install(false);
    await renderAt("/yi/shelf");
    expect(screen.getByTestId("storage-notice").textContent).toBe(shelfT("yi")("shelf.memoryNotice"));
    await act(async () => {
      await personal.enqueue([{ shiurId: C, start: 3 }]);
    });
    expect(main().querySelector('section[data-section="queue"]')!.querySelectorAll("li")).toHaveLength(1);
  });
});

describe("queue page", () => {
  it("moves and removes entries", async () => {
    await seed(personal);
    await renderAt("/en/shelf/queue");
    const list = () => screen.getByTestId("queue-list");
    const titles = () => within(list()).getAllByRole("listitem").map((li) => li.querySelector("a")!.getAttribute("href"));
    expect(titles()).toEqual([`/en/s/${B}?t=30`, `/en/s/${C}`, `/en/s/${A}?t=754`]);
    fireEvent.click(within(list()).getByRole("button", { name: "Move up · Item 3" }));
    await settle();
    expect(titles()).toEqual([`/en/s/${B}?t=30`, `/en/s/${A}?t=754`, `/en/s/${C}`]);
    fireEvent.click(within(list()).getByRole("button", { name: "Remove · Item 1" }));
    await settle();
    expect(titles()).toEqual([`/en/s/${A}?t=754`, `/en/s/${C}`]);
  });

  it("saves the queue as a playlist", async () => {
    await seed(personal);
    await renderAt("/en/shelf/queue");
    fireEvent.click(screen.getByRole("button", { name: "Save as playlist" }));
    const name = screen.getByLabelText("Playlist name");
    fireEvent.change(name, { target: { value: "Commute" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await settle();
    const pl = personal.store.getState().playlists.find((p) => p.name === "Commute");
    expect(pl?.items.map((i) => i.shiurId)).toEqual([B, C, A]);
  });

  it("the share link opens the same list on the shared playlist page", async () => {
    await seed(personal);
    const { router } = await renderAt("/en/shelf/queue");
    fireEvent.click(screen.getByRole("button", { name: "Share link" }));
    await settle();
    const url = new URL((screen.getByTestId("share-url") as HTMLInputElement).value);
    expect(url.pathname).toBe("/en/pl");
    await act(async () => {
      await router.navigate(`${url.pathname}${url.hash}`);
    });
    await settle();
    const items = within(screen.getByTestId("shared-list")).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("a")!.getAttribute("href"))).toEqual([`/en/s/${B}?t=30`, `/en/s/${C}`, `/en/s/${A}?t=754`]);
  });
});

describe("playlists", () => {
  it("shows a playlist by id, renames and deletes it", async () => {
    await seed(personal);
    const id = personal.store.getState().playlists[0]!.id;
    await renderAt(`/en/shelf/playlists?id=${id}`);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Purim");
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Playlist name"), { target: { value: "Adar" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await settle();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Adar");
    const confirm = window.confirm;
    window.confirm = () => true;
    try {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      await settle();
    } finally {
      window.confirm = confirm;
    }
    expect(personal.store.getState().playlists).toEqual([]);
    expect(main().textContent).toContain(shelfEn["playlist.notFound"]);
  });

  it("an unknown section says so", async () => {
    await renderAt("/en/shelf/nonsense");
    expect(main().textContent).toContain(shelfEn["shelf.unknownSection"]);
    expect(main().querySelectorAll("h1")).toHaveLength(1);
  });
});

describe("shared playlist page", () => {
  it("decodes the fragment and saves it as a playlist", async () => {
    const hash = encodePlaylist([
      { shiurId: C, start: 12, end: 20 },
      { shiurId: B, start: 0, end: null },
    ]);
    await renderAt(`/en/pl#${hash}`);
    const items = within(screen.getByTestId("shared-list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("0:12–0:20");
    expect(items[1]!.textContent).toContain(B_TITLE);
    expect(personal.store.getState().playlists).toEqual([]); // nothing stored yet
    fireEvent.click(screen.getByRole("button", { name: "Save as playlist" }));
    await settle();
    expect(personal.store.getState().playlists[0]?.items).toEqual([
      { shiurId: C, start: 12, end: 20, momentId: null },
      { shiurId: B, start: 0, end: null, momentId: null },
    ]);
    expect(screen.getByRole("status").textContent).toBe(shelfEn["pl.saved"]);
  });

  it("explains a broken link", async () => {
    await renderAt("/yi/pl#not-a-playlist");
    expect(main().textContent).toContain(shelfT("yi")("pl.invalid"));
    expect(screen.queryByTestId("shared-list")).toBeNull();
  });
});

describe("export / import", () => {
  it("imports an export file through the file input", async () => {
    await seed(personal);
    const text = serializeExport(await personal.exportFile());
    const before = dumpFromData(personal.store.getState());
    await personal.clearAll();
    await renderAt("/en/shelf");
    fireEvent.click(screen.getByLabelText("Replace what is here"));
    const input = screen.getByTestId("import-file") as HTMLInputElement;
    const file = new File([text], "emunas-shelf.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
    await settle();
    expect(screen.getByText(/^Imported 9 items\.$/)).toBeTruthy();
    expect(dumpFromData(personal.store.getState())).toEqual(before);
  });

  it("reports a file that is not an export", async () => {
    await renderAt("/en/shelf");
    const input = screen.getByTestId("import-file") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["hello"], "x.json")], configurable: true });
    fireEvent.change(input);
    await settle();
    expect(screen.getByText(shelfEn["transfer.error.not-json"])).toBeTruthy();
  });
});

describe("accessibility (axe, jsdom)", () => {
  for (const ui of ["en", "yi"] as const) {
    it(`has no axe violations on the shelf pages (${ui})`, async () => {
      await seed(personal);
      const id = personal.store.getState().playlists[0]!.id;
      const { router } = await renderAt(`/${ui}/shelf`);
      const pages = [
        "shelf",
        "shelf/continue",
        "shelf/queue",
        "shelf/playlists",
        `shelf/playlists?id=${id}`,
        "shelf/saved",
        "shelf/notes",
        "shelf/history",
        "shelf/downloads",
        `pl#${encodePlaylist([{ shiurId: C, start: 1, end: null }])}`,
        "pl#broken",
      ];
      for (const p of pages) {
        await act(async () => {
          await router.navigate(`/${ui}/${p}`);
        });
        await settle();
        expect(main().querySelectorAll("h1"), p).toHaveLength(1);
        const result = await axe.run(document, {
          rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false } },
        });
        expect(
          result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
          `${ui}/${p}`,
        ).toEqual([]);
      }
    });
  }

  it("SHELF_CLASSES lists exactly the classes in Shelf.module.css", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "Shelf.module.css"), "utf8");
    const found = new Set([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9]*)\b/g)].map((m) => m[1]!));
    expect([...found].sort()).toEqual([...SHELF_CLASSES].sort());
  });
});

/**
 * The personal store over real IndexedDB (fake-indexeddb) and over the memory fallback: every kind of
 * record persists across instances, the queue keeps its order, progress drives "continue", export →
 * import reproduces the data, merge is last-writer-wins, and storage failures never break an action.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryBackend, type Backend } from "./backend.ts";
import { openBestBackend } from "./idb-backend.ts";
import {
  continueListening,
  createPersonal,
  dumpFromData,
  notesFor,
  queueCurrentKey,
  type BroadcastLike,
  type Personal,
  type PersonalDeps,
} from "./personal.ts";
import { serializeExport } from "./transfer.ts";

const A = "yi-parshas-hashavua-brshys-01";
const B = "en-parsha-en-nch-01";
const C = "yi-tanya-1-01";

const realIndexedDB = globalThis.indexedDB;
const open: Personal[] = [];

function make(deps: PersonalDeps = {}): Personal {
  let clock = 1_000;
  let id = 0;
  const p = createPersonal({ now: () => (clock += 10), newId: () => `id-${++id}-${clock}`, channel: null, ...deps });
  open.push(p);
  return p;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  for (const p of open.splice(0)) p.dispose();
  globalThis.indexedDB = realIndexedDB;
});

describe("persistence", () => {
  it("loads what an earlier instance stored, in every store", async () => {
    const a = make();
    await a.ready();
    expect(a.store.getState()).toMatchObject({ status: "ready", persistent: true });
    await a.recordProgress({ shiurId: A, t: 120, duration: 3000 });
    const [k] = await a.enqueue([{ shiurId: B, start: 30, end: 90, momentId: `${B}~s2` }]);
    await a.setQueueCurrent(k!);
    const pl = await a.createPlaylist("  Purim  ", [{ shiurId: C, start: 0 }]);
    await a.saveMoment({ shiurId: A, start: 754, momentId: `${A}~i3` });
    await a.addNote(A, 760, "ask about this");
    await a.setPref("skip.singing", true);
    await a.putDownload({ shiurId: C, recordingIds: ["r1"], bytes: 1234, state: "complete" });
    a.dispose();

    const b = make();
    await b.ready();
    const s = b.store.getState();
    expect(s.progress[A]).toMatchObject({ t: 120, duration: 3000, completedAt: null });
    expect(s.history.map((h) => h.shiurId)).toEqual([A]);
    expect(s.queue).toEqual([expect.objectContaining({ key: k, shiurId: B, start: 30, end: 90, momentId: `${B}~s2` })]);
    expect(queueCurrentKey(s)).toBe(k);
    expect(s.playlists).toEqual([expect.objectContaining({ id: pl, name: "Purim", items: [{ shiurId: C, start: 0, end: null, momentId: null }] })]);
    expect(s.saved).toEqual([expect.objectContaining({ shiurId: A, t: 754, momentId: `${A}~i3` })]);
    expect(notesFor(s, A).map((n) => n.text)).toEqual(["ask about this"]);
    expect(s.prefs["skip.singing"]?.value).toBe(true);
    expect(s.downloads[C]).toMatchObject({ bytes: 1234, state: "complete" });
  });

  it("every record carries updatedAt", async () => {
    const a = make();
    await a.recordProgress({ shiurId: A, t: 50, duration: 100 });
    await a.enqueue([{ shiurId: A, start: 0 }]);
    await a.createPlaylist("x", []);
    await a.saveMoment({ shiurId: A, start: 1 });
    await a.addNote(A, 1, "n");
    await a.setPref("k", 1);
    await a.putDownload({ shiurId: A, recordingIds: [], bytes: 0, state: "partial" });
    const dump = dumpFromData(a.store.getState());
    for (const records of Object.values(dump)) {
      expect(records.length).toBeGreaterThan(0);
      for (const r of records) expect(typeof (r as { updatedAt: unknown }).updatedAt).toBe("number");
    }
  });

  it("actions issued before loading finishes are not lost", async () => {
    const a = make();
    await a.ready();
    await a.addNote(A, 5, "old");
    a.dispose();
    const b = make();
    const pending = b.addNote(A, 6, "early"); // before ready()
    await pending;
    expect(notesFor(b.store.getState(), A).map((n) => n.text)).toEqual(["old", "early"]);
  });
});

describe("queue", () => {
  it("adds at the end or right after the current entry, moves and removes", async () => {
    const p = make();
    const [k1, k2, k3] = await p.enqueue([
      { shiurId: A, start: 0, end: 10 },
      { shiurId: B, start: 5, end: 15 },
      { shiurId: C, start: 0 },
    ]);
    await p.setQueueCurrent(k1!);
    const [n1, n2] = await p.enqueue(
      [
        { shiurId: C, start: 100, end: 110 },
        { shiurId: C, start: 200, end: 210 },
      ],
      "next",
    );
    const order = () => p.store.getState().queue.map((q) => q.key);
    expect(order()).toEqual([k1, n1, n2, k2, k3]);
    await p.moveInQueue(k3!, -1);
    expect(order()).toEqual([k1, n1, n2, k3, k2]);
    await p.moveInQueue(k1!, -1); // already first: no change
    expect(order()).toEqual([k1, n1, n2, k3, k2]);
    await p.removeFromQueue(k1!);
    expect(order()).toEqual([n1, n2, k3, k2]);
    expect(queueCurrentKey(p.store.getState())).toBeNull();
  });

  it("drops invalid moments (bad id, end before start, negative time)", async () => {
    const p = make();
    const keys = await p.enqueue([
      { shiurId: "../etc", start: 0 },
      { shiurId: A, start: 50, end: 40 },
      { shiurId: A, start: -1 },
      { shiurId: A, start: 5 },
    ]);
    expect(keys).toHaveLength(1);
  });

  it("replaceQueue makes the first entry current; clearQueue empties it", async () => {
    const p = make();
    const keys = await p.replaceQueue([
      { shiurId: A, start: 1, end: 2 },
      { shiurId: B, start: 3 },
    ]);
    expect(queueCurrentKey(p.store.getState())).toBe(keys[0]);
    await p.clearQueue();
    expect(p.store.getState().queue).toEqual([]);
    expect(queueCurrentKey(p.store.getState())).toBeNull();
  });
});

describe("progress", () => {
  it("records position, chapters and completion; continue lists unfinished shiurim, newest first", async () => {
    const p = make();
    await p.recordProgress({ shiurId: A, t: 600, duration: 3000, completedChapters: [0] });
    await p.recordProgress({ shiurId: B, t: 10, duration: 2000 }); // too little to "continue"
    await p.recordProgress({ shiurId: C, t: 400, duration: 2500 });
    await p.recordProgress({ shiurId: A, t: 900, duration: 3000, completedChapters: [1] });
    let s = p.store.getState();
    expect(s.progress[A]?.completedChapters).toEqual([0, 1]);
    expect(continueListening(s).map((r) => r.shiurId)).toEqual([A, C]);

    await p.recordProgress({ shiurId: C, t: 2490, duration: 2500 });
    s = p.store.getState();
    expect(s.progress[C]).toMatchObject({ t: 2500 });
    expect(s.progress[C]?.completedAt).not.toBeNull();
    expect(continueListening(s).map((r) => r.shiurId)).toEqual([A]);
    expect(s.history.map((h) => h.shiurId)).toEqual([C, A, B]);
  });
});

describe("playlists, saved, notes", () => {
  it("edits playlists", async () => {
    const p = make();
    const id = await p.createPlaylist("Hester panim", [{ shiurId: A, start: 1, end: 5 }]);
    await p.addToPlaylist(id, [{ shiurId: B, start: 7 }]);
    await p.renamePlaylist(id, "Purim");
    await p.removeFromPlaylist(id, 0);
    expect(p.store.getState().playlists[0]).toMatchObject({ name: "Purim", items: [{ shiurId: B, start: 7, end: null }] });
    await p.deletePlaylist(id);
    expect(p.store.getState().playlists).toEqual([]);
  });

  it("saving the same moment twice keeps one", async () => {
    const p = make();
    const a = await p.saveMoment({ shiurId: A, start: 10, momentId: `${A}~s1` });
    const b = await p.saveMoment({ shiurId: A, start: 10, momentId: `${A}~s1` });
    expect(a).toBe(b);
    expect(p.store.getState().saved).toHaveLength(1);
    await p.unsave(a!);
    expect(p.store.getState().saved).toEqual([]);
  });

  it("notes: empty text is refused, editing to empty deletes", async () => {
    const p = make();
    expect(await p.addNote(A, 5, "   ")).toBeNull();
    const id = await p.addNote(A, 5, " the mashal ");
    expect(notesFor(p.store.getState(), A)[0]?.text).toBe("the mashal");
    await p.editNote(id!, "the nimshal");
    expect(notesFor(p.store.getState(), A)[0]?.text).toBe("the nimshal");
    await p.editNote(id!, "");
    expect(p.store.getState().notes).toEqual([]);
  });
});

describe("export and import", () => {
  async function filled(): Promise<Personal> {
    const p = make();
    await p.recordProgress({ shiurId: A, t: 600, duration: 3000, completedChapters: [0, 2] });
    await p.replaceQueue([
      { shiurId: B, start: 30, end: 60 },
      { shiurId: C, start: 0 },
    ]);
    await p.createPlaylist("Purim", [{ shiurId: A, start: 1, end: 9, momentId: `${A}~st0` }]);
    await p.saveMoment({ shiurId: B, start: 77.5 });
    await p.addNote(C, 3, "אַ הערה");
    await p.setPref("read", "yi");
    return p;
  }

  it("export → import (replace) into an empty store reproduces the data exactly", async () => {
    const a = await filled();
    const text = serializeExport(await a.exportFile());
    const before = dumpFromData(a.store.getState());
    await a.clearAll();
    expect(dumpFromData(a.store.getState()).notes).toEqual([]);

    const r = await a.importText(text, "replace");
    expect(r.skipped).toBe(0);
    expect(dumpFromData(a.store.getState())).toEqual(before);
    a.dispose();
    // ... and it is in the database, not only in memory.
    const b = make();
    await b.ready();
    expect(dumpFromData(b.store.getState())).toEqual(before);
  });

  it("merge keeps the newer record per key", async () => {
    const a = await filled();
    const text = serializeExport(await a.exportFile());
    const noteId = a.store.getState().notes[0]!.id;
    await a.editNote(noteId, "edited after export"); // newer than the file's copy
    await a.deletePlaylist(a.store.getState().playlists[0]!.id); // gone locally, present in file
    await a.importText(text, "merge");
    const s = a.store.getState();
    expect(s.notes.find((n) => n.id === noteId)?.text).toBe("edited after export");
    expect(s.playlists.map((p) => p.name)).toEqual(["Purim"]);
  });

  it("a bad file changes nothing", async () => {
    const a = await filled();
    const before = dumpFromData(a.store.getState());
    await expect(a.importText("{not json", "replace")).rejects.toMatchObject({ code: "not-json" });
    expect(dumpFromData(a.store.getState())).toEqual(before);
  });
});

describe("storage unavailable or failing", () => {
  it("works in memory when IndexedDB cannot be opened", async () => {
    // @ts-expect-error simulate blocked storage
    globalThis.indexedDB = undefined;
    const p = make();
    await p.ready();
    expect(p.store.getState()).toMatchObject({ status: "ready", persistent: false });
    const keys = await p.enqueue([{ shiurId: A, start: 1, end: 3 }]);
    await p.createPlaylist("x", [{ shiurId: A, start: 1 }]);
    await p.recordProgress({ shiurId: A, t: 100, duration: 200 });
    expect(p.store.getState().queue.map((q) => q.key)).toEqual(keys);
    const exported = await p.exportFile();
    expect(exported.data.playlists).toHaveLength(1);
  });

  it("switches to memory when a write fails, keeping what was there", async () => {
    let failing = false;
    const p = make({
      open: async () => {
        const opened = await openBestBackend();
        const real = opened.backend;
        const flaky: Backend = new Proxy(real, {
          get(target, prop, recv) {
            const v = Reflect.get(target, prop, recv) as unknown;
            if (typeof v !== "function") return v;
            return (...args: unknown[]) => {
              if (failing && prop !== "close") return Promise.reject(new DOMException("quota", "QuotaExceededError"));
              return (v as (...a: unknown[]) => unknown).apply(target, args);
            };
          },
        });
        return { backend: flaky, fallbackReason: null };
      },
    });
    await p.addNote(A, 1, "before");
    failing = true;
    await p.addNote(A, 2, "during");
    expect(p.store.getState()).toMatchObject({ persistent: false });
    expect(p.store.getState().fallbackReason).toMatch(/QuotaExceeded/);
    await p.addNote(A, 3, "after");
    expect(notesFor(p.store.getState(), A).map((n) => n.text)).toEqual(["before", "during", "after"]);
    const exported = await p.exportFile();
    expect(exported.data.notes).toHaveLength(3);
  });

  it("a memory backend given to the store is reported as not persistent", async () => {
    const p = make({ open: async () => ({ backend: new MemoryBackend(), fallbackReason: "test" }) });
    await p.ready();
    expect(p.store.getState()).toMatchObject({ persistent: false, fallbackReason: "test" });
  });
});

describe("other tabs", () => {
  it("reloads when another tab announces a change", async () => {
    const listeners: ((ev: MessageEvent) => void)[] = [];
    const sent: unknown[] = [];
    const channel = (): BroadcastLike => ({
      postMessage: (m) => {
        sent.push(m);
        for (const l of listeners) l(new MessageEvent("message", { data: m }));
      },
      addEventListener: (_t, fn) => listeners.push(fn),
      close: () => undefined,
    });
    const reader = make({ channel: channel() });
    await reader.ready();
    const writer = make({ channel: { postMessage: (m) => channel().postMessage(m), addEventListener: () => undefined, close: () => undefined } });
    await writer.addNote(B, 9, "from the other tab");
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.length).toBeGreaterThan(0);
    expect(notesFor(reader.store.getState(), B).map((n) => n.text)).toEqual(["from the other tab"]);
  });
});

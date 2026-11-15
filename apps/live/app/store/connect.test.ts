/** The personal store as Today's and the series pages' progress source (integration of W3.8/W3.9). */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { personalProgressSource, toTodayProgress } from "./connect.ts";
import { createPersonal, type Personal } from "./personal.ts";

const realIndexedDB = globalThis.indexedDB;
let p: Personal | null = null;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  p?.dispose();
  p = null;
  globalThis.indexedDB = realIndexedDB;
});

describe("personal store → Today progress", () => {
  it("maps a stored record to Today's shape", () => {
    expect(
      toTodayProgress({ shiurId: "a", t: 90, duration: 600, completedChapters: [], completedAt: null, updatedAt: 0 }),
    ).toEqual({ shiurId: "a", t: 90, completed: false, updatedAt: "1970-01-01T00:00:00.000Z" });
    expect(
      toTodayProgress({ shiurId: "a", t: 600, duration: 600, completedChapters: [0], completedAt: 5, updatedAt: 5 }).completed,
    ).toBe(true);
  });

  it("reads what the store recorded, after it has loaded", async () => {
    let clock = 1_000;
    p = createPersonal({ now: () => (clock += 10), channel: null });
    await p.recordProgress({ shiurId: "yi-tanya-1-01", t: 120, duration: 900 });
    await p.recordProgress({ shiurId: "en-tanya-1-01", t: 900, duration: 900, completed: true });
    const rows = await personalProgressSource(p).progress();
    const byId = new Map(rows.map((r) => [r.shiurId, r]));
    expect(byId.get("yi-tanya-1-01")).toMatchObject({ t: 120, completed: false });
    expect(byId.get("en-tanya-1-01")).toMatchObject({ completed: true });
  });
});

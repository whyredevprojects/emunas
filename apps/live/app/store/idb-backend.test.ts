/**
 * IndexedDB layer: schema creation, migrations (data carried forward, atomic on failure), and every
 * way opening can fail ending in the memory fallback instead of an error.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MIGRATIONS,
  latestVersion,
  openBestBackend,
  openIdbBackend,
  type Migration,
} from "./idb-backend.ts";
import { KEY_PATH, PERSONAL_DB_NAME, PERSONAL_SCHEMA_VERSION, STORE_NAMES, type NoteRecord } from "./schema.ts";

const realIndexedDB = globalThis.indexedDB;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  globalThis.indexedDB = realIndexedDB;
});

const note = (id: string, text: string): NoteRecord => ({
  id,
  shiurId: "yi-tanya-1-01",
  t: 12,
  text,
  createdAt: 1,
  updatedAt: 1,
});

/**
 * A stand-in for a future schema change, used to exercise the migration runner: version 2 adds an
 * `updatedAt` index on notes and rewrites every note (here: trims its text and records the version
 * that touched it in a pref).
 */
const V2: Migration = {
  version: 2,
  description: "test: index notes by updatedAt and rewrite them",
  async upgrade(_db, tx) {
    const notes = tx.objectStore("notes");
    notes.createIndex("updatedAt", "updatedAt");
    let cursor = await notes.openCursor();
    while (cursor) {
      const n = cursor.value as NoteRecord;
      await cursor.update({ ...n, text: n.text.trim(), updatedAt: n.updatedAt + 1 });
      cursor = await cursor.continue();
    }
    await tx.objectStore("prefs").put({ key: "migrated", value: 2, updatedAt: 0 });
  },
};

describe("schema", () => {
  it("the schema version is the number of migrations", () => {
    expect(latestVersion(MIGRATIONS)).toBe(PERSONAL_SCHEMA_VERSION);
  });

  it("migration versions must be consecutive from 1", () => {
    expect(() => latestVersion([{ ...V2 }])).toThrow(/expected 1/);
    expect(() => latestVersion([MIGRATIONS[0]!, { ...V2, version: 3 }])).toThrow(/expected 2/);
  });

  it("a fresh database has all seven stores with their key paths and indexes", async () => {
    const b = await openIdbBackend();
    b.close();
    const db = await openDB(PERSONAL_DB_NAME);
    expect(db.version).toBe(PERSONAL_SCHEMA_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual([...STORE_NAMES].sort());
    const tx = db.transaction(["queue", "notes", "progress"]);
    expect(tx.objectStore("queue").keyPath).toBe("key");
    expect([...tx.objectStore("queue").indexNames]).toEqual(["pos"]);
    expect([...tx.objectStore("notes").indexNames]).toEqual(["shiurId"]);
    expect(tx.objectStore("progress").keyPath).toBe("shiurId");
    db.close();
  });
});

describe("migrations", () => {
  it("upgrades an existing v1 database to v2 and keeps every record", async () => {
    const v1 = await openIdbBackend();
    await v1.putMany("notes", [note("n1", "  first  "), note("n2", "second")]);
    await v1.put("progress", {
      shiurId: "yi-tanya-1-01",
      t: 300,
      duration: 1000,
      completedChapters: [0, 1],
      completedAt: null,
      updatedAt: 5,
    });
    v1.close();

    const v2 = await openIdbBackend({ migrations: [...MIGRATIONS, V2] });
    const notes = await v2.getAll("notes");
    expect(notes.map((n) => [n.id, n.text, n.updatedAt])).toEqual([
      ["n1", "first", 2],
      ["n2", "second", 2],
    ]);
    expect(await v2.getAll("progress")).toHaveLength(1);
    expect(await v2.getAll("prefs")).toEqual([{ key: "migrated", value: 2, updatedAt: 0 }]);
    v2.close();

    const db = await openDB(PERSONAL_DB_NAME);
    expect(db.version).toBe(2);
    expect([...db.transaction("notes").store.indexNames].sort()).toEqual(["shiurId", "updatedAt"]);
    db.close();
  });

  it("a brand-new database runs every migration in order", async () => {
    const b = await openIdbBackend({ migrations: [...MIGRATIONS, V2] });
    expect(await b.getAll("prefs")).toEqual([{ key: "migrated", value: 2, updatedAt: 0 }]);
    b.close();
  });

  it("a failing migration leaves the old database and its data untouched", async () => {
    const v1 = await openIdbBackend();
    await v1.put("notes", note("n1", "keep me"));
    v1.close();

    const broken: Migration = {
      version: 2,
      description: "throws half way",
      async upgrade(db, tx) {
        await tx.objectStore("notes").clear();
        db.deleteObjectStore("history");
        throw new Error("boom");
      },
    };
    await expect(openIdbBackend({ migrations: [...MIGRATIONS, broken] })).rejects.toThrow();

    const again = await openIdbBackend();
    expect((await again.getAll("notes")).map((n) => n.text)).toEqual(["keep me"]);
    expect(await again.getAll("history")).toEqual([]);
    again.close();
  });

  it("an older tab's connection closes so a newer build can upgrade", async () => {
    const old = await openIdbBackend();
    await old.put("notes", note("n1", "x"));
    // `old` stays open; the v2 open must not block on it.
    const v2 = await openIdbBackend({ migrations: [...MIGRATIONS, V2], timeoutMs: 2000 });
    expect(await v2.getAll("notes")).toHaveLength(1);
    v2.close();
  });
});

describe("fallback to memory", () => {
  it("uses IndexedDB when it opens", async () => {
    const { backend, fallbackReason } = await openBestBackend();
    expect(backend.kind).toBe("indexeddb");
    expect(fallbackReason).toBeNull();
    backend.close();
  });

  it("falls back when indexedDB is missing", async () => {
    // @ts-expect-error simulate a browser without IndexedDB
    globalThis.indexedDB = undefined;
    const { backend, fallbackReason } = await openBestBackend();
    expect(backend.kind).toBe("memory");
    expect(fallbackReason).toMatch(/not available/);
  });

  it("falls back when reading indexedDB throws (blocked storage)", async () => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    try {
      const { backend } = await openBestBackend();
      expect(backend.kind).toBe("memory");
    } finally {
      Object.defineProperty(globalThis, "indexedDB", { configurable: true, writable: true, value: new IDBFactory() });
    }
  });

  it("falls back when open() itself throws", async () => {
    const f = new IDBFactory();
    f.open = () => {
      throw new DOMException("denied", "InvalidStateError");
    };
    globalThis.indexedDB = f;
    const { backend, fallbackReason } = await openBestBackend();
    expect(backend.kind).toBe("memory");
    expect(fallbackReason).toMatch(/denied/);
  });

  it("falls back (and does not touch the data) when the database is newer than this build", async () => {
    const newer = await openIdbBackend({ migrations: [...MIGRATIONS, V2] });
    await newer.put("notes", note("n1", "from the future"));
    newer.close();
    await expect(openIdbBackend()).rejects.toThrow();
    const { backend } = await openBestBackend();
    expect(backend.kind).toBe("memory");
    const check = await openIdbBackend({ migrations: [...MIGRATIONS, V2] });
    expect(await check.getAll("notes")).toHaveLength(1);
    check.close();
  });

  it("falls back when an upgrade stays blocked", async () => {
    // A raw connection that ignores versionchange (e.g. a tab of a build without the close handler).
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(PERSONAL_DB_NAME, 1);
      req.onupgradeneeded = () => {
        for (const s of STORE_NAMES) req.result.createObjectStore(s, { keyPath: KEY_PATH[s] });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await expect(openIdbBackend({ migrations: [...MIGRATIONS, V2], timeoutMs: 100 })).rejects.toThrow(/timed out/);
    raw.close();
  });
});

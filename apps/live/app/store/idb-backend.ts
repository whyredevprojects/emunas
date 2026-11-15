/**
 * IndexedDB backend through `idb` (tech-live §1 "State", §4.2).
 *
 * Versioning: the database version is the schema version. `MIGRATIONS` is an ordered list; on open,
 * every migration whose `version` is above the database's old version runs inside the single
 * `versionchange` transaction, so an upgrade either completes or leaves the old database untouched.
 * To change the schema, append `{ version: N + 1, upgrade }` and raise `PERSONAL_SCHEMA_VERSION`
 * (a unit test keeps the two in step).
 *
 * Failure handling lives in `openBestBackend`: any error (no `indexedDB`, SecurityError in a
 * private window, a database written by a newer build, an open that never completes because another
 * tab blocks the upgrade) yields the in-memory backend instead, and the reason is reported.
 */
import { openDB, type IDBPDatabase, type IDBPTransaction } from "idb";
import { MemoryBackend, type Backend } from "./backend.ts";
import {
  KEY_PATH,
  PERSONAL_DB_NAME,
  PERSONAL_SCHEMA_VERSION,
  STORE_NAMES,
  emptyDump,
  type PersonalDump,
  type StoreName,
  type StoreRecords,
} from "./schema.ts";

export type UpgradeTransaction = IDBPTransaction<unknown, string[], "versionchange">;

export interface Migration {
  /** The database version this migration produces. */
  version: number;
  description: string;
  upgrade(db: IDBPDatabase, tx: UpgradeTransaction): Promise<void> | void;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: "create the eight personal stores",
    upgrade(db) {
      for (const name of STORE_NAMES) {
        const store = db.createObjectStore(name, { keyPath: KEY_PATH[name] });
        if (name === "queue") store.createIndex("pos", "pos");
        if (name === "notes" || name === "saved") store.createIndex("shiurId", "shiurId");
      }
    },
  },
];

/** Checks that versions are 1, 2, 3, … with no gaps; returns the last one. */
export function latestVersion(migrations: readonly Migration[]): number {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`migration ${i} has version ${m.version}, expected ${i + 1}`);
  });
  return migrations.length;
}

export interface IdbOptions {
  name?: string;
  migrations?: readonly Migration[];
  /** Give up on an open that has not completed after this long (blocked upgrade). Default 4000 ms. */
  timeoutMs?: number;
}

export class IdbBackend implements Backend {
  readonly kind = "indexeddb" as const;
  constructor(private readonly db: IDBPDatabase) {}

  async getAll<S extends StoreName>(store: S): Promise<StoreRecords[S][]> {
    return (await this.db.getAll(store)) as StoreRecords[S][];
  }

  async put<S extends StoreName>(store: S, record: StoreRecords[S]): Promise<void> {
    await this.db.put(store, record);
  }

  async putMany<S extends StoreName>(store: S, records: readonly StoreRecords[S][]): Promise<void> {
    const tx = this.db.transaction(store, "readwrite");
    await Promise.all([...records.map((r) => tx.store.put(r)), tx.done]);
  }

  async delete(store: StoreName, key: string): Promise<void> {
    await this.db.delete(store, key);
  }

  async clear(stores: readonly StoreName[] = STORE_NAMES): Promise<void> {
    const tx = this.db.transaction([...stores], "readwrite");
    await Promise.all([...stores.map((s) => tx.objectStore(s).clear()), tx.done]);
  }

  async replaceAll(dump: PersonalDump): Promise<void> {
    const tx = this.db.transaction([...STORE_NAMES], "readwrite");
    const ops: Promise<unknown>[] = [];
    for (const s of STORE_NAMES) {
      const os = tx.objectStore(s);
      ops.push(os.clear());
      for (const r of dump[s]) ops.push(os.put(r));
    }
    await Promise.all([...ops, tx.done]);
  }

  async dump(): Promise<PersonalDump> {
    const out = emptyDump();
    const tx = this.db.transaction([...STORE_NAMES], "readonly");
    for (const s of STORE_NAMES) (out as Record<StoreName, unknown[]>)[s] = await tx.objectStore(s).getAll();
    await tx.done;
    return out;
  }

  close(): void {
    this.db.close();
  }
}

function getFactory(): IDBFactory | null {
  try {
    // Reading the property itself can throw (SecurityError) where storage is blocked.
    const f = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    return f ?? null;
  } catch {
    return null;
  }
}

/** Opens (creating or upgrading) the personal database. Rejects on any failure. */
export async function openIdbBackend(opts: IdbOptions = {}): Promise<IdbBackend> {
  const migrations = opts.migrations ?? MIGRATIONS;
  // Opening the real database with a version the schema does not declare would be a build bug.
  if (opts.migrations === undefined && latestVersion(migrations) !== PERSONAL_SCHEMA_VERSION) {
    throw new Error("PERSONAL_SCHEMA_VERSION and MIGRATIONS disagree");
  }
  const version = latestVersion(migrations);
  if (getFactory() === null) throw new Error("indexedDB is not available");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const opening = openDB(opts.name ?? PERSONAL_DB_NAME, version, {
    upgrade(db, oldVersion, _newVersion, tx) {
      const run = async (): Promise<void> => {
        for (const m of migrations) {
          if (m.version > oldVersion) await m.upgrade(db, tx as unknown as UpgradeTransaction);
        }
      };
      // `idb` ignores the callback's promise: a failed migration must abort the versionchange
      // transaction itself, which rolls the database back and makes the open reject.
      // The open request reports an abort; the transaction's own promise need not.
      tx.done.catch(() => undefined);
      run().catch(() => {
        try {
          tx.abort();
        } catch {
          /* already finished or aborted */
        }
      });
    },
    blocking() {
      // A newer build in another tab wants to upgrade: let it.
      void opening.then((db) => db.close()).catch(() => undefined);
    },
  });
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("indexedDB open timed out")), opts.timeoutMs ?? 4000);
  });
  try {
    const db = await Promise.race([opening, timeout]);
    return new IdbBackend(db);
  } catch (e) {
    // If the open completes after the timeout, do not leave a stray connection behind.
    opening.then((db) => db.close()).catch(() => undefined);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface OpenedBackend {
  backend: Backend;
  /** Why the memory fallback is in use; `null` when IndexedDB opened. */
  fallbackReason: string | null;
}

/** IndexedDB when it works, else memory. Never rejects. */
export async function openBestBackend(opts: IdbOptions = {}): Promise<OpenedBackend> {
  try {
    return { backend: await openIdbBackend(opts), fallbackReason: null };
  } catch (e) {
    const reason = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { backend: new MemoryBackend(), fallbackReason: reason };
  }
}

/**
 * Storage backends for personal data. The app talks to `Backend`; IndexedDB (`idb-backend.ts`) is
 * the real one and `MemoryBackend` the fallback when storage is unavailable (private windows that
 * block IndexedDB, blocked site data, a database newer than this build, quota errors). With the
 * memory backend everything works for the life of the tab and the UI says that nothing is kept.
 */
import { STORE_NAMES, emptyDump, keyOf, type PersonalDump, type StoreName, type StoreRecords } from "./schema.ts";

export type BackendKind = "indexeddb" | "memory";

export interface Backend {
  readonly kind: BackendKind;
  getAll<S extends StoreName>(store: S): Promise<StoreRecords[S][]>;
  put<S extends StoreName>(store: S, record: StoreRecords[S]): Promise<void>;
  putMany<S extends StoreName>(store: S, records: readonly StoreRecords[S][]): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  /** Clears the given stores (all when omitted) in one transaction. */
  clear(stores?: readonly StoreName[]): Promise<void>;
  /** Replaces the whole content in one transaction (import "replace"). */
  replaceAll(dump: PersonalDump): Promise<void>;
  dump(): Promise<PersonalDump>;
  close(): void;
}

/** Deep copy through JSON: what goes in and comes out is detached, like IndexedDB's structured clone. */
function copy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export class MemoryBackend implements Backend {
  readonly kind = "memory" as const;
  private data: { [S in StoreName]: Map<string, StoreRecords[S]> };

  constructor(initial: PersonalDump = emptyDump()) {
    this.data = {
      progress: new Map(),
      queue: new Map(),
      playlists: new Map(),
      saved: new Map(),
      notes: new Map(),
      history: new Map(),
      prefs: new Map(),
    };
    this.load(initial);
  }

  private load(dump: PersonalDump): void {
    for (const s of STORE_NAMES) this.fill(s, dump[s]);
  }

  private fill<S extends StoreName>(store: S, records: readonly StoreRecords[S][]): void {
    const m = this.data[store] as Map<string, StoreRecords[S]>;
    for (const r of records) m.set(keyOf(store, r), copy(r));
  }

  async getAll<S extends StoreName>(store: S): Promise<StoreRecords[S][]> {
    return [...(this.data[store] as Map<string, StoreRecords[S]>).values()].map(copy);
  }

  async put<S extends StoreName>(store: S, record: StoreRecords[S]): Promise<void> {
    this.fill(store, [record]);
  }

  async putMany<S extends StoreName>(store: S, records: readonly StoreRecords[S][]): Promise<void> {
    this.fill(store, records);
  }

  async delete(store: StoreName, key: string): Promise<void> {
    this.data[store].delete(key);
  }

  async clear(stores: readonly StoreName[] = STORE_NAMES): Promise<void> {
    for (const s of stores) this.data[s].clear();
  }

  async replaceAll(dump: PersonalDump): Promise<void> {
    await this.clear();
    this.load(dump);
  }

  async dump(): Promise<PersonalDump> {
    const out = emptyDump();
    for (const s of STORE_NAMES) (out as Record<StoreName, unknown[]>)[s] = await this.getAll(s);
    return out;
  }

  close(): void {}
}

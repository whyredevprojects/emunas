/**
 * The page's handle on the facet engine: a Web Worker in the browser, the same engine in-thread when
 * `Worker` is missing or fails to start. Queries resolve in order; callers keep only the latest.
 */
import type { QueryResult } from "./engine.ts";
import type { ExploreFilters, FacetRow } from "./model.ts";
import { FacetHost, slimRow, type FacetRequest, type FacetResponse } from "./protocol.ts";

export interface TimedResult extends QueryResult {
  /** Engine time for this query, in milliseconds (excluding message passing). */
  ms: number;
}

export interface FacetService {
  readonly mode: "worker" | "inline";
  query(filters: ExploreFilters): Promise<TimedResult>;
  dispose(): void;
}

function inlineService(rows: readonly FacetRow[]): FacetService {
  const host = new FacetHost();
  host.handle({ type: "init", rows: rows.map(slimRow) });
  return {
    mode: "inline",
    query(filters) {
      const res = host.handle({ type: "query", id: 0, filters });
      if (res.type === "result") return Promise.resolve({ ...res.result, ms: res.ms });
      return Promise.reject(new Error(res.type === "error" ? res.message : "unexpected response"));
    },
    dispose() {},
  };
}

function workerService(rows: readonly FacetRow[], worker: Worker): FacetService {
  let nextId = 1;
  const pending = new Map<number, { resolve: (r: TimedResult) => void; reject: (e: unknown) => void }>();
  let fallback: FacetService | null = null;

  const failAll = (why: string) => {
    fallback ??= inlineService(rows);
    // Answer what was pending from the in-thread engine so the page never hangs on a dead worker.
    for (const [, p] of pending) p.reject(new Error(why));
    pending.clear();
  };

  worker.onmessage = (e: MessageEvent<FacetResponse>) => {
    const msg = e.data;
    if (msg.type === "result") {
      pending.get(msg.id)?.resolve({ ...msg.result, ms: msg.ms });
      pending.delete(msg.id);
    } else if (msg.type === "error") {
      if (msg.id === null) failAll(msg.message);
      else {
        pending.get(msg.id)?.reject(new Error(msg.message));
        pending.delete(msg.id);
      }
    }
  };
  worker.onerror = () => {
    failAll("facet worker failed");
    worker.terminate();
  };
  const init: FacetRequest = { type: "init", rows: rows.map(slimRow) };
  worker.postMessage(init);

  return {
    mode: "worker",
    query(filters) {
      if (fallback) return fallback.query(filters);
      const id = nextId++;
      const req: FacetRequest = { type: "query", id, filters };
      return new Promise<TimedResult>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage(req);
      }).catch((e: unknown) => {
        if (fallback) return fallback.query(filters);
        throw e;
      });
    },
    dispose() {
      worker.terminate();
      pending.clear();
    },
  };
}

export interface FacetServiceOptions {
  /** Force the in-thread engine (tests). Default: a worker when the platform has one. */
  inline?: boolean;
}

export function createFacetService(rows: readonly FacetRow[], opts: FacetServiceOptions = {}): FacetService {
  if (opts.inline || typeof Worker === "undefined") return inlineService(rows);
  try {
    const worker = new Worker(new URL("./facet.worker.ts", import.meta.url), { type: "module", name: "explore-facets" });
    return workerService(rows, worker);
  } catch {
    return inlineService(rows);
  }
}

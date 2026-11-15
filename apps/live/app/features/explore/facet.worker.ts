/**
 * The facet Web Worker (tech-live §4.3): builds the bitsets once from `corpus.json` rows and answers
 * facet queries off the main thread. Bundled by Vite as a separate module chunk.
 */
import { FacetHost, type FacetRequest, type FacetResponse } from "./protocol.ts";

interface WorkerScope {
  onmessage: ((e: MessageEvent<FacetRequest>) => void) | null;
  postMessage(msg: FacetResponse, transfer?: Transferable[]): void;
}

const scope = globalThis as unknown as WorkerScope;
const host = new FacetHost();

scope.onmessage = (e) => {
  const res = host.handle(e.data);
  // The match list is a fresh array per query, so it can be transferred instead of copied.
  scope.postMessage(res, res.type === "result" ? [res.result.matches.buffer as ArrayBuffer] : []);
};

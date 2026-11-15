/**
 * `@emunas/search-core/build`: Node-only. Builds SearchDoc/MomentRow from `.corpus/` and writes
 * `.corpus/search/{docs,moments}.ndjson`.
 */
export { buildMomentRows, buildSearchDoc } from "./docs.ts";
export {
  buildSearchOutputs,
  loadCandidateTopics,
  readCorpusShiurim,
  toNdjson,
  writeSearchOutputs,
} from "./emit.ts";
export type { SearchOutputs, WriteSearchOptions, WriteSearchResult } from "./emit.ts";
export { canonicalJson, contentHash } from "./hash.ts";

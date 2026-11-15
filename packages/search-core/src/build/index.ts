/**
 * `@emunas/search-core/build`: Node-only. Builds SearchDoc/MomentRow/EntityDoc from `.corpus/` and
 * its corpus layer, and writes `.corpus/search/{docs,moments,entities}.ndjson`.
 */
export { MOMENT_TOPIC_SALIENCE, buildMomentRows, buildSearchDoc, topicKeywords } from "./docs.ts";
export { buildEntityDocs } from "./entities.ts";
export {
  buildSearchOutputs,
  readCorpusShiurim,
  readSearchLayerInput,
  toNdjson,
  writeSearchOutputs,
} from "./emit.ts";
export type { SearchLayerInput, SearchOutputs, WriteSearchOptions, WriteSearchResult } from "./emit.ts";
export {
  SynonymCheckError,
  assertNoAsrVariants,
  displayFieldsOf,
  displaySetsOf,
  facetIdSets,
  loadDisplaySets,
  readLayerFiles,
  readSearchLayer,
  verifyDisplaySynonyms,
} from "./layer.ts";
export type { DisplaySets, LayerFiles } from "./layer.ts";
export { canonicalJson, contentHash } from "./hash.ts";

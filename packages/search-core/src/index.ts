/**
 * `@emunas/search-core`: browser-safe. The indexed-field allow-list types and query/index text
 * normalization. The builders that write `.corpus/search/*.ndjson` live in `@emunas/search-core/build`
 * (Node only).
 */
export * from "./types.ts";
export { normalizeQuery, MAX_QUERY_LENGTH } from "./query.ts";
export type { EntityExpansion, Expansion, ExpansionKind, NormalizedQuery } from "./query.ts";
export {
  MAX_ENTITY_MATCHES,
  MAX_PREFIX_TOKENS,
  buildSynonymTable,
  isFunctionWord,
  matchSpan,
} from "./synonyms.ts";
export type { EntityMatch, EntityMatchKind, SynonymEntry, SynonymSource, SynonymTable, SynonymTableOptions } from "./synonyms.ts";
export { synonymKey } from "./layer-types.ts";
export type { SearchLayer, SearchLayerTopic } from "./layer-types.ts";
export {
  docSearchText,
  docTextParts,
  foldForIndex,
  indexTokens,
  localizedTexts,
  momentRowText,
  momentSearchText,
  parshaLabels,
  yearLabels,
  zmanLabels,
} from "./text.ts";

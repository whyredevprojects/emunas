/**
 * `@emunas/search-core`: browser-safe. The indexed-field allow-list types and query/index text
 * normalization. The builders that write `.corpus/search/*.ndjson` live in `@emunas/search-core/build`
 * (Node only).
 */
export * from "./types.ts";
export { normalizeQuery, MAX_QUERY_LENGTH } from "./query.ts";
export type { Expansion, ExpansionKind, NormalizedQuery } from "./query.ts";
export {
  docSearchText,
  docTextParts,
  foldForIndex,
  indexTokens,
  momentSearchText,
  parshaLabels,
  yearLabels,
  zmanLabels,
} from "./text.ts";

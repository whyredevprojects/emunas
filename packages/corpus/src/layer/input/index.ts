/**
 * Corpus-layer input (corpus-wave-plan §3.1, §3.2): the allow-listed reader of
 * `data/derived/corpus/`, its loose schemas, and the visible-set model. Node-only build tooling.
 */
export {
  CORE_FILES,
  CORPUS_DIR,
  KNOWN_CORPUS_VERSIONS,
  OPTIONAL_FILES,
  isForbiddenInputKey,
  readCorpusInput,
} from "./load.ts";
export type { CorpusInput, CorpusInputReport, CorpusInputResult, DroppedRecord, ReadCorpusInputOptions } from "./load.ts";
export { CORPUS_ID_RE, PERSON_TYPES, REDIRECT_KINDS, SHIUR_ID_RE } from "./schemas.ts";
export type {
  ConceptIn,
  CorpusIndexIn,
  PersonIn,
  PersonTypeIn,
  RedirectKind,
  RedirectsIn,
  SeriesSynthesisIn,
  ShiurTagsIn,
  StoryIn,
  TeachingClusterIn,
  TopicIn,
  WorkIn,
} from "./schemas.ts";
export { buildVisibleSet, loadCategoryVisibility } from "./visible.ts";
export type { CategoryVisibility, DropReason, VisibleSet, VisibleSetInput, VisibleShiurSource } from "./visible.ts";

export { UI_DIR, UI_ENDONYM, UI_LANGS, UI_LOCALE, byUiLang, isUiLang, otherUiLangs, type UiLang } from "./lang.ts";
export {
  CONTENT_FALLBACK,
  SOURCE_LANGS,
  TRANSLATED_LANGS,
  isSourceLang,
  hasContent,
  pickLocalized,
  pickText,
  type ContentChain,
  type Localized,
  type LocalizedText,
  type Picked,
  type PickedText,
  type SourceLang,
  type TranslatedLang,
} from "./content.ts";
export {
  createT,
  type Message,
  type MessageTable,
  type MessageTables,
  type Params,
  type TFunction,
} from "./t.ts";
export { pluralCategory, pluralRules, selectPlural, type PluralMessage } from "./plural.ts";
export { formatNumber } from "./numbers.ts";
export { formatClock, formatDuration, type DurationStyle } from "./duration.ts";
export { hebrewLetters, hebrewNumeral, numeralValue, punctuateNumeral, type NumeralMarks } from "./gematria.ts";
export {
  civilPair,
  civilYearsOf,
  formatHebrewYear,
  formatHebrewYears,
  hebrewYearParts,
  type HebrewYearOptions,
  type HebrewYearParts,
} from "./hebrew-year.ts";
export {
  firstStrongDir,
  hebrewScriptLang,
  isolate,
  langFor,
  scriptOf,
  stripBidiControls,
  type AudioLang,
  type Dir,
  type LangAttrs,
  type Script,
} from "./script.ts";
export {
  AUDIO_LANGUAGE_LABELS,
  CATEGORY_LABELS,
  LANGUAGE_NAMES,
  NOTICES,
  RESOLUTION_LABELS,
  SECTION_KIND_LABELS,
  VOCABULARY_REVIEW_STATUS,
  audioLanguageLabel,
  categoryLabel,
  coverageNotice,
  formatSourceRef,
  languageName,
  notice,
  sectionKindLabel,
  sourceRefParts,
  type Category,
  type NoticeKey,
  type Resolution,
  type SectionKind,
  type SourceRefInput,
  type SourceRefParts,
} from "./vocabulary.ts";
export { AI_LABEL, AI_LABEL_STATUS } from "./vocab/ai-label.ts";
export {
  CORPUS_LABELS,
  CORPUS_LABEL_STATUS,
  PERSON_GROUP_ORDER,
  TOPIC_GRADES,
  corpusEntryLabel,
  corpusLabel,
  personGroupLabel,
  topicGradeLabel,
  type CorpusLabelKey,
  type PersonGroup,
  type TopicGrade,
} from "./vocab/corpus.ts";

/**
 * @emunas/normalize — text folding, alias tables, stable keys, Sefaria ref parser, gematria.
 * Pure and browser-safe (no node:* imports, no I/O). See README.md.
 */
export { normalizeHe, foldBasic, foldBasicTokens, fold, foldTokens, applyVariants } from "./fold.ts";
export { slugify, isKey } from "./slug.ts";
export { toHebrewNumeral, hebrewYear, parseHebrewNumeral, parseHebrewYear } from "./gematria.ts";
export type { NumeralOptions, YearOptions } from "./gematria.ts";

export { lookupParsha, lookupZman, parshaByKey, occasionByKeyOf } from "./occasion.ts";
export type { OccasionMatch, Audience, OccasionSub } from "./occasion.ts";
export { lookupWork, workByKey, workForm, compareWorks } from "./work.ts";
export type { WorkMatch } from "./work.ts";
export { lookupPerson, personByKey, personForm, lookupConcept } from "./person.ts";
export type { PersonMatch, ConceptMatch } from "./person.ts";
export { parseSefariaRef, compareRefs, compareSortKeys, sefariaUrl, refLabel } from "./sefaria.ts";
export type { ParsedRef, UnparsedRef, RefParse, RefPoint, RefCorpus } from "./sefaria.ts";
export { parshaKey, zmanKey, workKey, personKey, conceptKey, createKeyer } from "./keys.ts";
export type { NormalizeKeyer, ReportingKeyer, UnmappedEntry, KeyKind } from "./keys.ts";

export { PARSHIYOS, parshiyosReviewStatus } from "./tables/parshiyos.ts";
export type { Parsha, ChumashKey } from "./tables/parshiyos.ts";
export { OCCASIONS, OTHER_OCCASION_KEY, OTHER_ZMANIM, occasionsReviewStatus } from "./tables/occasions.ts";
export type { Occasion, OccasionWindow, HebMonth, HebDay } from "./tables/occasions.ts";
export { WORKS, WORK_GROUPS, WORK_GROUP_LABELS, worksReviewStatus } from "./tables/works.ts";
export type { Work, WorkGroup, OrderingScheme } from "./tables/works.ts";
export { TANACH, tanachReviewStatus } from "./tables/tanach.ts";
export type { TanachBook, TanachSection } from "./tables/tanach.ts";
export { TRACTATES, tractatesReviewStatus } from "./tables/tractates.ts";
export type { Tractate, Seder } from "./tables/tractates.ts";
export { PEOPLE, peopleReviewStatus } from "./tables/people.ts";
export type { Person } from "./tables/people.ts";
export { CONCEPT_ALIASES, conceptsReviewStatus } from "./tables/concepts.ts";
export { VARIANTS, variantsReviewStatus } from "./tables/variants.ts";
export { MISHNEH_TORAH_HILCHOS, SHULCHAN_ARUKH_PARTS, SEFER_HAMITZVOT_PARTS, refSectionsReviewStatus } from "./tables/ref-sections.ts";

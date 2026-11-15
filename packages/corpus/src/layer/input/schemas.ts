/**
 * Loose valibot schemas for the corpus-wide files (docs/corpus-data.md, src/corpus-types.ts;
 * corpus-wave-plan §3.1). Required fields are the ones the sites render; everything else is read
 * optionally with a default. `v.object` drops unknown keys from the output, so a field the pipeline
 * adds is never copied further than this file until someone maps it on purpose (plan §1 rule 2).
 *
 * Validation is per record: the loader parses each array element on its own, so one bad record is
 * dropped and reported instead of failing the file.
 *
 * The compile-time checks at the bottom keep these schemas in step with the pipeline's types: a
 * pipeline record must always be accepted as schema input, so a breaking type change upstream
 * breaks the site typecheck, which is wanted.
 */
import * as v from "valibot";
import type {
  Concept,
  CorpusIndex,
  Person,
  Redirects,
  SeriesSynthesis,
  ShiurTags,
  Story,
  TeachingCluster,
  Topic,
  Work,
} from "../../../../../src/corpus-types.ts";

/** Corpus ids (topic, concept, person, work, story, cluster) and series ids. */
export const CORPUS_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Ingest shiur ids. */
export const SHIUR_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

const str = v.string();
const nonNegInt = v.pipe(v.number(), v.integer(), v.minValue(0));
const unit = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1));
const corpusId = v.pipe(str, v.regex(CORPUS_ID_RE, "not a corpus id (ASCII kebab slug)"));
const shiurId = v.pipe(str, v.regex(SHIUR_ID_RE, "not a shiur id"));
const strList = v.optional(v.array(str), () => []);
const idList = v.optional(v.array(corpusId), () => []);

export const BilingualSchema = v.object({ en: str, yi: str });
const ReviewStatusSchema = v.exactOptional(v.picklist(["unreviewed", "reviewed"]));
/** A retired record pointing at the record it was merged into (read when present). */
const mergedInto = v.exactOptional(corpusId);
/** Free-form classifier the pipeline may add (work: generic / commentary …; story: kind of maaseh). */
const kind = v.exactOptional(v.pipe(str, v.minLength(1)));
/** Topic `parsha` / `zman` keys (D11), one key or several. */
const occasionKeys = v.exactOptional(
  v.pipe(
    v.union([str, v.array(str), v.null()]),
    v.transform((x) => (x === null ? [] : typeof x === "string" ? [x] : x)),
  ),
);
const flag = v.exactOptional(v.boolean());

export const CorpusIndexSchema = v.object({
  version: v.pipe(v.number(), v.integer()),
  generatedAt: v.optional(str, ""),
  shiurIds: v.array(str),
  files: strList,
  pendingDescriptions: strList,
});

export const TopicSchema = v.object({
  id: corpusId,
  parentId: v.nullable(corpusId),
  level: v.picklist([1, 2, 3]),
  label: v.object({ en: str, yi: str, he: v.exactOptional(str) }),
  /** Search synonyms only, never displayed. */
  aliases: strList,
  description: v.optional(v.nullable(BilingualSchema), null),
  /** Read but never trusted for counts (plan §1 rule 5). */
  hubShiurIds: strList,
  sameAs: v.exactOptional(
    v.object({ conceptId: v.exactOptional(corpusId), personId: v.exactOptional(corpusId), workId: v.exactOptional(corpusId) }),
  ),
  parsha: occasionKeys,
  zman: occasionKeys,
  reviewStatus: ReviewStatusSchema,
  mergedInto,
});

export const ConceptSchema = v.object({
  id: corpusId,
  canonicalHe: str,
  label: BilingualSchema,
  transliterations: strList,
  definition: BilingualSchema,
  shiurIds: v.array(str),
  exampleRefs: v.optional(v.array(v.object({ shiurId: str, sectionIndex: nonNegInt })), () => []),
  reviewStatus: ReviewStatusSchema,
  mergedInto,
});

export const PERSON_TYPES = ["tanach", "chazal", "rishon", "acharon", "chassidic_rebbe", "other"] as const;
export type PersonTypeIn = (typeof PERSON_TYPES)[number];

export const PersonSchema = v.object({
  id: corpusId,
  nameHe: str,
  nameEn: str,
  nameYi: str,
  /** A type the site does not know yet is read as `other` (the loader reports it). */
  type: str,
  aliases: strList,
  shiurIds: v.array(str),
  private: flag,
  family: flag,
  contemporary: flag,
  reviewStatus: ReviewStatusSchema,
  mergedInto,
});

export const WorkSchema = v.object({
  id: corpusId,
  titleHe: str,
  titleEn: str,
  aliases: strList,
  authorPersonId: v.optional(v.nullable(corpusId), null),
  sefariaIndexTitle: v.optional(v.nullable(str), null),
  shiurIds: v.array(str),
  kind,
  reviewStatus: ReviewStatusSchema,
  mergedInto,
});

export const StorySchema = v.object({
  id: corpusId,
  title: BilingualSchema,
  retelling: BilingualSchema,
  /** Person ids where resolved, else the raw name (rendered unlinked). */
  people: strList,
  tellings: v.array(v.object({ shiurId: str, storyIndex: nonNegInt })),
  kind,
  reviewStatus: ReviewStatusSchema,
  mergedInto,
});

export const TeachingClusterSchema = v.object({
  id: corpusId,
  label: BilingualSchema,
  summary: BilingualSchema,
  topicIds: idList,
  members: v.array(v.object({ shiurId: str, insightIndex: nonNegInt })),
  reviewStatus: ReviewStatusSchema,
  mergedInto,
});

export const SeriesSynthesisSchema = v.object({
  seriesId: shiurId,
  title: BilingualSchema,
  overview: BilingualSchema,
  arc: v.array(v.object({ shiurId: str, part: v.pipe(v.number(), v.integer(), v.minValue(1)), oneLiner: BilingualSchema })),
  keyThemes: v.optional(v.array(BilingualSchema), () => []),
  reviewStatus: ReviewStatusSchema,
});

export const ShiurTagsSchema = v.object({
  shiurId,
  /** Optional upstream (added in e7680a2); null when absent. */
  otherSpeakerShare: v.optional(v.nullable(unit), null),
  topics: v.optional(v.array(v.object({ id: corpusId, salience: unit })), () => []),
  sections: v.optional(v.array(v.object({ index: nonNegInt, topicIds: idList })), () => []),
  conceptIds: idList,
  personIds: idList,
  workIds: idList,
  sourceWorkIds: v.optional(v.array(v.nullable(corpusId)), () => []),
});

/** Redirect kinds the sites know; any other top-level key is reported and ignored. */
export const REDIRECT_KINDS = ["topics", "concepts", "people", "works", "stories", "teachingClusters"] as const;
export type RedirectKind = (typeof REDIRECT_KINDS)[number];

/** Top level only; entries are checked one by one by the loader. */
export const RedirectsSchema = v.record(str, v.record(str, str));

export type CorpusIndexIn = v.InferOutput<typeof CorpusIndexSchema>;
export type TopicIn = v.InferOutput<typeof TopicSchema>;
export type ConceptIn = v.InferOutput<typeof ConceptSchema>;
export type PersonIn = Omit<v.InferOutput<typeof PersonSchema>, "type"> & { type: PersonTypeIn };
export type WorkIn = v.InferOutput<typeof WorkSchema>;
export type StoryIn = v.InferOutput<typeof StorySchema>;
export type TeachingClusterIn = v.InferOutput<typeof TeachingClusterSchema>;
export type SeriesSynthesisIn = v.InferOutput<typeof SeriesSynthesisSchema>;
export type ShiurTagsIn = v.InferOutput<typeof ShiurTagsSchema>;
export type RedirectsIn = Partial<Record<RedirectKind, Readonly<Record<string, string>>>>;

// ---------- compile-time checks against the pipeline types (read-only) ----------
type Accepts<S extends v.GenericSchema, T> = T extends v.InferInput<S> ? true : false;
const assertTrue = <T extends true>(): T => true as T;
export const _schemaChecks = [
  assertTrue<Accepts<typeof CorpusIndexSchema, CorpusIndex>>(),
  assertTrue<Accepts<typeof TopicSchema, Topic>>(),
  assertTrue<Accepts<typeof ConceptSchema, Concept>>(),
  assertTrue<Accepts<typeof PersonSchema, Person>>(),
  assertTrue<Accepts<typeof WorkSchema, Work>>(),
  assertTrue<Accepts<typeof StorySchema, Story>>(),
  assertTrue<Accepts<typeof TeachingClusterSchema, TeachingCluster>>(),
  assertTrue<Accepts<typeof SeriesSynthesisSchema, SeriesSynthesis>>(),
  assertTrue<Accepts<typeof ShiurTagsSchema, ShiurTags>>(),
  assertTrue<Accepts<typeof RedirectsSchema, Required<Redirects>>>(),
] as const;

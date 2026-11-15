/**
 * valibot schemas mirroring `src/types.ts` (pipeline, read-only) and the pipeline's manifest/meta
 * shapes. `v.object` drops unknown keys from the parsed output, so a field the pipeline adds later
 * never travels further than this file. Compile-time checks at the bottom keep the schemas and the
 * pipeline types in step: a pipeline type change breaks the site typecheck, which is wanted (§1.2).
 */
import * as v from "valibot";
import type { Extraction, IngestOutput, Recording, Series, Shiur, Writeup } from "../../../../src/types.ts";

const str = v.string();
const nstr = v.nullable(v.string());
const num = v.pipe(v.number(), v.finite());
const int = v.pipe(v.number(), v.integer());
const nonNegInt = v.pipe(v.number(), v.integer(), v.minValue(0));

export const LangSchema = v.picklist(["yi", "en"]);

export const LocalizedSchema = v.object({ en: str, yi: str, he: v.exactOptional(str) });

// ---------- ingest ----------

export const RecordingSchema = v.object({
  id: str,
  audioKey: str,
  transcriptKey: nstr,
  durationSec: v.nullable(num),
  asrModel: nstr,
  sizeBytes: nonNegInt,
  duplicateOf: nstr,
  partOf: nstr,
});

export const CategorySchema = v.picklist(["parsha", "zman", "shonos", "set", "simcha", "misc", "current", "purim"]);

export const ShiurSchema = v.object({
  id: v.pipe(str, v.regex(/^[a-z0-9][a-z0-9-]*$/)),
  lang: LangSchema,
  category: CategorySchema,
  seriesId: nstr,
  seriesOrder: v.nullable(int),
  catalog: v.object({
    source: v.picklist(["pocket-guide-2012", "uncatalogued-guide"]),
    sectionId: str,
    sectionTitle: str,
    n: nstr,
    page: v.nullable(int),
    titleOriginal: str,
    subTitle: nstr,
    heading: v.exactOptional(str),
    derived: v.picklist(["catalog", "pocket-guide", "dir-prefix", "filename"]),
    note: nstr,
  }),
  parsha: nstr,
  zman: nstr,
  perek: nstr,
  hebrewYears: v.array(int),
  recordingIds: v.array(str),
  inScope: v.boolean(),
  outOfScopeReason: nstr,
  pathNotes: v.array(str),
});

export const SeriesSchema = v.object({
  id: str,
  title: LocalizedSchema,
  lang: LangSchema,
  catalogSectionIds: v.array(str),
  shiurIds: v.array(str),
});

export const IngestSchema = v.object({
  generatedAt: str,
  stats: v.record(str, num),
  shiurim: v.array(ShiurSchema),
  recordings: v.array(RecordingSchema),
  series: v.array(SeriesSchema),
  warnings: v.array(str),
});

// ---------- manifest (scripts/lib/manifest.ts) ----------

export const ManifestEntrySchema = v.object({
  shiurId: str,
  lang: LangSchema,
  status: v.picklist(["pending", "in_progress", "done", "failed", "needs_review"]),
  promptVersion: v.nullable(v.object({ p4: nstr, p4b: nstr })),
  updatedAt: v.exactOptional(nstr),
});

export const ManifestSchema = v.object({
  version: v.literal(1),
  updatedAt: str,
  entries: v.array(ManifestEntrySchema),
});
export type ManifestEntry = v.InferOutput<typeof ManifestEntrySchema>;
export type Manifest = v.InferOutput<typeof ManifestSchema>;

// ---------- catalogs (section order and titles only) ----------

export const CatalogFileSchema = v.object({
  sections: v.array(
    v.object({
      id: str,
      title: str,
      pages: v.exactOptional(v.tuple([int, int])),
      dir: v.exactOptional(v.picklist(["rtl", "ltr"])),
    }),
  ),
});
export type CatalogFile = v.InferOutput<typeof CatalogFileSchema>;

// ---------- meta.json (scripts/lib/pilot.ts PilotMeta) ----------

export const MetaRecordingSchema = v.object({
  recording: v.object({ id: str }),
  order: nonNegInt,
  durationSec: v.pipe(num, v.minValue(0)),
  segmentCount: nonNegInt,
  starts: v.array(num),
  ends: v.array(num),
  noise: v.exactOptional(v.array(v.object({ idx: nonNegInt }))),
});

export const MetaSchema = v.object({
  shiurId: str,
  catalogTopics: v.array(str),
  totalDurationSec: num,
  recordings: v.pipe(v.array(MetaRecordingSchema), v.minLength(1)),
});
export type Meta = v.InferOutput<typeof MetaSchema>;
export type MetaRecording = v.InferOutput<typeof MetaRecordingSchema>;

// ---------- extraction / write-up (src/types.ts) ----------

const confidence = v.pipe(num, v.minValue(0), v.maxValue(1));
const segIdx = v.pipe(v.number(), v.integer());

export const EvidenceSchema = v.object({
  segs: v.array(segIdx),
  confidence,
  recordingId: v.exactOptional(str),
});

const SegRangeEntries = {
  recordingId: str,
  startSeg: segIdx,
  endSeg: segIdx,
};

export const SectionKindSchema = v.picklist([
  "intro",
  "main",
  "story",
  "tangent",
  "closing",
  "brachah",
  "singing",
  "other_speaker",
  "noise",
]);

export const SectionSchema = v.object({
  ...SegRangeEntries,
  title: LocalizedSchema,
  summary: LocalizedSchema,
  kind: SectionKindSchema,
  catalogTopicIdx: v.array(int),
  subsections: v.array(v.object({ ...SegRangeEntries, title: LocalizedSchema, summary: LocalizedSchema })),
});

export const SourceMentionSchema = v.object({
  heardAs: str,
  work: nstr,
  ref: nstr,
  sefariaRef: nstr,
  resolution: v.picklist(["resolved", "inferred", "unresolved"]),
  mention: v.picklist(["quoted", "paraphrased", "alluded"]),
  evidence: EvidenceSchema,
});

const TextItem = v.object({ text: LocalizedSchema, evidence: EvidenceSchema });

export const ExtractionSchema = v.object({
  shiurId: str,
  model: str,
  variant: str,
  promptVersion: v.exactOptional(str),
  summary: v.object({
    oneLiner: LocalizedSchema,
    abstract: LocalizedSchema,
    keyPoints: v.array(TextItem),
  }),
  sections: v.pipe(v.array(SectionSchema), v.minLength(1)),
  sources: v.array(SourceMentionSchema),
  insights: v.array(TextItem),
  stories: v.array(
    v.object({ title: LocalizedSchema, retelling: LocalizedSchema, people: v.array(str), evidence: EvidenceSchema }),
  ),
  questions: v.array(
    v.object({
      question: LocalizedSchema,
      answer: LocalizedSchema,
      questionSegs: v.array(segIdx),
      answerSegs: v.array(segIdx),
      confidence,
      recordingId: v.exactOptional(str),
    }),
  ),
  takeaways: v.array(TextItem),
  candidateTopics: v.array(str),
  concepts: v.array(v.object({ he: str, heardAs: v.array(str) })),
  people: v.array(v.object({ name: str, heardAs: v.array(str) })),
  asrNotes: str,
});

const WriteupBlockSchema = v.object({
  sectionIndex: nonNegInt,
  heading: nstr,
  paragraphs: v.array(v.object({ text: str, sourceIdx: v.array(int), evidence: EvidenceSchema })),
});

export const WriteupSchema = v.object({
  shiurId: str,
  model: str,
  variant: str,
  promptVersion: v.exactOptional(str),
  extractionVariant: str,
  en: v.array(WriteupBlockSchema),
  yi: v.array(WriteupBlockSchema),
});

// ---------- compile-time agreement with src/types.ts ----------

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type _CheckRecording = Assert<Same<v.InferOutput<typeof RecordingSchema>, Recording>>;
export type _CheckShiur = Assert<Same<v.InferOutput<typeof ShiurSchema>, Shiur>>;
export type _CheckSeries = Assert<Same<v.InferOutput<typeof SeriesSchema>, Series>>;
export type _CheckIngest = Assert<Same<v.InferOutput<typeof IngestSchema>, IngestOutput>>;
export type _CheckExtraction = Assert<Same<v.InferOutput<typeof ExtractionSchema>, Extraction>>;
export type _CheckWriteup = Assert<Same<v.InferOutput<typeof WriteupSchema>, Writeup>>;

/** Issue summary safe for reports: path and expectation only, never the received value. */
export function issueSummary(issues: readonly v.BaseIssue<unknown>[], max = 3): string[] {
  return issues.slice(0, max).map((i) => {
    const path = (i.path ?? []).map((p) => String((p as { key?: unknown }).key ?? "?")).join(".");
    return `${path || "(root)"}: expected ${i.expected ?? i.kind}`;
  });
}

/**
 * Runtime schemas for every `/data/*` file (W3.6 acceptance: "every emitted file validates against
 * its TS type"). Each schema is checked at compile time to infer exactly the contract type in
 * `app/data/types.ts` (mutual assignability, `_typeChecks` below), so a contract change that is not
 * mirrored here fails `tsc`. Objects are strict: an unexpected key (a field the contract does not
 * publish) fails validation.
 */
import * as v from "valibot";
import type { MediaUrl } from "@emunas/corpus/public";
import {
  LIVE_DATA_SCHEMA_VERSION,
  type BuildFile,
  type CorpusFile,
  type DataFiles,
  type DataKind,
  type EntityFile,
  type FacetsFile,
  type MomentShardFile,
  type QuickIndexFile,
  type SeriesFile,
  type ShiurFile,
  type StoriesFile,
  type TodayFile,
  type WorkFile,
  type WorksFile,
  type WriteupFile,
} from "../app/data/types.ts";

const str = v.string();
const num = v.pipe(v.number(), v.finite());
const int = v.pipe(v.number(), v.integer());
const nnum = v.nullable(num);
const nstr = v.nullable(str);
const ed = v.picklist(["en", "yi"]);
const L = v.strictObject({ en: str, yi: str });
const version = v.literal(LIVE_DATA_SCHEMA_VERSION);
const soft = v.exactOptional(v.literal(true));
const category = v.picklist(["parsha", "zman", "shonos", "set", "simcha", "misc", "current", "purim"]);
const sectionKind = v.picklist([
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
const status = v.picklist(["full", "catalog-only"]);
const resolution = v.picklist(["resolved", "inferred", "unresolved"]);
const mention = v.picklist(["quoted", "paraphrased", "alluded"]);
const momentKind = v.picklist(["kp", "s", "i", "tk", "q", "st"]);
const entityKind = v.picklist(["p", "c", "o"]);
const mediaUrl = v.custom<MediaUrl>((x) => typeof x === "string" && /^https?:\/\/[^/]+\/./.test(x), "media URL");
const counts = v.strictObject({ total: int, full: int, catalogOnly: int, downgraded: int });
const facetLabel = v.strictObject({ en: str, yi: str, he: v.exactOptional(str) });
const facetValue = v.strictObject({ label: facetLabel, count: int });
const momentRefEntries = { id: str, shiurId: str, kind: momentKind, t: nnum, end: nnum };
const momentRef = v.strictObject(momentRefEntries);
const moment = v.strictObject({ id: str, text: L, t: nnum, end: nnum, soft });
const keyed = v.nullable(v.strictObject({ raw: str, key: str }));

const recordingBase = {
  id: str,
  order: int,
  offset: num,
  duration: num,
  transcript: v.strictObject({ eligible: v.literal(false) }),
};
const recording = v.union([
  v.strictObject({ ...recordingBase, audioUrl: mediaUrl, playable: v.literal(true) }),
  v.strictObject({ ...recordingBase, audioUrl: v.null(), playable: v.literal(false) }),
]);

const catalogEntries = {
  source: v.picklist(["pocket-guide-2012", "uncatalogued-guide"]),
  sectionId: str,
  sectionTitle: str,
  n: nstr,
  page: v.nullable(int),
  titleOriginal: str,
  subTitle: nstr,
  heading: v.exactOptional(str),
  derived: v.picklist(["catalog", "pocket-guide", "dir-prefix", "filename"]),
};

const writeupBlock = v.strictObject({
  sectionIndex: int,
  heading: nstr,
  paragraphs: v.array(v.strictObject({ id: str, text: str, src: v.array(int), t: nnum, end: nnum })),
});

const notes = v.strictObject({
  summary: v.strictObject({ oneLiner: L, abstract: L, keyPoints: v.array(moment) }),
  chapters: v.array(
    v.strictObject({
      idx: int,
      id: str,
      recordingId: str,
      t: num,
      end: num,
      title: L,
      summary: L,
      kind: sectionKind,
      catalogTopicIdx: v.array(int),
      sub: v.array(v.strictObject({ title: L, summary: L, t: num })),
    }),
  ),
  skip: v.array(v.tuple([num, num, v.picklist([...sectionKind.options, "asr-noise"])])),
  sources: v.array(
    v.strictObject({
      idx: int,
      id: str,
      work: nstr,
      workKey: nstr,
      ref: nstr,
      sefariaRef: nstr,
      resolution,
      mention,
      t: nnum,
      soft,
    }),
  ),
  insights: v.array(moment),
  takeaways: v.array(moment),
  questions: v.array(v.strictObject({ id: str, q: L, a: L, tq: nnum, ta: nnum, soft })),
  stories: v.array(
    v.strictObject({
      id: str,
      title: L,
      retelling: L,
      people: v.array(str),
      peopleKeys: v.array(str),
      t: nnum,
      end: nnum,
      soft,
    }),
  ),
  people: v.array(v.strictObject({ name: str, key: str })),
  concepts: v.array(v.strictObject({ he: str, key: str })),
  writeupLangs: v.array(ed),
});

export const BuildSchema = v.strictObject({
  schemaVersion: version,
  corpusSchemaVersion: int,
  buildId: str,
  dataSha: nstr,
  generatedAt: v.pipe(str, v.isoTimestamp()),
  counts,
  momentShards: v.strictObject({ en: int, yi: int }),
});

export const CorpusSchema = v.strictObject({
  schemaVersion: version,
  buildId: str,
  counts,
  shiurim: v.array(
    v.strictObject({
      id: str,
      rev: str,
      lang: ed,
      category,
      status,
      perek: nstr,
      years: v.array(int),
      duration: num,
      oneLiner: v.nullable(L),
      title: str,
      heading: nstr,
      sectionTitle: str,
      derived: catalogEntries.derived,
      parsha: nstr,
      zman: nstr,
      series: v.nullable(v.strictObject({ id: str, order: v.nullable(num) })),
      entities: v.strictObject({ works: v.array(str), people: v.array(str), concepts: v.array(str) }),
      counts: v.strictObject({ chapters: int, stories: int, questions: int, insights: int }),
    }),
  ),
});

const facetRecord = v.record(str, facetValue);
const fv = v.exactOptional(facetValue);
export const FacetsSchema = v.strictObject({
  schemaVersion: version,
  category: v.strictObject({
    parsha: fv,
    zman: fv,
    shonos: fv,
    set: fv,
    simcha: fv,
    misc: fv,
    current: fv,
    purim: fv,
  }),
  lang: v.strictObject({ en: facetValue, yi: facetValue }),
  occasion: v.record(str, v.strictObject({ label: facetLabel, count: int, type: v.picklist(["parsha", "zman"]), hasPage: v.boolean() })),
  year: facetRecord,
  series: v.record(str, v.strictObject({ label: facetLabel, count: int, lang: ed, sibling: nstr })),
  work: facetRecord,
  person: facetRecord,
  concept: facetRecord,
});

export const TodaySchema = v.strictObject({
  schemaVersion: version,
  occasions: v.record(str, v.strictObject({ shiurIds: v.array(str), moments: v.array(momentRef) })),
  newlySummarized: v.array(v.strictObject({ shiurId: str, updatedAt: str })),
});

export const ShiurSchema = v.strictObject({
  schemaVersion: version,
  id: str,
  rev: str,
  lang: ed,
  category,
  catalog: v.strictObject({ ...catalogEntries, note: nstr, topics: v.array(str) }),
  parsha: keyed,
  zman: keyed,
  perek: nstr,
  years: v.array(int),
  series: v.nullable(v.strictObject({ id: str, order: v.nullable(num), count: int })),
  pathNotes: v.array(str),
  duration: num,
  recordings: v.array(recording),
  status,
  notes: v.exactOptional(notes),
  related: v.strictObject({
    sameOccasion: v.array(str),
    prev: nstr,
    next: nstr,
    neighbors: v.array(v.strictObject({ momentId: str, shiurId: str, t: num, score: num })),
  }),
});

export const WriteupSchema = v.strictObject({
  schemaVersion: version,
  shiurId: str,
  rev: str,
  lang: ed,
  blocks: v.array(writeupBlock),
});

export const SeriesSchema = v.strictObject({
  schemaVersion: version,
  id: str,
  title: L,
  lang: ed,
  sibling: nstr,
  parts: v.array(
    v.strictObject({
      shiurId: str,
      order: v.nullable(num),
      title: str,
      oneLiner: v.nullable(L),
      duration: num,
      years: v.array(int),
      status,
      perek: nstr,
    }),
  ),
  perekGroups: v.array(v.strictObject({ perek: str, shiurIds: v.array(str) })),
});

export const WorksSchema = v.strictObject({
  schemaVersion: version,
  works: v.array(v.strictObject({ key: str, name: str, label: facetLabel, count: int, mentions: int })),
});

const workCitation = v.strictObject({ shiurId: str, sourceId: str, t: nnum, mention, resolution });
export const WorkSchema = v.strictObject({
  schemaVersion: version,
  key: str,
  name: str,
  label: facetLabel,
  locations: v.array(v.strictObject({ ref: str, sefariaRef: nstr, citations: v.array(workCitation) })),
  unlocated: v.array(workCitation),
});

export const EntitySchema = v.strictObject({
  schemaVersion: version,
  kind: entityKind,
  key: str,
  label: facetLabel,
  shiurIds: v.array(str),
  years: v.record(str, int),
  moments: v.array(momentRef),
  related: v.array(v.strictObject({ kind: entityKind, key: str, shared: int })),
});

export const StoriesSchema = v.strictObject({
  schemaVersion: version,
  stories: v.array(
    v.strictObject({
      id: str,
      shiurId: str,
      title: L,
      peopleKeys: v.array(str),
      t: nnum,
      end: nnum,
      year: v.nullable(int),
      lang: ed,
    }),
  ),
});

export const MomentShardSchema = v.strictObject({
  schemaVersion: version,
  lang: ed,
  shard: int,
  moments: v.array(v.strictObject({ ...momentRefEntries, title: str, sectionKind: v.exactOptional(sectionKind) })),
});

export const QuickIndexSchema = v.strictObject({
  schemaVersion: version,
  lang: ed,
  options: v.strictObject({ fields: v.array(str), storeFields: v.array(str), idField: str }),
  index: v.unknown(),
});

export const DATA_SCHEMAS = {
  build: BuildSchema,
  corpus: CorpusSchema,
  facets: FacetsSchema,
  today: TodaySchema,
  shiur: ShiurSchema,
  writeup: WriteupSchema,
  series: SeriesSchema,
  works: WorksSchema,
  work: WorkSchema,
  entity: EntitySchema,
  stories: StoriesSchema,
  moments: MomentShardSchema,
  quickIndex: QuickIndexSchema,
} as const satisfies Record<DataKind, v.GenericSchema>;

// ---------------------------------------------------------------- compile-time equality with the contract

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Out<K extends DataKind> = v.InferOutput<(typeof DATA_SCHEMAS)[K]>;

/** Each schema infers exactly the contract type of its file kind. */
export const _typeChecks: {
  build: Same<Out<"build">, BuildFile>;
  corpus: Same<Out<"corpus">, CorpusFile>;
  facets: Same<Out<"facets">, FacetsFile>;
  today: Same<Out<"today">, TodayFile>;
  shiur: Same<Out<"shiur">, ShiurFile>;
  writeup: Same<Out<"writeup">, WriteupFile>;
  series: Same<Out<"series">, SeriesFile>;
  works: Same<Out<"works">, WorksFile>;
  work: Same<Out<"work">, WorkFile>;
  entity: Same<Out<"entity">, EntityFile>;
  stories: Same<Out<"stories">, StoriesFile>;
  moments: Same<Out<"moments">, MomentShardFile>;
  quickIndex: Same<Out<"quickIndex">, QuickIndexFile>;
} = {
  build: true,
  corpus: true,
  facets: true,
  today: true,
  shiur: true,
  writeup: true,
  series: true,
  works: true,
  work: true,
  entity: true,
  stories: true,
  moments: true,
  quickIndex: true,
};
export type _AllKinds = Same<keyof typeof _typeChecks, keyof DataFiles>;
export const _allKinds: _AllKinds = true;

// ---------------------------------------------------------------- validation

/** The file kind of a data file path relative to `/data/` (`shiur/x.json` → `shiur`). */
export function kindOfFile(file: string): DataKind | null {
  if (file === "build.json") return "build";
  if (file === "corpus.json") return "corpus";
  if (file === "facets.json") return "facets";
  if (file === "today.json") return "today";
  if (file === "works.json") return "works";
  if (file === "stories.json") return "stories";
  if (/^quick-index\.(en|yi)\.json$/.test(file)) return "quickIndex";
  if (/^shiur\/[^/]+\.json$/.test(file)) return "shiur";
  if (/^writeup\/[^/]+\.(en|yi)\.json$/.test(file)) return "writeup";
  if (/^series\/[^/]+\.json$/.test(file)) return "series";
  if (/^work\/[^/]+\.json$/.test(file)) return "work";
  if (/^entity\/[pco]\/[^/]+\.json$/.test(file)) return "entity";
  if (/^moments\/(en|yi)-\d+\.json$/.test(file)) return "moments";
  return null;
}

export interface ValidationIssue {
  file: string;
  /** Dotted path of the first failing value, and valibot's message (no data values). */
  issues: { path: string; message: string }[];
}

/** Validate one file body. Messages name paths and expectations only, never data. */
export function validateFile(file: string, body: unknown): ValidationIssue | null {
  const kind = kindOfFile(file);
  if (kind === null) return { file, issues: [{ path: "", message: "unknown data file path" }] };
  const r = v.safeParse(DATA_SCHEMAS[kind], body, { abortPipeEarly: true });
  if (r.success) return null;
  return {
    file,
    issues: r.issues.slice(0, 5).map((i) => ({
      path: (i.path ?? []).map((p) => String(p.key)).join("."),
      message: `${i.kind}: expected ${i.expected ?? "?"}`,
    })),
  };
}

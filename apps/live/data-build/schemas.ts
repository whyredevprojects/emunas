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
  type ExploreEntitiesFile,
  type FacetsFile,
  type GlossaryShardFile,
  type StoriesIndexFile,
  type StoryFile,
  type ThreadFile,
  type TopicFile,
  type TopicMomentsFile,
  type TopicsFile,
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
  glossaryShards: v.array(str),
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
  series: v.record(str, v.strictObject({ label: facetLabel, count: int, lang: ed })),
  work: facetRecord,
  person: facetRecord,
  concept: facetRecord,
});

const yearSpan = v.nullable(v.tuple([int, int]));
const level = v.picklist([1, 2, 3]);
const chip = v.strictObject({ id: str, label: facetLabel, page: v.boolean() });
const card = v.strictObject({
  id: str,
  lang: ed,
  title: str,
  oneLiner: v.nullable(L),
  duration: num,
  years: v.array(int),
  status,
});
const mixItemEntries = { id: str, shiurId: str, t: num, end: num, lang: ed, title: L };

export const TodaySchema = v.strictObject({
  schemaVersion: version,
  counts,
  occasions: v.record(
    str,
    v.strictObject({
      label: v.exactOptional(facetLabel),
      shiurIds: v.array(str),
      total: int,
      moments: v.array(v.strictObject({ id: str, t: num })),
      mix: v.nullable(
        v.strictObject({
          topicId: str,
          label: facetLabel,
          sections: int,
          shiurim: int,
          first: v.array(v.strictObject({ id: str, t: num, end: num, title: L })),
        }),
      ),
    }),
  ),
  newlySummarized: v.array(v.strictObject({ shiurId: str, updatedAt: str })),
  cards: v.record(
    str,
    v.strictObject({ lang: ed, title: str, duration: num, years: v.array(int), status, oneLiner: v.exactOptional(L) }),
  ),
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
    titles: v.record(str, v.strictObject({ title: str, lang: ed, years: v.array(int) })),
  }),
  seriesTitle: v.nullable(L),
  corpus: v.exactOptional(
    v.strictObject({
      topics: v.array(v.strictObject({ id: str, salience: num })),
      chapters: v.array(v.strictObject({ idx: int, topicIds: v.array(str) })),
      topicLabels: v.record(str, chip),
      terms: v.array(chip),
      sources: v.array(v.strictObject({ momentId: str, workId: str, page: v.boolean() })),
      stories: v.array(v.strictObject({ momentId: str, storyId: str, tellings: int, page: v.boolean() })),
      insights: v.array(
        v.strictObject({
          momentId: str,
          threadId: str,
          shiurCount: int,
          years: yearSpan,
          page: v.boolean(),
          other: v.exactOptional(
            v.strictObject({ shiurId: str, momentId: str, t: nnum, year: v.nullable(int), lang: ed }),
          ),
        }),
      ),
    }),
  ),
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
  synthesis: v.exactOptional(
    v.strictObject({
      title: L,
      overview: L,
      keyThemes: v.array(L),
      arc: v.array(v.strictObject({ shiurId: str, oneLiner: L })),
      reviewed: v.boolean(),
    }),
  ),
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

// ---------------------------------------------------------------- corpus layer (C1.7)

export const TopicsSchema = v.strictObject({
  schemaVersion: version,
  topics: v.array(v.tuple([str, nstr, str, str, nstr, int])),
});

const labelled = v.strictObject({ id: str, label: facetLabel });

export const TopicSchema = v.strictObject({
  schemaVersion: version,
  id: str,
  level,
  label: facetLabel,
  breadcrumb: v.array(labelled),
  description: v.nullable(L),
  reviewed: v.boolean(),
  term: v.nullable(v.strictObject({ conceptId: str, he: str, definition: L })),
  person: v.nullable(chip),
  work: v.nullable(chip),
  count: int,
  hubs: v.array(card),
  children: v.array(v.strictObject({ id: str, label: facetLabel, count: int })),
  coTopics: v.array(v.strictObject({ id: str, label: facetLabel, sections: int })),
  threads: v.array(v.strictObject({ id: str, label: L, shiurCount: int, page: v.boolean() })),
  threadTotal: int,
  stories: v.array(v.strictObject({ id: str, title: L, tellings: int, page: v.boolean() })),
  storyTotal: int,
  occasions: v.array(str),
  moments: v.array(v.strictObject({ ...mixItemEntries, year: v.nullable(int) })),
  momentTotal: int,
  momentShiurim: int,
  momentPages: int,
});

export const TopicMomentsSchema = v.strictObject({
  schemaVersion: version,
  topicId: str,
  page: int,
  moments: v.array(v.strictObject({ id: str, shiurId: str, t: num, end: num, lang: ed })),
});

const memberEntries = {
  shiurId: str,
  momentId: str,
  t: nnum,
  year: v.nullable(int),
  lang: ed,
  title: str,
  chapterTitle: v.nullable(L),
};

export const ThreadSchema = v.strictObject({
  schemaVersion: version,
  id: str,
  label: L,
  summary: L,
  reviewed: v.boolean(),
  topics: v.array(labelled),
  members: v.array(v.strictObject({ ...memberEntries, text: v.nullable(L) })),
  shiurCount: int,
  datedCount: int,
  years: yearSpan,
  timeline: v.boolean(),
});

export const StorySchema = v.strictObject({
  schemaVersion: version,
  id: str,
  title: L,
  retelling: L,
  reviewed: v.boolean(),
  people: v.array(v.union([chip, v.strictObject({ name: str })])),
  attributionVaries: v.boolean(),
  tellings: v.array(v.strictObject(memberEntries)),
});

export const StoriesIndexSchema = v.strictObject({
  schemaVersion: version,
  stories: v.array(
    v.strictObject({
      id: str,
      title: L,
      people: v.array(str),
      tellings: int,
      langs: v.array(ed),
      page: v.boolean(),
      first: v.strictObject({ shiurId: str, momentId: str, t: nnum }),
    }),
  ),
});

export const GlossarySchema = v.strictObject({
  schemaVersion: version,
  shard: str,
  concepts: v.array(
    v.strictObject({
      id: str,
      he: str,
      label: L,
      definition: L,
      count: int,
      page: v.boolean(),
      topicId: nstr,
      examples: v.array(v.strictObject({ shiurId: str, momentId: str, t: num })),
    }),
  ),
});


export const ExploreEntitiesSchema = v.strictObject({
  schemaVersion: version,
  shiurim: v.record(
    str,
    v.strictObject({ topics: v.array(str), people: v.array(str), concepts: v.array(str), works: v.array(str) }),
  ),
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
  topics: TopicsSchema,
  topic: TopicSchema,
  topicMoments: TopicMomentsSchema,
  thread: ThreadSchema,
  story: StorySchema,
  storiesIndex: StoriesIndexSchema,
  glossary: GlossarySchema,
  exploreEntities: ExploreEntitiesSchema,
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
  topics: Same<Out<"topics">, TopicsFile>;
  topic: Same<Out<"topic">, TopicFile>;
  topicMoments: Same<Out<"topicMoments">, TopicMomentsFile>;
  thread: Same<Out<"thread">, ThreadFile>;
  story: Same<Out<"story">, StoryFile>;
  storiesIndex: Same<Out<"storiesIndex">, StoriesIndexFile>;
  glossary: Same<Out<"glossary">, GlossaryShardFile>;
  exploreEntities: Same<Out<"exploreEntities">, ExploreEntitiesFile>;
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
  topics: true,
  topic: true,
  topicMoments: true,
  thread: true,
  story: true,
  storiesIndex: true,
  glossary: true,
  exploreEntities: true,
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
  if (file === "topics.json") return "topics";
  if (file === "stories-index.json") return "storiesIndex";
  if (file === "explore/entities.json") return "exploreEntities";
  if (/^topic\/[^/]+\.moments-[1-9]\d*\.json$/.test(file)) return "topicMoments";
  if (/^topic\/[^/]+\.json$/.test(file)) return "topic";
  if (/^thread\/[^/]+\.json$/.test(file)) return "thread";
  if (/^story\/[^/]+\.json$/.test(file)) return "story";
  if (/^glossary\/[^/]+\.json$/.test(file)) return "glossary";
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

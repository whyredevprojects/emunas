/**
 * Corpus-layer input (corpus-wave-plan §3.1): reads the corpus-wide files through the allow-listed
 * data reader only, validates every record with the loose schemas and applies the failure policy:
 *
 * - corpus absent (no `index.json` and no core file) → layer off, with a warning;
 * - `index.json` version not in KNOWN_CORPUS_VERSIONS → warning, or fatal when the corpus policy
 *   says `unknownVersion: "fail"`;
 * - a core file (topics, concepts, people, works) missing, not JSON, not an array, or with most of
 *   its records failing the required shape → fatal (FatalDataError), like an invalid ingest;
 * - an optional file (stories, teaching-clusters, redirects, a series file, a shiur-tags file)
 *   missing or invalid → that feature off or that shiur untagged, with a report entry;
 * - a single invalid record → dropped and reported;
 * - `index.json` `files` entries the reader does not know → listed by name as "not read" (names on
 *   the deny list are only counted, so the report never carries them).
 *
 * Keys named `asrVariants` or `heardAs*` are removed from every record before validation and
 * counted, so a future reversal upstream cannot leak them even through a looser schema.
 *
 * This module never touches the file system itself: every read goes through `DataReader`.
 */
import * as v from "valibot";
import { FatalDataError } from "../../build/load.ts";
import { ForbiddenPathError, isDeniedDataPath, type DataReader } from "../../build/read.ts";
import { issueSummary } from "../../build/schemas.ts";
import type { CorpusPolicy } from "../policy.ts";
import {
  CORPUS_ID_RE,
  ConceptSchema,
  CorpusIndexSchema,
  PERSON_TYPES,
  PersonSchema,
  REDIRECT_KINDS,
  RedirectTargetSchema,
  RedirectsSchema,
  SHIUR_ID_RE,
  SeriesSynthesisSchema,
  ShiurTagsSchema,
  StorySchema,
  TeachingClusterSchema,
  TopicSchema,
  WORK_KINDS,
  WorkSchema,
  type ConceptIn,
  type CorpusIndexIn,
  type PersonIn,
  type PersonTypeIn,
  type RedirectKind,
  type RedirectTargetIn,
  type RedirectsIn,
  type SeriesSynthesisIn,
  type ShiurTagsIn,
  type StoryIn,
  type TeachingClusterIn,
  type TopicIn,
  type WorkIn,
  type WorkKindIn,
} from "./schemas.ts";

/** `index.json` versions whose shapes this reader was written against. */
export const KNOWN_CORPUS_VERSIONS: readonly number[] = [2];

export const CORPUS_DIR = "derived/corpus";
export const CORE_FILES = ["topics.json", "concepts.json", "people.json", "works.json"] as const;
export const OPTIONAL_FILES = ["stories.json", "teaching-clusters.json", "redirects.json"] as const;

/** A record key that may carry transcript wording; removed on read wherever it appears. */
export function isForbiddenInputKey(key: string): boolean {
  return key === "asrVariants" || /^heardAs/.test(key);
}

export interface DroppedRecord {
  file: string;
  /** Record id when it has one, else `#<position>`. */
  ref: string;
  reason: string;
}

export interface CorpusInputReport {
  /** False when the corpus is absent: the layer is off and the sites build without it. */
  present: boolean;
  version: number | null;
  knownVersion: boolean;
  generatedAt: string | null;
  warnings: string[];
  /** Files actually read, relative to the corpus dir (series and shiur-tags counted, not listed). */
  read: string[];
  seriesRead: number;
  shiurTagsRead: number;
  /** Optional features switched off, with the reason. */
  disabled: { file: string; reason: string }[];
  droppedRecords: DroppedRecord[];
  /** Forbidden keys removed on read: file → key → count. */
  droppedKeys: Record<string, Record<string, number>>;
  /** Shiurim in `index.shiurIds` without usable tags. */
  untagged: { shiurId: string; reason: string }[];
  /** Persons whose `type` is unknown to the site, read as `other`. */
  coercedPersonTypes: { id: string; type: string }[];
  /** Works whose `kind` is unknown to the site, read as `sefer`. */
  coercedWorkKinds: { id: string; kind: string }[];
  /** `index.files` entries the reader does not know, by name. */
  notRead: string[];
  /** `index.files` entries on the deny list (never named in the report). */
  notReadDenied: number;
}

export interface CorpusInput {
  index: CorpusIndexIn;
  topics: TopicIn[];
  concepts: ConceptIn[];
  people: PersonIn[];
  works: WorkIn[];
  /** null: stories.json missing or invalid (stories off). */
  stories: StoryIn[] | null;
  /** null: teaching-clusters.json missing or invalid (threads off). */
  teachingClusters: TeachingClusterIn[] | null;
  /** null: redirects.json missing or invalid (no corpus redirects). */
  redirects: RedirectsIn | null;
  /** Series id → synthesis (only files that parsed). */
  series: ReadonlyMap<string, SeriesSynthesisIn>;
  /** Shiur id → tags (only files that parsed). */
  shiurTags: ReadonlyMap<string, ShiurTagsIn>;
}

export interface CorpusInputResult {
  /** null when the corpus is absent (layer off). */
  input: CorpusInput | null;
  report: CorpusInputReport;
}

export interface ReadCorpusInputOptions {
  policy: Pick<CorpusPolicy, "unknownVersion">;
}

function emptyReport(): CorpusInputReport {
  return {
    present: false,
    version: null,
    knownVersion: false,
    generatedAt: null,
    warnings: [],
    read: [],
    seriesRead: 0,
    shiurTagsRead: 0,
    disabled: [],
    droppedRecords: [],
    droppedKeys: {},
    untagged: [],
    coercedPersonTypes: [],
    coercedWorkKinds: [],
    notRead: [],
    notReadDenied: 0,
  };
}

/** Remove forbidden keys at any depth, counting them under `file`. Mutates `x`. */
function stripForbidden(x: unknown, file: string, report: CorpusInputReport): void {
  if (Array.isArray(x)) {
    for (const e of x) stripForbidden(e, file, report);
    return;
  }
  if (x === null || typeof x !== "object") return;
  const o = x as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (isForbiddenInputKey(k)) {
      const byKey = (report.droppedKeys[file] ??= {});
      byKey[k] = (byKey[k] ?? 0) + 1;
      delete o[k];
    } else {
      stripForbidden(o[k], file, report);
    }
  }
}

type ReadJson = { ok: true; json: unknown } | { ok: false; reason: string };

function readJson(reader: DataReader, file: string, report: CorpusInputReport): ReadJson {
  let text: string | null;
  try {
    text = reader.readText(`${CORPUS_DIR}/${file}`);
  } catch (e) {
    if (e instanceof ForbiddenPathError) return { ok: false, reason: e.denied ? "denied by name" : "not on the allow-list" };
    throw e;
  }
  if (text === null) return { ok: false, reason: "missing" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  stripForbidden(json, file, report);
  return { ok: true, json };
}

function refOf(x: unknown, i: number, key = "id"): string {
  if (x && typeof x === "object" && typeof (x as Record<string, unknown>)[key] === "string") {
    return String((x as Record<string, unknown>)[key]);
  }
  return `#${i}`;
}

type ParseList<T> = { ok: true; records: T[] } | { ok: false; reason: string };

/**
 * Parse a record array one record at a time. Invalid records and later duplicates are dropped and
 * reported. A file that is not an array, or in which most records fail, is a shape failure.
 */
function parseList<S extends v.GenericSchema>(
  json: unknown,
  file: string,
  schema: S,
  idOf: (r: v.InferOutput<S>) => string,
  report: CorpusInputReport,
  idKey = "id",
): ParseList<v.InferOutput<S>> {
  if (!Array.isArray(json)) return { ok: false, reason: "not an array" };
  const out: v.InferOutput<S>[] = [];
  const seen = new Set<string>();
  const dropped: DroppedRecord[] = [];
  json.forEach((raw, i) => {
    const r = v.safeParse(schema, raw);
    if (!r.success) {
      dropped.push({ file, ref: refOf(raw, i, idKey), reason: issueSummary(r.issues).join("; ") });
      return;
    }
    const id = idOf(r.output);
    if (seen.has(id)) {
      dropped.push({ file, ref: id, reason: "duplicate id (later record dropped)" });
      return;
    }
    seen.add(id);
    out.push(r.output);
  });
  if (json.length > 0 && out.length * 2 < json.length) {
    const first = dropped[0];
    return { ok: false, reason: `most records fail the required shape (${dropped.length} of ${json.length}; first: ${first?.ref}: ${first?.reason})` };
  }
  report.droppedRecords.push(...dropped);
  return { ok: true, records: out };
}

type IdSchema = v.GenericSchema<unknown, { id: string }>;

function loadCore<S extends IdSchema>(
  reader: DataReader,
  file: (typeof CORE_FILES)[number],
  schema: S,
  report: CorpusInputReport,
): v.InferOutput<S>[] {
  const j = readJson(reader, file, report);
  if (!j.ok) throw new FatalDataError(`${CORPUS_DIR}/${file} ${j.reason}`);
  const r = parseList(j.json, file, schema, (x) => x.id, report);
  if (!r.ok) throw new FatalDataError(`${CORPUS_DIR}/${file} is invalid: ${r.reason}`);
  report.read.push(file);
  return r.records;
}

function loadOptionalList<S extends IdSchema>(
  reader: DataReader,
  file: (typeof OPTIONAL_FILES)[number],
  schema: S,
  report: CorpusInputReport,
): v.InferOutput<S>[] | null {
  const j = readJson(reader, file, report);
  if (!j.ok) {
    report.disabled.push({ file, reason: j.reason });
    return null;
  }
  const r = parseList(j.json, file, schema, (x) => x.id, report);
  if (!r.ok) {
    report.disabled.push({ file, reason: r.reason });
    return null;
  }
  report.read.push(file);
  return r.records;
}

function loadRedirects(reader: DataReader, report: CorpusInputReport): RedirectsIn | null {
  const file = "redirects.json";
  const j = readJson(reader, file, report);
  if (!j.ok) {
    report.disabled.push({ file, reason: j.reason });
    return null;
  }
  const isPlain = (x: unknown) => typeof x === "object" && x !== null && !Array.isArray(x);
  if (!isPlain(j.json) || !Object.values(j.json as object).every(isPlain)) {
    report.disabled.push({ file, reason: "not an object of per-kind maps" });
    return null;
  }
  const r = v.safeParse(RedirectsSchema, j.json);
  if (!r.success) {
    report.disabled.push({ file, reason: issueSummary(r.issues).join("; ") });
    return null;
  }
  const out: RedirectsIn = {};
  for (const [kind, map] of Object.entries(r.output)) {
    if (!(REDIRECT_KINDS as readonly string[]).includes(kind)) {
      report.droppedRecords.push({ file, ref: kind, reason: "unknown redirect kind (ignored)" });
      continue;
    }
    const clean: Record<string, RedirectTargetIn> = {};
    for (const [from, raw] of Object.entries(map)) {
      const ref = `${kind}:${CORPUS_ID_RE.test(from) ? from : "#invalid"}`;
      const t = v.safeParse(RedirectTargetSchema, raw);
      const to: { kind: string; id: string } | null = !t.success ? null : typeof t.output === "string" ? { kind, id: t.output } : t.output;
      if (to === null || !CORPUS_ID_RE.test(from) || !CORPUS_ID_RE.test(to.id)) {
        report.droppedRecords.push({ file, ref, reason: "not a corpus id" });
      } else if (!(REDIRECT_KINDS as readonly string[]).includes(to.kind)) {
        report.droppedRecords.push({ file, ref, reason: `unknown target kind ${JSON.stringify(to.kind)}` });
      } else if (to.kind === kind && from === to.id) {
        report.droppedRecords.push({ file, ref, reason: "redirects to itself" });
      } else {
        clean[from] = { kind: to.kind as RedirectKind, id: to.id };
      }
    }
    out[kind as RedirectKind] = clean;
  }
  report.read.push(file);
  return out;
}

const SERIES_FILE_RE = /^series\/([a-z0-9][a-z0-9-]*)\.json$/;
const SHIUR_TAGS_FILE_RE = /^shiur-tags\/([a-z0-9][a-z0-9-]*)\.json$/;
const KNOWN_TOP = new Set<string>(["index.json", ...CORE_FILES, ...OPTIONAL_FILES]);

function loadIndex(reader: DataReader, report: CorpusInputReport): CorpusIndexIn | null {
  const j = readJson(reader, "index.json", report);
  if (!j.ok) {
    if (j.reason !== "missing") throw new FatalDataError(`${CORPUS_DIR}/index.json ${j.reason}`);
    // No index: the corpus is absent unless core files are lying around without it.
    const stray = CORE_FILES.filter((f) => reader.exists(`${CORPUS_DIR}/${f}`));
    if (stray.length > 0) throw new FatalDataError(`${CORPUS_DIR}/index.json is missing but ${stray.join(", ")} exist`);
    return null;
  }
  const r = v.safeParse(CorpusIndexSchema, j.json);
  if (!r.success) throw new FatalDataError(`${CORPUS_DIR}/index.json is invalid: ${issueSummary(r.issues, 5).join("; ")}`);
  report.read.push("index.json");
  const seen = new Set<string>();
  const shiurIds: string[] = [];
  r.output.shiurIds.forEach((id, i) => {
    if (!SHIUR_ID_RE.test(id)) report.droppedRecords.push({ file: "index.json", ref: `shiurIds#${i}`, reason: "not a shiur id" });
    else if (seen.has(id)) report.droppedRecords.push({ file: "index.json", ref: id, reason: "duplicate shiur id" });
    else {
      seen.add(id);
      shiurIds.push(id);
    }
  });
  return { ...r.output, shiurIds };
}

/**
 * Read the corpus-wide layer input. Throws FatalDataError under the fatal rules above; otherwise
 * returns the parsed input (or null when the corpus is absent) and the report.
 */
export function readCorpusInput(reader: DataReader, opts: ReadCorpusInputOptions): CorpusInputResult {
  const report = emptyReport();
  const index = loadIndex(reader, report);
  if (index === null) {
    report.warnings.push(`${CORPUS_DIR}/ is absent: the corpus layer is off and the sites build without the corpus indexes`);
    return { input: null, report };
  }
  report.present = true;
  report.version = index.version;
  report.generatedAt = index.generatedAt || null;
  report.knownVersion = KNOWN_CORPUS_VERSIONS.includes(index.version);
  if (!report.knownVersion) {
    const msg = `${CORPUS_DIR}/index.json version ${index.version} is not one this build knows (${KNOWN_CORPUS_VERSIONS.join(", ")}); validating by shape`;
    if (opts.policy.unknownVersion === "fail") throw new FatalDataError(`${msg} (corpus-policy unknownVersion: "fail")`);
    report.warnings.push(msg);
  }

  const topics = loadCore(reader, "topics.json", TopicSchema, report);
  const concepts = loadCore(reader, "concepts.json", ConceptSchema, report);
  const people = loadCore(reader, "people.json", PersonSchema, report).map((p): PersonIn => {
    if ((PERSON_TYPES as readonly string[]).includes(p.type)) return { ...p, type: p.type as PersonTypeIn };
    report.coercedPersonTypes.push({ id: p.id, type: p.type });
    return { ...p, type: "other" };
  });
  const works = loadCore(reader, "works.json", WorkSchema, report).map((w): WorkIn => {
    if ((WORK_KINDS as readonly string[]).includes(w.kind)) return { ...w, kind: w.kind as WorkKindIn };
    report.coercedWorkKinds.push({ id: w.id, kind: w.kind });
    return { ...w, kind: "sefer" };
  });
  const stories = loadOptionalList(reader, "stories.json", StorySchema, report);
  const teachingClusters = loadOptionalList(reader, "teaching-clusters.json", TeachingClusterSchema, report);
  const redirects = loadRedirects(reader, report);

  // Series: the ones index.json lists.
  const series = new Map<string, SeriesSynthesisIn>();
  const shiurIdSet = new Set(index.shiurIds);
  for (const f of index.files) {
    if (isDeniedDataPath(`${CORPUS_DIR}/${f}`)) {
      report.notReadDenied++;
      continue;
    }
    const sm = SERIES_FILE_RE.exec(f);
    if (sm) {
      const seriesId = sm[1]!;
      if (series.has(seriesId)) continue;
      const j = readJson(reader, f, report);
      if (!j.ok) {
        report.disabled.push({ file: f, reason: j.reason });
        continue;
      }
      const r = v.safeParse(SeriesSynthesisSchema, j.json);
      if (!r.success) report.disabled.push({ file: f, reason: issueSummary(r.issues).join("; ") });
      else if (r.output.seriesId !== seriesId) report.disabled.push({ file: f, reason: `seriesId ${r.output.seriesId} does not match the file name` });
      else series.set(seriesId, r.output);
      continue;
    }
    const tm = SHIUR_TAGS_FILE_RE.exec(f);
    if (tm && shiurIdSet.has(tm[1]!)) continue;
    if (!KNOWN_TOP.has(f)) report.notRead.push(f);
  }
  report.seriesRead = series.size;

  // Shiur tags: one per corpus shiur.
  const shiurTags = new Map<string, ShiurTagsIn>();
  for (const shiurId of index.shiurIds) {
    const f = `shiur-tags/${shiurId}.json`;
    const j = readJson(reader, f, report);
    if (!j.ok) {
      report.untagged.push({ shiurId, reason: j.reason });
      continue;
    }
    const r = v.safeParse(ShiurTagsSchema, j.json);
    if (!r.success) report.untagged.push({ shiurId, reason: issueSummary(r.issues).join("; ") });
    else if (r.output.shiurId !== shiurId) report.untagged.push({ shiurId, reason: `shiurId ${r.output.shiurId} does not match the file name` });
    else shiurTags.set(shiurId, r.output);
  }
  report.shiurTagsRead = shiurTags.size;

  return {
    input: { index, topics, concepts, people, works, stories, teachingClusters, redirects, series, shiurTags },
    report,
  };
}

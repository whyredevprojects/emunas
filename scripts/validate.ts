// Validate P4 extraction and P4b write-up outputs against the shiur's meta.json.
//
//   npm run -s validate -- data/derived/shiurim/<shiurId>/extraction.json data/derived/shiurim/<shiurId>/writeup.json
//   npx tsx scripts/validate.ts out/pilot/<shiurId>/<file>.json [...] [--meta path] [--quiet]
//   npx tsx scripts/validate.ts --summary out/pilot/<shiurId>/*.json
//
// The kind of each file is detected from its content: an Extraction has `sections`; a Writeup has
// `extractionVariant` + `en`/`yi`. A write-up is checked against the extraction it references,
// out/pilot/<shiurId>/<extractionVariant>.json (same directory), which must itself validate.
// meta.json is taken from the same directory as each file unless --meta is given.
// Non-output files in the directory (meta.json, input*.txt, judge-*.json) are skipped.
// Exit code 1 when any file has errors.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Evidence, Extraction, Localized, Section, Writeup } from "../src/types.js";
import { BLOCK_TOLERANCE, NON_CONTENT_KINDS, WRITEUP_TOLERANCE, writeupBudget } from "./lib/budget.js";
import { hebrewRatio, mmss, wordCount, type PilotMeta, type PilotRecordingMeta } from "./lib/pilot.js";

// ---------------- caps & thresholds ----------------
const SECTIONS_PER_HOUR = { min: 4, max: 12 };
const MIN_SECTION_SEC = 180;
const SUBSECTION_PARENT_MIN_SEC = 12 * 60;
const SUBSECTIONS = { min: 2, max: 4 };
const MIN_SUBSECTION_SEC = 90;
const KEY_POINTS = { min: 3, max: 7 };
const INSIGHTS = { min: 3, max: 7 };
const QUESTIONS_MAX = 6;
const TAKEAWAYS_MAX = 5;
const CANDIDATE_TOPICS = { min: 5, max: 10 };
const ABSTRACT_WORDS = { en: { min: 80, max: 150 }, yi: { min: 80, max: 180 } };
// Write-up length: 800-1000 words per audio hour per language, see scripts/lib/budget.ts.
const YI_MIN_HEBREW = 0.8;        // below: warning; below YI_HARD_MIN: error
const YI_HARD_MIN = 0.5;
const EN_MAX_HEBREW = 0.25;       // English text that is mostly Hebrew script is suspicious
const EVIDENCE_SLACK_SEGS = 3;    // "near" the section

// ---------------- report ----------------
type Kind = "extraction" | "writeup";

export interface Report {
  file: string;
  kind: Kind | null;
  errors: string[];
  warnings: string[];
  stats: Record<string, number | string>;
}

// ---------------- shape validation (hand-rolled) ----------------
type Check = (v: unknown, path: string, errs: string[]) => void;

const typeOf = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const isObj = (v: unknown): v is Record<string, unknown> => typeOf(v) === "object";

const str: Check = (v, p, e) => {
  if (typeof v !== "string") e.push(`${p}: expected string, got ${typeOf(v)}`);
};
const nonEmptyStr: Check = (v, p, e) => {
  if (typeof v !== "string") e.push(`${p}: expected string, got ${typeOf(v)}`);
  else if (!v.trim()) e.push(`${p}: empty string`);
};
const strOrNull: Check = (v, p, e) => {
  if (v !== null && typeof v !== "string") e.push(`${p}: expected string|null, got ${typeOf(v)}`);
};
const int: Check = (v, p, e) => {
  if (typeof v !== "number" || !Number.isInteger(v)) e.push(`${p}: expected integer, got ${JSON.stringify(v)}`);
};
const num01: Check = (v, p, e) => {
  if (typeof v !== "number" || !(v >= 0 && v <= 1)) e.push(`${p}: expected number in 0..1, got ${JSON.stringify(v)}`);
};
const oneOf = (...vals: string[]): Check => (v, p, e) => {
  if (typeof v !== "string" || !vals.includes(v)) e.push(`${p}: expected one of ${vals.join("|")}, got ${JSON.stringify(v)}`);
};
const arr = (item: Check): Check => (v, p, e) => {
  if (!Array.isArray(v)) return void e.push(`${p}: expected array, got ${typeOf(v)}`);
  v.forEach((x, i) => item(x, `${p}[${i}]`, e));
};
const strOrNullOrAbsent = (v: unknown, p: string, e: string[]) => {
  if (v !== undefined) str(v, p, e);
};
/** Object with required keys (spec) and optional keys (opt). Unknown keys are reported as errors. */
const obj = (spec: Record<string, Check>, opt: Record<string, Check> = {}): Check => (v, p, e) => {
  if (!isObj(v)) return void e.push(`${p}: expected object, got ${typeOf(v)}`);
  for (const [k, c] of Object.entries(spec)) {
    if (!(k in v)) e.push(`${p}.${k}: missing`);
    else c(v[k], `${p}.${k}`, e);
  }
  for (const [k, c] of Object.entries(opt)) if (k in v && v[k] !== undefined) c(v[k], `${p}.${k}`, e);
  for (const k of Object.keys(v)) if (!(k in spec) && !(k in opt)) e.push(`${p}.${k}: unexpected field`);
};

const localized: Check = obj({ en: nonEmptyStr, yi: nonEmptyStr }, { he: str });
const evidence: Check = obj({ segs: arr(int), confidence: num01 }, { recordingId: str });
const segRange = { recordingId: nonEmptyStr, startSeg: int, endSeg: int };
const textItem: Check = obj({ text: localized, evidence });

const extractionShape: Check = obj({
  shiurId: nonEmptyStr,
  model: nonEmptyStr,
  variant: nonEmptyStr,
  summary: obj({ oneLiner: localized, abstract: localized, keyPoints: arr(textItem) }),
  sections: arr(
    obj({
      ...segRange,
      title: localized,
      summary: localized,
      kind: oneOf("intro", "main", "story", "tangent", "closing", "brachah", "singing", "other_speaker", "noise"),
      catalogTopicIdx: arr(int),
      subsections: arr(obj({ ...segRange, title: localized, summary: localized })),
    }),
  ),
  sources: arr(
    obj({
      heardAs: str,
      work: strOrNull,
      ref: strOrNull,
      sefariaRef: strOrNull,
      resolution: oneOf("resolved", "inferred", "unresolved"),
      mention: oneOf("quoted", "paraphrased", "alluded"),
      evidence,
    }),
  ),
  insights: arr(textItem),
  stories: arr(obj({ title: localized, retelling: localized, people: arr(str), evidence })),
  questions: arr(
    obj(
      { question: localized, answer: localized, questionSegs: arr(int), answerSegs: arr(int), confidence: num01 },
      { recordingId: strOrNullOrAbsent },
    ),
  ),
  takeaways: arr(textItem),
  candidateTopics: arr(nonEmptyStr),
  concepts: arr(obj({ he: nonEmptyStr, heardAs: arr(str) })),
  people: arr(obj({ name: nonEmptyStr, heardAs: arr(str) })),
  asrNotes: str,
}, { promptVersion: nonEmptyStr });

const writeupBlock: Check = obj({
  sectionIndex: int,
  heading: strOrNull,
  paragraphs: arr(obj({ text: nonEmptyStr, sourceIdx: arr(int), evidence })),
});
const writeupShape: Check = obj({
  shiurId: nonEmptyStr,
  model: nonEmptyStr,
  variant: nonEmptyStr,
  extractionVariant: nonEmptyStr,
  en: arr(writeupBlock),
  yi: arr(writeupBlock),
}, { promptVersion: nonEmptyStr });

function detectKind(v: unknown): Kind | null {
  if (!isObj(v)) return null;
  if ("extractionVariant" in v || ("en" in v && "yi" in v && !("sections" in v))) return "writeup";
  if ("sections" in v || "summary" in v) return "extraction";
  return null;
}

// ---------------- semantic validation ----------------
function loadJson(file: string, r: Report): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    r.errors.push(`JSON parse: ${(e as Error).message}`);
    return undefined;
  }
}

function checkShape(shape: Check, data: unknown, r: Report): boolean {
  const shapeErrs: string[] = [];
  shape(data, "$", shapeErrs);
  if (!shapeErrs.length) return true;
  r.errors.push(...shapeErrs.slice(0, 60));
  if (shapeErrs.length > 60) r.errors.push(`... ${shapeErrs.length - 60} more shape errors`);
  return false; // semantic checks assume the shape
}

export function validateFile(file: string, metaOverride: string | null = null): Report {
  const r: Report = { file, kind: null, errors: [], warnings: [], stats: {} };
  const metaPath = metaOverride ?? join(dirname(file), "meta.json");
  if (!existsSync(metaPath)) return r.errors.push(`meta not found: ${metaPath}`), r;
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as PilotMeta;

  const data = loadJson(file, r);
  if (data === undefined) return r;
  r.kind = detectKind(data);
  if (r.kind === "extraction") {
    if (checkShape(extractionShape, data, r)) validateExtraction(data as Extraction, meta, r);
  } else if (r.kind === "writeup") {
    if (checkShape(writeupShape, data, r)) validateWriteup(data as Writeup, file, meta, metaOverride, r);
  } else {
    r.errors.push("unknown file kind: expected an Extraction (has `sections`) or a Writeup (has `extractionVariant`, `en`, `yi`)");
  }
  return r;
}

/** Helpers shared by the extraction and write-up checks. */
function context(meta: PilotMeta, r: Report) {
  const err = (m: string) => r.errors.push(m);
  const warn = (m: string) => r.warnings.push(m);
  const recs = new Map<string, PilotRecordingMeta>(meta.recordings.map((m) => [m.recording.id, m]));
  const multi = meta.recordings.length > 1;
  const firstRec = meta.recordings[0]!;
  const hours = meta.totalDurationSec / 3600;
  const inRange = (rec: PilotRecordingMeta, i: number) => i >= 0 && i < rec.segmentCount;

  const resolveRec = (rid: string | undefined, p: string): PilotRecordingMeta | null => {
    if (rid === undefined) {
      if (multi) {
        err(`${p}: recordingId required (shiur has ${meta.recordings.length} recordings)`);
        return null;
      }
      return firstRec;
    }
    const rec = recs.get(rid);
    if (!rec) err(`${p}: unknown recordingId "${rid}"`);
    return rec ?? null;
  };
  const checkSegs = (segs: number[], rec: PilotRecordingMeta | null, p: string, allowEmpty = false) => {
    if (segs.length === 0) {
      if (!allowEmpty) err(`${p}: empty segs`);
      return;
    }
    if (!rec) return;
    for (const s of segs) if (!inRange(rec, s)) err(`${p}: seg ${s} out of range 0..${rec.segmentCount - 1} (${rec.recording.id})`);
  };
  const checkEvidence = (ev: Evidence, p: string, defaultRec?: PilotRecordingMeta) => {
    const rec = ev.recordingId === undefined && defaultRec ? defaultRec : resolveRec(ev.recordingId, p);
    checkSegs(ev.segs, rec, `${p}.segs`);
    return rec;
  };
  return { err, warn, recs, multi, firstRec, hours, inRange, resolveRec, checkSegs, checkEvidence };
}

function validateExtraction(x: Extraction, meta: PilotMeta, r: Report): void {
  const { err, warn, recs, multi, firstRec, hours, inRange, resolveRec, checkSegs, checkEvidence } = context(meta, r);
  r.stats.model = x.model;
  r.stats.variant = x.variant;
  r.stats.promptVersion = x.promptVersion ?? "";

  if (x.shiurId !== meta.shiurId) err(`shiurId "${x.shiurId}" != meta "${meta.shiurId}"`);

  const secOf = (rec: PilotRecordingMeta, a: number, b: number) => (rec.ends[b] ?? 0) - (rec.starts[a] ?? 0);

  // --- localized text
  const checkLoc = (l: Localized, p: string) => {
    const yr = hebrewRatio(l.yi);
    if (yr < YI_HARD_MIN) err(`${p}.yi: only ${(yr * 100).toFixed(0)}% Hebrew script`);
    else if (yr < YI_MIN_HEBREW) warn(`${p}.yi: only ${(yr * 100).toFixed(0)}% Hebrew script`);
    const er = hebrewRatio(l.en);
    if (er > EN_MAX_HEBREW) warn(`${p}.en: ${(er * 100).toFixed(0)}% Hebrew script (transliterate in English)`);
    if (l.en.trim() === l.yi.trim()) err(`${p}: en and yi are identical`);
  };

  // --- sections: shape-level per section
  x.sections.forEach((s, i) => {
    const p = `sections[${i}]`;
    const rec = recs.get(s.recordingId);
    checkLoc(s.title, `${p}.title`);
    checkLoc(s.summary, `${p}.summary`);
    for (const t of s.catalogTopicIdx) {
      if (t < 0 || t >= meta.catalogTopics.length) err(`${p}.catalogTopicIdx: ${t} out of range 0..${meta.catalogTopics.length - 1}`);
    }
    if (!rec) return void err(`${p}: unknown recordingId "${s.recordingId}"`);
    if (!inRange(rec, s.startSeg) || !inRange(rec, s.endSeg)) return void err(`${p}: range ${s.startSeg}..${s.endSeg} outside 0..${rec.segmentCount - 1}`);
    if (s.startSeg > s.endSeg) return void err(`${p}: startSeg > endSeg`);
    const dur = secOf(rec, s.startSeg, s.endSeg);
    const tag = `${p} "${s.title.en}" [${mmss(rec.starts[s.startSeg] ?? 0)}–${mmss(rec.ends[s.endSeg] ?? 0)}]`;
    if (dur < MIN_SECTION_SEC && rec.durationSec >= MIN_SECTION_SEC) err(`${tag}: ${Math.round(dur)}s < ${MIN_SECTION_SEC}s minimum`);

    // subsections
    if (s.subsections.length) {
      if (dur <= SUBSECTION_PARENT_MIN_SEC) err(`${tag}: has subsections but is only ${mmss(dur)} (needs > 12:00)`);
      if (s.subsections.length < SUBSECTIONS.min || s.subsections.length > SUBSECTIONS.max) {
        err(`${tag}: ${s.subsections.length} subsections (allowed ${SUBSECTIONS.min}-${SUBSECTIONS.max})`);
      }
      let expect = s.startSeg;
      s.subsections.forEach((ss, j) => {
        const q = `${p}.subsections[${j}]`;
        checkLoc(ss.title, `${q}.title`);
        checkLoc(ss.summary, `${q}.summary`);
        if (ss.recordingId !== s.recordingId) err(`${q}: recordingId differs from parent`);
        if (ss.startSeg > ss.endSeg) err(`${q}: startSeg > endSeg`);
        if (ss.startSeg !== expect) err(`${q}: starts at ${ss.startSeg}, expected ${expect} (subsections must tile the parent)`);
        if (ss.endSeg > s.endSeg) err(`${q}: ends at ${ss.endSeg}, past parent end ${s.endSeg}`);
        if (inRange(rec, ss.startSeg) && inRange(rec, ss.endSeg)) {
          const sd = secOf(rec, ss.startSeg, ss.endSeg);
          if (sd < MIN_SUBSECTION_SEC) err(`${q}: ${Math.round(sd)}s < ${MIN_SUBSECTION_SEC}s minimum`);
        }
        expect = ss.endSeg + 1;
      });
      if (expect !== s.endSeg + 1) err(`${p}: subsections end at ${expect - 1}, parent ends at ${s.endSeg}`);
    } else if (dur > 25 * 60 && s.kind === "main") {
      warn(`${tag}: ${mmss(dur)} long with no subsections`);
    }
  });

  // --- tiling per recording, in array order
  for (const rec of meta.recordings) {
    const secs = x.sections.map((s, i) => ({ s, i })).filter(({ s }) => s.recordingId === rec.recording.id);
    if (secs.length === 0) {
      err(`recording ${rec.recording.id}: no sections`);
      continue;
    }
    let expect = 0;
    for (const { s, i } of secs) {
      if (s.startSeg !== expect) {
        err(`sections[${i}] (${rec.recording.id}): starts at seg ${s.startSeg}, expected ${expect} — ${s.startSeg > expect ? "gap" : "overlap"}`);
      }
      expect = s.endSeg + 1;
    }
    if (expect !== rec.segmentCount) err(`recording ${rec.recording.id}: sections end at seg ${expect - 1}, last seg is ${rec.segmentCount - 1}`);
  }
  // recordings must appear in playback order
  const recOrder = x.sections.map((s) => recs.get(s.recordingId)?.order ?? -1);
  for (let i = 1; i < recOrder.length; i++) {
    if (recOrder[i]! < recOrder[i - 1]!) err(`sections[${i}]: recordings out of playback order`);
  }

  // --- section counts per hour
  const nSections = x.sections.length;
  const minSec = Math.max(1, Math.floor(SECTIONS_PER_HOUR.min * hours));
  const maxSec = Math.max(minSec, Math.ceil(SECTIONS_PER_HOUR.max * hours));
  if (nSections < minSec || nSections > maxSec) {
    err(`${nSections} sections for ${mmss(meta.totalDurationSec)} (allowed ${minSec}-${maxSec})`);
  }
  // catalog coverage
  const covered = new Set(x.sections.flatMap((s) => s.catalogTopicIdx));
  meta.catalogTopics.forEach((t, i) => {
    if (!covered.has(i)) warn(`catalog topic ${i} "${t}" not assigned to any section`);
  });

  // section index helpers for "near" checks
  const sectionFor = (rec: PilotRecordingMeta, seg: number): number =>
    x.sections.findIndex((s) => s.recordingId === rec.recording.id && seg >= s.startSeg && seg <= s.endSeg);

  // --- summary
  checkLoc(x.summary.oneLiner, "summary.oneLiner");
  checkLoc(x.summary.abstract, "summary.abstract");
  for (const lang of ["en", "yi"] as const) {
    const w = wordCount(x.summary.abstract[lang]);
    const lim = ABSTRACT_WORDS[lang];
    if (w < lim.min || w > lim.max) warn(`summary.abstract.${lang}: ${w} words (target ${lim.min}-${lim.max})`);
  }
  const capCheck = (n: number, lo: number, hi: number, label: string) => {
    if (n < lo || n > hi) err(`${label}: ${n} (allowed ${lo}-${hi})`);
  };
  capCheck(x.summary.keyPoints.length, KEY_POINTS.min, KEY_POINTS.max, "summary.keyPoints");
  capCheck(x.insights.length, INSIGHTS.min, INSIGHTS.max, "insights");
  capCheck(x.questions.length, 0, QUESTIONS_MAX, "questions");
  capCheck(x.takeaways.length, 0, TAKEAWAYS_MAX, "takeaways");
  capCheck(x.candidateTopics.length, CANDIDATE_TOPICS.min, CANDIDATE_TOPICS.max, "candidateTopics");

  const textItems = (list: { text: Localized; evidence: Evidence }[], label: string) =>
    list.forEach((it, i) => {
      checkLoc(it.text, `${label}[${i}].text`);
      checkEvidence(it.evidence, `${label}[${i}].evidence`);
    });
  textItems(x.summary.keyPoints, "summary.keyPoints");
  textItems(x.insights, "insights");
  textItems(x.takeaways, "takeaways");

  x.stories.forEach((s, i) => {
    checkLoc(s.title, `stories[${i}].title`);
    checkLoc(s.retelling, `stories[${i}].retelling`);
    checkEvidence(s.evidence, `stories[${i}].evidence`);
  });
  x.questions.forEach((q, i) => {
    const p = `questions[${i}]`;
    checkLoc(q.question, `${p}.question`);
    checkLoc(q.answer, `${p}.answer`);
    const rec = resolveRec(q.recordingId, p);
    checkSegs(q.questionSegs, rec, `${p}.questionSegs`);
    checkSegs(q.answerSegs, rec, `${p}.answerSegs`);
  });
  x.sources.forEach((s, i) => {
    const p = `sources[${i}]`;
    checkEvidence(s.evidence, `${p}.evidence`);
    // resolved: ref + sefariaRef; inferred: ref (sefariaRef optional); unresolved: neither.
    if (s.resolution === "resolved" && (!s.ref || !s.sefariaRef)) {
      err(`${p}: "resolved" requires ref and sefariaRef (use "inferred" when only ref is known, else "unresolved")`);
    }
    if (s.resolution === "inferred" && !s.ref) err(`${p}: "inferred" requires ref (use "unresolved" with ref null)`);
    if (s.resolution === "unresolved" && (s.ref || s.sefariaRef)) err(`${p}: "unresolved" must have ref and sefariaRef null`);
    if (s.ref && s.work && s.ref.trim().toLowerCase() === s.work.trim().toLowerCase()) {
      warn(`${p}: ref "${s.ref}" only repeats the work; a ref names a location (chapter, verse, daf), else use "unresolved"`);
    }
    if (hebrewRatio(s.heardAs) === 0 && meta.shiur.lang === "yi" && s.heardAs) warn(`${p}.heardAs: no Hebrew script in a Yiddish shiur`);
  });
  x.concepts.forEach((c, i) => {
    if (hebrewRatio(c.he) < YI_HARD_MIN) err(`concepts[${i}].he: not Hebrew script`);
  });

  // --- evidence near the section for other items (soft): warn on evidence spanning many sections
  const spread = (ev: Evidence, p: string) => {
    const rec = ev.recordingId ? recs.get(ev.recordingId) : multi ? undefined : firstRec;
    if (!rec) return;
    const idx = new Set(ev.segs.map((s) => sectionFor(rec, s)).filter((i) => i >= 0));
    if (idx.size > 3) warn(`${p}: evidence spread over ${idx.size} sections`);
  };
  x.summary.keyPoints.forEach((k, i) => spread(k.evidence, `summary.keyPoints[${i}]`));
  x.insights.forEach((k, i) => spread(k.evidence, `insights[${i}]`));

  // --- stats
  const allConf = [
    ...x.summary.keyPoints.map((k) => k.evidence.confidence),
    ...x.insights.map((k) => k.evidence.confidence),
    ...x.sources.map((k) => k.evidence.confidence),
    ...x.stories.map((k) => k.evidence.confidence),
    ...x.takeaways.map((k) => k.evidence.confidence),
    ...x.questions.map((k) => k.confidence),
  ];
  Object.assign(r.stats, {
    duration: mmss(meta.totalDurationSec),
    sections: nSections,
    mainSections: x.sections.filter((s) => s.kind === "main").length,
    subsections: x.sections.reduce((a, s) => a + s.subsections.length, 0),
    sources: x.sources.length,
    resolvedSources: x.sources.filter((s) => s.resolution === "resolved").length,
    keyPoints: x.summary.keyPoints.length,
    insights: x.insights.length,
    stories: x.stories.length,
    questions: x.questions.length,
    takeaways: x.takeaways.length,
    topics: x.candidateTopics.length,
    concepts: x.concepts.length,
    people: x.people.length,
    meanConf: mean(allConf),
    catalogCovered: `${covered.size}/${meta.catalogTopics.length}`,
  });
}

const mean = (xs: number[]) => (xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)) : 0);

function validateWriteup(w: Writeup, file: string, meta: PilotMeta, metaOverride: string | null, r: Report): void {
  const { err, warn, recs, multi, checkEvidence } = context(meta, r);
  r.stats.model = w.model;
  r.stats.variant = w.variant;
  r.stats.extractionVariant = w.extractionVariant;
  r.stats.promptVersion = w.promptVersion ?? "";
  if (w.shiurId !== meta.shiurId) err(`shiurId "${w.shiurId}" != meta "${meta.shiurId}"`);

  // The write-up indexes into the extraction it was built on; that extraction must exist and validate.
  const xFile = join(dirname(file), `${w.extractionVariant}.json`);
  if (!existsSync(xFile)) return void err(`extraction not found: ${xFile} (from extractionVariant "${w.extractionVariant}")`);
  const xr = validateFile(xFile, metaOverride);
  if (xr.kind !== "extraction") return void err(`${xFile} is not an extraction`);
  if (xr.errors.length) return void err(`extraction ${xFile} fails validation (${xr.errors.length} errors); fix it first`);
  const x = JSON.parse(readFileSync(xFile, "utf8")) as Extraction;
  if (x.shiurId !== w.shiurId) err(`shiurId "${w.shiurId}" != extraction "${x.shiurId}"`);
  const budget = writeupBudget(x, meta);

  const sourcesUsed = new Set<number>();
  // --- writeup
  const words: Record<"en" | "yi", number> = { en: 0, yi: 0 };
  const contentSections = x.sections
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !NON_CONTENT_KINDS.has(s.kind));
  for (const lang of ["en", "yi"] as const) {
    const blocks = w[lang];
    let prev = -1;
    const seen = new Set<number>();
    blocks.forEach((b, bi) => {
      const p = `writeup.${lang}[${bi}]`;
      const sec: Section | undefined = x.sections[b.sectionIndex];
      if (!sec) return void err(`${p}: sectionIndex ${b.sectionIndex} out of range 0..${x.sections.length - 1}`);
      if (b.sectionIndex <= prev) err(`${p}: sectionIndex ${b.sectionIndex} not increasing (one block per section, in order)`);
      prev = b.sectionIndex;
      seen.add(b.sectionIndex);
      if (NON_CONTENT_KINDS.has(sec.kind)) warn(`${p}: block for a ${sec.kind} section`);
      if (b.paragraphs.length === 0) err(`${p}: no paragraphs`);
      if (b.heading !== null) {
        const hr = hebrewRatio(b.heading);
        if (lang === "yi" && hr < YI_HARD_MIN) err(`${p}.heading: not Hebrew script`);
        if (lang === "en" && hr > EN_MAX_HEBREW) warn(`${p}.heading: Hebrew script in English heading`);
      }
      const secRec = recs.get(sec.recordingId);
      let blockWords = 0;
      b.paragraphs.forEach((para, pi) => {
        const q = `${p}.paragraphs[${pi}]`;
        blockWords += wordCount(para.text);
        const hr = hebrewRatio(para.text);
        if (lang === "yi" && hr < YI_HARD_MIN) err(`${q}.text: only ${(hr * 100).toFixed(0)}% Hebrew script`);
        else if (lang === "yi" && hr < YI_MIN_HEBREW) warn(`${q}.text: only ${(hr * 100).toFixed(0)}% Hebrew script`);
        if (lang === "en" && hr > EN_MAX_HEBREW) warn(`${q}.text: ${(hr * 100).toFixed(0)}% Hebrew script`);
        for (const si of para.sourceIdx) if (si < 0 || si >= x.sources.length) err(`${q}.sourceIdx: ${si} out of range 0..${x.sources.length - 1}`);
        if (multi && para.evidence.recordingId === undefined) warn(`${q}.evidence: no recordingId (multi-recording shiur; defaulting to the section's)`);
        const rec = checkEvidence(para.evidence, `${q}.evidence`, secRec);
        if (rec && sec && rec.recording.id === sec.recordingId) {
          const far = para.evidence.segs.filter(
            (s) => s < sec.startSeg - EVIDENCE_SLACK_SEGS || s > sec.endSeg + EVIDENCE_SLACK_SEGS,
          );
          if (far.length) warn(`${q}.evidence: segs ${far.join(",")} outside section ${b.sectionIndex} (${sec.startSeg}..${sec.endSeg})`);
        } else if (rec && sec) {
          warn(`${q}.evidence: points into ${rec.recording.id}, section is in ${sec.recordingId}`);
        }
      });
      words[lang] += blockWords;
      const planned = budget.sections[b.sectionIndex]?.words;
      if (planned && blockWords > planned * BLOCK_TOLERANCE.warnHigh + BLOCK_TOLERANCE.slack) {
        warn(`${p}: ${blockWords} words, budget for section ${b.sectionIndex} is ${planned}`);
      }
    });
    for (const { s, i } of contentSections) {
      if (!seen.has(i) && s.kind === "main") err(`writeup.${lang}: no block for main section ${i} "${s.title.en}"`);
    }
    const { min: lo, max: hi } = budget;
    const T = WRITEUP_TOLERANCE;
    const range = `${lo}-${hi} (budget ${budget.total} for ${mmss(budget.contentSec)} of content; npm run -s writeup:budget)`;
    if (words[lang] < lo * T.errLow) err(`writeup.${lang}: ${words[lang]} words, far below ${range}`);
    else if (words[lang] > hi * T.errHigh) err(`writeup.${lang}: ${words[lang]} words, far above ${range}; trim to the budget`);
    else if (words[lang] < lo * T.warnLow || words[lang] > hi * T.warnHigh) warn(`writeup.${lang}: ${words[lang]} words (target ${range})`);
  }
  if (w.en.length !== w.yi.length) warn(`writeup: ${w.en.length} en blocks vs ${w.yi.length} yi blocks`);
  if (words.en && words.yi) {
    const ratio = words.yi / words.en;
    if (ratio < 0.6 || ratio > 1.6) warn(`writeup: yi/en word ratio ${ratio.toFixed(2)} (expected ~0.8-1.2)`);
  }

  for (const lang of ["en", "yi"] as const) {
    for (const b of w[lang]) for (const para of b.paragraphs) for (const i of para.sourceIdx) if (i >= 0 && i < x.sources.length) sourcesUsed.add(i);
  }

  const conf = [...w.en, ...w.yi].flatMap((b) => b.paragraphs.map((p) => p.evidence.confidence));
  Object.assign(r.stats, {
    duration: mmss(meta.totalDurationSec),
    blocksEn: w.en.length,
    blocksYi: w.yi.length,
    contentSections: contentSections.length,
    parasEn: w.en.reduce((a, b) => a + b.paragraphs.length, 0),
    parasYi: w.yi.reduce((a, b) => a + b.paragraphs.length, 0),
    sourcesCited: `${sourcesUsed.size}/${x.sources.length}`,
    wordsEn: words.en,
    wordsYi: words.yi,
    budget: budget.total,
    wphEn: budget.contentSec ? Math.round(words.en / (budget.contentSec / 3600)) : 0,
    wphYi: budget.contentSec ? Math.round(words.yi / (budget.contentSec / 3600)) : 0,
    meanConf: mean(conf),
  });
}

// ---------------- output ----------------
function printReport(r: Report, quiet: boolean): void {
  const status = r.errors.length ? "FAIL" : "OK";
  console.log(`\n== ${r.file} [${r.kind ?? "?"}]: ${status} (${r.errors.length} errors, ${r.warnings.length} warnings)`);
  for (const e of r.errors) console.log(`  ERROR ${e}`);
  if (!quiet) for (const w of r.warnings) console.log(`  warn  ${w}`);
  const s = r.stats;
  if (!s.duration) return;
  if (r.kind === "extraction") {
    console.log(
      `  stats: ${s.duration} | sections ${s.sections} (main ${s.mainSections}, sub ${s.subsections}) | sources ${s.sources} (resolved ${s.resolvedSources}) | ` +
        `keyPts ${s.keyPoints} insights ${s.insights} stories ${s.stories} Q&A ${s.questions} takeaways ${s.takeaways} topics ${s.topics} | ` +
        `catalog ${s.catalogCovered} | meanConf ${s.meanConf}`,
    );
  } else {
    console.log(
      `  stats: ${s.duration} | on ${s.extractionVariant} | blocks en ${s.blocksEn} yi ${s.blocksYi} (content sections ${s.contentSections}) | ` +
        `paras en ${s.parasEn} yi ${s.parasYi} | sources cited ${s.sourcesCited} | ` +
        `budget ${s.budget}w | en ${s.wordsEn}w (${s.wphEn}/content-h) yi ${s.wordsYi}w (${s.wphYi}/content-h) | meanConf ${s.meanConf}`,
    );
  }
}

type Col = [string, (r: Report) => string];
const stat = (k: string) => (r: Report) => String(r.stats[k] ?? "");
const COMMON_COLS: Col[] = [
  ["file", (r) => `${basename(dirname(r.file))}/${basename(r.file)}`],
  ["model", stat("model")],
  ["variant", stat("variant")],
  ["err", (r) => String(r.errors.length)],
  ["warn", (r) => String(r.warnings.length)],
];
const EXTRACTION_COLS: Col[] = [
  ...COMMON_COLS,
  ["sect", stat("sections")],
  ["sub", stat("subsections")],
  ["src", stat("sources")],
  ["keyP", stat("keyPoints")],
  ["ins", stat("insights")],
  ["story", stat("stories")],
  ["Q&A", stat("questions")],
  ["take", stat("takeaways")],
  ["cat", stat("catalogCovered")],
  ["conf", stat("meanConf")],
];
const WRITEUP_COLS: Col[] = [
  ...COMMON_COLS,
  ["on", stat("extractionVariant")],
  ["blk en", stat("blocksEn")],
  ["blk yi", stat("blocksYi")],
  ["src", stat("sourcesCited")],
  ["budget", stat("budget")],
  ["en w", stat("wordsEn")],
  ["yi w", stat("wordsYi")],
  ["en/h", stat("wphEn")],
  ["yi/h", stat("wphYi")],
  ["conf", stat("meanConf")],
];

function printTable(title: string, cols: Col[], reports: Report[]): void {
  if (!reports.length) return;
  const rows = reports.map((r) => cols.map(([, f]) => f(r)));
  const widths = cols.map(([h], i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
  const fmt = (cells: string[]) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join("  ");
  console.log(`\n${title} (${reports.length})`);
  console.log(fmt(cols.map(([h]) => h)));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(fmt(row));
}

function printSummary(reports: Report[]): void {
  printTable("EXTRACTIONS", EXTRACTION_COLS, reports.filter((r) => r.kind === "extraction"));
  printTable("WRITE-UPS", WRITEUP_COLS, reports.filter((r) => r.kind === "writeup"));
  const unknown = reports.filter((r) => r.kind === null);
  if (unknown.length) {
    console.log(`\nUNREADABLE (${unknown.length})`);
    for (const r of unknown) console.log(`  ${r.file}: ${r.errors[0] ?? "?"}`);
  }
}

/** Skip the pilot kit's own files and judge verdicts, so `out/pilot/<id>/*` globs work. */
function isOutputFile(path: string): boolean {
  const b = basename(path);
  return b.endsWith(".json") && b !== "meta.json" && !b.startsWith("judge");
}

function main(): void {
  const args = process.argv.slice(2);
  let summary = false;
  let quiet = false;
  let meta: string | null = null;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--summary") summary = true;
    else if (a === "--quiet") quiet = true;
    else if (a === "--meta") meta = args[++i] ?? null;
    else if (a.startsWith("--")) {
      console.error(`unknown flag ${a}`);
      process.exit(2);
    } else if (isOutputFile(a)) files.push(a);
  }
  if (files.length === 0) {
    console.error("usage: npx tsx scripts/validate.ts [--summary] [--quiet] [--meta meta.json] <extraction-or-writeup.json...>");
    process.exit(2);
  }
  const reports = files.map((f) => validateFile(f, meta));
  if (summary) printSummary(reports);
  else for (const r of reports) printReport(r, quiet);
  process.exit(reports.some((r) => r.errors.length) ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();

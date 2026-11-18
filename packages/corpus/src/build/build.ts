/**
 * `corpus:build`: data/ → .corpus/ (integration-plan §4 step 1, §5.1).
 *
 *   build.json, shiurim/<id>.json, index.json, audio-table.json, updated.json, build-report.json, .fingerprints.json
 *
 * `index.json` also lists the catalog gaps (`gaps`: guide rows with no audio, catalog fields only;
 * see gaps.ts), which have no shiur file.
 *
 * `updated.json` carries the manifest `updatedAt` of every full shiur (`{ schemaVersion, updatedAt:
 * { shiurId: iso } }`), so apps can list "newly summarized" without reading data/ (W3.6).
 *
 * Audio (Amendment A1): every recording gets `audioUrl` = media origin + per-segment-encoded bucket
 * key, or `playable: false` when its object is not an mp3 (unless `site-policy/audio-transcoded.json`
 * lists the key: then the URL is that of the `.mp3` transcode next to it). The media origin comes from
 * `BuildOptions.mediaOrigin`, else env `EMUNAS_MEDIA_ORIGIN`, else the dev placeholder
 * `https://media.example.invalid` (reported as a warning). The bucket key never reaches the output.
 *
 * Every build takes what is in data/ at that moment. Only an invalid ingest or manifest is fatal; a
 * bad shiur becomes catalog-only and is reported. A shiur file is rewritten only when its fingerprint
 * (all of its inputs + projector/keyer/schema versions + policy) changed or the file is missing.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MEDIA_ORIGIN,
  MEDIA_ORIGIN_ENV,
  buildAudioTable,
  normalizeMediaOrigin,
  type AudioTable,
  type AudioTableIssue,
} from "@emunas/audio";
import type { Recording, Shiur } from "../../../../src/types.ts";
import { SCHEMA_VERSION } from "../public/index.ts";
import type {
  BuildInfo,
  CorpusIndex,
  IndexRow,
  IndexSection,
  PublicSeries,
  PublicShiur,
} from "../public/types.ts";
import { shiurIdOf } from "../public/moment-id.ts";
import { catalogGaps } from "./gaps.ts";
import { gate } from "./gate.ts";
import { identitySlugKeyer, type Keyer } from "./keyer.ts";
import { loadCatalogs, loadIngest, loadManifest, loadShiurFiles, type Catalogs, type ShiurFiles } from "./load.ts";
import { loadAudioTranscoded, loadPublishPolicy, loadSuppressFile, type PublishPolicy } from "./policy.ts";
import { PROJECTOR_VERSION, projectShiur, type ProjectContext } from "./project.ts";
import { createDataReader, defaultDataDir, defaultPolicyDir, REPO_ROOT } from "./read.ts";
import { emitEligibleTranscripts } from "../transcript-gate.ts";
import { TRANSLATED_LANGS, currentShiurOverlays, loadShiurOverlays, type ShiurOverlayFile } from "./translations.ts";
import { isCorpusItemId } from "../layer/suppress.ts";
import { ReportCollector, type BuildReport } from "./report.ts";

export interface BuildOptions {
  dataDir?: string;
  outDir?: string;
  policyDir?: string;
  /** Guard pre-pass output (ids only). */
  suppressFile?: string;
  keyer?: Keyer;
  /**
   * Origin of the public media host (`https://media.<domain>`). Default: env `EMUNAS_MEDIA_ORIGIN`,
   * else `DEFAULT_MEDIA_ORIGIN` (a `.invalid` placeholder for dev, reported as a warning).
   * An invalid origin is fatal.
   */
  mediaOrigin?: string;
  /** Rewrite every shiur file even when its fingerprint is unchanged. */
  force?: boolean;
  /** Commit sha of the data; default: `EMUNAS_DATA_SHA`, else git's last commit touching the data dir. */
  dataSha?: string | null;
  /**
   * Extra outputs computed from the projected corpus (W2.1 aggregates). Each returned entry is
   * written to `<out>/<name>` as JSON (only when its content changed).
   */
  extraOutputs?: (corpus: ProjectedCorpus) => Record<string, unknown>;
  /** Environment for the transcript gate (EMUNAS_TRANSCRIPT_VIEW); default `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
  log?: (line: string) => void;
}

export interface ProjectedCorpus {
  shiurim: PublicShiur[];
  index: CorpusIndex;
  keyer: Keyer;
  report: ReportCollector;
}

export interface BuildResult {
  info: BuildInfo;
  report: BuildReport;
  outDir: string;
  /** Shiur files written (new or changed fingerprint). */
  written: string[];
  /** Shiur files removed (no longer in scope). */
  removed: string[];
  ms: number;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Public files that never affect the projection of a shiur: the corpus-layer types (C1.2), which
 * have their own LAYER_SCHEMA_VERSION. They and the line re-exporting them are left out of
 * CODE_HASH, so a layer change does not churn every shiur fingerprint.
 */
const NOT_PROJECTION_SOURCES = new Set(["corpus-layer.ts"]);
const NOT_PROJECTION_EXPORT = /^export \* from "\.\/corpus-layer\.ts";\n/gm;

/**
 * Hash of this package's projection source (src/public, src/build). Part of every fingerprint, so a
 * code change re-emits the affected shiurim even when nobody bumped PROJECTOR_VERSION.
 */
export const CODE_HASH: string = (() => {
  const h = createHash("sha256");
  const here = dirname(fileURLToPath(import.meta.url));
  for (const dir of [here, resolve(here, "../public")]) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts") && !NOT_PROJECTION_SOURCES.has(x)).sort()) {
      h.update(`${f}\u0000${readFileSync(join(dir, f), "utf8").replace(NOT_PROJECTION_EXPORT, "")}\u0000`);
    }
  }
  return h.digest("hex").slice(0, 16);
})();

/** Deterministic JSON: object keys in insertion order (the projector builds them in a fixed order). */
export function toJson(x: unknown): string {
  return `${JSON.stringify(x, null, 1)}\n`;
}

function writeIfChanged(path: string, text: string): boolean {
  if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
  return true;
}

function gitDataSha(dataDir: string): string | null {
  try {
    const out = execFileSync("git", ["-C", dataDir, "log", "-1", "--format=%H", "--", "."], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^[0-9a-f]{40}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

function sectionsOf(catalogs: Catalogs, listed: Shiur[], report: ReportCollector): IndexSection[] {
  const out: IndexSection[] = [];
  const add = (source: IndexSection["source"], file: Catalogs["pocketGuide"]) => {
    for (const s of file?.sections ?? []) {
      const key = `${source}:${s.id}`;
      if (out.some((x) => x.key === key)) continue;
      out.push({ key, source, id: s.id, title: s.title, order: out.length, pages: s.pages ?? null, dir: s.dir ?? null });
    }
  };
  add("pocket-guide-2012", catalogs.pocketGuide);
  add("uncatalogued-guide", catalogs.uncatalogued);
  for (const s of listed) {
    const key = `${s.catalog.source}:${s.catalog.sectionId}`;
    if (out.some((x) => x.key === key)) continue;
    report.missingSections.push(key);
    out.push({ key, source: s.catalog.source, id: s.catalog.sectionId, title: s.catalog.sectionTitle, order: out.length, pages: null, dir: null });
  }
  return out;
}

function indexRow(p: PublicShiur): IndexRow {
  const n = p.notes;
  const { topics: _topics, note: _note, ...catalog } = p.catalog;
  return {
    id: p.id,
    rev: p.rev,
    lang: p.lang,
    category: p.category,
    status: p.status,
    catalog,
    parsha: p.parsha,
    zman: p.zman,
    perek: p.perek,
    years: p.years,
    series: p.series,
    duration: p.duration,
    recordingIds: p.recordings.map((r) => r.id),
    oneLiner: n ? n.summary.oneLiner : null,
    counts: {
      chapters: n?.chapters.length ?? 0,
      sources: n?.sources.length ?? 0,
      stories: n?.stories.length ?? 0,
      questions: n?.questions.length ?? 0,
      insights: n?.insights.length ?? 0,
    },
  };
}

function fingerprintOf(parts: {
  shiur: Shiur;
  recordings: (Recording | undefined)[];
  /** This shiur's audio-table rows (URL and playability: covers media origin and bucket key changes). */
  audio: unknown[];
  seriesCount: number | null;
  entry: unknown;
  files: ShiurFiles | null;
  /** Translation overlay files of the shiur (raw text per language). */
  overlays: Partial<Record<string, ShiurOverlayFile>>;
  keyer: Keyer;
  policy: PublishPolicy;
  suppress: string[];
}): string {
  const h = createHash("sha256");
  const add = (label: string, s: string) => h.update(`${label}\u0000${s.length}\u0000${s}\u0000`);
  add("schema", String(SCHEMA_VERSION));
  add("projector", `${PROJECTOR_VERSION}+${CODE_HASH}`);
  add("keyer", `${parts.keyer.id}@${parts.keyer.version}`);
  add("policy", JSON.stringify([parts.policy.dropBelow, parts.policy.softBelow]));
  add("suppress", JSON.stringify(parts.suppress));
  add("shiur", JSON.stringify(parts.shiur));
  add("recordings", JSON.stringify(parts.recordings.map((r) => (r ? [r.id, r.durationSec, r.sizeBytes, r.duplicateOf] : null))));
  add("audio", JSON.stringify(parts.audio));
  add("series", String(parts.seriesCount));
  add("manifest", JSON.stringify(parts.entry ?? null));
  add("meta", parts.files?.texts.meta ?? "");
  add("extraction", parts.files?.texts.extraction ?? "");
  add("writeup", parts.files?.texts.writeup ?? "");
  for (const lang of TRANSLATED_LANGS) add(`i18n:${lang}`, parts.overlays[lang]?.text ?? "");
  return h.digest("hex");
}

interface FingerprintFile {
  schemaVersion: number;
  shiurim: Record<string, string>;
}

function readFingerprints(path: string): Record<string, string> {
  try {
    const f = JSON.parse(readFileSync(path, "utf8")) as FingerprintFile;
    return f.schemaVersion === SCHEMA_VERSION && f.shiurim && typeof f.shiurim === "object" ? f.shiurim : {};
  } catch {
    return {};
  }
}

export function resolveOutDir(outDir: string | undefined): string {
  return outDir ? resolve(outDir) : resolve(REPO_ROOT, ".corpus");
}

/** `opts.mediaOrigin`, else env `EMUNAS_MEDIA_ORIGIN`, else the placeholder; validated (throws when invalid). */
export function resolveMediaOrigin(mediaOrigin?: string): { origin: string; placeholder: boolean } {
  const raw = mediaOrigin ?? process.env[MEDIA_ORIGIN_ENV];
  const origin = normalizeMediaOrigin(raw === undefined || raw.trim() === "" ? DEFAULT_MEDIA_ORIGIN : raw);
  return { origin, placeholder: origin === DEFAULT_MEDIA_ORIGIN };
}

function audioIssueText(i: AudioTableIssue): string {
  switch (i.kind) {
    case "unplayable":
      return `audio: ${i.id} not playable (${i.reason}); shown as unavailable`;
    case "missing-canonical":
      return `audio: ${i.id} duplicateOf ${i.duplicateOf} not in ingest; shown as unavailable`;
    case "duplicate-cycle":
      return `audio: ${i.id} duplicateOf chain does not end; shown as unavailable`;
    case "duplicate-id":
      return `audio: recording ${i.id} listed twice in ingest`;
    case "invalid-size":
      return `audio: ${i.id} has an invalid sizeBytes`;
  }
}

/** Load, gate and project every in-scope shiur (no file output). */
export function projectCorpus(
  opts: Pick<BuildOptions, "dataDir" | "policyDir" | "suppressFile" | "keyer" | "mediaOrigin"> = {},
) {
  const media = resolveMediaOrigin(opts.mediaOrigin);
  const reader = createDataReader(opts.dataDir ?? defaultDataDir());
  const keyer = opts.keyer ?? identitySlugKeyer;
  const policy = loadPublishPolicy(opts.policyDir ?? defaultPolicyDir());
  // Corpus-layer ids (`corpus:…`) are applied to `.corpus/layer/` by layer/suppress.ts, not here.
  const suppressIds = [...policy.suppress, ...(opts.suppressFile ? loadSuppressFile(opts.suppressFile) : [])].filter(
    (id) => !isCorpusItemId(id),
  );
  const suppress = new Set(suppressIds);
  const suppressByShiur = new Map<string, string[]>();
  for (const id of suppress) {
    const sid = shiurIdOf(id);
    if (sid === null) continue;
    const list = suppressByShiur.get(sid) ?? [];
    list.push(id);
    suppressByShiur.set(sid, list);
  }

  const ingest = loadIngest(reader);
  const manifest = loadManifest(reader);
  const catalogs = loadCatalogs(reader);
  const report = new ReportCollector();
  report.warnings.push(...catalogs.warnings);

  const inScope = ingest.shiurim.filter((s) => s.inScope);
  const inScopeIds = new Set(inScope.map((s) => s.id));
  const seen = new Set<string>();
  for (const s of inScope) {
    if (seen.has(s.id)) throw new Error(`derived/ingest.json lists ${s.id} twice`);
    seen.add(s.id);
  }
  const recordingsById = new Map(ingest.recordings.map((r) => [r.id, r]));
  const entries = new Map(manifest.entries.map((e) => [e.shiurId, e]));
  const series: PublicSeries[] = ingest.series.map((x) => ({
    id: x.id,
    // The catalog series name from ingest has no translation overlay (the corpus layer's
    // `series/<id>.json` carries the translated synthesis title).
    title: { en: x.title.en, yi: x.title.yi },
    lang: x.lang,
    catalogSectionIds: [...x.catalogSectionIds],
    shiurIds: x.shiurIds.filter((id) => inScopeIds.has(id)),
  }));
  const seriesCount = new Map<string, number>();
  for (const s of inScope) if (s.seriesId !== null) seriesCount.set(s.seriesId, (seriesCount.get(s.seriesId) ?? 0) + 1);

  if (media.placeholder) {
    report.warnings.push(`audio: ${MEDIA_ORIGIN_ENV} not set; audio URLs use the placeholder ${DEFAULT_MEDIA_ORIGIN}`);
  }
  const audioTable: AudioTable = buildAudioTable(ingest.recordings, {
    origin: media.origin,
    mp3Siblings: loadAudioTranscoded(opts.policyDir ?? defaultPolicyDir()),
    only: inScope.flatMap((s) => s.recordingIds),
    onIssue: (i) => report.warnings.push(audioIssueText(i)),
  });

  const ctx: ProjectContext = { keyer, policy, suppress, report, recordingsById, seriesCount, audio: audioTable };
  const shiurim: PublicShiur[] = [];
  const fingerprints: Record<string, string> = {};
  const updatedAt: Record<string, string> = {};
  let notDone = 0;

  for (const s of inScope) {
    for (const rid of s.recordingIds) {
      if (!recordingsById.has(rid)) report.warnings.push(`${s.id}: recording ${rid} not in ingest recordings`);
    }
    const entry = entries.get(s.id);
    if (entry?.status !== "done") notDone++;
    // Files are read for done shiurim (and to notice mid-flight directories of the others).
    const files = loadShiurFiles(reader, s.id);
    if (entry?.status !== "done" && files.anyFile) report.notDoneWithFiles.push(s.id);
    const g = gate(s, entry, entry?.status === "done" ? files : null);
    const overlayFiles = loadShiurOverlays(reader, s.id);
    const overlays = g.full
      ? currentShiurOverlays(overlayFiles, g, (lang, why) => report.translation(lang, s.id, why))
      : {};
    const fp = fingerprintOf({
      shiur: s,
      recordings: s.recordingIds.map((id) => recordingsById.get(id)),
      audio: s.recordingIds.map((id) => audioTable[id] ?? null),
      seriesCount: s.seriesId !== null ? (seriesCount.get(s.seriesId) ?? 0) : null,
      entry,
      files: entry?.status === "done" ? files : null,
      overlays: g.full ? overlayFiles : {},
      keyer,
      policy,
      suppress: [...(suppressByShiur.get(s.id) ?? [])].sort(),
    });
    fingerprints[s.id] = fp;
    const rev = fp.slice(0, 12);
    const r = projectShiur({ shiur: s, rev, full: g.full ? g : null, overlays }, ctx);
    if (!g.full && g.downgrade) {
      report.downgraded.push({ id: s.id, manifestStatus: entry?.status ?? null, reasons: g.reasons });
    } else if (r.notesError !== null) {
      report.downgraded.push({ id: s.id, manifestStatus: entry?.status ?? null, reasons: [r.notesError] });
    }
    if (r.shiur.status === "full") for (const lang of TRANSLATED_LANGS) if (overlays[lang] !== undefined) report.translation(lang, s.id, "applied");
    shiurim.push(r.shiur);
    if (r.shiur.status === "full" && typeof entry?.updatedAt === "string") updatedAt[s.id] = entry.updatedAt;
  }

  const gaps = catalogGaps(ingest.shiurim, keyer, report);
  const gapIds = new Set(gaps.map((g) => g.id));
  const sections = sectionsOf(
    catalogs,
    ingest.shiurim.filter((s) => s.inScope || gapIds.has(s.id)),
    report,
  );
  const index: CorpusIndex = { schemaVersion: SCHEMA_VERSION, sections, series, shiurim: shiurim.map(indexRow), gaps };
  const full = shiurim.filter((s) => s.status === "full").length;
  const counts = {
    total: shiurim.length,
    full,
    catalogOnly: shiurim.length - full,
    downgraded: report.downgraded.length,
  };
  return {
    shiurim,
    index,
    report,
    counts,
    notDone,
    fingerprints,
    audioTable,
    updatedAt,
    mediaOrigin: media.origin,
    keyer,
    suppressIds,
  };
}

export function buildCorpus(opts: BuildOptions = {}): BuildResult {
  const t0 = performance.now();
  const log = opts.log ?? (() => {});
  const dataDir = resolve(opts.dataDir ?? defaultDataDir());
  const outDir = resolveOutDir(opts.outDir);
  const p = projectCorpus({ ...opts, dataDir });

  mkdirSync(join(outDir, "shiurim"), { recursive: true });
  const fpPath = join(outDir, ".fingerprints.json");
  const previous = opts.force ? {} : readFingerprints(fpPath);
  const written: string[] = [];
  for (const s of p.shiurim) {
    const path = join(outDir, "shiurim", `${s.id}.json`);
    if (previous[s.id] === p.fingerprints[s.id] && existsSync(path)) continue;
    writeFileSync(path, toJson(s));
    written.push(s.id);
  }
  const keep = new Set(p.shiurim.map((s) => `${s.id}.json`));
  const removed: string[] = [];
  for (const f of readdirSync(join(outDir, "shiurim"))) {
    if (!keep.has(f)) {
      rmSync(join(outDir, "shiurim", f), { force: true });
      removed.push(f);
    }
  }

  const buildId = sha256(
    JSON.stringify([
      SCHEMA_VERSION,
      PROJECTOR_VERSION,
      CODE_HASH,
      p.keyer.id,
      p.keyer.version,
      p.mediaOrigin,
      Object.entries(p.fingerprints).sort(),
    ]),
  ).slice(0, 16);
  const dataSha = opts.dataSha !== undefined ? opts.dataSha : (process.env["EMUNAS_DATA_SHA"] ?? gitDataSha(dataDir));
  const info: BuildInfo = { buildId, dataSha, schemaVersion: SCHEMA_VERSION, mediaOrigin: p.mediaOrigin, counts: p.counts };
  writeIfChanged(join(outDir, "index.json"), toJson(p.index));
  writeIfChanged(join(outDir, "audio-table.json"), toJson(p.audioTable));
  writeIfChanged(join(outDir, "updated.json"), toJson({ schemaVersion: SCHEMA_VERSION, updatedAt: p.updatedAt }));
  if (opts.extraOutputs) {
    const extra = opts.extraOutputs({ shiurim: p.shiurim, index: p.index, keyer: p.keyer, report: p.report });
    for (const [name, value] of Object.entries(extra)) {
      if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*\.json$/.test(name)) throw new Error(`extra output name not allowed: ${name}`);
      const path = join(outDir, name);
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeIfChanged(path, toJson(value));
    }
  }
  // Transcript view (W5.2): `.corpus/transcript/<recordingId>.json` only for gate-approved recordings;
  // with EMUNAS_TRANSCRIPT_VIEW off (the default) the folder is removed and nothing is read.
  const tv = emitEligibleTranscripts({
    outDir,
    recordingIds: p.shiurim.flatMap((s) => s.recordings.map((r) => r.id)),
    dataDir,
    policyDir: opts.policyDir ?? defaultPolicyDir(),
    env: opts.env ?? process.env,
  });
  log(
    tv.enabled
      ? `transcript view ON: ${tv.emitted.length} file(s) [${tv.emitted.join(", ")}], ` +
          `${tv.skipped.length} eligible id(s) skipped${tv.skipped.length ? ` [${tv.skipped.map((s) => `${s.recordingId}: ${s.reason}`).join(", ")}]` : ""}`
      : "transcript view off",
  );
  // Finished after the extra outputs so aggregates can add unmapped values and warnings.
  const report = p.report.finish({ ...p.counts, notDone: p.notDone }, SCHEMA_VERSION, p.suppressIds);
  writeIfChanged(join(outDir, "build-report.json"), toJson(report));
  writeIfChanged(join(outDir, "build.json"), toJson(info));
  writeIfChanged(fpPath, toJson({ schemaVersion: SCHEMA_VERSION, shiurim: p.fingerprints } satisfies FingerprintFile));

  const ms = Math.round(performance.now() - t0);
  log(
    `corpus:build ${p.counts.total} shiurim: ${p.counts.full} full, ${p.counts.catalogOnly} catalog-only ` +
      `(${p.counts.downgraded} downgraded); wrote ${written.length}, removed ${removed.length} → ${outDir} in ${ms} ms`,
  );
  return { info, report, outDir, written, removed, ms };
}

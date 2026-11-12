// Build P4 pilot inputs for one or more shiurim.
//
//   npx tsx scripts/prepare-pilot.ts <shiurId...> [--ingest data/derived/ingest.json] [--out out/pilot]
//
// For each shiur: loads every recording's transcript JSON from out/transcripts/ (downloads it from
// R2 when missing), then writes out/pilot/<shiurId>/input.txt (what the extraction subagent reads)
// and out/pilot/<shiurId>/meta.json (what validate.ts checks against). Segment text is kept as-is.
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { IngestOutput, Recording, Shiur } from "../src/types.js";
import {
  hebrewYearLabel,
  langName,
  loadDotEnv,
  mmss,
  splitCatalogTopics,
  type PilotMeta,
  type PilotRecordingMeta,
  type TranscriptJson,
} from "./lib/pilot.js";

const TRANSCRIPT_CACHE = "out/transcripts";

function parseArgs(argv: string[]): { ids: string[]; ingest: string; out: string } {
  const ids: string[] = [];
  let ingest = "data/derived/ingest.json";
  let out = "out/pilot";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--ingest") ingest = argv[++i] ?? ingest;
    else if (a === "--out") out = argv[++i] ?? out;
    else if (a.startsWith("--")) throw new Error(`unknown flag ${a}`);
    else ids.push(a);
  }
  return { ids, ingest, out };
}

let s3: S3Client | null = null;
function r2(): { client: S3Client; bucket: string } {
  loadDotEnv();
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  const missing = Object.entries({ R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`missing env (.env): ${missing.join(", ")}`);
  s3 ??= new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT!,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
  });
  return { client: s3, bucket: R2_BUCKET! };
}

function cachePath(transcriptKey: string): string {
  const rel = transcriptKey.replace(/^transcripts\//, "");
  return join(TRANSCRIPT_CACHE, `${rel}.json`);
}

async function loadTranscript(transcriptKey: string): Promise<TranscriptJson> {
  const local = cachePath(transcriptKey);
  if (!existsSync(local)) {
    const { client, bucket } = r2();
    const key = `${transcriptKey}.json`;
    process.stderr.write(`  downloading ${key}\n`);
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) throw new Error(`empty body for ${key}`);
    const body = await res.Body.transformToString("utf-8");
    mkdirSync(dirname(local), { recursive: true });
    writeFileSync(local, body);
  }
  const parsed = JSON.parse(readFileSync(local, "utf8")) as TranscriptJson;
  if (!Array.isArray(parsed.segments)) throw new Error(`${local}: no segments[]`);
  return parsed;
}

/** Keep text verbatim, except newlines, which would break the one-segment-per-line format. */
function oneLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

function header(shiur: Shiur, meta: PilotMeta): string {
  const c = shiur.catalog;
  const L: string[] = [];
  L.push(`# SHIUR ${shiur.id}`);
  L.push(`language: ${langName(shiur.lang)} (${shiur.lang})`);
  L.push(`catalogTitle: ${c.titleOriginal}`);
  if (meta.catalogTopics.length > 1) {
    L.push(`catalogTopics (catalogTitle split on ';' — use these indices for catalogTopicIdx):`);
    meta.catalogTopics.forEach((t, i) => L.push(`  ${i}: ${t}`));
  } else {
    L.push(`catalogTopics: 0: ${meta.catalogTopics[0] ?? "(none)"}`);
  }
  if (c.subTitle) L.push(`catalogSubTitle: ${c.subTitle}`);
  L.push(`catalogSection: ${c.sectionTitle} (${c.sectionId})${c.n ? `, #${c.n}` : ""}`);
  L.push(`catalogConfidence: ${c.derived === "catalog" ? "human-written catalog row" : `derived guess (${c.derived}) — treat title as a hint only`}`);
  if (c.note) L.push(`catalogNote: ${c.note}`);
  L.push(`category: ${shiur.category}`);
  if (shiur.parsha) L.push(`parsha: ${shiur.parsha}`);
  if (shiur.zman) L.push(`zman: ${shiur.zman}`);
  if (shiur.perek) L.push(`perek: ${shiur.perek}`);
  if (shiur.hebrewYears.length) L.push(`year: ${shiur.hebrewYears.map(hebrewYearLabel).join(", ")}`);
  if (meta.series) {
    L.push(`series: ${meta.series.title.en} / ${meta.series.title.yi} (${meta.series.id})${shiur.seriesOrder != null ? `, part ${shiur.seriesOrder}` : ""}`);
  }
  if (shiur.pathNotes.length) L.push(`pathNotes: ${shiur.pathNotes.join("; ")}`);
  L.push(`totalDuration: ${mmss(meta.totalDurationSec)} (${(meta.totalDurationSec / 3600).toFixed(2)} h)`);
  const h = meta.totalDurationSec / 3600;
  const secMin = Math.max(1, Math.floor(4 * h));
  const secMax = Math.max(secMin, Math.ceil(12 * h));
  L.push(`targets: ${secMin}-${secMax} sections in total; write-up about ${Math.round(400 * h)}-${Math.round(700 * h)} words per language`);
  L.push(`recordings (in playback order):`);
  for (const r of meta.recordings) {
    L.push(`  ${r.recording.id}: ${r.segmentCount} segments (idx 0..${r.segmentCount - 1}), ${mmss(r.durationSec)}, asr=${r.asrModel ?? "?"}`);
  }
  return L.join("\n");
}

async function prepare(shiur: Shiur, ingest: IngestOutput, outRoot: string): Promise<void> {
  const recById = new Map(ingest.recordings.map((r) => [r.id, r]));
  const recs: PilotRecordingMeta[] = [];
  const bodies: string[] = [];
  for (const [order, rid] of shiur.recordingIds.entries()) {
    const rec: Recording | undefined = recById.get(rid);
    if (!rec) throw new Error(`${shiur.id}: recording ${rid} not in ingest.recordings`);
    if (!rec.transcriptKey) {
      process.stderr.write(`  WARN ${rid}: no transcript, skipped\n`);
      continue;
    }
    const tr = await loadTranscript(rec.transcriptKey);
    const segs = tr.segments;
    const last = segs[segs.length - 1];
    const durationSec = tr.duration ?? rec.durationSec ?? (last ? last.end : 0);
    recs.push({
      recording: rec,
      order,
      transcriptLanguage: tr.language ?? null,
      asrModel: tr.model ?? rec.asrModel,
      durationSec,
      segmentCount: segs.length,
      starts: segs.map((s) => s.start),
      ends: segs.map((s) => s.end),
    });
    const lines = [`## RECORDING ${rec.id} — ${segs.length} segments, ${mmss(durationSec)}`];
    segs.forEach((s, i) => lines.push(`[${rec.id}:${i}|${mmss(s.start)}] ${oneLine(s.text)}`));
    bodies.push(lines.join("\n"));
  }
  if (recs.length === 0) throw new Error(`${shiur.id}: no transcribed recordings`);

  const meta: PilotMeta = {
    shiurId: shiur.id,
    generatedAt: new Date().toISOString(),
    shiur,
    series: shiur.seriesId ? ingest.series.find((s) => s.id === shiur.seriesId) ?? null : null,
    catalogTopics: splitCatalogTopics(shiur.catalog.titleOriginal),
    totalDurationSec: recs.reduce((a, r) => a + r.durationSec, 0),
    recordings: recs,
  };

  const dir = join(outRoot, shiur.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "input.txt"), `${header(shiur, meta)}\n\n${bodies.join("\n\n")}\n`);
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 1) + "\n");
  const segTotal = recs.reduce((a, r) => a + r.segmentCount, 0);
  console.log(`${shiur.id}: ${recs.length} recording(s), ${segTotal} segments, ${mmss(meta.totalDurationSec)} -> ${dir}/`);
}

async function main(): Promise<void> {
  const { ids, ingest: ingestPath, out } = parseArgs(process.argv.slice(2));
  if (ids.length === 0) {
    console.error("usage: npx tsx scripts/prepare-pilot.ts <shiurId...> [--ingest path] [--out dir]");
    process.exit(2);
  }
  const ingest = JSON.parse(readFileSync(ingestPath, "utf8")) as IngestOutput;
  const byId = new Map(ingest.shiurim.map((s) => [s.id, s]));
  let failed = 0;
  for (const id of ids) {
    const shiur = byId.get(id);
    if (!shiur) {
      console.error(`ERROR ${id}: not found in ${ingestPath}`);
      failed++;
      continue;
    }
    if (!shiur.inScope) console.error(`  WARN ${id}: inScope=false (${shiur.outOfScopeReason ?? "?"}), preparing anyway`);
    try {
      await prepare(shiur, ingest, out);
    } catch (e) {
      console.error(`ERROR ${id}: ${(e as Error).message}`);
      failed++;
    }
  }
  process.exit(failed ? 1 : 0);
}

await main();

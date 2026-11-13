// Input preparation shared by the pilot (scripts/prepare-pilot.ts) and production (scripts/batch.ts).
// For one shiur it writes <dir>/input.txt (what the agent reads) and <dir>/meta.json (what the
// validator checks against). Segment text is kept verbatim (newlines collapsed); segments the noise
// detector flags get "[NOISE?]" after the line prefix. Segment indices never change.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IngestOutput, Recording, Shiur } from "../../src/types.js";
import { headerWordRange } from "./budget.js";
import { detectNoise, NOISE_MARK, NOISE_TYPES, type NoiseType } from "./noise.js";
import {
  hebrewYearLabel,
  langName,
  loadTranscript,
  mmss,
  splitCatalogTopics,
  type PilotMeta,
  type PilotRecordingMeta,
} from "./pilot.js";

/** Keep text verbatim, except newlines, which would break the one-segment-per-line format. */
function oneLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

export function sectionTargets(totalSec: number): { min: number; max: number } {
  const h = totalSec / 3600;
  const min = Math.max(1, Math.floor(4 * h));
  return { min, max: Math.max(min, Math.ceil(12 * h)) };
}

function noiseSummary(recs: PilotRecordingMeta[]): string | null {
  const counts = Object.fromEntries(NOISE_TYPES.map((t) => [t, 0])) as Record<NoiseType, number>;
  let n = 0;
  for (const r of recs) for (const f of r.noise ?? []) {
    n++;
    for (const t of f.types) counts[t]++;
  }
  if (!n) return null;
  const parts = NOISE_TYPES.filter((t) => counts[t]).map((t) => `${t} ${counts[t]}`);
  return `${n} segment(s) marked ${NOISE_MARK} by code (flags: ${parts.join(", ")}; a segment can have several); see the prompt on how to treat them`;
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
  const sec = sectionTargets(meta.totalDurationSec);
  const wr = headerWordRange(meta.totalDurationSec);
  L.push(
    `targets: ${sec.min}-${sec.max} sections in total; write-up about ${wr.min}-${wr.max} words per language ` +
      `(800-1000 per audio hour; the exact per-section word budget comes from \`npm run -s writeup:budget\` after extraction)`,
  );
  const noise = noiseSummary(meta.recordings);
  if (noise) L.push(`asrNoise: ${noise}`);
  L.push(`recordings (in playback order):`);
  for (const r of meta.recordings) {
    const nz = r.noise?.length ? `, ${r.noise.length} ${NOISE_MARK}` : "";
    L.push(`  ${r.recording.id}: ${r.segmentCount} segments (idx 0..${r.segmentCount - 1}), ${mmss(r.durationSec)}, asr=${r.asrModel ?? "?"}${nz}`);
  }
  return L.join("\n");
}

export interface PreparedShiur {
  dir: string;
  meta: PilotMeta;
  segments: number;
  noiseSegments: number;
}

/** Write <outRoot>/<shiurId>/{input.txt, meta.json}. Throws when no recording has a transcript. */
export function prepareShiur(shiur: Shiur, ingest: IngestOutput, outRoot: string, log: (m: string) => void = () => {}): PreparedShiur {
  const recById = new Map(ingest.recordings.map((r) => [r.id, r]));
  const recs: PilotRecordingMeta[] = [];
  const bodies: string[] = [];
  for (const [order, rid] of shiur.recordingIds.entries()) {
    const rec: Recording | undefined = recById.get(rid);
    if (!rec) throw new Error(`${shiur.id}: recording ${rid} not in ingest.recordings`);
    if (!rec.transcriptKey) {
      log(`  WARN ${rid}: no transcript, skipped`);
      continue;
    }
    const tr = loadTranscript(rec.id);
    const segs = tr.segments;
    const last = segs[segs.length - 1];
    const durationSec = tr.duration ?? rec.durationSec ?? (last ? last.end : 0);
    const noise = detectNoise(segs);
    recs.push({
      recording: rec,
      order,
      transcriptLanguage: tr.language ?? null,
      asrModel: tr.model ?? rec.asrModel,
      durationSec,
      segmentCount: segs.length,
      starts: segs.map((s) => s.start),
      ends: segs.map((s) => s.end),
      noise,
    });
    const flagged = new Set(noise.map((f) => f.idx));
    const lines = [`## RECORDING ${rec.id} — ${segs.length} segments, ${mmss(durationSec)}`];
    segs.forEach((s, i) => lines.push(`[${rec.id}:${i}|${mmss(s.start)}] ${flagged.has(i) ? `${NOISE_MARK} ` : ""}${oneLine(s.text)}`));
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
  // Indented, but numeric arrays (segment starts/ends) on one line each.
  const metaJson = JSON.stringify(meta, null, 1).replace(/\[\s*(-?[\d.e+-]+(?:,\s*-?[\d.e+-]+)*)\s*\]/g, (_, xs: string) => `[${xs.replace(/\s+/g, "")}]`);
  writeFileSync(join(dir, "meta.json"), metaJson + "\n");
  return {
    dir,
    meta,
    segments: recs.reduce((a, r) => a + r.segmentCount, 0),
    noiseSegments: recs.reduce((a, r) => a + (r.noise?.length ?? 0), 0),
  };
}

/** Total duration from ingest (no transcript loading), for ordering and grouping. */
export function ingestDurationSec(shiur: Shiur, ingest: IngestOutput): number {
  const recById = new Map(ingest.recordings.map((r) => [r.id, r]));
  return shiur.recordingIds.reduce((a, id) => a + (recById.get(id)?.durationSec ?? 0), 0);
}

// Corpus-wide ASR noise report: runs the noise detector (scripts/lib/noise.ts) over every
// transcribed recording of every in-scope shiur and prints counts by type.
//
//   npm run noise:report [-- --examples 5] [-- --ingest data/derived/ingest.json]
import { readFileSync } from "node:fs";
import type { IngestOutput } from "../src/types.js";
import { detectNoise, NOISE_TYPES, type NoiseType } from "./lib/noise.js";
import { loadTranscript } from "./lib/pilot.js";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] ?? d : d;
};
const ingest = JSON.parse(readFileSync(opt("--ingest", "data/derived/ingest.json"), "utf8")) as IngestOutput;
const nExamples = Number(opt("--examples", "0"));

const recIds = new Set(ingest.shiurim.filter((s) => s.inScope).flatMap((s) => s.recordingIds));
const recs = ingest.recordings.filter((r) => recIds.has(r.id) && r.transcriptKey);

const byType = Object.fromEntries(NOISE_TYPES.map((t) => [t, 0])) as Record<NoiseType, number>;
const secByType = Object.fromEntries(NOISE_TYPES.map((t) => [t, 0])) as Record<NoiseType, number>;
const examples = Object.fromEntries(NOISE_TYPES.map((t) => [t, [] as string[]])) as Record<NoiseType, string[]>;
let segTotal = 0;
let flagged = 0;
let flaggedSec = 0;
let totalSec = 0;
let recsWithFlags = 0;
for (const r of recs) {
  const tr = loadTranscript(r.id);
  segTotal += tr.segments.length;
  totalSec += tr.duration ?? r.durationSec ?? 0;
  const flags = detectNoise(tr.segments);
  if (flags.length) recsWithFlags++;
  for (const f of flags) {
    const s = tr.segments[f.idx]!;
    const d = s.end - s.start;
    flagged++;
    flaggedSec += d;
    for (const t of f.types) {
      byType[t]++;
      secByType[t] += d;
      if (examples[t].length < nExamples && (examples[t].length === 0 || Math.random() < 0.05)) {
        examples[t].push(`${r.id}:${f.idx} (${d.toFixed(0)}s) ${s.text.trim().slice(0, 90)}`);
      }
    }
  }
}
console.log(`recordings ${recs.length} (${recsWithFlags} with flags), segments ${segTotal}, audio ${(totalSec / 3600).toFixed(1)} h`);
console.log(`flagged segments ${flagged} (${((flagged / segTotal) * 100).toFixed(2)}%), covering ${(flaggedSec / 3600).toFixed(1)} h of segment time`);
for (const t of NOISE_TYPES) console.log(`  ${t.padEnd(13)} ${String(byType[t]).padStart(6)} segs  ${(secByType[t] / 3600).toFixed(1).padStart(5)} h`);
if (nExamples) {
  for (const t of NOISE_TYPES) {
    console.log(`\n${t}:`);
    for (const e of examples[t]) console.log(`  ${e}`);
  }
}

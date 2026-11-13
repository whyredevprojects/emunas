// Build P4 pilot inputs for one or more shiurim.
//
//   npx tsx scripts/prepare-pilot.ts <shiurId...> [--ingest data/derived/ingest.json] [--out out/pilot]
//
// For each shiur: loads every recording's transcript from data/transcripts/<recordingId>.json
// (committed in the repo; no R2 access or .env needed), then writes <out>/<shiurId>/input.txt (what the
// extraction subagent reads) and <out>/<shiurId>/meta.json (what validate.ts checks against).
// The format is shared with production (scripts/lib/prepare.ts): segment text verbatim, likely ASR
// noise marked "[NOISE?]". Production inputs are made by `npm run batch:next`.
import { readFileSync } from "node:fs";
import type { IngestOutput } from "../src/types.js";
import { mmss } from "./lib/pilot.js";
import { prepareShiur } from "./lib/prepare.js";

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

function main(): void {
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
      const p = prepareShiur(shiur, ingest, out, (m) => console.error(m));
      console.log(
        `${id}: ${p.meta.recordings.length} recording(s), ${p.segments} segments (${p.noiseSegments} [NOISE?]), ${mmss(p.meta.totalDurationSec)} -> ${p.dir}/`,
      );
    } catch (e) {
      console.error(`ERROR ${id}: ${(e as Error).message}`);
      failed++;
    }
  }
  process.exit(failed ? 1 : 0);
}

main();

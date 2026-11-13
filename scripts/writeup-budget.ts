// Print the per-section word budget for a shiur's write-up (P4b), computed from its validated extraction.
//
//   npm run -s writeup:budget -- <shiurId | shiur dir> [--extraction <file stem, default "extraction">]
//
// A bare shiurId means data/derived/shiurim/<shiurId>/. The rule lives in scripts/lib/budget.ts and the
// validator checks the same numbers.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Extraction } from "../src/types.js";
import { WRITEUP_TOLERANCE, WRITEUP_WORDS_PER_HOUR, writeupBudget } from "./lib/budget.js";
import { mmss, type PilotMeta } from "./lib/pilot.js";
import { SHIURIM_DIR } from "./lib/manifest.js";

const args = process.argv.slice(2);
let stem = "extraction";
const pos: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--extraction") stem = args[++i] ?? stem;
  else pos.push(args[i]!);
}
const target = pos[0];
if (!target) {
  console.error("usage: npm run -s writeup:budget -- <shiurId | dir> [--extraction stem]");
  process.exit(2);
}
const dir = existsSync(join(target, "meta.json")) ? target : join(SHIURIM_DIR, target);
const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as PilotMeta;
const x = JSON.parse(readFileSync(join(dir, `${stem}.json`), "utf8")) as Extraction;
const b = writeupBudget(x, meta);
const T = WRITEUP_TOLERANCE;

console.log(`WRITE-UP BUDGET ${meta.shiurId} — words per language (en and yi each)`);
console.log(
  `total ${b.total} words (allowed ${b.min}-${b.max}; ${WRITEUP_WORDS_PER_HOUR.min}-${WRITEUP_WORDS_PER_HOUR.max} per hour over ${mmss(b.contentSec)} of content). ` +
    `Validator error below ${Math.round(b.min * T.errLow)} or above ${Math.round(b.max * T.errHigh)}.`,
);
console.log(`idx  kind           segments                     time           words`);
for (const s of b.sections) {
  const sec = x.sections[s.sectionIndex]!;
  const rec = meta.recordings.find((r) => r.recording.id === sec.recordingId);
  const t0 = rec?.starts[sec.startSeg] ?? 0;
  const range = `${sec.recordingId.length > 18 ? "…" + sec.recordingId.slice(-17) : sec.recordingId}:${sec.startSeg}-${sec.endSeg}`;
  console.log(
    `${String(s.sectionIndex).padStart(3)}  ${s.kind.padEnd(13)}  ${range.padEnd(27)}  ${mmss(t0)} +${mmss(s.durationSec)}  ${s.words === null ? "no block" : String(s.words).padStart(5)}`,
  );
}
console.log(`Move up to ~30% between sections where density differs; keep the total within ${b.min}-${b.max}.`);

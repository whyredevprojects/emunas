/**
 * `npm run bench:real --workspace=@emunas/corpus-guard`
 * Times the pre-pass over today's real data (all `done` shiurim vs. their transcripts)
 * and prints counts and the suppressed ids. Prints ids and numbers only.
 */
import { join } from "node:path";
import { prePassUnits } from "../src/pre.ts";
import { readVerbatimAllow } from "../src/policy.ts";
import { DEFAULT_TRANSCRIPTS_DIR } from "../src/transcripts.ts";
import { REPO_ROOT, hasRealData, realUnits } from "./real-corpus.ts";

if (!hasRealData()) {
  console.log("bench: no data/derived in this checkout");
  process.exit(0);
}
const t0 = performance.now();
const r = prePassUnits(realUnits(), {
  transcriptsDir: join(REPO_ROOT, DEFAULT_TRANSCRIPTS_DIR),
  allow: readVerbatimAllow(join(REPO_ROOT, "site-policy")),
});
const secs = (performance.now() - t0) / 1000;
console.log(JSON.stringify(r.counts, null, 2));
const hist = new Map<number, number>();
for (const e of r.report) hist.set(e.runLength, (hist.get(e.runLength) ?? 0) + 1);
console.log("report run-length histogram:", Object.fromEntries([...hist].sort((a, b) => a[0] - b[0])));
console.log("items reported:", new Set(r.report.map((e) => e.id)).size);
for (const s of r.suppress) console.log(`suppress ${s.id} ${s.runLength} ${s.fields.join(",")}`);
console.log(`pre-pass on real data: ${secs.toFixed(1)} s`);

/**
 * `npx tsx bench/real-global.ts`: time and memory of the whole-corpus index the post-pass
 * uses for text it cannot attribute to one shiur. Prints numbers only.
 */
import { join } from "node:path";
import { DEFAULT_TRANSCRIPTS_DIR } from "../src/transcripts.ts";
import { VerbatimMatcher } from "../src/verbatim.ts";
import { REPO_ROOT } from "./real-corpus.ts";

const t0 = performance.now();
const m = new VerbatimMatcher({ transcriptsDir: join(REPO_ROOT, DEFAULT_TRANSCRIPTS_DIR), cacheRecordings: 100_000 });
const idx = m.globalIndex();
console.log(
  `global index: ${idx.size} shingles, ${((performance.now() - t0) / 1000).toFixed(1)} s, rss ${Math.round(process.memoryUsage().rss / 1e6)} MB`,
);
const t1 = performance.now();
const probe = "the mashgiach explains this idea at length with care and warmth for everyone listening and so on for a while";
for (let i = 0; i < 2000; i++) m.scan(probe, null);
console.log(`2000 unattributed scans: ${((performance.now() - t1) / 1000).toFixed(2)} s`);

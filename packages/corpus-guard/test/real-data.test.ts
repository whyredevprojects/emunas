/**
 * Acceptance (W1.6): the full-corpus pre-pass on real data runs in under 2 minutes and prints
 * its counts. Runs whenever the checkout has the pipeline data (it is committed, so CI has it).
 * Uses the stand-in projection in bench/real-corpus.ts until corpus:build exists.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prePassUnits } from "../src/pre.ts";
import { DEFAULT_TRANSCRIPTS_DIR } from "../src/transcripts.ts";
import { REPO_ROOT, hasRealData, realUnits } from "../bench/real-corpus.ts";

const transcripts = join(REPO_ROOT, DEFAULT_TRANSCRIPTS_DIR);
const available = hasRealData() && existsSync(transcripts);

describe("real data", () => {
  it.runIf(available)(
    "full-corpus pre-pass finishes in < 2 min, prints counts, and its output holds ids and numbers only",
    () => {
      const t0 = performance.now();
      const r = prePassUnits(realUnits(), { transcriptsDir: transcripts });
      const secs = (performance.now() - t0) / 1000;
      console.log(`[corpus-guard] real-data pre-pass ${secs.toFixed(1)} s`, JSON.stringify(r.counts));
      expect(secs).toBeLessThan(120);
      expect(r.counts.shiurimScanned).toBeGreaterThan(400);
      expect(r.counts.recordingsMissing).toBe(0);

      // Every string in the output is an id, a field path, a reason or a generator name: no prose.
      const strings: string[] = [];
      JSON.stringify(r, (_k, v: unknown) => {
        if (typeof v === "string") strings.push(v);
        return v;
      });
      for (const s of strings) {
        if (s === "@emunas/corpus-guard pre") continue;
        expect(s).toMatch(/^[\w.~\-[\]]+$/);
      }
    },
    120_000,
  );
});

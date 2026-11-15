/**
 * Acceptance: the corpus-guard post-pass on the NDJSON is clean. Runs the deploy order
 * (integration-plan §4): corpus:build → guard pre-pass → corpus:build --suppress → search:build →
 * guard post-pass (keys, substrings, verbatim runs against the shiur's own transcripts).
 *
 * The transcript folder is located through @emunas/corpus-guard (the only site package allowed to
 * read it); this package never names it.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TRANSCRIPTS_DIR, LeakScanner, createLeakScanner, runPrePass } from "@emunas/corpus-guard";
import { writeSearchOutputs } from "../src/build/index.ts";
import { MINI_DATA, MINI_POLICY, REAL_DATA, REAL_POLICY, REPO, buildCorpusTo, tmp } from "./helpers.ts";

const transcripts = join(REPO, DEFAULT_TRANSCRIPTS_DIR);
const haveTranscripts = existsSync(transcripts);
const haveRealData = existsSync(join(REAL_DATA, "derived/ingest.json"));

function guardedSearchBuild(dataDir: string, policyDir: string) {
  const first = buildCorpusTo(dataDir, policyDir);
  const pre = runPrePass(first, { transcriptsDir: transcripts });
  const suppress = join(tmp(), "suppress.json");
  writeFileSync(suppress, JSON.stringify(pre));
  const corpus = buildCorpusTo(dataDir, policyDir, suppress);
  const r = writeSearchOutputs({ corpusDir: corpus, dataDir });
  const scanner = createLeakScanner({ corpusDir: corpus, transcriptsDir: transcripts, siteDir: REAL_POLICY, env: {}, baseDir: corpus });
  scanner.scanPaths([join(corpus, "search/docs.ndjson"), join(corpus, "search/moments.ndjson")]);
  return { r, post: scanner.result(), pre };
}

describe("corpus-guard post-pass on the search NDJSON", () => {
  it.runIf(haveTranscripts)("mini corpus: clean, with the verbatim scan on", () => {
    const { r, post } = guardedSearchBuild(MINI_DATA, MINI_POLICY);
    expect(r.docs).toBeGreaterThan(50);
    expect(post.verbatimChecked).toBe(true);
    expect(post.counts.unitsMappedToShiur).toBeGreaterThan(1000);
    expect(post.findings).toEqual([]);
  });

  it.runIf(haveTranscripts && haveRealData)("real data: clean, with the verbatim scan on", () => {
    const t0 = performance.now();
    const { r, post, pre } = guardedSearchBuild(REAL_DATA, REAL_POLICY);
    console.log(
      `[search-core] real data: ${r.docs} docs, ${r.moments} moments, pre-pass suppressed ${pre.counts.suppressed}; ` +
        `post-pass ${post.counts.textUnits} units, ${post.findings.length} findings in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
    );
    expect(r.docs).toBeGreaterThanOrEqual(997);
    expect(post.verbatimChecked).toBe(true);
    expect(post.findings).toEqual([]);
  }, 600_000);

  it("the scanner does flag a planted forbidden key in search NDJSON (the check is live)", () => {
    const dir = tmp();
    const f = join(dir, "docs.ndjson");
    writeFileSync(f, `${JSON.stringify({ id: "x", heardAs: ["y"] })}\n${JSON.stringify({ id: "z", body_en: "see transcripts/abc" })}\n`);
    const s = new LeakScanner({ baseDir: dir });
    s.scanPaths([f]);
    expect(s.result().findings.map((x) => x.kind).sort()).toEqual(["key", "substring"]);
  });
});

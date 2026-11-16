/**
 * Acceptance: the corpus-guard post-pass on the NDJSON (docs, moments, entities) is clean. Runs the
 * deploy order (integration-plan §4): corpus:build → guard pre-pass → corpus:build --suppress →
 * search:build → guard post-pass (keys, substrings, verbatim runs against the shiur's own
 * transcripts, and the C1.3 alias checks: raw ban and alias-key assertion against the corpus data's
 * display fields).
 *
 * The transcript folder is located through @emunas/corpus-guard (the only site package allowed to
 * read it); this package never names it.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TRANSCRIPTS_DIR, LeakScanner, createLeakScanner, runPrePass } from "@emunas/corpus-guard";
import { writeSearchOutputs } from "../src/build/index.ts";
import { buildSynonymTable, normalizeQuery, type EntityDoc } from "../src/index.ts";
import { MINI_DATA, MINI_POLICY, REAL_DATA, REAL_POLICY, REPO, buildCorpusTo, corpusDataDir, readNdjson, tmp } from "./helpers.ts";

const transcripts = join(REPO, DEFAULT_TRANSCRIPTS_DIR);
const haveTranscripts = existsSync(transcripts);
const haveRealData = existsSync(join(REAL_DATA, "derived/ingest.json"));

function guardedSearchBuild(dataDir: string, policyDir: string) {
  const first = buildCorpusTo(dataDir, policyDir);
  const pre = runPrePass(first, { transcriptsDir: transcripts });
  const suppress = join(tmp(), "suppress.json");
  writeFileSync(suppress, JSON.stringify(pre));
  const corpus = buildCorpusTo(dataDir, policyDir, suppress);
  const r = writeSearchOutputs({ corpusDir: corpus, dataDir, policyDir });
  const scanner = createLeakScanner({
    corpusDir: corpus,
    transcriptsDir: transcripts,
    corpusDataDir: corpusDataDir(dataDir),
    siteDir: REAL_POLICY,
    env: {},
    baseDir: corpus,
  });
  scanner.scanPaths(["docs.ndjson", "moments.ndjson", "entities.ndjson"].map((f) => join(corpus, "search", f)));
  const entities = readNdjson<EntityDoc>(join(corpus, "search/entities.ndjson"));
  return { r, post: scanner.result(), pre, entities };
}

describe("corpus-guard post-pass on the search NDJSON", () => {
  it.runIf(haveTranscripts)("mini corpus: clean, with the verbatim scan on", () => {
    const { r, post } = guardedSearchBuild(MINI_DATA, MINI_POLICY);
    expect(r.docs).toBeGreaterThan(50);
    expect(r.entities).toBeGreaterThan(50);
    expect(r.synonymsChecked).toBe(true);
    expect(post.counts.aliasTermsChecked).toBeGreaterThan(100);
    expect(post.verbatimChecked).toBe(true);
    expect(post.counts.unitsMappedToShiur).toBeGreaterThan(1000);
    expect(post.findings).toEqual([]);
  });

  it.runIf(haveTranscripts && haveRealData)("real data: clean, with the verbatim scan on", () => {
    const t0 = performance.now();
    const { r, post, pre, entities } = guardedSearchBuild(REAL_DATA, REAL_POLICY);
    console.log(
      `[search-core] real data: ${r.docs} docs, ${r.moments} moments, pre-pass suppressed ${pre.counts.suppressed}; ` +
        `post-pass ${post.counts.textUnits} units, ${post.findings.length} findings in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
    );
    expect(r.docs).toBeGreaterThanOrEqual(997);
    expect(r.synonymsChecked).toBe(true);
    expect(post.verbatimChecked).toBe(true);
    expect(post.findings).toEqual([]);
    // the acceptance queries on the real entities
    const table = buildSynonymTable(entities);
    const ids = (q: string) => normalizeQuery(q, table).entities.map((e) => `${e.kind}:${e.id}`);
    expect(ids("hester")).toEqual(expect.arrayContaining(["topic:hester-panim", "concept:hester-panim"]));
    expect(ids("Hashem Tov")).not.toContain("person:baal-shem-tov");
    expect(ids("baal shem tov")).toContain("person:baal-shem-tov");
  }, 600_000);

  it("the alias checks are live on entities.ndjson: a planted non-display synonym is a finding", () => {
    const dir = tmp();
    const f = join(dir, "entities.ndjson");
    writeFileSync(f, `${JSON.stringify({ kind: "person", id: "baal-shem-tov", labels: {}, synonyms: ["the besht", "zzq not a display name"] })}\n`);
    const s = createLeakScanner({ corpusDataDir: corpusDataDir(MINI_DATA), siteDir: REAL_POLICY, env: {}, baseDir: dir });
    s.scanPaths([f]);
    expect(s.result().findings.length).toBe(1);
  });

  it("the scanner does flag a planted forbidden key in search NDJSON (the check is live)", () => {
    const dir = tmp();
    const f = join(dir, "docs.ndjson");
    writeFileSync(f, `${JSON.stringify({ id: "x", heardAs: ["y"] })}\n${JSON.stringify({ id: "z", body_en: "see transcripts/abc" })}\n`);
    const s = new LeakScanner({ baseDir: dir });
    s.scanPaths([f]);
    // "transcripts/" in prose is also a remark on the transcript (meta-comment).
    expect(s.result().findings.map((x) => x.kind).sort()).toEqual(["key", "meta-comment", "substring"]);
  });
});

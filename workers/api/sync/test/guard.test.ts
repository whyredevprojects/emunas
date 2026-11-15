/**
 * Acceptance: the corpus-guard post-pass is clean on what the sync ships — the moments NDJSON
 * it reads, the vector metadata it upserts, and a dump of every D1 table it writes — with the
 * verbatim scan against the transcripts on. The transcript folder is located through
 * @emunas/corpus-guard (the only site package allowed to read it); this package never names it.
 *
 * Runs on the mini corpus and, when the repo data is present, on the real corpus too (that
 * run also proves the sync's idempotence at full size).
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_TRANSCRIPTS_DIR, LeakScanner, createLeakScanner, runPrePass } from "@emunas/corpus-guard";
import { buildCorpusWithAggregates as buildCorpus } from "@emunas/corpus/build/aggregate";
import { writeSearchOutputs } from "@emunas/search-core/build";
import { runSync } from "../src/sync.ts";
import { HashingEmbedder, MemoryBlobStore, MemoryVectorIndex, type MiniflareD1Target } from "../src/local.ts";
import { MINI_DATA, MINI_POLICY, REAL_DATA, REAL_POLICY, REPO, buildMiniCorpus, freshD1, tmp } from "./helpers.ts";

const transcripts = join(REPO, DEFAULT_TRANSCRIPTS_DIR);
const haveTranscripts = existsSync(transcripts);
const haveRealData = existsSync(join(REAL_DATA, "derived/ingest.json"));

const open: MiniflareD1Target[] = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

/** Every row of every table the sync writes, as NDJSON files (what a D1 export would hold). */
async function dumpD1(t: MiniflareD1Target, dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const table of ["moments", "moment_entities", "moment_text", "fts_words", "fts_tri", "meta"]) {
    const rows = await t.all(`SELECT * FROM ${table}`);
    const f = join(dir, `d1-${table}.ndjson`);
    writeFileSync(f, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    files.push(f);
  }
  return files;
}

async function guardedSync(corpus: string, policyDir: string) {
  const d1 = await freshD1();
  open.push(d1);
  const index = new MemoryVectorIndex("emunas-moments-staging", 64);
  const ai = new HashingEmbedder(64);
  const store = new MemoryBlobStore();
  const moments = join(corpus, "search/moments.ndjson");
  const vectorMeta = join(corpus, "search/vector-meta.ndjson");
  const first = await runSync({ moments, targets: { d1, vectors: { target: index, embedder: ai, store } }, vectorMetaOut: vectorMeta });
  const second = await runSync({ moments, targets: { d1, vectors: { target: index, embedder: ai, store } }, vectorMetaOut: vectorMeta });
  // What Vectorize actually received, too.
  const upserted = join(corpus, "search/vectors-upserted.ndjson");
  writeFileSync(upserted, [...index.vectors.values()].map((v) => JSON.stringify({ id: v.id, metadata: v.metadata })).join("\n") + "\n");
  const dumps = await dumpD1(d1, join(corpus, "search"));
  const scanner = createLeakScanner({ corpusDir: corpus, transcriptsDir: transcripts, siteDir: policyDir, env: {}, baseDir: corpus });
  scanner.scanPaths([moments, vectorMeta, upserted, ...dumps]);
  return { first, second, post: scanner.result() };
}

describe("corpus-guard post-pass on sync outputs", () => {
  it.runIf(haveTranscripts)("mini corpus: NDJSON, vector metadata and D1 contents are clean (verbatim on)", async () => {
    const corpus = buildMiniCorpus(MINI_DATA);
    const { first, second, post } = await guardedSync(corpus, MINI_POLICY);
    expect(first.d1!.inserted).toBeGreaterThan(500);
    expect(second.d1!.statements).toBe(0);
    expect(second.vectors!.upserted).toBe(0);
    expect(post.verbatimChecked).toBe(true);
    expect(post.findings).toEqual([]);
  });

  it.runIf(haveTranscripts && haveRealData)(
    "real data: full sync, second run writes 0 rows and 0 vectors, guard clean",
    async () => {
      const t0 = performance.now();
      // Deploy order (integration-plan §4): build, guard pre-pass, build with --suppress, search:build.
      const pre = join(tmp(), ".corpus");
      buildCorpus({ dataDir: REAL_DATA, outDir: pre, policyDir: REAL_POLICY, dataSha: null });
      const suppress = join(tmp(), "suppress.json");
      writeFileSync(suppress, JSON.stringify(runPrePass(pre, { transcriptsDir: transcripts })));
      const corpus = join(tmp(), ".corpus");
      buildCorpus({ dataDir: REAL_DATA, outDir: corpus, policyDir: REAL_POLICY, dataSha: null, suppressFile: suppress });
      writeSearchOutputs({ corpusDir: corpus, dataDir: REAL_DATA });
      const { first, second, post } = await guardedSync(corpus, REAL_POLICY);
      console.log(
        `[sync] real data: ${first.moments} moments, ${first.vectors!.upserted} vectors; second run ` +
          `${second.d1!.statements} statements / ${second.vectors!.upserted} vectors; guard ${post.counts.textUnits} units, ` +
          `${post.findings.length} findings in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
      );
      expect(first.d1!.inserted).toBe(first.moments);
      expect(second.d1).toMatchObject({ inserted: 0, updated: 0, deleted: 0, statements: 0, rowsWritten: 0, revWritten: false });
      expect(second.vectors).toMatchObject({ upserted: 0, deleted: 0 });
      expect(second.vectors!.embed.modelCalls).toBe(0);
      expect(first.vectors!.skipped).toEqual([]);
      expect(post.verbatimChecked).toBe(true);
      expect(post.findings).toEqual([]);
    },
    900_000,
  );

  it("the scanner flags a planted transcript key in vector metadata (the check is live)", () => {
    const dir = tmp();
    const f = join(dir, "vector-meta.ndjson");
    writeFileSync(f, `${JSON.stringify({ id: "x~s0@en", metadata: { shiurId: "x", heardAs: "y" } })}\n`);
    const s = new LeakScanner({ baseDir: dir });
    s.scanPaths([f]);
    expect(s.result().findings.map((x) => x.kind)).toEqual(["key"]);
  });
});

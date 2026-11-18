/**
 * Acceptance on the repo's real data, in the deploy order (integration-plan §4):
 * corpus:build → guard pre-pass → corpus:build --suppress → Live emit → validate → budgets →
 * guard post-pass (keys, substrings and verbatim runs against each shiur's own transcripts).
 *
 * The transcript folder is located through @emunas/corpus-guard (the only site package allowed to
 * read it); this package never names it. Without the real data the tests do not run.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UI_LANGS } from "@emunas/i18n";
import { DEFAULT_TRANSCRIPTS_DIR, createLeakScanner, runPrePass } from "@emunas/corpus-guard";
import type { ShiurFile } from "../app/data/types.ts";
import { brotliSize, checkLiveBudgets, describeFinding, prerenderSetsFromCorpus } from "./budgets.ts";
import { readCorpusInput, readFeaturedPolicy } from "./corpus-input.ts";
import { emitLiveData } from "./emit.ts";
import { validateFile } from "./schemas.ts";
import { GENERATED_AT, REAL_DATA, REAL_POLICY, REPO, buildCorpusTo, tmp } from "./test-helpers.ts";
import { serialize, writeDataDir } from "./write.ts";

const transcripts = join(REPO, DEFAULT_TRANSCRIPTS_DIR);
const haveRealData = existsSync(join(REAL_DATA, "derived/ingest.json"));
const haveTranscripts = existsSync(transcripts);

describe.runIf(haveRealData)("Live data emit on real data", () => {
  it("validates, fits the budgets and passes the guard post-pass", () => {
    const t0 = performance.now();
    let corpusDir = buildCorpusTo(REAL_DATA, REAL_POLICY);
    let suppressed = 0;
    if (haveTranscripts) {
      const pre = runPrePass(corpusDir, { transcriptsDir: transcripts });
      suppressed = pre.counts.suppressed;
      const suppress = join(tmp(), "suppress.json");
      writeFileSync(suppress, JSON.stringify(pre));
      corpusDir = buildCorpusTo(REAL_DATA, REAL_POLICY, { suppressFile: suppress });
    }
    const input = readCorpusInput(corpusDir);
    const files = emitLiveData(input, { generatedAt: GENERATED_AT, featured: readFeaturedPolicy(REAL_POLICY) });

    // Every file validates against its contract schema.
    const invalid = [...files].flatMap(([f, body]) => validateFile(f, body) ?? []);
    expect(invalid).toEqual([]);
    expect(input.info.counts.total).toBeGreaterThanOrEqual(997);
    expect([...files.keys()].filter((f) => f.startsWith("shiur/"))).toHaveLength(input.info.counts.total);

    // Budgets (no build/client here: the projected prerender count is checked).
    const root = join(tmp(), "public");
    const dataDir = join(root, "data");
    writeDataDir(dataDir, files);
    const b = checkLiveBudgets({ dataDir, publicDir: root, clientDir: null, prerender: prerenderSetsFromCorpus(corpusDir) });
    expect(b.findings.map(describeFinding)).toEqual([]);
    // One Today file per reading language, each within its own 30 KiB target (checked above).
    const todaySizes = UI_LANGS.map((l) => {
      const body = files.get(`today.${l}.json`);
      expect(body, l).toBeDefined();
      return `today.${l}.json ${brotliSize(serialize(body))} B br`;
    });
    expect(b.projectedFiles).toBeLessThanOrEqual(18_000);
    // The corpus layer is on: its files exist (plan §4 budgets are in BR_TARGETS, checked above).
    for (const kind of ["topics", "topic", "thread", "story", "storiesIndex", "glossary", "exploreEntities"] as const) {
      expect(b.byKind[kind]?.files ?? 0, kind).toBeGreaterThan(0);
    }

    // A shiur file grows by at most 2 KiB br at the median with its self-contained additions (G.1:
    // related titles, series title, corpus-layer refs with labels), max 40 KiB (BR_TARGETS).
    const growth = [...files]
      .filter(([f]) => f.startsWith("shiur/"))
      .map(([, body]) => {
        const s = body as ShiurFile;
        const { corpus: _c, seriesTitle: _t, related, ...rest } = s;
        const { titles: _x, ...relatedRest } = related;
        return brotliSize(JSON.stringify(s)) - brotliSize(JSON.stringify({ ...rest, related: relatedRest }));
      })
      .sort((x, y) => x - y);
    const median = growth[Math.floor(growth.length / 2)]!;
    expect(median).toBeLessThanOrEqual(2 * 1024);

    // Guard post-pass over the emitted tree.
    const scanner = createLeakScanner({
      corpusDir,
      transcriptsDir: haveTranscripts ? transcripts : null,
      siteDir: REAL_POLICY,
      env: {},
      baseDir: root,
    });
    scanner.scanPaths([dataDir]);
    const post = scanner.result();
    console.log(
      `[live data-build] real data: ${files.size} files, ${b.projectedFiles} projected with prerender, ` +
        `corpus.json ${b.byKind.corpus?.brBytes} B br (${b.warnings.length} soft-target warnings); ` +
        `${todaySizes.join(", ")}, topics.json ${b.byKind.topics?.brBytes} B br, shiur growth median ${median} B br; ` +
        `pre-pass suppressed ${suppressed}; post-pass ${post.counts.textUnits} units, verbatim ${post.verbatimChecked}, ` +
        `${post.findings.length} findings in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
    );
    expect(post.verbatimChecked).toBe(haveTranscripts);
    expect(post.findings).toEqual([]);
  }, 600_000);
});

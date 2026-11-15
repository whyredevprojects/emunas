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
import { DEFAULT_TRANSCRIPTS_DIR, createLeakScanner, runPrePass } from "@emunas/corpus-guard";
import { checkLiveBudgets, describeFinding } from "./budgets.ts";
import { readCorpusInput } from "./corpus-input.ts";
import { emitLiveData } from "./emit.ts";
import { validateFile } from "./schemas.ts";
import { GENERATED_AT, REAL_DATA, REAL_POLICY, REPO, buildCorpusTo, tmp } from "./test-helpers.ts";
import { writeDataDir } from "./write.ts";

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
    const files = emitLiveData(input, { generatedAt: GENERATED_AT });

    // Every file validates against its contract schema.
    const invalid = [...files].flatMap(([f, body]) => validateFile(f, body) ?? []);
    expect(invalid).toEqual([]);
    expect(input.info.counts.total).toBeGreaterThanOrEqual(997);
    expect([...files.keys()].filter((f) => f.startsWith("shiur/"))).toHaveLength(input.info.counts.total);

    // Budgets (no build/client here: the projected prerender count is checked).
    const root = join(tmp(), "public");
    const dataDir = join(root, "data");
    writeDataDir(dataDir, files);
    const b = checkLiveBudgets({ dataDir, publicDir: root, clientDir: null });
    expect(b.findings.map(describeFinding)).toEqual([]);
    expect(b.projectedFiles).toBeLessThanOrEqual(18_000);

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
        `pre-pass suppressed ${suppressed}; post-pass ${post.counts.textUnits} units, verbatim ${post.verbatimChecked}, ` +
        `${post.findings.length} findings in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
    );
    expect(post.verbatimChecked).toBe(haveTranscripts);
    expect(post.findings).toEqual([]);
  }, 600_000);
});

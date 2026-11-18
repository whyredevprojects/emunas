/**
 * W5.2 acceptance for the Quiet site (corpus:build → astro build → guard post-pass):
 *
 * - defaults (EMUNAS_TRANSCRIPT_VIEW unset, the shipped empty eligibility): no `transcript/` folder in
 *   `.corpus/` or `dist/`, no "Follow the text" markup or script anywhere, guard clean — on a fixture
 *   build and on the repo's real data;
 * - flag on + one synthetic fixture recording whose eligibility entry matches its identity: exactly one
 *   `dist/transcript/<id>.json` (plus the slot's script), the slot only on that shiur's pages, and the
 *   guard accepts that file and nothing else;
 * - identity mismatch: nothing.
 *
 * The transcript is synthetic (fixture words) in a temp copy of the mini corpus; this test reads no
 * real transcript.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, inject, it } from "vitest";
import { createLeakScanner } from "@emunas/corpus-guard";
import { astroBuild } from "./astro-build.ts";
import { EDS } from "../src/lib/edition.ts";

const require = createRequire(import.meta.url);
const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(app, "..", "..");
const mini = join(repo, "packages", "corpus", "test", "fixtures", "mini");
const realPolicy = join(repo, "site-policy");

const REC = "e-parsha-bereshes-02-01-noach-english-the-special-qualities-of-the-teivah";
const SHIUR = "en-parsha-en-nch-01";
const SYNTH = "zephyr quokka lantern marmalade synthetic fixture words never spoken in any shiur recording at all";
const identity = { model: "synthetic/asr", mode: "careful", transcribedAt: "2026-11-01T00:00:00Z" };
const OFF = { EMUNAS_TRANSCRIPT_VIEW: "" };

const work = mkdtempSync(join(tmpdir(), "quiet-transcript-view-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

let n = 0;
function fixture(transcriptIdentity = identity): { data: string; policy: string; transcripts: string } {
  const root = join(work, `fx-${n++}`);
  const data = join(root, "data");
  cpSync(join(mini, "data"), data, { recursive: true });
  const transcripts = join(data, "transcripts");
  mkdirSync(transcripts);
  writeFileSync(
    join(transcripts, `${REC}.json`),
    JSON.stringify({ recordingId: REC, key: "fixture/a.mp3", duration: 30, ...transcriptIdentity, language: "en", segments: [[0, 10, SYNTH], [10, 20, "second synthetic cue"]] }),
  );
  const policy = join(root, "site-policy");
  cpSync(join(mini, "site-policy"), policy, { recursive: true });
  writeFileSync(
    join(policy, "transcript-eligibility.json"),
    JSON.stringify({
      policyVersion: 1,
      eligible: { [REC]: { ...identity, quality: "reviewed", approvedBy: "fixture", approvedAt: "2026-11-02", allowSearch: false } },
    }),
  );
  return { data, policy, transcripts };
}

function corpusBuild(data: string, policy: string, env: Record<string, string>): string {
  const out = join(work, `corpus-${n++}`);
  const args = [require.resolve("tsx/cli"), join(repo, "packages", "corpus", "src", "cli.ts"), "--data-dir", data, "--policy-dir", policy, "--out", out];
  const c = spawnSync(process.execPath, args, { cwd: repo, encoding: "utf8", env: { ...process.env, INIT_CWD: repo, ...env } });
  if (c.status !== 0) throw new Error(`corpus:build failed:\n${c.stdout}\n${c.stderr}`);
  return out;
}

function siteBuild(corpus: string, env: Record<string, string>): string {
  const dist = join(work, `dist-${n++}`);
  const b = astroBuild(app, dist, { EMUNAS_CORPUS_DIR: corpus, ...env });
  if (b.status !== 0) throw new Error(`astro build failed:\n${b.stdout}\n${b.stderr}`);
  return dist;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function guard(dist: string, corpus: string, siteDir: string, transcriptsDir: string | null, env: Record<string, string>) {
  const scanner = createLeakScanner({ corpusDir: corpus, transcriptsDir, siteDir, env, baseDir: dist });
  scanner.scanPaths([dist]);
  return scanner.result();
}

/**
 * Files (relative) whose text carries the view's markers: the slot, its script, or a path into
 * `/transcript/`. (The word itself is not a marker: real derived text has e.g. "Untranscribed opening".)
 */
function mentions(dist: string): string[] {
  return walk(dist)
    .filter((f) => /\.(html|js|css|json|xml|txt)$/.test(f))
    .filter((f) => /follow-text|data-follow|\/transcript\//.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(dist.length + 1))
    .sort();
}

describe("Quiet transcript view (W5.2)", () => {
  it("defaults: no slot, no script, no transcript folder; guard clean", () => {
    const f = fixture();
    const corpus = corpusBuild(f.data, f.policy, OFF);
    expect(existsSync(join(corpus, "transcript"))).toBe(false);
    const dist = siteBuild(corpus, { ...OFF, EMUNAS_SITE_POLICY_DIR: f.policy });
    expect(existsSync(join(dist, "transcript"))).toBe(false);
    expect(mentions(dist)).toEqual([]);
    const g = guard(dist, corpus, f.policy, f.transcripts, {});
    expect(g.findings).toEqual([]);
  }, 300_000);

  it("flag on + matching identity: exactly one transcript file, the slot only on that shiur, guard accepts only it", () => {
    const f = fixture();
    const on = { EMUNAS_TRANSCRIPT_VIEW: "on", EMUNAS_SITE_POLICY_DIR: f.policy };
    const corpus = corpusBuild(f.data, f.policy, on);
    expect(readdirSync(join(corpus, "transcript"))).toEqual([`${REC}.json`]);
    const dist = siteBuild(corpus, on);

    expect(readdirSync(join(dist, "transcript")).sort()).toEqual([`${REC}.json`, "follow-text.js"]);
    expect(walk(dist).filter((p) => /[\\/]transcript[\\/][^\\/]+\.json$/.test(p))).toHaveLength(1);
    // the shiur's page in every edition, and the script
    expect(mentions(dist)).toEqual([...EDS.map((ed) => `${ed}/shiur/${SHIUR}/index.html`), "transcript/follow-text.js"].sort());
    // The words are only in the transcript file, never in a page.
    const withWords = walk(dist).filter((p) => readFileSync(p).includes("zephyr"));
    expect(withWords.map((p) => p.slice(dist.length + 1))).toEqual([`transcript/${REC}.json`]);
    const page = readFileSync(join(dist, "en", "shiur", SHIUR, "index.html"), "utf8");
    expect(page).toContain(`data-follow-src="/transcript/${REC}.json"`);
    expect(page).toContain('<script type="module" src="/transcript/follow-text.js">');

    const g = guard(dist, corpus, f.policy, f.transcripts, { EMUNAS_TRANSCRIPT_VIEW: "on" });
    expect(g.findings).toEqual([]);
    expect(g.counts.transcriptFilesAllowed).toBe(1);
    // Checked as a default build, the same output fails.
    const off = guard(dist, corpus, f.policy, f.transcripts, {});
    // (The slot's own wording, which names the transcription, is then a remark on the transcript too.)
    expect(off.findings.filter((x) => x.kind !== "meta-comment")).toEqual([{ kind: "transcript-file", source: `transcript/${REC}.json`, recordingId: REC, reason: "flag-off" }]);
    expect(off.findings.filter((x) => x.kind === "meta-comment").map((x) => x.source).sort()).toEqual([`en/shiur/${SHIUR}/index.html`, `yi/shiur/${SHIUR}/index.html`]);
  }, 300_000);

  it("identity mismatch (re-transcribed recording): nothing emitted", () => {
    const f = fixture({ ...identity, transcribedAt: "2027-01-01T00:00:00Z" });
    const on = { EMUNAS_TRANSCRIPT_VIEW: "on", EMUNAS_SITE_POLICY_DIR: f.policy };
    const corpus = corpusBuild(f.data, f.policy, on);
    expect(existsSync(join(corpus, "transcript"))).toBe(false);
    const dist = siteBuild(corpus, on);
    expect(existsSync(join(dist, "transcript"))).toBe(false);
    expect(mentions(dist)).toEqual([]);
  }, 300_000);

  it(
    "real data with the defaults: nothing transcript-related in .corpus/ or dist/, guard clean",
    () => {
      // The shared real-data build (test/site-builds.ts), made with EMUNAS_TRANSCRIPT_VIEW unset.
      const { corpus, dist } = inject("quietSite");
      expect(existsSync(join(corpus, "transcript"))).toBe(false);
      expect(existsSync(join(dist, "transcript"))).toBe(false);
      expect(mentions(dist)).toEqual([]);
      // Keys, substrings and transcript files; the verbatim part of the post-pass on real data runs in
      // the deploy flow (pre-pass suppression first) and in the guard's own real-data tests.
      const g = guard(dist, corpus, realPolicy, null, {});
      expect(g.findings).toEqual([]);
      expect(g.counts.transcriptFilesAllowed).toBe(0);
    },
    120_000,
  );
});

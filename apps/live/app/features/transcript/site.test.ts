/**
 * W5.2 acceptance for the Live site's data output (corpus:build → data-build emit → guard post-pass):
 *
 * - defaults (EMUNAS_TRANSCRIPT_VIEW unset, the shipped empty eligibility): no `transcript/` folder in
 *   `.corpus/` or `public/data/`, and the guard passes — on a fixture build and on the repo's real data;
 * - flag on + one synthetic fixture recording whose eligibility entry matches its identity: exactly one
 *   `public/data/transcript/<id>.json`, which the guard accepts (and only that one);
 * - identity mismatch, or a site build with the flag off over a corpus built with it on: none.
 *
 * The transcript is synthetic (fixture words), written into a temp copy of the mini corpus; no real
 * transcript is read by this test.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLeakScanner } from "@emunas/corpus-guard";
import { main } from "../../../data-build/cli.ts";
import { GENERATED_AT, MINI_POLICY, REAL_DATA, REAL_POLICY, buildCorpusTo, miniCopy, tmp } from "../../../data-build/test-helpers.ts";

const REC = "e-parsha-bereshes-02-01-noach-english-the-special-qualities-of-the-teivah";
const SHIUR = "en-parsha-en-nch-01";
const SYNTH = "zephyr quokka lantern marmalade synthetic fixture words never spoken in any shiur recording at all";
const identity = { model: "synthetic/asr", mode: "careful", transcribedAt: "2026-11-01T00:00:00Z" };

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Mini corpus data + a synthetic transcript for REC + a policy dir approving it. */
function fixture(transcriptIdentity = identity): { data: string; policy: string; transcripts: string } {
  const data = miniCopy();
  const transcripts = join(data, "transcripts");
  mkdirSync(transcripts, { recursive: true });
  writeFileSync(
    join(transcripts, `${REC}.json`),
    JSON.stringify({ recordingId: REC, key: "fixture/a.mp3", duration: 30, ...transcriptIdentity, language: "en", segments: [[0, 10, SYNTH], [10, 20, "second synthetic cue"]] }),
  );
  const policy = join(tmp(), "site-policy");
  cpSync(MINI_POLICY, policy, { recursive: true });
  writeFileSync(
    join(policy, "transcript-eligibility.json"),
    JSON.stringify({
      policyVersion: 1,
      eligible: { [REC]: { ...identity, quality: "reviewed", approvedBy: "fixture", approvedAt: "2026-11-02", allowSearch: false } },
    }),
  );
  return { data, policy, transcripts };
}

function corpus(f: { data: string; policy: string }, flag: boolean): string {
  if (flag) vi.stubEnv("EMUNAS_TRANSCRIPT_VIEW", "on");
  else vi.stubEnv("EMUNAS_TRANSCRIPT_VIEW", "");
  try {
    return buildCorpusTo(f.data, f.policy);
  } finally {
    vi.unstubAllEnvs();
  }
}

async function emit(corpusDir: string, env: Record<string, string>): Promise<string> {
  const out = join(tmp(), "public", "data");
  vi.stubEnv("EMUNAS_TRANSCRIPT_VIEW", env["EMUNAS_TRANSCRIPT_VIEW"] ?? "");
  if (env["EMUNAS_SITE_POLICY_DIR"]) vi.stubEnv("EMUNAS_SITE_POLICY_DIR", env["EMUNAS_SITE_POLICY_DIR"]);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const code = await main(["emit", "--corpus", corpusDir, "--out", out, "--neighbors", "off", "--generated-at", GENERATED_AT]);
    expect(code).toBe(0);
  } finally {
    log.mockRestore();
    vi.unstubAllEnvs();
  }
  return out;
}

function guard(dataDir: string, corpusDir: string, siteDir: string, transcriptsDir: string | null, env: Record<string, string>) {
  const scanner = createLeakScanner({ corpusDir, transcriptsDir, siteDir, env, baseDir: dataDir });
  scanner.scanPaths([dataDir]);
  return scanner.result();
}

const transcriptDir = (dir: string) => join(dir, "transcript");

describe("Live transcript view (W5.2)", () => {
  it("defaults: nothing in .corpus/ or public/data/, guard clean", async () => {
    const f = fixture();
    const c = corpus(f, false);
    expect(existsSync(transcriptDir(c))).toBe(false);
    const out = await emit(c, {});
    expect(existsSync(transcriptDir(out))).toBe(false);
    const g = guard(out, c, f.policy, f.transcripts, {});
    expect(g.findings).toEqual([]);
    expect(g.counts.transcriptFilesAllowed).toBe(0);
  }, 120_000);

  it("flag on + matching identity: exactly one file, accepted by the guard and only with the flag", async () => {
    const f = fixture();
    const c = corpus(f, true);
    expect(readdirSync(transcriptDir(c))).toEqual([`${REC}.json`]);
    const out = await emit(c, { EMUNAS_TRANSCRIPT_VIEW: "on", EMUNAS_SITE_POLICY_DIR: f.policy });
    expect(readdirSync(transcriptDir(out))).toEqual([`${REC}.json`]);
    const body = JSON.parse(readFileSync(join(transcriptDir(out), `${REC}.json`), "utf8")) as { cues: [number, number, string][] };
    expect(body.cues[0]).toEqual([0, 10, SYNTH]);
    // The synthetic words appear in that file only, never in the shiur's own data files.
    expect(readFileSync(join(out, "shiur", `${SHIUR}.json`), "utf8")).not.toContain("zephyr");

    const on = guard(out, c, f.policy, f.transcripts, { EMUNAS_TRANSCRIPT_VIEW: "on" });
    expect(on.findings).toEqual([]);
    expect(on.counts.transcriptFilesAllowed).toBe(1);

    // The same output checked with the flag off fails: the file is accepted only for an approved build.
    const off = guard(out, c, f.policy, f.transcripts, {});
    expect(off.findings).toEqual([{ kind: "transcript-file", source: `transcript/${REC}.json`, recordingId: REC, reason: "flag-off" }]);

    // A second (non-eligible) transcript file is rejected while the eligible one stays accepted.
    writeFileSync(join(transcriptDir(out), "y-not-approved-01.json"), JSON.stringify({ ...body, recordingId: "y-not-approved-01" }));
    const two = guard(out, c, f.policy, f.transcripts, { EMUNAS_TRANSCRIPT_VIEW: "on" });
    expect(two.findings.map((x) => (x.kind === "transcript-file" ? `${x.recordingId}:${x.reason}` : x.kind))).toEqual([
      "y-not-approved-01:not-eligible",
    ]);
    expect(two.counts.transcriptFilesAllowed).toBe(1);
  }, 120_000);

  it("site build with the flag off over a corpus built with it on: nothing", async () => {
    const f = fixture();
    const c = corpus(f, true);
    expect(existsSync(transcriptDir(c))).toBe(true);
    const out = await emit(c, { EMUNAS_SITE_POLICY_DIR: f.policy });
    expect(existsSync(transcriptDir(out))).toBe(false);
  }, 120_000);

  it("identity mismatch (re-transcribed recording): nothing emitted anywhere", async () => {
    const f = fixture({ ...identity, model: "re-transcribed/asr" });
    const c = corpus(f, true);
    expect(existsSync(transcriptDir(c))).toBe(false);
    const out = await emit(c, { EMUNAS_TRANSCRIPT_VIEW: "on", EMUNAS_SITE_POLICY_DIR: f.policy });
    expect(existsSync(transcriptDir(out))).toBe(false);
    // And the guard would not accept a file for it either, even if one were planted.
    mkdirSync(transcriptDir(out));
    writeFileSync(join(transcriptDir(out), `${REC}.json`), "{}");
    const g = guard(out, c, f.policy, f.transcripts, { EMUNAS_TRANSCRIPT_VIEW: "on" });
    expect(g.findings).toEqual([{ kind: "transcript-file", source: `transcript/${REC}.json`, recordingId: REC, reason: "not-eligible" }]);
  }, 120_000);

  it.runIf(existsSync(join(REAL_DATA, "derived", "ingest.json")))(
    "real data with the defaults: no transcript output, guard (keys, substrings, transcript files) clean",
    async () => {
      vi.stubEnv("EMUNAS_TRANSCRIPT_VIEW", "");
      let c: string;
      try {
        c = buildCorpusTo(REAL_DATA, REAL_POLICY);
      } finally {
        vi.unstubAllEnvs();
      }
      expect(existsSync(transcriptDir(c))).toBe(false);
      const out = await emit(c, {});
      expect(existsSync(transcriptDir(out))).toBe(false);
      // The verbatim part of the post-pass on real data runs in data-build/real-data.test.ts.
      const g = guard(out, c, REAL_POLICY, null, {});
      expect(g.findings).toEqual([]);
      expect(g.counts.transcriptFilesAllowed).toBe(0);
    },
    300_000,
  );
});

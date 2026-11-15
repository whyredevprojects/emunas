/**
 * W5.2: the post-pass accepts a public transcript file only for an eligible id, with the flag on,
 * the gate's exact public shape and the approved identity. Synthetic fixtures only.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LeakScanner } from "../src/post.ts";
import { checkTranscriptFile, readTranscriptEligibility, transcriptIdentityVersion } from "../src/eligible.ts";
import { readEligibleTranscriptIds } from "../src/policy.ts";

const REC = "y-synthetic-rec-01";
const ON = { EMUNAS_TRANSCRIPT_VIEW: "on" };
const identity = { model: "synthetic/asr", mode: "careful", transcribedAt: "2026-11-01T00:00:00Z" };
const entry = { ...identity, quality: "reviewed", approvedBy: "reviewer", approvedAt: "2026-11-02", allowSearch: false, note: null };
const SYNTH = "zephyr quokka lantern synthetic words for the guard eligibility test only";

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function site(eligible: Record<string, unknown>, transcript?: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), "guard-eligible-"));
  dirs.push(root);
  const siteDir = join(root, "site-policy");
  const transcripts = join(root, "transcripts");
  mkdirSync(siteDir);
  mkdirSync(transcripts);
  writeFileSync(join(siteDir, "transcript-eligibility.json"), JSON.stringify({ policyVersion: 1, eligible }));
  if (transcript) writeFileSync(join(transcripts, `${REC}.json`), JSON.stringify(transcript));
  return { root, siteDir, transcripts };
}

const publicFile = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    recordingId: REC,
    quality: "reviewed",
    lang: "yi",
    version: transcriptIdentityVersion(identity),
    cues: [[0, 4, SYNTH]],
    ...over,
  });

describe("readTranscriptEligibility", () => {
  it("is empty with the flag off and reads nothing (even a malformed file)", () => {
    const s = site({});
    writeFileSync(join(s.siteDir, "transcript-eligibility.json"), "{ not json");
    expect(readTranscriptEligibility(s.siteDir, {}).enabled).toBe(false);
    expect(readEligibleTranscriptIds(s.siteDir, {}).size).toBe(0);
  });

  it("is empty with the shipped (empty) policy and the flag on", () => {
    expect(readTranscriptEligibility(site({}).siteDir, ON)).toEqual({ enabled: true, versions: new Map() });
  });

  it("drops invalid entries (allowSearch true, missing identity) and throws on a malformed top level", () => {
    const s = site({ [REC]: { ...entry, allowSearch: true }, "y-other": { approvedBy: "x" } });
    expect(readTranscriptEligibility(s.siteDir, ON).versions.size).toBe(0);
    writeFileSync(join(s.siteDir, "transcript-eligibility.json"), JSON.stringify({ policyVersion: 1, eligible: [] }));
    expect(() => readTranscriptEligibility(s.siteDir, ON)).toThrow(/expected/);
  });

  it("with the transcripts folder, keeps an entry only while the identity still matches", () => {
    const t = { recordingId: REC, model: identity.model, mode: identity.mode, transcribedAt: identity.transcribedAt, segments: [] };
    const ok = site({ [REC]: entry }, t);
    expect([...readTranscriptEligibility(ok.siteDir, ON, { transcriptsDir: ok.transcripts }).versions.keys()]).toEqual([REC]);
    const changed = site({ [REC]: entry }, { ...t, model: "re-transcribed" });
    expect(readTranscriptEligibility(changed.siteDir, ON, { transcriptsDir: changed.transcripts }).versions.size).toBe(0);
    const missing = site({ [REC]: entry });
    expect(readTranscriptEligibility(missing.siteDir, ON, { transcriptsDir: missing.transcripts }).versions.size).toBe(0);
  });
});

describe("checkTranscriptFile", () => {
  const elig = () => readTranscriptEligibility(site({ [REC]: entry }).siteDir, ON);

  it("accepts the gate's public shape for the eligible id", () => {
    expect(checkTranscriptFile(REC, publicFile(), elig())).toBeNull();
  });

  it.each([
    ["flag-off", () => readTranscriptEligibility(site({ [REC]: entry }).siteDir, {}), REC, publicFile()],
    ["not-eligible", elig, "y-other-rec", publicFile({ recordingId: "y-other-rec" })],
    ["not-json", elig, REC, "{"],
    ["bad-shape", elig, REC, publicFile({ segments: [[0, 1, SYNTH]] })],
    ["bad-shape", elig, REC, publicFile({ model: identity.model })],
    ["bad-shape", elig, REC, publicFile({ cues: [[0, 1]] })],
    ["id-mismatch", elig, REC, publicFile({ recordingId: "y-other-rec" })],
    ["version-mismatch", elig, REC, publicFile({ version: transcriptIdentityVersion({ ...identity, mode: null }) })],
  ] as const)("rejects: %s", (reason, e, id, raw) => {
    expect(checkTranscriptFile(id, raw, e())).toBe(reason);
  });
});

describe("post-pass with eligibility", () => {
  it("accepts exactly the eligible file and still scans every other file", () => {
    const s = site({ [REC]: entry });
    const dist = join(s.root, "dist");
    mkdirSync(join(dist, "transcript"), { recursive: true });
    writeFileSync(join(dist, "transcript", `${REC}.json`), publicFile());
    writeFileSync(join(dist, "transcript", "y-other-rec.json"), publicFile({ recordingId: "y-other-rec" }));
    writeFileSync(join(dist, "page.json"), JSON.stringify({ heardAs: "x" }));
    const scanner = new LeakScanner({ transcripts: readTranscriptEligibility(s.siteDir, ON), baseDir: s.root });
    scanner.scanPaths([dist]);
    const r = scanner.result();
    expect(r.counts.transcriptFilesAllowed).toBe(1);
    expect(r.findings).toEqual([
      { kind: "key", source: "dist/page.json", key: "heardAs", field: "heardAs", count: 1 },
      { kind: "transcript-file", source: "dist/transcript/y-other-rec.json", recordingId: "y-other-rec", reason: "not-eligible" },
    ].sort((a, b) => (a.source < b.source ? -1 : 1)));
  });

  it("rejects every transcript file by default", () => {
    const s = site({ [REC]: entry });
    const dist = join(s.root, "dist");
    mkdirSync(join(dist, "transcript"), { recursive: true });
    writeFileSync(join(dist, "transcript", `${REC}.json`), publicFile());
    const scanner = new LeakScanner({ baseDir: s.root });
    scanner.scanPaths([dist]);
    expect(scanner.result().findings).toEqual([
      { kind: "transcript-file", source: `dist/transcript/${REC}.json`, recordingId: REC, reason: "flag-off" },
    ]);
  });
});

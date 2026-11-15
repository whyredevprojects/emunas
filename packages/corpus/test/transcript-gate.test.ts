import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCorpus } from "../src/build/build.ts";
import {
  ELIGIBILITY_FILE,
  PUBLIC_TRANSCRIPT_DIR,
  eligibilityEntry,
  emitEligibleTranscripts,
  readEligibleTranscript,
  readPublishedTranscripts,
  transcriptVersion,
  transcriptViewEnabled,
  type PublicTranscriptFile,
} from "../src/transcript-gate.ts";
import { MINI_POLICY, miniCopy, tmp } from "./helpers.ts";

const REC = "y-synthetic-01";
const ON = { EMUNAS_TRANSCRIPT_VIEW: "on" };

function setup(entry: Record<string, unknown> | null, transcript: Record<string, unknown> | null) {
  const d = tmp();
  const eligibilityFile = join(d, "eligibility.json");
  const transcriptsDir = join(d, "tr");
  mkdirSync(transcriptsDir);
  writeFileSync(eligibilityFile, JSON.stringify({ policyVersion: 1, eligible: entry ? { [REC]: entry } : {} }));
  if (transcript) writeFileSync(join(transcriptsDir, `${REC}.json`), JSON.stringify(transcript));
  return { eligibilityFile, transcriptsDir };
}

const identity = { model: "some/asr-model", mode: "careful", transcribedAt: "2026-11-01T00:00:00Z" };
const entry = { ...identity, quality: "reviewed", approvedBy: "reviewer", approvedAt: "2026-11-02", allowSearch: false, note: null };
const transcript = {
  recordingId: REC,
  key: "fixture/a.mp3",
  duration: 12,
  ...identity,
  language: "yi",
  segments: [[0, 5, "synthetic segment one"], [5, 12, "synthetic segment two"]],
};

describe("transcript gate", () => {
  it("is off by default and with any value but 'on'", () => {
    expect(transcriptViewEnabled({})).toBe(false);
    expect(transcriptViewEnabled({ EMUNAS_TRANSCRIPT_VIEW: "1" })).toBe(false);
    expect(transcriptViewEnabled({ EMUNAS_TRANSCRIPT_VIEW: "ON" })).toBe(false);
    expect(transcriptViewEnabled(ON)).toBe(true);
  });

  it("returns null with the shipped (empty) eligibility file, even with the flag on", () => {
    expect(eligibilityEntry(REC)).toBeNull();
    expect(readEligibleTranscript(REC, { env: ON })).toBeNull();
    expect(readEligibleTranscript("e-english-sets-emunah-english-01-emunah-english", { env: ON, eligibilityFile: ELIGIBILITY_FILE })).toBeNull();
  });

  it("returns null with the flag off even when the entry matches", () => {
    const o = setup(entry, transcript);
    expect(readEligibleTranscript(REC, { ...o, env: {} })).toBeNull();
  });

  it("returns the transcript when flag, entry and identity all match", () => {
    const o = setup(entry, transcript);
    const t = readEligibleTranscript(REC, { ...o, env: ON });
    expect(t?.recordingId).toBe(REC);
    expect(t?.segments).toHaveLength(2);
  });

  it.each([
    ["model", { model: "other/model" }],
    ["mode", { mode: null }],
    ["transcribedAt", { transcribedAt: "2026-11-03T00:00:00Z" }],
  ])("returns null on identity mismatch (%s): re-transcription voids approval", (_f, change) => {
    const o = setup(entry, { ...transcript, ...change });
    expect(readEligibleTranscript(REC, { ...o, env: ON })).toBeNull();
  });

  it("returns null for an empty eligibility, a missing transcript, a bad entry or a bad id", () => {
    expect(readEligibleTranscript(REC, { ...setup(null, transcript), env: ON })).toBeNull();
    expect(readEligibleTranscript(REC, { ...setup(entry, null), env: ON })).toBeNull();
    expect(readEligibleTranscript(REC, { ...setup({ ...entry, allowSearch: true }, transcript), env: ON })).toBeNull();
    expect(readEligibleTranscript("../x", { ...setup(entry, transcript), env: ON })).toBeNull();
    expect(readEligibleTranscript(REC, { ...setup(entry, { ...transcript, recordingId: "other" }), env: ON })).toBeNull();
    const o = setup(entry, transcript);
    writeFileSync(o.eligibilityFile, "{ not json");
    expect(readEligibleTranscript(REC, { ...o, env: ON })).toBeNull();
  });
});

// ---- W5.2: emit into .corpus/, read back for the sites ------------------------------------------
// Fixture-only: a synthetic transcript for a recording id of the mini corpus; never real ASR text.

const MINI_REC = "e-parsha-bereshes-02-01-noach-english-the-special-qualities-of-the-teivah";
const SYNTH = "zephyr quokka lantern synthetic fixture words that never occur in any real recording";

function emitFixture(opts: { entry?: Record<string, unknown> | null; transcript?: Record<string, unknown> | null } = {}) {
  const d = tmp();
  const dataDir = join(d, "data");
  const policyDir = join(d, "site-policy");
  const outDir = join(d, ".corpus");
  mkdirSync(join(dataDir, "transcripts"), { recursive: true });
  mkdirSync(policyDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const e = opts.entry === undefined ? entry : opts.entry;
  const t =
    opts.transcript === undefined
      ? { ...transcript, recordingId: MINI_REC, segments: [[0, 4, `  ${SYNTH}  `], [4, 6, "   "], [6, 9, "second cue"]] }
      : opts.transcript;
  const eligibilityFile = join(policyDir, "transcript-eligibility.json");
  writeFileSync(eligibilityFile, JSON.stringify({ policyVersion: 1, eligible: e ? { [MINI_REC]: e } : {} }));
  if (t) writeFileSync(join(dataDir, "transcripts", `${MINI_REC}.json`), JSON.stringify(t));
  return { dataDir, policyDir, outDir, eligibilityFile };
}

describe("emitEligibleTranscripts / readPublishedTranscripts", () => {
  it("flag off: writes nothing, removes a stale folder, reports nothing", () => {
    const f = emitFixture();
    mkdirSync(join(f.outDir, PUBLIC_TRANSCRIPT_DIR));
    writeFileSync(join(f.outDir, PUBLIC_TRANSCRIPT_DIR, `${MINI_REC}.json`), "{}");
    const r = emitEligibleTranscripts({ ...f, recordingIds: [MINI_REC], env: {} });
    expect(r).toEqual({ enabled: false, emitted: [], skipped: [], removed: [`${MINI_REC}.json`] });
    expect(existsSync(join(f.outDir, PUBLIC_TRANSCRIPT_DIR))).toBe(false);
  });

  it("flag on + matching identity: exactly one public file with the allow-listed shape", () => {
    const f = emitFixture();
    const r = emitEligibleTranscripts({ ...f, recordingIds: [MINI_REC, "other-rec"], env: ON });
    expect(r.emitted).toEqual([MINI_REC]);
    expect(readdirSync(join(f.outDir, PUBLIC_TRANSCRIPT_DIR))).toEqual([`${MINI_REC}.json`]);
    const raw = readFileSync(join(f.outDir, PUBLIC_TRANSCRIPT_DIR, `${MINI_REC}.json`), "utf8");
    const body = JSON.parse(raw) as PublicTranscriptFile;
    expect(Object.keys(body).sort()).toEqual(["cues", "lang", "quality", "recordingId", "schemaVersion", "version"]);
    expect(body.version).toBe(transcriptVersion(identity));
    expect(body.cues).toEqual([[0, 4, SYNTH], [6, 9, "second cue"]]);
    for (const k of ["model", "segments", "transcribedAt", "approvedBy", "key"]) expect(raw).not.toContain(`"${k}"`);
    // The sites read it back only with the flag on.
    expect([...readPublishedTranscripts(f.outDir, { env: ON, eligibilityFile: f.eligibilityFile }).keys()]).toEqual([MINI_REC]);
    expect(readPublishedTranscripts(f.outDir, { env: {}, eligibilityFile: f.eligibilityFile }).size).toBe(0);
  });

  it("identity mismatch, out-of-scope recording or empty eligibility: nothing emitted", () => {
    const mismatch = emitFixture({ transcript: { ...transcript, recordingId: MINI_REC, model: "re-transcribed/model" } });
    const r1 = emitEligibleTranscripts({ ...mismatch, recordingIds: [MINI_REC], env: ON });
    expect(r1.emitted).toEqual([]);
    expect(r1.skipped).toEqual([{ recordingId: MINI_REC, reason: "unavailable-or-identity-mismatch" }]);
    expect(existsSync(join(mismatch.outDir, PUBLIC_TRANSCRIPT_DIR))).toBe(false);

    const scope = emitFixture();
    expect(emitEligibleTranscripts({ ...scope, recordingIds: [], env: ON }).skipped).toEqual([
      { recordingId: MINI_REC, reason: "not-in-corpus" },
    ]);

    const empty = emitFixture({ entry: null });
    expect(emitEligibleTranscripts({ ...empty, recordingIds: [MINI_REC], env: ON })).toEqual({
      enabled: true,
      emitted: [],
      skipped: [],
      removed: [],
    });
  });

  it("a site does not re-publish a .corpus file whose approval was withdrawn or changed", () => {
    const f = emitFixture();
    emitEligibleTranscripts({ ...f, recordingIds: [MINI_REC], env: ON });
    const changed = { ...entry, transcribedAt: "2027-01-01T00:00:00Z" };
    writeFileSync(f.eligibilityFile, JSON.stringify({ policyVersion: 1, eligible: { [MINI_REC]: changed } }));
    expect(readPublishedTranscripts(f.outDir, { env: ON, eligibilityFile: f.eligibilityFile }).size).toBe(0);
    writeFileSync(f.eligibilityFile, JSON.stringify({ policyVersion: 1, eligible: {} }));
    expect(readPublishedTranscripts(f.outDir, { env: ON, eligibilityFile: f.eligibilityFile }).size).toBe(0);
    // And never with the shipped (empty) eligibility file.
    expect(readPublishedTranscripts(f.outDir, { env: ON }).size).toBe(0);
  });

  it("re-running with the approval withdrawn removes the stale file", () => {
    const f = emitFixture();
    emitEligibleTranscripts({ ...f, recordingIds: [MINI_REC], env: ON });
    writeFileSync(f.eligibilityFile, JSON.stringify({ policyVersion: 1, eligible: {} }));
    const r = emitEligibleTranscripts({ ...f, recordingIds: [MINI_REC], env: ON });
    expect(r.removed).toEqual([`${MINI_REC}.json`]);
    expect(existsSync(join(f.outDir, PUBLIC_TRANSCRIPT_DIR))).toBe(false);
  });

  it("buildCorpus emits nothing by default and exactly the approved file with the flag on", () => {
    const data = miniCopy();
    const f = emitFixture();
    cpSync(join(f.dataDir, "transcripts"), join(data, "transcripts"), { recursive: true });
    cpSync(MINI_POLICY, f.policyDir, { recursive: true });
    const out = join(tmp(), ".corpus");
    const lines: string[] = [];
    const base = { dataDir: data, outDir: out, policyDir: f.policyDir, dataSha: null, log: (l: string) => lines.push(l) };
    buildCorpus({ ...base, env: {} });
    expect(existsSync(join(out, PUBLIC_TRANSCRIPT_DIR))).toBe(false);
    expect(lines).toContain("transcript view off");

    buildCorpus({ ...base, env: ON });
    expect(readdirSync(join(out, PUBLIC_TRANSCRIPT_DIR))).toEqual([`${MINI_REC}.json`]);
    // Shiur files keep the literal descriptor; the text lives only in the transcript file.
    const shiur = readFileSync(join(out, "shiurim", "en-parsha-en-nch-01.json"), "utf8");
    const recs = (JSON.parse(shiur) as { recordings: { transcript: unknown }[] }).recordings;
    expect(recs.map((r) => r.transcript)).toEqual([{ eligible: false }]);
    expect(shiur).not.toContain("zephyr");

    // Back to the default: the folder is gone again.
    buildCorpus({ ...base, env: {} });
    expect(existsSync(join(out, PUBLIC_TRANSCRIPT_DIR))).toBe(false);
  });
});

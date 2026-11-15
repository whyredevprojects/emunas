import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ELIGIBILITY_FILE, eligibilityEntry, readEligibleTranscript, transcriptViewEnabled } from "../src/transcript-gate.ts";
import { tmp } from "./helpers.ts";

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

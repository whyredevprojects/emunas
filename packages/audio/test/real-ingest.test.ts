import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { IngestOutput } from "../../../src/types.ts";
import { buildAudioTable, type AudioTableIssue } from "../src/index.ts";

const INGEST = resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/derived/ingest.json");
const ORIGIN = "https://media.example.org";

/** Real keys (ingest.json) with spaces, Hebrew, `#`, `.MP3` and `.WMA`. */
describe.runIf(existsSync(INGEST))("audio table over the real ingest.json", () => {
  const ingest = JSON.parse(readFileSync(INGEST, "utf8")) as IngestOutput;
  const inScope = [...new Set(ingest.shiurim.filter((s) => s.inScope).flatMap((s) => s.recordingIds))];
  const issues: AudioTableIssue[] = [];
  const table = buildAudioTable(ingest.recordings, { origin: ORIGIN, only: inScope, onIssue: (i) => issues.push(i) });
  const byId = new Map(ingest.recordings.map((r) => [r.id, r]));

  it("has one entry per in-scope recording", () => {
    expect(Object.keys(table).sort()).toEqual([...inScope].sort());
  });

  it("every URL decodes segment-wise to the canonical key, and is printable ASCII", () => {
    let playable = 0;
    for (const [id, e] of Object.entries(table)) {
      if (!e.playable) continue;
      playable++;
      const key = byId.get(e.canonicalId)!.audioKey;
      expect(e.url.startsWith(`${ORIGIN}/`)).toBe(true);
      expect(e.url, id).not.toMatch(/[^\x21-\x7e]/);
      expect(e.url.slice(ORIGIN.length + 1).split("/").map(decodeURIComponent).join("/")).toBe(key);
      expect(e.url.toLowerCase()).not.toContain("transcripts/");
      expect(new URL(e.url).hash).toBe("");
      expect(new URL(e.url).search).toBe("");
    }
    expect(playable).toBe(inScope.length - 3);
  });

  it("covers the awkward real keys: spaces, Hebrew, #", () => {
    const pick = (re: RegExp) => ingest.recordings.find((r) => inScope.includes(r.id) && re.test(r.audioKey));
    const hebrew = pick(/[א-ת]/);
    const hash = pick(/#/);
    for (const r of [hebrew, hash]) {
      if (!r) continue;
      const e = table[r.id]!;
      expect(e.playable).toBe(true);
      expect(e.url).not.toContain(" ");
      expect(e.url).not.toContain("#");
    }
    expect(hebrew ?? hash).toBeDefined();
  });

  it("the .WMA recordings (and only those) are unplayable", () => {
    const unplayable = Object.entries(table)
      .filter(([, e]) => !e.playable)
      .map(([id]) => id)
      .sort();
    const wma = inScope.filter((id) => !/\.mp3$/i.test(byId.get(id)!.audioKey)).sort();
    expect(wma.every((id) => /\.wma$/i.test(byId.get(id)!.audioKey))).toBe(true);
    expect(unplayable).toEqual(wma);
    expect(unplayable).toHaveLength(3);
    expect(issues).toEqual(wma.map((id) => ({ kind: "unplayable", id, reason: "not-mp3" })));
  });

  it("duplicateOf recordings map to their canonical (real duplicates are out of scope today)", () => {
    const dups = ingest.recordings.filter((r) => r.duplicateOf !== null);
    const all = buildAudioTable(ingest.recordings, { origin: ORIGIN });
    for (const d of dups) {
      expect(all[d.id]?.canonicalId).toBe(d.duplicateOf);
      expect(all[d.id]?.url).toBe(all[d.duplicateOf!]?.url);
    }
  });
});

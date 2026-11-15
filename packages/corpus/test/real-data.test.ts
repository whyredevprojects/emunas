/**
 * Acceptance on today's data (integration-plan §8 W1.2). Reads the repo's data/ through the
 * allow-listed reader. Counts are derived from ingest/manifest, so the suite stays valid while the
 * pipeline keeps adding shiurim.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { IngestOutput } from "../../../src/types.ts";
import { mp3SiblingKey } from "@emunas/audio";
import { buildCorpus, projectCorpus } from "../src/build/build.ts";
import { loadAudioTranscoded } from "../src/build/policy.ts";
import type { PublicShiur } from "../src/public/types.ts";
import { FORBIDDEN_KEYS, REAL_DATA, REAL_POLICY, allKeys, invariantViolations, readJson, tmp } from "./helpers.ts";

const ingest = readJson<IngestOutput>(join(REAL_DATA, "derived/ingest.json"));
const manifest = readJson<{ entries: { shiurId: string; status: string }[] }>(join(REAL_DATA, "derived/manifest.json"));
const inScope = ingest.shiurim.filter((s) => s.inScope);
const done = new Set(manifest.entries.filter((e) => e.status === "done").map((e) => e.shiurId));

describe("real data", () => {
  const p = projectCorpus({ dataDir: REAL_DATA, policyDir: REAL_POLICY });
  const byId = new Map<string, PublicShiur>(p.shiurim.map((s) => [s.id, s]));

  it("emits every in-scope shiur (997 today)", () => {
    expect(p.shiurim).toHaveLength(inScope.length);
    expect(inScope.length).toBeGreaterThanOrEqual(997);
    expect(new Set(p.shiurim.map((s) => s.id)).size).toBe(p.shiurim.length);
  });

  it("full count = manifest done − downgrades", () => {
    const doneInScope = inScope.filter((s) => done.has(s.id)).length;
    expect(p.counts.full).toBe(doneInScope - p.counts.downgraded);
    // every downgrade is a done shiur, every full shiur is done
    for (const d of p.report.downgraded) expect(done.has(d.id)).toBe(true);
    for (const s of p.shiurim) if (s.status === "full") expect(done.has(s.id)).toBe(true);
    console.log(`real data: ${p.counts.total} shiurim, ${p.counts.full} full, ${p.counts.downgraded} downgraded`);
  });

  it("the partial directory and the unprocessed Tanya shiur are catalog-only", () => {
    expect(byId.get("yi-zmanim-msybs-lchyym-bkmp-01-c")?.status).toBe("catalog-only");
    expect(byId.get("yi-tanya-1-01")?.status).toBe("catalog-only");
  });

  it("yi-zmanim-tv-bb-04 has 2 recordings with correct offsets", () => {
    const s = byId.get("yi-zmanim-tv-bb-04")!;
    expect(s.recordings).toHaveLength(2);
    expect(s.recordings[0]!.offset).toBe(0);
    expect(s.recordings[1]!.offset).toBeCloseTo(s.recordings[0]!.duration, 3);
    expect(s.duration).toBeCloseTo(s.recordings[0]!.duration + s.recordings[1]!.duration, 3);
  });

  it("every multi-recording shiur has cumulative offsets", () => {
    const multi = p.shiurim.filter((s) => s.recordings.length > 1);
    expect(multi.length).toBeGreaterThanOrEqual(4);
    for (const s of multi) {
      let acc = 0;
      for (const r of s.recordings) {
        expect(r.offset).toBeCloseTo(acc, 2);
        acc += r.duration;
      }
    }
  });

  it("property: chapters monotonic and tiling, every t within [0, duration], write-up t inside its section", () => {
    const violations = p.shiurim.flatMap(invariantViolations);
    expect(violations.slice(0, 20)).toEqual([]);
  });

  it("zero forbidden keys anywhere in the output", () => {
    const keys = allKeys([p.shiurim, p.index, p.audioTable]);
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k), k).toBe(false);
  });

  it("audio (Amendment A1): audioUrl for every playable recording, .WMA unplayable unless transcoded, no bucket key field", () => {
    const keyOf = new Map(ingest.recordings.map((r) => [r.id, r.audioKey]));
    const transcoded = new Set(loadAudioTranscoded(REAL_POLICY));
    const origin = p.mediaOrigin;
    const urlOf = (key: string) => `${origin}/${key.split("/").map(encodeURIComponent).join("/")}`;
    let playable = 0;
    const unplayable: string[] = [];
    const viaSibling = new Set<string>();
    for (const s of p.shiurim) {
      for (const r of s.recordings) {
        const key = keyOf.get(r.id)!;
        if (/\.mp3$/i.test(key)) {
          expect(r.playable, r.id).toBe(true);
          expect(r.audioUrl).toBe(urlOf(key));
          playable++;
        } else if (transcoded.has(key)) {
          expect(r.playable, r.id).toBe(true);
          expect(r.audioUrl).toBe(urlOf(mp3SiblingKey(key)!));
          viaSibling.add(r.id);
          playable++;
        } else {
          expect(r).toMatchObject({ playable: false, audioUrl: null });
          unplayable.push(r.id);
        }
      }
    }
    expect(unplayable.every((id) => /\.wma$/i.test(keyOf.get(id)!))).toBe(true);
    // 3 .WMA recordings in the archive; those listed in site-policy/audio-transcoded.json play their MP3 sibling.
    expect(new Set(unplayable).size + viaSibling.size).toBe(3);
    const tableIds = Object.keys(p.audioTable);
    expect(tableIds).toHaveLength(new Set(inScope.flatMap((s) => s.recordingIds)).size);
    expect(Object.values(p.audioTable).filter((e) => e.playable)).toHaveLength(tableIds.length - 3 + viaSibling.size);
    const text = JSON.stringify([p.shiurim, p.index, p.audioTable]);
    expect(text).not.toContain('"audioKey"');
    expect(text).not.toContain("transcripts/");
    console.log(`real data: ${playable} playable recording slots, ${unplayable.length} unplayable (${unplayable.join(", ")})`);
  });

  it("full build < 30 s; an unchanged rerun rewrites 0 shiur files", () => {
    const out = join(tmp(), ".corpus");
    const t0 = performance.now();
    const first = buildCorpus({ dataDir: REAL_DATA, policyDir: REAL_POLICY, outDir: out });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(30_000);
    expect(first.written).toHaveLength(inScope.length);
    const f = join(out, "shiurim/yi-zmanim-tv-bb-04.json");
    const before = statSync(f).mtimeMs;
    const second = buildCorpus({ dataDir: REAL_DATA, policyDir: REAL_POLICY, outDir: out });
    expect(second.written).toEqual([]);
    expect(statSync(f).mtimeMs).toBe(before);
    expect(second.info.buildId).toBe(first.info.buildId);
    console.log(`real data: full build ${Math.round(ms)} ms, rerun ${second.ms} ms`);
    // the report never contains raw validation values or item text: only ids and reasons
    const report = readFileSync(join(out, "build-report.json"), "utf8");
    expect(report).not.toMatch(/"(heardAs|asrNotes|segments)"/);
  });
});

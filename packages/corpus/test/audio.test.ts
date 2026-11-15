/**
 * Audio in the public output (integration-plan Amendment A1): `recordings[].audioUrl` on the media
 * host, `playable: false` for non-mp3 objects, duplicates share the canonical URL, the bucket key
 * never appears as a field, `.corpus/audio-table.json` is written.
 */
import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IngestOutput } from "../../../src/types.ts";
import { buildCorpus, projectCorpus, resolveMediaOrigin } from "../src/build/build.ts";
import type { AudioTable, BuildInfo, PublicShiur } from "../src/public/types.ts";
import { FORBIDDEN_KEYS, MINI_DATA, MINI_POLICY, allKeys, editJson, miniCopy, readJson, tmp } from "./helpers.ts";

const ORIGIN = "https://media.example.org";

let savedEnv: string | undefined;
beforeEach(() => {
  savedEnv = process.env["EMUNAS_MEDIA_ORIGIN"];
  delete process.env["EMUNAS_MEDIA_ORIGIN"];
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env["EMUNAS_MEDIA_ORIGIN"];
  else process.env["EMUNAS_MEDIA_ORIGIN"] = savedEnv;
});

describe("media origin", () => {
  it("option, else env, else placeholder; invalid is fatal", () => {
    expect(resolveMediaOrigin()).toEqual({ origin: "https://media.example.invalid", placeholder: true });
    process.env["EMUNAS_MEDIA_ORIGIN"] = "https://media.from-env.org/";
    expect(resolveMediaOrigin()).toEqual({ origin: "https://media.from-env.org", placeholder: false });
    expect(resolveMediaOrigin(ORIGIN)).toEqual({ origin: ORIGIN, placeholder: false });
    expect(() => resolveMediaOrigin("https://media.example.org/sub")).toThrow();
    expect(() => projectCorpus({ dataDir: MINI_DATA, policyDir: MINI_POLICY, mediaOrigin: "ftp://x" })).toThrow();
  });

  it("the placeholder is reported as a warning; a real origin is not", () => {
    const a = projectCorpus({ dataDir: MINI_DATA, policyDir: MINI_POLICY });
    expect(a.report.warnings.some((w) => w.includes("EMUNAS_MEDIA_ORIGIN not set"))).toBe(true);
    const b = projectCorpus({ dataDir: MINI_DATA, policyDir: MINI_POLICY, mediaOrigin: ORIGIN });
    expect(b.report.warnings.some((w) => w.startsWith("audio:"))).toBe(false);
  });
});

describe("recordings[].audioUrl", () => {
  it("every mini recording is playable with an encoded URL on the media origin", () => {
    const p = projectCorpus({ dataDir: MINI_DATA, policyDir: MINI_POLICY, mediaOrigin: ORIGIN });
    const ingest = readJson<IngestOutput>(join(MINI_DATA, "derived/ingest.json"));
    const keyOf = new Map(ingest.recordings.map((r) => [r.id, r.audioKey]));
    for (const s of p.shiurim) {
      for (const r of s.recordings) {
        expect(r.playable).toBe(true);
        expect(r.audioUrl).toBe(`${ORIGIN}/${keyOf.get(r.id)!.split("/").map(encodeURIComponent).join("/")}`);
      }
    }
    for (const k of FORBIDDEN_KEYS) expect(allKeys([p.shiurim, p.index, p.audioTable]).has(k), k).toBe(false);
  });

  it("non-mp3 (.WMA) → playable false, audioUrl null; duplicates use the canonical's URL", () => {
    const d = miniCopy();
    const WMA = "y-zemanim-taamuz-av-07-04-2-15-av";
    const DUP = "y-zemanim-taamuz-av-07-04-1-15-av";
    let canonical = "";
    editJson<IngestOutput>(join(d, "derived/ingest.json"), (i) => {
      const wma = i.recordings.find((r) => r.id === WMA)!;
      wma.audioKey = "Y Zemanim/07 Taamuz-Av/04-2 15 Av.WMA";
      // Make DUP a duplicate of a recording outside every in-scope shiur, with a Hebrew/space/# key.
      const extra = { ...i.recordings.find((r) => r.id === DUP)! };
      extra.id = "x-canonical-of-15-av";
      extra.audioKey = "Y Zemanim/07 Taamuz-Av/ט\"ו באב #1.mp3";
      extra.duplicateOf = null;
      i.recordings.push(extra);
      canonical = extra.id;
      i.recordings.find((r) => r.id === DUP)!.duplicateOf = extra.id;
    });
    const out = join(tmp(), ".corpus");
    const r = buildCorpus({ dataDir: d, policyDir: MINI_POLICY, outDir: out, mediaOrigin: ORIGIN, dataSha: null });
    const s = readJson<PublicShiur>(join(out, "shiurim/yi-zmanim-tv-bb-04.json"));
    const [a, b] = s.recordings;
    expect(a).toMatchObject({
      id: DUP,
      playable: true,
      audioUrl: `${ORIGIN}/Y%20Zemanim/07%20Taamuz-Av/%D7%98%22%D7%95%20%D7%91%D7%90%D7%91%20%231.mp3`,
    });
    expect(b).toMatchObject({ id: WMA, playable: false, audioUrl: null });
    // Times and notes are unaffected by playability.
    expect(s.status).toBe("full");
    expect(b!.offset).toBe(a!.duration);

    const table = readJson<AudioTable>(join(out, "audio-table.json"));
    expect(table[DUP]).toEqual({ canonicalId: canonical, size: expect.any(Number), playable: true, url: a!.audioUrl });
    expect(table[WMA]).toEqual({ canonicalId: WMA, size: expect.any(Number), playable: false, url: null });
    // Only in-scope recordings are in the table (the canonical is not in any in-scope shiur).
    expect(table[canonical]).toBeUndefined();
    expect(r.report.warnings).toContain(`audio: ${WMA} not playable (not-mp3); shown as unavailable`);
  });

  describe("site-policy/audio-transcoded.json (MP3 sibling of a non-mp3 object)", () => {
    const WMA = "y-zemanim-taamuz-av-07-04-2-15-av";
    const WMA_KEY = "Y Zemanim/07 Taamuz-Av/04-2 15 Av #2.WMA";
    const withWma = () => {
      const d = miniCopy();
      editJson<IngestOutput>(join(d, "derived/ingest.json"), (i) => {
        i.recordings.find((r) => r.id === WMA)!.audioKey = WMA_KEY;
      });
      return d;
    };
    const policyWith = (body: unknown) => {
      const p = join(tmp(), "site-policy");
      cpSync(MINI_POLICY, p, { recursive: true });
      writeFileSync(join(p, "audio-transcoded.json"), JSON.stringify(body));
      return p;
    };
    const recOf = (shiurim: PublicShiur[]) => shiurim.flatMap((s) => s.recordings).find((r) => r.id === WMA)!;

    it("listed → playable, audioUrl is the encoded .mp3 sibling; the raw key is not in the output", () => {
      const policyDir = policyWith({ policyVersion: 1, mp3Siblings: [WMA_KEY] });
      const p = projectCorpus({ dataDir: withWma(), policyDir, mediaOrigin: ORIGIN });
      const sibling = `${ORIGIN}/Y%20Zemanim/07%20Taamuz-Av/04-2%2015%20Av%20%232.mp3`;
      expect(recOf(p.shiurim)).toMatchObject({ playable: true, audioUrl: sibling });
      expect(p.audioTable[WMA]).toEqual({ canonicalId: WMA, size: 0, playable: true, url: sibling });
      expect(p.report.warnings.some((w) => w.includes(WMA))).toBe(false);
      const json = JSON.stringify([p.shiurim, p.index, p.audioTable]);
      expect(json).not.toContain("WMA");
      expect(json).not.toContain("15 Av #2");
      for (const k of FORBIDDEN_KEYS) expect(allKeys([p.shiurim, p.index, p.audioTable]).has(k), k).toBe(false);
    });

    it("not listed (or listing another key) → still unplayable", () => {
      for (const policyDir of [
        MINI_POLICY,
        policyWith({ policyVersion: 1, mp3Siblings: [] }),
        policyWith({ policyVersion: 1, mp3Siblings: ["Y Zemanim/other.WMA"] }),
      ]) {
        const p = projectCorpus({ dataDir: withWma(), policyDir, mediaOrigin: ORIGIN });
        expect(recOf(p.shiurim)).toMatchObject({ playable: false, audioUrl: null });
        expect(p.report.warnings).toContain(`audio: ${WMA} not playable (not-mp3); shown as unavailable`);
      }
    });

    it("an invalid file is fatal", () => {
      for (const body of [
        { policyVersion: 2, mp3Siblings: [] },
        { policyVersion: 1 },
        { policyVersion: 1, mp3Siblings: ["a/b.mp3"] },
        { policyVersion: 1, mp3Siblings: ["transcripts/a/b.WMA"] },
        { policyVersion: 1, mp3Siblings: ["a/noext"] },
      ]) {
        expect(() => projectCorpus({ dataDir: MINI_DATA, policyDir: policyWith(body), mediaOrigin: ORIGIN })).toThrow(
          /audio-transcoded\.json/,
        );
      }
    });
  });

  it("changing the media origin re-emits every shiur; build.json records the origin", () => {
    const out = join(tmp(), ".corpus");
    const opts = { dataDir: MINI_DATA, policyDir: MINI_POLICY, outDir: out, dataSha: null };
    buildCorpus({ ...opts, mediaOrigin: ORIGIN });
    expect(readJson<BuildInfo>(join(out, "build.json")).mediaOrigin).toBe(ORIGIN);
    expect(buildCorpus({ ...opts, mediaOrigin: ORIGIN }).written).toEqual([]);
    const again = buildCorpus({ ...opts, mediaOrigin: "https://media.other.org" });
    expect(again.written).toHaveLength(60);
    expect(readJson<BuildInfo>(join(out, "build.json")).mediaOrigin).toBe("https://media.other.org");
    const s = readJson<PublicShiur>(join(out, "shiurim/yi-zmanim-tv-bb-04.json"));
    expect(s.recordings[0]!.audioUrl?.startsWith("https://media.other.org/")).toBe(true);
  });
});

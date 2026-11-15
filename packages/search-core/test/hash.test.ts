import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PublicShiur } from "@emunas/corpus/public";
import { buildMomentRows, buildSearchDoc, canonicalJson, contentHash, readCorpusShiurim, writeSearchOutputs } from "../src/build/index.ts";
import { MINI_DATA, MINI_POLICY, buildCorpusTo } from "./helpers.ts";

const ID = "yi-parshas-hashavua-brshys-01";

describe("hashes", () => {
  const a = buildCorpusTo(MINI_DATA, MINI_POLICY);
  const b = buildCorpusTo(MINI_DATA, MINI_POLICY);

  it("are stable across runs (two independent builds give identical NDJSON)", () => {
    writeSearchOutputs({ corpusDir: a, dataDir: MINI_DATA });
    writeSearchOutputs({ corpusDir: b, dataDir: MINI_DATA });
    for (const f of ["docs.ndjson", "moments.ndjson"]) {
      expect(readFileSync(join(a, "search", f), "utf8")).toBe(readFileSync(join(b, "search", f), "utf8"));
    }
  });

  it("a second run with no change rewrites nothing", () => {
    writeSearchOutputs({ corpusDir: a, dataDir: MINI_DATA });
    const before = statSync(join(a, "search/moments.ndjson")).mtimeMs;
    const r = writeSearchOutputs({ corpusDir: a, dataDir: MINI_DATA });
    expect(r.written).toEqual([]);
    expect(statSync(join(a, "search/moments.ndjson")).mtimeMs).toBe(before);
  });

  const shiur = readCorpusShiurim(a).find((s) => s.id === ID)!;
  const clone = (): PublicShiur => JSON.parse(JSON.stringify(shiur)) as PublicShiur;

  it("ignore rev and object key order, but follow text and metadata", () => {
    const base = buildSearchDoc({ shiur, candidateTopics: ["x"] });
    const rows = buildMomentRows(shiur);

    const revChanged = clone();
    revChanged.rev = "something-else";
    expect(buildSearchDoc({ shiur: revChanged, candidateTopics: ["x"] }).hash).toBe(base.hash);
    expect(buildMomentRows(revChanged).map((r) => r.hash)).toEqual(rows.map((r) => r.hash));

    const textChanged = clone();
    textChanged.notes!.chapters[0]!.summary.en += " More.";
    expect(buildSearchDoc({ shiur: textChanged, candidateTopics: ["x"] }).hash).not.toBe(base.hash);
    const changedRows = buildMomentRows(textChanged);
    const changedIds = rows.filter((r, i) => r.hash !== changedRows[i]!.hash).map((r) => r.id);
    expect(changedIds).toEqual([shiur.notes!.chapters[0]!.id]);

    const timeChanged = clone();
    timeChanged.notes!.insights[0]!.t = (timeChanged.notes!.insights[0]!.t ?? 0) + 1;
    expect(buildMomentRows(timeChanged).find((r) => r.id === shiur.notes!.insights[0]!.id)!.hash).not.toBe(
      rows.find((r) => r.id === shiur.notes!.insights[0]!.id)!.hash,
    );

    expect(buildSearchDoc({ shiur, candidateTopics: ["y"] }).hash).not.toBe(base.hash);
  });

  it("canonical JSON sorts keys at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[{"y":2,"z":1}]},"b":1}');
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(contentHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

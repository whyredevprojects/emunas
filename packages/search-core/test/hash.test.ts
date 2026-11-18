import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PublicShiur } from "@emunas/corpus/public";
import {
  buildEntityDocs,
  buildMomentRows,
  buildSearchDoc,
  canonicalJson,
  contentHash,
  readCorpusShiurim,
  readLayerFiles,
  readSearchLayerInput,
  writeSearchOutputs,
} from "../src/build/index.ts";
import { MINI_DATA, MINI_POLICY, buildCorpusTo } from "./helpers.ts";

const ID = "yi-parshas-hashavua-brshys-01";

describe("hashes", () => {
  const a = buildCorpusTo(MINI_DATA, MINI_POLICY);
  const b = buildCorpusTo(MINI_DATA, MINI_POLICY);

  it("are stable across runs (two independent builds give identical NDJSON)", () => {
    writeSearchOutputs({ corpusDir: a, dataDir: MINI_DATA });
    writeSearchOutputs({ corpusDir: b, dataDir: MINI_DATA });
    for (const f of ["docs.ndjson", "moments.ndjson", "entities.ndjson"]) {
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

  const shiurim = readCorpusShiurim(a);
  const shiur = shiurim.find((s) => s.id === ID)!;
  const layer = readSearchLayerInput(a, shiurim).layer;
  const clone = (): PublicShiur => JSON.parse(JSON.stringify(shiur)) as PublicShiur;

  it("ignore rev and object key order, but follow text, metadata and the layer", () => {
    const base = buildSearchDoc({ shiur, layer });
    const rows = buildMomentRows(shiur, layer);
    expect(base.keywords.length).toBeGreaterThan(0);

    const revChanged = clone();
    revChanged.rev = "something-else";
    expect(buildSearchDoc({ shiur: revChanged, layer }).hash).toBe(base.hash);
    expect(buildMomentRows(revChanged, layer).map((r) => r.hash)).toEqual(rows.map((r) => r.hash));

    const textChanged = clone();
    const ch0 = textChanged.notes!.chapters[0]!;
    ch0.summary = { ...ch0.summary, en: `${ch0.summary.en} More.` };
    expect(buildSearchDoc({ shiur: textChanged, layer }).hash).not.toBe(base.hash);
    const changedRows = buildMomentRows(textChanged, layer);
    const changedIds = rows.filter((r, i) => r.hash !== changedRows[i]!.hash).map((r) => r.id);
    expect(changedIds).toEqual([shiur.notes!.chapters[0]!.id]);

    const timeChanged = clone();
    timeChanged.notes!.insights[0]!.t = (timeChanged.notes!.insights[0]!.t ?? 0) + 1;
    expect(buildMomentRows(timeChanged, layer).find((r) => r.id === shiur.notes!.insights[0]!.id)!.hash).not.toBe(
      rows.find((r) => r.id === shiur.notes!.insights[0]!.id)!.hash,
    );

    // a topic label change reaches the keywords and the hash
    const topics = new Map(layer.topics);
    const first = base.facets.topics[0]!;
    topics.set(first, { ...topics.get(first)!, en: `${topics.get(first)!.en} changed` });
    expect(buildSearchDoc({ shiur, layer: { ...layer, topics } }).hash).not.toBe(base.hash);
    // no layer: different (empty) keywords and facets
    expect(buildSearchDoc({ shiur }).hash).not.toBe(base.hash);
  });

  it("EntityDoc hashes are stable and follow the synonyms", () => {
    const files = readLayerFiles(a);
    const one = buildEntityDocs(files);
    expect(buildEntityDocs(readLayerFiles(b)).map((e) => e.hash)).toEqual(one.map((e) => e.hash));
    const first = files.synonyms.synonyms[0]!;
    const changed = { ...files, synonyms: { synonyms: [{ ...first, terms: first.terms.slice(1) }, ...files.synonyms.synonyms.slice(1)] } };
    const two = buildEntityDocs(changed);
    const diff = one.filter((e, i) => e.hash !== two[i]!.hash).map((e) => `${e.kind}:${e.id}`);
    expect(diff).toEqual([`${first.kind}:${first.id}`]);
  });

  it("canonical JSON sorts keys at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[{"y":2,"z":1}]},"b":1}');
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(contentHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

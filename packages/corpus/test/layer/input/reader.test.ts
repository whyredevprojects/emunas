/**
 * Corpus-layer allow-list (corpus-wave-plan §3.1, C1.1 acceptance): the reader refuses every path
 * of the internal folder, every alias map, the ASR variants file and the section search dump, and a
 * full corpus read of the real data opens only allow-listed files.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DATA_ALLOW_LIST,
  ForbiddenPathError,
  createDataReader,
  isAllowedDataPath,
  isDeniedDataPath,
  readPolicyText,
  type DataReader,
} from "../../../src/build/read.ts";
import { readCorpusInput } from "../../../src/layer/input/load.ts";
import { DEFAULT_CORPUS_POLICY } from "../../../src/layer/policy.ts";
import { MINI_DATA, PKG, REAL_DATA, REAL_POLICY } from "../../helpers.ts";
import { POISON_CANARY } from "../../../scripts/make-mini-corpus.ts";

// Built from parts so the source carries no literal path of the internal folder.
const RAW = ["raw"].join("");
const CORPUS = "derived/corpus";
const RAW_DIR = `${CORPUS}/${RAW}`;

/** A reader that records every path it is asked for. */
function spy(inner: DataReader): DataReader & { paths: string[] } {
  const paths: string[] = [];
  return {
    root: inner.root,
    paths,
    exists(rel) {
      paths.push(rel);
      return inner.exists(rel);
    },
    list(rel) {
      paths.push(rel);
      return inner.list(rel);
    },
    readText(rel) {
      paths.push(rel);
      return inner.readText(rel);
    },
  };
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split("\\").join("/"));
}

describe("corpus allow-list", () => {
  const reader = createDataReader(REAL_DATA);

  it("reads the allowed corpus files", () => {
    for (const f of ["index", "topics", "concepts", "people", "works", "stories", "teaching-clusters", "redirects"]) {
      expect(reader.exists(`${CORPUS}/${f}.json`), f).toBe(true);
    }
    expect(reader.readText(`${CORPUS}/shiur-tags/yi-zmanim-tv-bb-04.json`)).toContain('"topics"');
    expect(reader.readText(`${CORPUS}/series/tanya-yi.json`)).toContain('"arc"');
    expect(reader.readText(`${CORPUS}/series/no-such-series.json`)).toBeNull();
  });

  // Names only: the folder's contents are never opened.
  const rawFiles = filesUnder(join(REAL_DATA, RAW_DIR)).map((f) => `${RAW_DIR}/${f}`);
  it("the real internal folder is not empty (so the next test means something)", () => {
    expect(rawFiles.length).toBeGreaterThan(10);
  });

  it("refuses every path under the internal folder of the real data", () => {
    const allowed = rawFiles.filter((rel) => {
      try {
        reader.readText(rel);
        return true;
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenPathError);
        expect((e as ForbiddenPathError).denied).toBe(true);
        return false;
      }
    });
    expect(allowed).toEqual([]);
    for (const rel of rawFiles) expect(() => reader.exists(rel)).toThrow(ForbiddenPathError);
  });

  const aliasMaps = ["concept", "people", "works", "topic"].map((k) => `${k}-alias-map.json`);
  const denied = [
    RAW_DIR,
    `${RAW_DIR}/`,
    `${RAW_DIR}/topics.json`,
    `${RAW_DIR}/digests/chunk-01.json`,
    `${RAW_DIR}/links/en-emunah-en-01.json`,
    ...aliasMaps.map((m) => `${RAW_DIR}/${m}`),
    ...aliasMaps.map((m) => `${CORPUS}/${m}`),
    `${CORPUS}/display-alias-map.json`,
    `${RAW_DIR}/asr-variants.json`,
    `${CORPUS}/asr-variants.json`,
    `${CORPUS}/heard-as.json`,
    `${CORPUS}/concept-variants.json`,
    `${CORPUS}/search/sections.jsonl`,
    `${CORPUS}/search/sections.json`,
    `${CORPUS}/topic-tags/chunk-01.json`,
    `${CORPUS}/teaching-clusters/emunah.json`,
    // Would match an allow pattern; the deny list wins.
    `${CORPUS}/series/asr-notes.json`,
    `${CORPUS}/series/variant-a.json`,
    `${CORPUS}/shiur-tags/yi-heard-01.json`,
    `${CORPUS}/shiur-tags/yi-alias-map.json`,
    // Anywhere in the data root.
    "derived/people-alias-map.json",
    "derived/shiurim/yi-a/asr-variants.json",
  ];
  it.each(denied)("denies %s before the allow-list", (rel) => {
    expect(isDeniedDataPath(rel)).toBe(true);
    expect(isAllowedDataPath(rel)).toBe(false);
    expect(() => reader.readText(rel)).toThrow(ForbiddenPathError);
    expect(() => reader.exists(rel)).toThrow(ForbiddenPathError);
  });

  it("a denied path that an allow pattern matches is still refused", () => {
    const rel = `${CORPUS}/series/asr-notes.json`;
    expect(DATA_ALLOW_LIST.some((re) => re.test(rel))).toBe(true);
    expect(() => reader.readText(rel)).toThrow(/denied/);
  });

  const notAllowed = [
    `${CORPUS}/index.jsonl`,
    `${CORPUS}/other.json`,
    `${CORPUS}/series/a/b.json`,
    `${CORPUS}/series/Upper.json`,
    `${CORPUS}/shiur-tags/../topics.json`,
    `${CORPUS}/teaching-clusters`,
    `${CORPUS}/insights.json`,
    "derived/corpus.json",
  ];
  it.each(notAllowed)("refuses %s (not on the allow-list)", (rel) => {
    expect(() => reader.readText(rel)).toThrow(ForbiddenPathError);
  });

  it("allows the corpus policy file in site-policy", () => {
    expect(readPolicyText(REAL_POLICY, "corpus-policy.json")).toContain("policyVersion");
  });
});

describe("a full corpus read opens only allow-listed files", () => {
  it("real data (reader spy)", () => {
    const s = spy(createDataReader(REAL_DATA));
    const { input, report } = readCorpusInput(s, { policy: DEFAULT_CORPUS_POLICY });
    expect(input).not.toBeNull();
    expect(s.paths.length).toBeGreaterThan(8);
    expect(s.paths.filter((p) => !isAllowedDataPath(p))).toEqual([]);
    expect(s.paths.filter((p) => p.startsWith(RAW_DIR))).toEqual([]);
    expect(new Set(s.paths).size).toBe(s.paths.length);
    expect(s.paths.filter((p) => p.includes("/shiur-tags/"))).toHaveLength(input!.index.shiurIds.length);
    expect(report.shiurTagsRead).toBe(input!.index.shiurIds.length);
    expect(report.untagged).toEqual([]);
    expect(report.droppedKeys).toEqual({});
  });

  it("mini fixture with a poisoned internal folder and alias map: none of it is opened or copied", () => {
    const s = spy(createDataReader(MINI_DATA));
    const { input, report } = readCorpusInput(s, { policy: DEFAULT_CORPUS_POLICY });
    expect(s.paths.filter((p) => !isAllowedDataPath(p))).toEqual([]);
    const json = JSON.stringify({ input: { ...input, series: [...input!.series], shiurTags: [...input!.shiurTags] }, report });
    expect(json).not.toContain(POISON_CANARY);
    // The poison really is on disk next to the files that were read.
    const poisoned = filesUnder(join(MINI_DATA, CORPUS)).filter((f) => readFileSync(join(MINI_DATA, CORPUS, f), "utf8").includes(POISON_CANARY));
    expect(poisoned.length).toBeGreaterThanOrEqual(7);
  });

  it("layer input code reaches the file system only through the reader", () => {
    const dir = join(PKG, "src/layer/input");
    for (const f of filesUnder(dir)) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/from\s+["']node:fs/);
      expect(text, f).not.toMatch(/\bfs\./);
    }
  });
});

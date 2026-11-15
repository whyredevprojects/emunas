/**
 * Clean synonyms (corpus-wave-plan §1 rule 1, §3.6): the synonym table holds display-field terms
 * only, the build rejects a synonym that is not a display field, and D1 (no ASR variants) is
 * asserted. Query expansion to corpus ids: `hester` → topic and concept hester-panim; `Hashem Tov`
 * (an ASR mishearing of the Baal Shem Tov) expands to nothing.
 */
import { cpSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LayerSynonymsFile } from "@emunas/corpus/public";
import { buildSynonymTable, matchSpan, normalizeQuery, type EntityDoc, type SynonymSource } from "../src/index.ts";
import {
  SynonymCheckError,
  assertNoAsrVariants,
  displaySetsOf,
  verifyDisplaySynonyms,
  writeSearchOutputs,
} from "../src/build/index.ts";
import { MINI_DATA, MINI_POLICY, buildCorpusTo, readNdjson, tmp } from "./helpers.ts";

function miniEntities(): { corpus: string; entities: EntityDoc[] } {
  const corpus = buildCorpusTo(MINI_DATA, MINI_POLICY);
  writeSearchOutputs({ corpusDir: corpus, dataDir: MINI_DATA, policyDir: MINI_POLICY });
  return { corpus, entities: readNdjson<EntityDoc>(join(corpus, "search/entities.ndjson")) };
}

const ids = (q: ReturnType<typeof normalizeQuery>) => q.entities.map((e) => `${e.kind}:${e.id}`);

describe("query expansion with the corpus synonym table (mini corpus)", () => {
  const { entities } = miniEntities();
  const table = buildSynonymTable(entities);

  it("'hester' expands to topic hester-panim and concept hester-panim", () => {
    const q = normalizeQuery("hester", table);
    expect(ids(q)).toEqual(expect.arrayContaining(["topic:hester-panim", "concept:hester-panim"]));
    // canonical forms come along, for AND engines as variants and for OR engines as tokens
    expect(q.variants).toContain("הסתר פנים");
    expect(q.tokens).toContain("panim");
    const exact = normalizeQuery("hester panim", table);
    expect(exact.entities.filter((e) => e.id === "hester-panim").map((e) => e.match)).toEqual(["exact", "exact"]);
  });

  it("'Hashem Tov' (an ASR variant) does not expand to baal-shem-tov; the display names do", () => {
    for (const q of ["Hashem Tov", "hashem tov", "השם טוב"]) {
      expect(ids(normalizeQuery(q, table)), q).not.toContain("person:baal-shem-tov");
    }
    expect(ids(normalizeQuery("the Baal Shem Tov", table))).toContain("person:baal-shem-tov");
    expect(ids(normalizeQuery("baal shem tov", table))).toContain("person:baal-shem-tov");
    expect(ids(normalizeQuery("the Besht", table))).toEqual(["person:baal-shem-tov"]);
  });

  it("every term in the table is a synonym or label of its entity (nothing else can enter)", () => {
    for (const [term, list] of table.exact) {
      for (const i of list) {
        const e = table.entries[i]!;
        const doc = entities.find((x) => x.kind === e.kind && x.id === e.id)!;
        const own = [...doc.synonyms, ...e.forms];
        expect(own.some((t) => t === term || t.endsWith(` ${term}`)), `${e.kind}:${e.id}`).toBe(true);
      }
    }
  });

  it("the existing normalize tables keep working alongside the table", () => {
    const q = normalizeQuery("parshas noach", table);
    expect(q.expansions.find((x) => x.kind === "parsha")?.key).toBe("noach");
    expect(q.tokens).toContain("נח");
    expect(normalizeQuery("hester").entities).toEqual([]);
  });

  it("function words alone never prefix-match", () => {
    expect(normalizeQuery("the", table).entities).toEqual([]);
    expect(normalizeQuery("rabbi", table).entities).toEqual([]);
    expect(matchSpan(table, "of the")).toEqual([]);
  });
});

describe("asrVariants (D1)", () => {
  const src: SynonymSource = { kind: "person", id: "x", labels: { he: null, en: "X", yi: null }, synonyms: ["x"], count: 1 };

  it("the synonym table only accepts asrVariants: false", () => {
    expect(() => buildSynonymTable([src], { asrVariants: false })).not.toThrow();
    expect(() => buildSynonymTable([src], { asrVariants: true } as unknown as { asrVariants: false })).toThrow(/asrVariants/);
  });

  it("the build asserts the policy keeps it false", () => {
    expect(() => assertNoAsrVariants({ search: { asrVariants: false } })).not.toThrow();
    expect(() => assertNoAsrVariants({})).not.toThrow();
    expect(() => assertNoAsrVariants({ search: { asrVariants: true } })).toThrow(/asrVariants/);
  });

  it("a policy file asking for ASR variants stops search:build", () => {
    const corpus = buildCorpusTo(MINI_DATA, MINI_POLICY);
    const policy = join(tmp(), "site-policy");
    mkdirSync(policy, { recursive: true });
    cpSync(MINI_POLICY, policy, { recursive: true });
    writeFileSync(join(policy, "corpus-policy.json"), JSON.stringify({ policyVersion: 1, search: { asrVariants: true } }));
    expect(() => writeSearchOutputs({ corpusDir: corpus, dataDir: MINI_DATA, policyDir: policy })).toThrow(/asrVariants/);
  });
});

describe("synonyms that are not display fields are rejected at build", () => {
  it("a planted non-display synonym in layer synonyms.json fails search:build, naming the entity but not the term", () => {
    const corpus = buildCorpusTo(MINI_DATA, MINI_POLICY);
    const file = join(corpus, "layer/synonyms.json");
    const syn = JSON.parse(readFileSync(file, "utf8")) as LayerSynonymsFile;
    const row = syn.synonyms.find((s) => s.kind === "person" && s.id === "baal-shem-tov")!;
    row.terms.push("hashem tov");
    writeFileSync(file, JSON.stringify(syn));
    let err: unknown;
    try {
      writeSearchOutputs({ corpusDir: corpus, dataDir: MINI_DATA, policyDir: MINI_POLICY });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SynonymCheckError);
    expect((err as SynonymCheckError).offenders).toEqual(new Map([["person:baal-shem-tov", 1]]));
    expect((err as Error).message).not.toContain("hashem tov");
  });

  it("verifyDisplaySynonyms accepts display fields in any spelling that folds equal, and rejects unknown entities", () => {
    const display = displaySetsOf({
      topics: [{ id: "t", label: { en: "Hester Panim", yi: "הסתר פנים", he: "הסתר פנים" }, aliases: ["hiding of the face"] }],
      concepts: [{ id: "c", canonicalHe: "הסתר", label: { en: "Hester", yi: "הסתר" }, transliterations: ["hester"] }],
      people: [{ id: "p", nameHe: "", nameEn: "The Besht", nameYi: "", aliases: [] }],
      works: [{ id: "w", titleHe: "", titleEn: "Rambam", sefariaIndexTitle: "Mishneh Torah", aliases: [] }],
    });
    expect(() =>
      verifyDisplaySynonyms(
        [
          { kind: "topic", id: "t", terms: ["hester panim", "Hiding of the Face"] },
          { kind: "concept", id: "c", terms: ["HESTER"] },
          { kind: "person", id: "p", terms: ["the besht"] },
          { kind: "work", id: "w", terms: ["mishneh torah"] },
        ],
        display,
      ),
    ).not.toThrow();
    expect(() => verifyDisplaySynonyms([{ kind: "person", id: "nobody", terms: ["x"] }], display)).toThrow(SynonymCheckError);
    expect(() => verifyDisplaySynonyms([{ kind: "person", id: "p", terms: ["hashem tov"] }], display)).toThrow(SynonymCheckError);
  });
});

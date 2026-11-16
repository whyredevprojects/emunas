/**
 * The engine over the real emitted quick index (`app/data/fixtures`, written by `data-build/emit.ts`
 * over the `@emunas/corpus` mini corpus and its corpus layer), so the suggestions follow the layer's
 * page rules and its clean synonyms exactly (corpus-wave-plan C3.6; concept-live-corpus D, E.1, F.2).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { FacetsFile, QuickIndexFile } from "../live-data.ts";
import { createQuickSearch, type Suggestion } from "../engine.ts";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../../../data/fixtures/data");
const read = <T,>(file: string): T => JSON.parse(readFileSync(join(dataDir, file), "utf8")) as T;

const facets = read<FacetsFile>("facets.json");
const engines = {
  en: createQuickSearch({ ui: "en", quick: read<QuickIndexFile>("quick-index.en.json"), facets }),
  yi: createQuickSearch({ ui: "yi", quick: read<QuickIndexFile>("quick-index.yi.json"), facets }),
};

const entityKeys = (xs: Suggestion[]) => xs.flatMap((s) => (s.type === "entity" ? [`${s.kind}:${s.id}`] : []));

describe.each(["en", "yi"] as const)("suggestions on the emitted quick index (%s)", (ui) => {
  const e = engines[ui];

  it("'hester' suggests the topic Hester Panim", () => {
    expect(entityKeys(e.suggest("hester"))[0]).toBe("topic:hester-panim");
    expect(entityKeys(e.suggest("הסתר פנים"))).toContain("topic:hester-panim");
  });

  it("'Hashem Tov' suggests nothing from an ASR mapping; the Baal Shem Tov's own names do", () => {
    for (const q of ["Hashem Tov", "hashem tov", "השם טוב"]) {
      expect(entityKeys(e.suggest(q)), q).not.toContain("person:baal-shem-tov");
      expect(e.normalize(q).entities.map((x) => x.id), q).not.toContain("baal-shem-tov");
    }
    expect(entityKeys(e.suggest("baal shem tov"))).toContain("person:baal-shem-tov");
    expect(entityKeys(e.suggest("the Besht"))).toContain("person:baal-shem-tov");
  });

  it("suggests no person of type other or of the other group, and none below the page threshold", () => {
    for (const q of ["Chashmonaim", "החשמונאים", "Syn Other", "Syn Gabbai", "פלוני הגבאי", "Eliyahu Shalom"]) {
      expect(entityKeys(e.suggest(q)).filter((k) => k.startsWith("person:")), q).toEqual([]);
    }
    for (const id of ["chashmonaim", "syn-other-one-shiur", "syn-individual", "eliyahu-shalom-wolfson"]) {
      expect(e.entity("person", id), id).toBeUndefined();
    }
  });

  it("every suggested entity links to a page that exists in the emitted tree", () => {
    const quick = read<QuickIndexFile>(`quick-index.${ui}.json`);
    const file = { topic: "topic", concept: "entity/c", person: "entity/p", work: "work" } as const;
    for (const x of quick.entities) {
      expect(() => readFileSync(join(dataDir, `${file[x.kind]}/${x.id}.json`)), `${x.kind}:${x.id}`).not.toThrow();
    }
  });
});

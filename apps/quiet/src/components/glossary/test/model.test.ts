/**
 * C2.1: the glossary (ערכים) and its entry pages on the mini corpus layer.
 */
import { corpusLabel } from "@emunas/i18n";
import type { LayerConcept } from "@emunas/corpus/public";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEntryDataFrom, type EntryData } from "../../indexes/entries.ts";
import { buildMiniCorpus, type MiniCorpus } from "../../indexes/test/mini.ts";
import { conceptPage, conceptPageIds, glossaryIndex } from "../model.ts";

let mini: MiniCorpus;
let d: EntryData;

beforeAll(() => {
  mini = buildMiniCorpus();
  d = loadEntryDataFrom(mini.dir);
}, 120_000);

afterAll(() => mini?.dispose());

const lines = (ed: "yi" | "en") => glossaryIndex(d, ed).flatMap((b) => b.items);

describe("glossary (ערכים)", () => {
  it("is one list aleph to tav of every concept, by the Hebrew headword in both editions", () => {
    for (const ed of ["yi", "en"] as const) {
      const all = lines(ed);
      expect(all.map((l) => l.id).sort()).toEqual(d.layer.concepts.map((c) => c.id).sort());
      const letters = glossaryIndex(d, ed).map((b) => b.letter);
      expect(letters[0]).toBe("א");
      expect(new Set(letters).size).toBe(letters.length);
      for (const l of all) expect(l.he.text).toBe(d.layer.concept(l.id)!.canonicalHe);
    }
  });

  it("gives each entry its gloss, definition and count", () => {
    const c = d.layer.concepts.find((x) => x.label.en !== "" && x.definition.en !== "")!;
    const l = lines("en").find((x) => x.id === c.id)!;
    expect(l.gloss?.text).toBe(c.label.en);
    expect(l.definition?.text).toBe(c.definition.en);
    expect(l.countText).toMatch(new RegExp(`^${c.count} shiur`));
  });

  it("links a term with a page, lists the shiurim of a term below five, and links a merged concept to its topic", () => {
    const merged = d.layer.concepts.filter((c) => c.mergedIntoTopic !== null);
    expect(merged.length).toBeGreaterThan(0);
    for (const l of lines("en")) {
      const c = d.layer.concept(l.id)!;
      if (c.mergedIntoTopic !== null) {
        expect(l.href).toBe(d.layer.hasPage("topic", c.mergedIntoTopic) ? `/en/inyanim/${c.mergedIntoTopic}/` : `/en/inyanim/#${c.mergedIntoTopic}`);
        expect(l.toTopic).toBe(true);
        expect(l.cites).toEqual([]);
      } else if (c.pages.quiet) {
        expect(c.count).toBeGreaterThanOrEqual(5);
        expect(l.href).toBe(`/en/erachim/${c.id}/`);
      } else {
        expect(c.count).toBeLessThan(5);
        expect(l.href).toBeNull();
        if (!c.passim) expect(l.cites.map((x) => x.shiurId)).toEqual(c.shiurIds);
      }
    }
  });

  it("says 'throughout' for a passim term instead of a list", () => {
    const passim = d.layer.concepts.filter((c) => c.passim);
    expect(passim.length).toBeGreaterThan(0);
    for (const c of passim) {
      const l = lines("yi").find((x) => x.id === c.id)!;
      expect(l.throughout).toBe(true);
      expect(l.cites).toEqual([]);
      const page = conceptPage(d, "yi", c);
      expect(page.shiurim).toEqual([]);
      expect(page.throughoutText.startsWith(corpusLabel("throughout", "yi"))).toBe(true);
    }
  });
});

describe("glossary entry pages", () => {
  it("exist for terms in five or more shiurim only, never for one merged into a topic", () => {
    const ids = conceptPageIds(d);
    expect(ids.sort()).toEqual(d.layer.concepts.filter((c) => c.pages.quiet).map((c) => c.id).sort());
    for (const id of ids) {
      const c = d.layer.concept(id)!;
      expect(c.count).toBeGreaterThanOrEqual(5);
      expect(c.mergedIntoTopic).toBeNull();
    }
  });

  it("list exampleRefs as section time links, then the shiurim", () => {
    const c = d.layer.concepts.find((x) => x.exampleRefs.length > 0 && !x.passim) ?? d.layer.concepts.find((x) => x.exampleRefs.length > 0)!;
    const page = conceptPage(d, "en", c);
    expect(page.examples.length).toBe(new Set(c.exampleRefs.map((r) => `${r.shiurId}~s${r.sectionIndex}`)).size);
    for (const [i, x] of page.examples.entries()) {
      const r = c.exampleRefs[i]!;
      expect(x.href).toBe(`/en/shiur/${r.shiurId}/#s${r.sectionIndex}`);
      expect(x.time).toMatch(/^\d+:\d\d(?::\d\d)?$/);
      expect(x.title.text).not.toBe("");
    }
    const plain: LayerConcept = { ...c, passim: false };
    expect(conceptPage(d, "en", plain).shiurim.map((s) => s.shiurId)).toEqual(c.shiurIds);
  });
});

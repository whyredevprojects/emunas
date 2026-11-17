/**
 * The shared helpers of the corpus-entry indexes: sort forms, jump letters, the alphabetical order,
 * letter blocks, catalog citations and the outbound Sefaria link.
 */
import type { IndexRow } from "@emunas/corpus/public";
import { describe, expect, it } from "vitest";
import { byLetter, citeFromRow, compareNames, letterOf, run, sefariaHref, shiurHref, sortForm } from "../model.ts";

describe("helpers", () => {
  it("sortForm drops articles, marks and leading quote marks", () => {
    expect(sortForm("the Chasam Sofer")).toBe("Chasam Sofer");
    expect(sortForm("\"Reb\" Zusha")).toBe("Reb\" Zusha");
    expect(sortForm("בְּרֵאשִׁית")).toBe("בראשית");
  });

  it("letterOf maps final forms and non-letters", () => {
    expect(letterOf("ךמא")).toBe("כ");
    expect(letterOf("élan")).toBe("E");
    expect(letterOf("1st")).toBe("#");
  });

  it("compareNames puts the edition's script first, and is total and stable on ties", () => {
    const a = { name: run("Alpha", "en"), key: "a" };
    const b = { name: run("alpha", "en"), key: "b" };
    const h = { name: run("אלף", "yi"), key: "h" };
    expect([b, h, a].sort(compareNames("en")).map((x) => x.key)).toEqual(["a", "b", "h"]);
    expect([b, h, a].sort(compareNames("yi")).map((x) => x.key)).toEqual(["h", "a", "b"]);
  });

  it("byLetter groups consecutive runs with stable anchors", () => {
    const blocks = byLetter([{ letter: "א" }, { letter: "א" }, { letter: "ב" }]);
    expect(blocks.map((b) => [b.letter, b.id, b.items.length])).toEqual([
      ["א", "letter-1", 2],
      ["ב", "letter-2", 1],
    ]);
  });

  it("citeFromRow cites the catalog's occasion, number and years, at the moment", () => {
    const row = {
      id: "yi-a-01",
      lang: "yi",
      catalog: { sectionTitle: "פרשת השבוע", n: "5" },
      parsha: { raw: "נח", key: "noach" },
      zman: null,
      years: [5743],
    } as unknown as IndexRow;
    expect(citeFromRow(row, "en", 90)).toEqual({
      shiurId: "yi-a-01",
      href: "/en/shiur/yi-a-01/#t=90",
      occasion: { text: "נח", lang: "yi", dir: "rtl" },
      n: "5",
      years: [5743],
      lang: "yi",
      t: 90,
    });
    expect(citeFromRow(row, "yi", null, "/yi/x/").href).toBe("/yi/x/");
    expect(shiurHref("yi", "yi-a-01", 61.5)).toBe("/yi/shiur/yi-a-01/#t=61.5");
    expect(shiurHref("yi", "yi-a-01", null)).toBe("/yi/shiur/yi-a-01/");
  });

  it("sefariaHref encodes the ref as one path segment", () => {
    expect(sefariaHref(" Berakhot 5a ")).toBe("https://www.sefaria.org/Berakhot%205a");
  });
});

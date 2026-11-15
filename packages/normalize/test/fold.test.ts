import { describe, expect, it } from "vitest";
import { VARIANTS } from "../src/tables/variants.ts";
import { fold, foldBasic, foldBasicTokens, foldTokens, normalizeHe } from "../src/fold.ts";

const GERSHAYIM = String.fromCodePoint(0x05f4);
const GERESH = String.fromCodePoint(0x05f3);
const MAQAF = String.fromCodePoint(0x05be);
const RDQ = String.fromCodePoint(0x201d); // ”
const LDQ = String.fromCodePoint(0x201c); // “
const RSQ = String.fromCodePoint(0x2019); // ’

describe("normalizeHe", () => {
  it("strips nikud and cantillation (U+0591–U+05C7)", () => {
    expect(normalizeHe("בְּרֵאשִׁ֖ית")).toBe("בראשית");
    expect(normalizeHe("שָׁל֑וֹם")).toBe("שלום");
  });

  it("unifies double and single quote marks", () => {
    expect(normalizeHe(`ל${GERSHAYIM}ג`)).toBe('ל"ג');
    expect(normalizeHe(`ל${RDQ}ג`)).toBe('ל"ג');
    expect(normalizeHe(`ל${LDQ}ג`)).toBe('ל"ג');
    expect(normalizeHe(`ה${GERESH}`)).toBe("ה'");
    expect(normalizeHe(`ה${RSQ}`)).toBe("ה'");
  });

  it("turns maqaf into a hyphen instead of deleting it", () => {
    expect(normalizeHe(`בהר${MAQAF}בחקתי`)).toBe("בהר-בחקתי");
  });

  it("decomposes Hebrew presentation forms", () => {
    expect(normalizeHe(String.fromCodePoint(0xfb2a))).toBe("ש"); // שׁ
    expect(normalizeHe(String.fromCodePoint(0xfb31))).toBe("ב"); // בּ
  });

  it("collapses whitespace, trims and is NFC", () => {
    expect(normalizeHe("  a \t b\n")).toBe("a b");
    const e = "é";
    expect(normalizeHe(e)).toBe("é");
    expect(normalizeHe("")).toBe("");
  });

  it("does not change case or Latin letters", () => {
    expect(normalizeHe("Ba'al Shem Tov")).toBe("Ba'al Shem Tov");
  });
});

describe("foldBasic", () => {
  it("removes quotes and geresh, lowercases Latin, hyphens to spaces", () => {
    expect(foldBasic('ל"ג בעומר')).toBe("לג בעומר");
    expect(foldBasic("Ba'al HaTurim")).toBe("baal haturim");
    expect(foldBasic("Lech-Lecha")).toBe("lech lecha");
    expect(foldBasic(`בהר${MAQAF}בחקתי`)).toBe("בהר בחקתי");
  });

  it("strips Latin diacritics", () => {
    expect(foldBasic("Ḥanukkah")).toBe("hanukkah");
    expect(foldBasic("Café")).toBe("cafe");
  });

  it("expands Yiddish ligatures", () => {
    expect(foldBasic(String.fromCodePoint(0x05f2))).toBe("יי");
    expect(foldBasic(String.fromCodePoint(0x05f0))).toBe("וו");
  });

  it("tokenizes", () => {
    expect(foldBasicTokens("  Rosh  Hashanah! ")).toEqual(["rosh", "hashanah"]);
    expect(foldBasicTokens("")).toEqual([]);
  });
});

describe("fold (search folding)", () => {
  it('ל"ג בעומר, ל”ג בעומר, ל״ג בעומר and lag baomer fold equal', () => {
    const forms = ['ל"ג בעומר', `ל${RDQ}ג בעומר`, `ל${GERSHAYIM}ג בעומר`, "lag baomer", "Lag BaOmer", "Lag B'Omer", "לג בעומר"];
    const folded = new Set(forms.map(fold));
    expect(folded.size).toBe(1);
    expect([...folded][0]).toBe("לג בעומר");
  });

  it("folds transliteration variants", () => {
    expect(fold("Chanukah")).toBe(fold("Hanukkah"));
    expect(fold("chanuka")).toBe(fold("חנוכה"));
    expect(fold("Shabbat")).toBe(fold("Shabbos"));
    expect(fold("Sukkot")).toBe(fold("Succos"));
    expect(fold("Yom Kippur")).toBe(fold('יו"כ'));
    expect(fold("yom kippur")).toBe(fold("יום הכיפורים"));
    expect(fold("Toldot")).toBe(fold("Toldos"));
  });

  it("matches multi-word variants inside longer text", () => {
    expect(foldTokens("the Rebbe on Lag BaOmer night")).toEqual(["the", "rebbe", "on", "לג", "בעומר", "night"]);
  });

  it("leaves unknown words alone", () => {
    expect(fold("Emunas Itecha")).toBe("emunas itecha");
  });

  it("variant table: every variant maps to exactly one canonical form", () => {
    const seen = new Map<string, string>();
    for (const row of VARIANTS) {
      const c = foldBasic(row.canonical);
      for (const v of row.variants) {
        const f = foldBasic(v);
        const prev = seen.get(f);
        if (prev !== undefined) expect(prev, v).toBe(c);
        seen.set(f, c);
      }
    }
  });

  it("is idempotent", () => {
    for (const s of ["Lag BaOmer", "Chanukah", 'ל"ג בעומר', "Rosh Hashana", "Ba'al Shem Tov"]) {
      expect(fold(fold(s))).toBe(fold(s));
    }
  });
});

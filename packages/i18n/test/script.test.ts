import { describe, expect, it } from "vitest";
import { UI_LANGS, firstStrongDir, hebrewScriptLang, isolate, langFor, scriptOf, stripBidiControls } from "../src/index.ts";

describe("scriptOf", () => {
  it("handles the mixed catalog title from the brief", () => {
    expect(scriptOf("The קדושה of צדיקים")).toBe("mixed");
    expect(scriptOf("The קדושה of צדיקים and the חשיבות of Learning תורה")).toBe("mixed");
    expect(scriptOf("המקוה והתיבה הם כמו embassy של שמים על הארץ")).toBe("mixed");
  });

  it("classifies single-script text", () => {
    expect(scriptOf("פרשת נח")).toBe("he");
    expect(scriptOf("װאָס ײדיש ױ")).toBe("he");
    expect(scriptOf("בְּרֵאשִׁ֖ית")).toBe("he");
    expect(scriptOf("שׁ")).toBe("he"); // U+FB2A presentation form
    expect(scriptOf("The Mashgiach on Chanukah")).toBe("latin");
    expect(scriptOf("Ḥasidut")).toBe("latin");
  });

  it("ignores digits, punctuation and quotes", () => {
    expect(scriptOf('תשמ"ג (1982–83)')).toBe("he");
    expect(scriptOf("Bereishis 6:9")).toBe("latin");
    expect(scriptOf("1:19:05")).toBe("latin");
    expect(scriptOf("")).toBe("latin");
  });
});

describe("firstStrongDir", () => {
  it("follows the first strong character like dir=auto", () => {
    expect(firstStrongDir("The קדושה of צדיקים")).toBe("ltr");
    expect(firstStrongDir("המקוה והתיבה הם כמו embassy של שמים על הארץ")).toBe("rtl");
    expect(firstStrongDir('"1982" תשמ"ג')).toBe("rtl");
    expect(firstStrongDir("12:30")).toBeNull();
  });
});

describe("langFor", () => {
  it("gives lang/dir for mixed titles", () => {
    expect(langFor("The קדושה of צדיקים", "en", "en")).toEqual({ lang: "en", dir: "ltr", script: "mixed" });
    expect(langFor("The קדושה of צדיקים", "yi", "yi")).toEqual({ lang: "en", dir: "ltr", script: "mixed" });
    expect(langFor("המקוה והתיבה הם כמו embassy של שמים על הארץ", "yi", "yi")).toEqual({
      lang: "yi",
      dir: "rtl",
      script: "mixed",
    });
    expect(langFor("המקוה והתיבה הם כמו embassy של שמים על הארץ", "yi", "he")).toEqual({
      lang: "he",
      dir: "rtl",
      script: "mixed",
    });
  });

  it("uses the shiur language to tell Yiddish from Hebrew in Hebrew script", () => {
    expect(langFor("ענין חנוכה", "yi", "yi")).toEqual({ lang: "yi", dir: "rtl", script: "he" });
    expect(langFor("ענין חנוכה", "yi", "en")).toEqual({ lang: "yi", dir: "rtl", script: "he" });
    expect(langFor("צדיקים", "en", "yi")).toEqual({ lang: "he", dir: "rtl", script: "he" });
    expect(langFor("The Mashgiach on Chanukah", "yi", "yi")).toEqual({ lang: "en", dir: "ltr", script: "latin" });
  });

  it("reads Hebrew-script text as Hebrew in the Hebrew edition", () => {
    expect(langFor("ענין חנוכה", "yi", "he")).toEqual({ lang: "he", dir: "rtl", script: "he" });
    expect(langFor("צדיקים", null, "he")).toEqual({ lang: "he", dir: "rtl", script: "he" });
    expect(langFor("The Mashgiach on Chanukah", "yi", "he")).toEqual({ lang: "en", dir: "ltr", script: "latin" });
  });

  it("follows the edition for strings that belong to no one shiur", () => {
    expect(langFor("ענין חנוכה", null, "yi").lang).toBe("yi");
    expect(langFor("ענין חנוכה", null, "en").lang).toBe("he");
  });
});

describe("hebrewScriptLang", () => {
  it("is he in the Hebrew edition, otherwise yi only in a Yiddish context", () => {
    const rows = (["yi", "en", null] as const).flatMap((shiur) =>
      UI_LANGS.map((ed) => `${shiur ?? "-"}/${ed} → ${hebrewScriptLang(shiur, ed)}`),
    );
    expect(rows).toEqual([
      "yi/en → yi",
      "yi/yi → yi",
      "yi/he → he",
      "en/en → he",
      "en/yi → he",
      "en/he → he",
      "-/en → he",
      "-/yi → yi",
      "-/he → he",
    ]);
  });
});

describe("isolate", () => {
  it("wraps with isolate controls and strips them again", () => {
    expect(isolate("The קדושה of צדיקים")).toBe("⁨The קדושה of צדיקים⁩");
    expect(isolate("1:19:05", "ltr")).toBe("⁦1:19:05⁩");
    expect(isolate("נח", "rtl")).toBe("⁧נח⁩");
    expect(stripBidiControls(isolate("x‏y", "rtl"))).toBe("xy");
  });
});

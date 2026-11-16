import { describe, expect, it } from "vitest";
import { firstStrongDir, isolate, langFor, scriptOf, stripBidiControls } from "../src/index.ts";

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
    expect(langFor("The קדושה of צדיקים", "en")).toEqual({ lang: "en", dir: "ltr", script: "mixed" });
    expect(langFor("The קדושה of צדיקים", "yi")).toEqual({ lang: "en", dir: "ltr", script: "mixed" });
    expect(langFor("המקוה והתיבה הם כמו embassy של שמים על הארץ", "yi")).toEqual({
      lang: "yi",
      dir: "rtl",
      script: "mixed",
    });
  });

  it("uses the shiur language to tell Yiddish from Hebrew in Hebrew script", () => {
    expect(langFor("ענין חנוכה", "yi")).toEqual({ lang: "yi", dir: "rtl", script: "he" });
    expect(langFor("צדיקים", "en")).toEqual({ lang: "he", dir: "rtl", script: "he" });
    expect(langFor("The Mashgiach on Chanukah", "yi")).toEqual({ lang: "en", dir: "ltr", script: "latin" });
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

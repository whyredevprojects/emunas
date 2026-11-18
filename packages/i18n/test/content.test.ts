import { describe, expect, expectTypeOf, it } from "vitest";
import type { TranslationLang } from "../../../src/types.ts";
import {
  CONTENT_FALLBACK,
  SOURCE_LANGS,
  UI_DIR,
  UI_ENDONYM,
  UI_LANGS,
  UI_LOCALE,
  byUiLang,
  hasContent,
  isUiLang,
  otherUiLangs,
  pickLocalized,
  pickText,
  type Localized,
  type LocalizedText,
  type SourceLang,
  type TranslatedLang,
  type UiLang,
} from "../src/index.ts";

describe("the language list", () => {
  it("has en, yi and he, with dir and locale for each", () => {
    expect(UI_LANGS).toEqual(["en", "yi", "he"]);
    expect(UI_DIR).toEqual({ en: "ltr", yi: "rtl", he: "rtl" });
    expect(UI_LOCALE.he).toBe("he");
    expect(UI_ENDONYM.he).toBe("עברית");
    expectTypeOf<UiLang>().toEqualTypeOf<"en" | "yi" | "he">();
  });

  it("recognises exactly the listed languages", () => {
    for (const lang of UI_LANGS) expect(isUiLang(lang)).toBe(true);
    for (const v of ["fr", "", "EN", null, undefined, 3, "toString"]) expect(isUiLang(v)).toBe(false);
  });

  it("lists the other languages and builds per-language records", () => {
    expect(otherUiLangs("he")).toEqual(["en", "yi"]);
    expect(otherUiLangs("en")).toEqual(["yi", "he"]);
    expect(byUiLang((l) => l.toUpperCase())).toEqual({ en: "EN", yi: "YI", he: "HE" });
  });

  it("translated languages are the pipeline's translation languages (src/types.ts)", () => {
    expectTypeOf<SourceLang>().toEqualTypeOf<"en" | "yi">();
    expectTypeOf<TranslatedLang>().toEqualTypeOf<TranslationLang>();
    expect(SOURCE_LANGS).toEqual(["en", "yi"]);
  });
});

describe("CONTENT_FALLBACK", () => {
  it("starts with the reader's language and ends in a source language", () => {
    for (const lang of UI_LANGS) {
      const chain = CONTENT_FALLBACK[lang];
      expect(chain[0]).toBe(lang);
      expect(SOURCE_LANGS).toContain(chain[chain.length - 1]);
      expect(new Set(chain).size).toBe(chain.length);
      // every source language is reachable, so a LocalizedText always yields a text
      for (const source of SOURCE_LANGS) expect(chain).toContain(source);
    }
  });

  it("is he → yi → en, yi → en, en → yi", () => {
    expect(CONTENT_FALLBACK).toEqual({ en: ["en", "yi"], yi: ["yi", "en"], he: ["he", "yi", "en"] });
  });
});

describe("pickText", () => {
  const translated: LocalizedText = { en: "The Mashgiach", yi: "דער משגיח", he: "המשגיח" };
  const untranslated: LocalizedText = { en: "The Mashgiach", yi: "דער משגיח" };

  it("shows the reader's language when present", () => {
    expect(pickText(translated, "he")).toEqual({ text: "המשגיח", lang: "he", dir: "rtl", fallback: false });
    expect(pickText(translated, "yi")).toEqual({ text: "דער משגיח", lang: "yi", dir: "rtl", fallback: false });
    expect(pickText(translated, "en")).toEqual({ text: "The Mashgiach", lang: "en", dir: "ltr", fallback: false });
  });

  it("falls back along the chain and reports the language actually shown", () => {
    expect(pickText(untranslated, "he")).toEqual({ text: "דער משגיח", lang: "yi", dir: "rtl", fallback: true });
    expect(pickText({ en: "Only English", yi: "" }, "he")).toEqual({ text: "Only English", lang: "en", dir: "ltr", fallback: true });
    expect(pickText({ en: "", yi: "נאר אידיש" }, "en")).toEqual({ text: "נאר אידיש", lang: "yi", dir: "rtl", fallback: true });
    expect(pickText({ en: "x", yi: "y", he: "  " }, "he").lang).toBe("yi");
  });

  it("returns the last source language when every text is blank", () => {
    expect(pickText({ en: "", yi: "" }, "he")).toEqual({ text: "", lang: "en", dir: "ltr", fallback: true });
    expect(pickText({ en: "", yi: "" }, "en")).toEqual({ text: "", lang: "yi", dir: "rtl", fallback: true });
  });

  it("types: en and yi are required, he is optional", () => {
    expectTypeOf<{ en: string; yi: string }>().toMatchTypeOf<LocalizedText>();
    // @ts-expect-error -- yi is required
    const missingYi: LocalizedText = { en: "x" };
    expect(missingYi.en).toBe("x");
    expectTypeOf<LocalizedText["he"]>().toEqualTypeOf<string | undefined>();
  });
});

describe("pickLocalized", () => {
  type Block = { heading: string };
  const blocks: Localized<Block[]> = { en: [{ heading: "A" }], yi: [{ heading: "א" }] };

  it("picks any per-language value along the chain", () => {
    expect(pickLocalized(blocks, "he")).toEqual({ value: [{ heading: "א" }], lang: "yi", dir: "rtl", fallback: true });
    expect(pickLocalized({ ...blocks, he: [{ heading: "ע" }] }, "he")?.lang).toBe("he");
    expect(pickLocalized({ ...blocks, he: [] }, "he")?.lang).toBe("yi");
    expect(pickLocalized({ en: [{ heading: "A" }] }, "he")?.lang).toBe("en");
  });

  it("returns null when nothing is present, and takes a custom presence test", () => {
    expect(pickLocalized(null, "he")).toBeNull();
    expect(pickLocalized({}, "en")).toBeNull();
    expect(pickLocalized({ en: [], yi: [] }, "yi")).toBeNull();
    expect(pickLocalized({ en: 0, yi: 5 }, "en", (n) => n > 0)?.value).toBe(5);
  });

  it("hasContent treats null, blank strings and empty arrays as missing", () => {
    expect([undefined, null, "", "  ", []].map(hasContent)).toEqual([false, false, false, false, false]);
    expect(["x", [1], 0, false, {}].map(hasContent)).toEqual([true, true, true, true, true]);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Text, textAttrs } from "./Text.tsx";

describe("<Text>", () => {
  it("isolates a mixed-script catalog title by its first strong character", () => {
    expect(renderToStaticMarkup(<Text value="The קדושה of צדיקים" shiurLang="en" />)).toBe(
      '<bdi lang="en" dir="ltr">The קדושה of צדיקים</bdi>',
    );
    expect(renderToStaticMarkup(<Text value="המקוה והתיבה הם כמו embassy של שמים" shiurLang="yi" />)).toBe(
      '<bdi lang="yi" dir="rtl">המקוה והתיבה הם כמו embassy של שמים</bdi>',
    );
  });

  it("marks Hebrew-script catalog text he in an English shiur and yi in a Yiddish one", () => {
    expect(textAttrs({ value: "נח", shiurLang: "en" }, "en")).toEqual({ text: "נח", lang: "he", dir: "rtl" });
    expect(textAttrs({ value: "נח", shiurLang: "yi" }, "en")).toEqual({ text: "נח", lang: "yi", dir: "rtl" });
  });

  it("marks Hebrew-script catalog text he in the Hebrew edition, even in a Yiddish shiur", () => {
    expect(textAttrs({ value: "נח", shiurLang: "yi" }, "he")).toEqual({ text: "נח", lang: "he", dir: "rtl" });
    expect(renderToStaticMarkup(<Text value="נח" shiurLang="yi" edition="he" />)).toBe('<bdi lang="he" dir="rtl">נח</bdi>');
  });

  it("follows the edition for strings that belong to no one shiur", () => {
    expect(textAttrs({ value: "חנוכה", shiurLang: null }, "yi").lang).toBe("yi");
    expect(textAttrs({ value: "חנוכה", shiurLang: null }, "en").lang).toBe("he");
    expect(textAttrs({ value: "חנוכה", shiurLang: null }, "he").lang).toBe("he");
  });

  it("uses the known language of generated text, whatever its first character", () => {
    expect(renderToStaticMarkup(<Text value="קדושה is the theme" lang="en" as="p" />)).toBe(
      '<p lang="en" dir="ltr">קדושה is the theme</p>',
    );
  });

  it("picks one language from a LocalizedText value", () => {
    const l = { en: "Opening", yi: "הקדמה" };
    expect(renderToStaticMarkup(<Text value={l} lang="yi" as="h2" className="x" />)).toBe(
      '<h2 lang="yi" dir="rtl" class="x">הקדמה</h2>',
    );
  });

  it("shows the Hebrew translation when there is one, and otherwise falls back with the shown text's lang", () => {
    const translated = { en: "Opening", yi: "הקדמה", he: "פתיחה" };
    expect(renderToStaticMarkup(<Text value={translated} lang="he" />)).toBe('<bdi lang="he" dir="rtl">פתיחה</bdi>');
    const untranslated = { en: "Opening", yi: "הקדמה" };
    expect(renderToStaticMarkup(<Text value={untranslated} lang="he" />)).toBe('<bdi lang="yi" dir="rtl">הקדמה</bdi>');
    const englishOnly = { en: "Opening", yi: "" };
    expect(renderToStaticMarkup(<Text value={englishOnly} lang="he" />)).toBe('<bdi lang="en" dir="ltr">Opening</bdi>');
  });

  it("shows a ReaderText (picked at build time) with the language it is in, not the reader's", () => {
    expect(renderToStaticMarkup(<Text value={{ lang: "yi", text: "הקדמה" }} lang="he" as="p" />)).toBe('<p lang="yi" dir="rtl">הקדמה</p>');
    expect(renderToStaticMarkup(<Text value={{ lang: "en", text: "Opening" }} lang="he" />)).toBe('<bdi lang="en" dir="ltr">Opening</bdi>');
  });

  it("never alters the text", () => {
    const s = 'ל”ג בעומר — תשל"ו';
    expect(textAttrs({ value: s, shiurLang: "yi" }, "yi").text).toBe(s);
  });
});

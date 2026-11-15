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
    expect(textAttrs({ value: "נח", shiurLang: "en" })).toEqual({ text: "נח", lang: "he", dir: "rtl" });
    expect(textAttrs({ value: "נח", shiurLang: "yi" })).toEqual({ text: "נח", lang: "yi", dir: "rtl" });
  });

  it("uses the known language of generated text, whatever its first character", () => {
    expect(renderToStaticMarkup(<Text value="קדושה is the theme" lang="en" as="p" />)).toBe(
      '<p lang="en" dir="ltr">קדושה is the theme</p>',
    );
  });

  it("picks one language from an L value", () => {
    const l = { en: "Opening", yi: "הקדמה" };
    expect(renderToStaticMarkup(<Text value={l} lang="yi" as="h2" className="x" />)).toBe(
      '<h2 lang="yi" dir="rtl" class="x">הקדמה</h2>',
    );
  });

  it("never alters the text", () => {
    const s = 'ל”ג בעומר — תשל"ו';
    expect(textAttrs({ value: s, shiurLang: "yi" }).text).toBe(s);
  });
});

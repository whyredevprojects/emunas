import { describe, expect, expectTypeOf, it } from "vitest";
import type { Lang, SectionKind as PipelineSectionKind, Shiur, SourceMention } from "../../../src/types.ts";
import {
  AI_LABEL,
  AI_LABEL_STATUS,
  AUDIO_LANGUAGE_LABELS,
  CATEGORY_LABELS,
  LANGUAGE_NAMES,
  NOTICES,
  RESOLUTION_LABELS,
  SECTION_KIND_LABELS,
  UI_LANGS,
  audioLanguageLabel,
  categoryLabel,
  coverageNotice,
  formatSourceRef,
  languageName,
  notice,
  scriptOf,
  sectionKindLabel,
  sourceRefParts,
  type AudioLang,
  type Category,
  type Resolution,
  type SectionKind,
} from "../src/index.ts";

describe("vocabulary types mirror the pipeline contract (src/types.ts, read-only)", () => {
  it("has the same unions", () => {
    expectTypeOf<Category>().toEqualTypeOf<Shiur["category"]>();
    expectTypeOf<SectionKind>().toEqualTypeOf<PipelineSectionKind>();
    expectTypeOf<Resolution>().toEqualTypeOf<SourceMention["resolution"]>();
    expectTypeOf<AudioLang>().toEqualTypeOf<Lang>();
  });
});

describe("label tables", () => {
  const tables = {
    CATEGORY_LABELS,
    SECTION_KIND_LABELS,
    LANGUAGE_NAMES,
    AUDIO_LANGUAGE_LABELS,
    NOTICES,
    RESOLUTION_LABELS: { inferred: RESOLUTION_LABELS.inferred, unresolved: RESOLUTION_LABELS.unresolved },
  };

  it("are complete, non-empty and in the right script for each language", () => {
    for (const [name, table] of Object.entries(tables)) {
      for (const [key, labels] of Object.entries(table)) {
        for (const lang of UI_LANGS) {
          const value = (labels as Record<string, string>)[lang];
          expect(value, `${name}.${key}.${lang}`).toBeTruthy();
        }
        const en = (labels as Record<string, string>)["en"] ?? "";
        expect(scriptOf(en), `${name}.${key}.en`).toBe("latin");
        for (const lang of ["yi", "he"] as const) {
          const value = (labels as Record<string, string>)[lang] ?? "";
          expect(["he", "mixed"], `${name}.${key}.${lang}`).toContain(scriptOf(value));
        }
      }
    }
  });

  it("uses the agreed wording", () => {
    expect(categoryLabel("parsha", "yi")).toBe("פרשת השבוע");
    expect(sectionKindLabel("story", "en")).toBe("Story");
    expect(audioLanguageLabel("yi", "en")).toBe("Shiur in Yiddish");
    expect(notice("aiNotes", "en")).toBe(
      "Notes prepared by AI from the recording; not reviewed, and not the Mashgiach's words. The recording is the source.",
    );
    expect(notice("notesPending", "en")).toBe("Notes for this shiur have not been prepared yet.");
    expect(RESOLUTION_LABELS.inferred).toEqual({ en: "apparently", yi: "לכאורה", he: "לכאורה" });
    expect(categoryLabel("current", "he")).toBe("ענייני השעה");
    expect(audioLanguageLabel("yi", "he")).toBe("שיעור באידיש");
    expect(languageName("he", "he")).toBe("עברית");
    expect(languageName("he", "en")).toBe("Hebrew");
    expect(notice("notesPending", "he")).toBe("הרשימות לשיעור זה עדיין לא הוכנו.");
  });

  it("has one standing AI label, identical in both sites (W5.3)", () => {
    // Quiet renders aiNotes, Live renders aiNotesShort: both must be the same wording.
    for (const lang of UI_LANGS) {
      expect(notice("aiNotesShort", lang)).toBe(notice("aiNotes", lang));
      expect(notice("aiNotes", lang)).toBe(AI_LABEL[lang]);
    }
    expect(NOTICES.aiNotesShort).toBe(NOTICES.aiNotes);
    // It names the source, the lack of review and that it is not the Mashgiach's words.
    expect(AI_LABEL.en).toMatch(/AI/);
    expect(AI_LABEL.en).toMatch(/not reviewed/);
    expect(AI_LABEL.en).toMatch(/not the Mashgiach's words/);
    expect(AI_LABEL.en).toMatch(/recording is the source/);
    expect(AI_LABEL.yi).toContain("נישט איבערגעקוקט");
    expect(AI_LABEL.yi).toContain("דער מקור איז די רעקארדירונג");
    expect(AI_LABEL.he).toContain("לא נבדקו");
    expect(AI_LABEL.he).toContain("המשגיח");
    expect(AI_LABEL.he).toContain("המקור הוא ההקלטה");
    expect(AI_LABEL_STATUS).toBe("proposed");
  });

  it("writes Yiddish without nikud, YIVO diacritics or ligatures (prompts/yiddish-style.md §1)", () => {
    const pointed = /[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05F0-\u05F2]/u;
    for (const [name, table] of Object.entries(tables)) {
      for (const [key, labels] of Object.entries(table)) {
        expect((labels as Record<string, string>)["yi"], `${name}.${key}.yi`).not.toMatch(pointed);
      }
    }
  });

  it("writes Hebrew without nikud and never calls the Mashgiach הרב or שליט\"א", () => {
    const pointed = /[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/u;
    for (const [name, table] of Object.entries(tables)) {
      for (const [key, labels] of Object.entries(table)) {
        const he = (labels as Record<string, string>)["he"];
        expect(he, `${name}.${key}.he`).not.toMatch(pointed);
        expect(he, `${name}.${key}.he`).not.toMatch(/(^|\s)הרב(\s|$)|שליט"א/);
      }
    }
  });

  it("shows an unknown value as itself instead of throwing", () => {
    expect(categoryLabel("brand-new" as Category, "en")).toBe("brand-new");
    expect(sectionKindLabel("toString" as SectionKind, "yi")).toBe("toString");
  });

  it("formats the coverage line", () => {
    expect(coverageNotice(518, 997, "en")).toBe("Compiled from the 518 shiurim that have notes so far, of 997.");
    expect(coverageNotice(1518, 1997, "yi")).toBe("צוזאמגעשטעלט פון די 1,518 שיעורים וואס האבן שוין נאטיצן, פון 1,997.");
    expect(coverageNotice(1518, 1997, "he")).toBe("לוקט מ־1,518 השיעורים שכבר יש להם רשימות, מתוך 1,997.");
  });
});

describe("source references", () => {
  it("grades by wording", () => {
    const resolved = { work: "Bereishis", ref: "Bereishis 6:9", resolution: "resolved" } as const;
    const inferred = { work: "Tanya", ref: "Tanya ch. 2", resolution: "inferred" } as const;
    const unresolved = { work: "Zohar", ref: null, resolution: "unresolved" } as const;
    const nothing = { work: null, ref: null, resolution: "unresolved" } as const;

    expect(formatSourceRef(resolved, "en")).toBe("Bereishis 6:9");
    expect(formatSourceRef(inferred, "en")).toBe("apparently Tanya ch. 2");
    expect(formatSourceRef(inferred, "yi")).toBe("לכאורה Tanya ch. 2");
    expect(formatSourceRef(unresolved, "en")).toBe("Zohar (place not identified)");
    expect(formatSourceRef(unresolved, "yi")).toBe("Zohar (מקום נישט באשטימט)");
    expect(formatSourceRef(nothing, "en")).toBeNull();
    expect(formatSourceRef(unresolved, "he")).toBe("Zohar (המקום לא זוהה)");
    expect(formatSourceRef(inferred, "he")).toBe("לכאורה Tanya ch. 2");
    expect(sourceRefParts(inferred, "yi")).toEqual({ text: "Tanya ch. 2", qualifier: "לכאורה", position: "before" });
  });

  it("falls back to the work when an inferred source has no ref", () => {
    expect(formatSourceRef({ work: "Zohar", ref: null, resolution: "inferred" }, "en")).toBe(
      "Zohar (place not identified)",
    );
  });
});

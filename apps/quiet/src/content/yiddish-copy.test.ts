/**
 * Yiddish UI copy rules for the Quiet site (W5.3 copy pass; prompts/yiddish-style.md and the
 * glossary in docs/sites/copy-review.md). Checks every Yiddish string table of the site, so a later
 * edit cannot bring back YIVO spelling, a dropped term or a wrong form without a deliberate change
 * here. Wording itself is reviewed by a person; this only guards the decisions already made.
 */
import { describe, expect, it } from "vitest";
import { findMetaComments } from "@emunas/corpus-guard";
import { CORPUS_LABELS, NOTICES, SECTION_KIND_LABELS } from "@emunas/i18n";
import { calendarEn, calendarYi } from "../components/calendar/strings.ts";
import { catalogEn, catalogYi } from "../components/catalog/strings.ts";
import { indexesEn, indexesYi } from "../components/indexes/strings.ts";
import { followTextEn, followTextYi } from "../components/shiur/follow-text-strings.ts";
import { shiurEn, shiurYi } from "../components/shiur/strings.ts";
import { corpusEn } from "../components/corpus/strings.ts";
import { storiesEn } from "../components/stories/strings.ts";
import { topicsEn } from "../components/topics/strings.ts";
import { tables as ui } from "../i18n/index.ts";
import { AI_LABEL, corpusLabelsEn } from "@emunas/i18n";
import { ABOUT_STRINGS } from "../pages/[ed]/about/_strings.ts";
import { SEARCH_STRINGS } from "../pages/[ed]/search/_strings.ts";

/** Every Yiddish string table of the site, with its English counterpart. */
const PAIRS: Record<string, { en: object; yi: object }> = {
  i18n: ui,
  catalog: { en: catalogEn, yi: catalogYi },
  shiur: { en: shiurEn, yi: shiurYi },
  followText: { en: followTextEn, yi: followTextYi },
  indexes: { en: indexesEn, yi: indexesYi },
  calendar: { en: calendarEn, yi: calendarYi },
  search: SEARCH_STRINGS,
  about: ABOUT_STRINGS,
};

/** Every string of a table, plural forms and nested records included. */
function strings(value: unknown, path: string): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  }
  return [];
}

const ALL = Object.entries(PAIRS).flatMap(([name, pair]) => strings(pair.yi, name));

/** The `{name}` placeholders of a key, over all its plural forms. */
const placeholders = (value: unknown): string[] =>
  [...new Set(strings(value, "").flatMap(([, s]) => s.match(/\{\w+\}/g) ?? []))].sort();

/** A Hebrew-letter word boundary (`\b` does not work for Hebrew letters). */
const word = (w: string) => new RegExp(`(?<![\\u05D0-\\u05EA])${w}(?![\\u05D0-\\u05EA])`, "u");

/** [rule, pattern, why] — kept in step with apps/live/app/content/yiddish-copy.test.ts. */
const BANNED: [string, RegExp][] = [
  ["nikud, YIVO diacritics or ligatures", /[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05F0-\u05F2]/u],
  ["ניט (write נישט)", word("ניט")],
  ["עטוואס (write עפעס)", word("עטוואס")],
  ["ווירקליך (write טאקע / באמת)", word("ווירקליך")],
  ["בעזאנדערס (write בפרט)", word("בעזאנדערס")],
  ["בלעטערער (write בראוזער)", word("בלעטערער")],
  ["אויפן נעץ (write אויפן אינטערנעט)", /אויפן נעץ/u],
  ["אינהאלט (write תוכן / טעקסט)", word("אינהאלט")],
  ["טעקע (write פייל)", /טעקע/u],
  ["סעריע (series = סדרה)", /סעריע/u],
  ["קאפיטל (section = חלק)", /קאפיטל/u],
  ["רגע (moment = מאמענט)", /(?<![\u05D0-\u05EA])רגע(ים)?(?![\u05D0-\u05EA])/u],
  ["אנגעפירט (cited = געברענגט)", /אנגעפירט/u],
  ["מראה מקומות (write מראי מקומות)", /מראה מקומות/u],
  ["לאדנט (write לאדט)", /לאדנט/u],
  ["איצט (write יעצט)", word("איצט")],
  ["שמות as the people index (people = פערזאנען)", /^שמות$/u],
  ["מענטשן as people (people = פערזאנען)", /^מענטשן$/u],
  ["שאלה as a question kind (question = קשיא)", /(?<![\u05D0-\u05EA])שאל(ה|ות)(?![\u05D0-\u05EA])/u],
  ["חידוש as an insight kind (insight = געדאנק)", /(?<![\u05D0-\u05EA])חידוש(ים)?(?![\u05D0-\u05EA])/u],
  ["הויפט פונקט (write הויפט נקודה)", /הויפט פונקט/u],
  ["באשרייבונג (write-up = אויסשרייב)", /באשרייבונג/u],
  ["אנווענדן", word("אנווענדן")],
  ["דעפיניציע (write טייטש)", /דעפיניציע/u],
  ["ענלעך (write ענליך)", /ענלעך/u],
  ["-יק- spellings (write -יג-: ענדיגן, יעצטיגער)", /ענדיק|איצטיק/u],
  ["relative וועלכע after a preposition (write וואו / וואס)", /(?<![\u05D0-\u05EA])(אין|מיט|פון) וועלכע/u],
];

describe("Yiddish UI copy (Quiet)", () => {
  it("reads every table", () => {
    expect(ALL.length).toBeGreaterThan(200);
  });

  for (const [rule, pattern] of BANNED) {
    it(`has no ${rule}`, () => {
      expect(ALL.filter(([, s]) => pattern.test(s)).map(([p, s]) => `${p}: ${s}`)).toEqual([]);
    });
  }

  it("speaks of the Mashgiach as דער משגיח, never as דער רב", () => {
    expect(ALL.filter(([, s]) => /דער רב(?![\u05D0-\u05EA])|דעם רב(?![\u05D0-\u05EA])/u.test(s))).toEqual([]);
    expect(ALL.some(([, s]) => s.includes("דער משגיח"))).toBe(true);
  });

  it("calls him the Mashgiach in English, never the Rav or the Rov", () => {
    const en = [
      ...Object.entries(PAIRS).flatMap(([name, pair]) => strings(pair.en, name)),
      ...strings(corpusEn, "corpus"),
      ...strings(storiesEn, "stories"),
      ...strings(topicsEn, "topics"),
      ...strings(corpusLabelsEn, "corpusLabels"),
      ...strings(AI_LABEL.en, "aiLabel"),
    ];
    expect(en.length).toBeGreaterThan(200);
    expect(en.filter(([, s]) => /\bthe R[ao]v\b(?! of\b)|\bR[ao]v['’]s\b/i.test(s))).toEqual([]);
    expect(en.some(([, s]) => s.includes("the Mashgiach"))).toBe(true);
  });

  it("has the same keys and {placeholders} as English (wording changes only)", () => {
    for (const [name, pair] of Object.entries(PAIRS)) {
      expect(Object.keys(pair.yi).sort(), name).toEqual(Object.keys(pair.en).sort());
      for (const [key, en] of Object.entries(pair.en)) {
        const yiValue: unknown = (pair.yi as Record<string, unknown>)[key];
        expect(placeholders(yiValue), `${name}.${key}`).toEqual(placeholders(en));
      }
    }
  });

  it("never remarks on the audio or the transcript, in either language (the guard's term list)", () => {
    // The follow-text view is designed and OFF (EMUNAS_TRANSCRIPT_VIEW); its strings name what it shows.
    const tables = Object.entries(PAIRS).filter(([name]) => name !== "followText");
    const all = [
      ...tables.flatMap(([name, pair]) => [...strings(pair.en, `${name}.en`), ...strings(pair.yi, `${name}.yi`)]),
      ...strings(corpusEn, "corpus"),
      ...strings(storiesEn, "stories"),
      ...strings(topicsEn, "topics"),
      ...strings(CORPUS_LABELS, "corpusLabels"),
      ...strings(SECTION_KIND_LABELS, "sectionKinds"),
      ...strings(NOTICES, "notices"),
      ...strings(AI_LABEL, "aiLabel"),
    ];
    expect(all.length).toBeGreaterThan(400);
    expect(all.flatMap(([path, s]) => findMetaComments(s).map((h) => `${path}: ${h.term}`))).toEqual([]);
  });
});

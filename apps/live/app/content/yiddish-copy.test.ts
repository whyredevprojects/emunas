/**
 * Yiddish UI copy rules for the Live site (W5.3 copy pass; prompts/yiddish-style.md and the
 * glossary in docs/sites/copy-review.md). Checks every Yiddish string table of the app, so a later
 * edit cannot bring back YIVO spelling, a dropped term or a wrong form without a deliberate change
 * here. Wording itself is reviewed by a person; this only guards the decisions already made.
 */
import { describe, expect, it } from "vitest";
import { findMetaComments } from "@emunas/corpus-guard";
import { CORPUS_LABELS, NOTICES, SECTION_KIND_LABELS } from "@emunas/i18n";
import { offlineEn, offlineYi } from "../../sw/client/strings.ts";
import { searchEn, searchYi } from "../features/command-bar/strings.ts";
import { browseEn, browseYi } from "../features/entities/strings.ts";
import { exploreEn, exploreYi } from "../features/explore/strings.ts";
import { feedbackEn, feedbackYi } from "../features/feedback/strings.ts";
import { roomEn, roomYi } from "../features/listening-room/strings.ts";
import { mixEn, mixYi } from "../features/mix/strings.ts";
import { seriesEn, seriesYi } from "../features/series/strings.ts";
import { shelfEn, shelfYi } from "../features/shelf/strings.ts";
import { todayEn, todayYi } from "../features/today/strings.ts";
import { topicsEn, topicsYi } from "../features/topics/strings.ts";
import { maasiosEn } from "../features/maasios/strings.ts";
import { threadsEn } from "../features/threads/strings.ts";
import { transcriptEn, transcriptYi } from "../features/transcript/strings.ts";
import { AI_LABEL, corpusLabelsEn } from "@emunas/i18n";
import { UI_TABLES } from "../i18n/index.ts";
import { seoStrings, type SeoStrings } from "../seo/strings.ts";

/** The share-preview sentences, rendered with sample values so their wording can be checked. */
function seoSamples(s: SeoStrings): Record<string, string> {
  return {
    shiurim: s.shiurim(2),
    shiurFallback: s.shiurFallback("yi", "{section}", "{years}"),
    series: s.series("{title}", "{count}"),
    occasion: s.occasion("{title}", "{count}"),
    work: s.work("{title}", "{count}"),
    person: s.person("{name}", "{count}"),
    concept: s.concept("{term}", "{count}"),
    topic: s.topic("{title}", "{count}"),
    story: s.story("{title}", 2),
    thread: s.thread("{count}"),
  };
}

/** Every Yiddish string table of the app, with its English counterpart. */
const PAIRS: Record<string, { en: object; yi: object }> = {
  i18n: UI_TABLES,
  search: { en: searchEn, yi: searchYi },
  browse: { en: browseEn, yi: browseYi },
  explore: { en: exploreEn, yi: exploreYi },
  feedback: { en: feedbackEn, yi: feedbackYi },
  room: { en: roomEn, yi: roomYi },
  mix: { en: mixEn, yi: mixYi },
  series: { en: seriesEn, yi: seriesYi },
  shelf: { en: shelfEn, yi: shelfYi },
  today: { en: todayEn, yi: todayYi },
  topics: { en: topicsEn, yi: topicsYi },
  transcript: { en: transcriptEn, yi: transcriptYi },
  offline: { en: offlineEn, yi: offlineYi },
};

/** Every string of a table, plural forms and nested records included. */
function strings(value: unknown, path: string): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  }
  return [];
}

const ALL = [
  ...Object.entries(PAIRS).flatMap(([name, pair]) => strings(pair.yi, name)),
  ...strings(seoSamples(seoStrings.yi), "seo"),
];

/** The `{name}` placeholders of a key, over all its plural forms. */
const placeholders = (value: unknown): string[] =>
  [...new Set(strings(value, "").flatMap(([, s]) => s.match(/\{\w+\}/g) ?? []))].sort();

/** A Hebrew-letter word boundary (`\b` does not work for Hebrew letters). */
const word = (w: string) => new RegExp(`(?<![\\u05D0-\\u05EA])${w}(?![\\u05D0-\\u05EA])`, "u");

/** [rule, pattern, why] — kept in step with apps/quiet/src/content/yiddish-copy.test.ts. */
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

describe("Yiddish UI copy (Live)", () => {
  it("reads every table", () => {
    expect(ALL.length).toBeGreaterThan(200);
  });

  for (const [rule, pattern] of BANNED) {
    it(`has no ${rule}`, () => {
      expect(ALL.filter(([, s]) => pattern.test(s)).map(([p, s]) => `${p}: ${s}`)).toEqual([]);
    });
  }

  it("never speaks of the Mashgiach as דער רב (he is דער משגיח, or by name)", () => {
    expect(ALL.filter(([, s]) => /דער רב(?![\u05D0-\u05EA])|דעם רב(?![\u05D0-\u05EA])/u.test(s))).toEqual([]);
  });

  it("calls him the Mashgiach in English, never the Rav or the Rov", () => {
    const en = [
      ...Object.entries(PAIRS).flatMap(([name, pair]) => strings(pair.en, name)),
      ...strings(seoSamples(seoStrings.en), "seo"),
      ...strings(threadsEn, "threads"),
      ...strings(maasiosEn, "maasios"),
      ...strings(corpusLabelsEn, "corpus"),
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
    // The transcript tab is designed and OFF (TRANSCRIPT_VIEW); its strings name what it shows.
    const tables = Object.entries(PAIRS).filter(([name]) => name !== "transcript");
    const all = [
      ...tables.flatMap(([name, pair]) => [...strings(pair.en, `${name}.en`), ...strings(pair.yi, `${name}.yi`)]),
      ...strings(seoSamples(seoStrings.en), "seo.en"),
      ...strings(seoSamples(seoStrings.yi), "seo.yi"),
      ...strings(threadsEn, "threads"),
      ...strings(maasiosEn, "maasios"),
      ...strings(CORPUS_LABELS, "corpus"),
      ...strings(SECTION_KIND_LABELS, "sectionKinds"),
      ...strings(NOTICES, "notices"),
      ...strings(AI_LABEL, "aiLabel"),
    ];
    expect(all.length).toBeGreaterThan(400);
    expect(all.flatMap(([path, s]) => findMetaComments(s).map((h) => `${path}: ${h.term}`))).toEqual([]);
  });
});

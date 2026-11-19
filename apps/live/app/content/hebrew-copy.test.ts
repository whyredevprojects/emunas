/**
 * Hebrew UI copy rules for the Live site, the counterpart of `yiddish-copy.test.ts`. Checks every
 * Hebrew string table of the app: the same keys and placeholders as English, Hebrew script without
 * nikud, the Mashgiach named as המשגיח (never הרב as a stand-in for him, never שליט"א), and no remark
 * on the transcript or the shiur itself (corpus-guard's Hebrew term list). Wording itself is reviewed
 * by a person; this only guards the decisions already made.
 */
import { describe, expect, it } from "vitest";
import { findMetaComments } from "@emunas/corpus-guard";
import { AI_LABEL, CORPUS_LABELS, NOTICES, SECTION_KIND_LABELS, UI_LANGS, type UiLang } from "@emunas/i18n";
import { searchEn, searchHe } from "../features/command-bar/strings.ts";
import { browseEn, browseHe } from "../features/entities/strings.ts";
import { exploreEn, exploreHe } from "../features/explore/strings.ts";
import { feedbackEn, feedbackHe } from "../features/feedback/strings.ts";
import { roomEn, roomHe } from "../features/listening-room/strings.ts";
import { maasiosEn, maasiosHe } from "../features/maasios/strings.ts";
import { mixEn, mixHe } from "../features/mix/strings.ts";
import { seriesEn, seriesHe } from "../features/series/strings.ts";
import { shelfEn, shelfHe } from "../features/shelf/strings.ts";
import { threadsEn, threadsHe } from "../features/threads/strings.ts";
import { todayEn, todayHe } from "../features/today/strings.ts";
import { topicsEn, topicsHe } from "../features/topics/strings.ts";
import { transcriptEn, transcriptHe } from "../features/transcript/strings.ts";
import { UI_TABLES } from "../i18n/index.ts";
import { RAV_NAME } from "../player-engine/media-session.ts";
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

/** Every Hebrew string table of the app, with its English counterpart. */
const PAIRS: Record<string, { en: object; he: object }> = {
  i18n: UI_TABLES,
  search: { en: searchEn, he: searchHe },
  browse: { en: browseEn, he: browseHe },
  explore: { en: exploreEn, he: exploreHe },
  feedback: { en: feedbackEn, he: feedbackHe },
  room: { en: roomEn, he: roomHe },
  maasios: { en: maasiosEn, he: maasiosHe },
  mix: { en: mixEn, he: mixHe },
  series: { en: seriesEn, he: seriesHe },
  shelf: { en: shelfEn, he: shelfHe },
  threads: { en: threadsEn, he: threadsHe },
  today: { en: todayEn, he: todayHe },
  topics: { en: topicsEn, he: topicsHe },
  transcript: { en: transcriptEn, he: transcriptHe },
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
  ...Object.entries(PAIRS).flatMap(([name, pair]) => strings(pair.he, name)),
  ...strings(seoSamples(seoStrings.he), "seo"),
  ["rav", RAV_NAME.he] as [string, string],
];

/** The `{name}` placeholders of a key, over all its plural forms. */
const placeholders = (value: unknown): string[] =>
  [...new Set(strings(value, "").flatMap(([, s]) => s.match(/\{\w+\}/g) ?? []))].sort();

/** A Hebrew-letter word boundary (`\b` does not work for Hebrew letters). */
const word = (w: string) => new RegExp(`(?<![\\u05D0-\\u05EA])${w}(?![\\u05D0-\\u05EA])`, "u");

describe("Hebrew UI copy (Live)", () => {
  it("reads every table", () => {
    expect(ALL.length).toBeGreaterThan(600);
  });

  it("has a Hebrew table wherever there is an English one, and every interface language has a table", () => {
    expect(Object.keys(UI_TABLES).sort()).toEqual([...UI_LANGS].sort());
    for (const lang of UI_LANGS) expect(UI_TABLES[lang as UiLang], lang).toBeDefined();
  });

  it("has the same keys and {placeholders} as English (wording changes only)", () => {
    for (const [name, pair] of Object.entries(PAIRS)) {
      expect(Object.keys(pair.he).sort(), name).toEqual(Object.keys(pair.en).sort());
      for (const [key, en] of Object.entries(pair.en)) {
        const heValue: unknown = (pair.he as Record<string, unknown>)[key];
        expect(placeholders(heValue), `${name}.${key}`).toEqual(placeholders(en));
      }
    }
  });

  it("is Hebrew script without nikud; AI, MB and placeholders are the only Latin", () => {
    const nikud = /[ְ-ׇֽֿׁׂׅׄ]/u;
    expect(ALL.filter(([, s]) => nikud.test(s))).toEqual([]);
    const latin = ALL.filter(([, s]) => /[A-Za-z]/.test(s.replace(/\{\w+\}/g, "").replace(/\b(AI|MB)\b/g, "")));
    expect(latin).toEqual([]);
  });

  it("names the Mashgiach as המשגיח or in full, never הרב as a stand-in and never שליט\"א", () => {
    expect(ALL.filter(([, s]) => word("הרב").test(s))).toEqual([]);
    expect(ALL.filter(([, s]) => /שליט["״]א/u.test(s))).toEqual([]);
    expect(ALL.some(([, s]) => s.includes("המשגיח"))).toBe(true);
    expect(ALL.filter(([, s]) => s.includes("וולפסון")).every(([, s]) => s.includes('זצ"ל'))).toBe(true);
  });

  it("never remarks on the transcript or the shiur itself (the guard's Hebrew term list)", () => {
    // The transcript tab is designed and OFF (TRANSCRIPT_VIEW); its strings name what it shows.
    const all = [
      ...ALL.filter(([path]) => !path.startsWith("transcript")),
      ...strings(CORPUS_LABELS.he, "corpus"),
      ...strings(SECTION_KIND_LABELS, "sectionKinds"),
      ...strings(NOTICES, "notices"),
      ...strings(AI_LABEL.he, "aiLabel"),
    ];
    expect(all.flatMap(([path, s]) => findMetaComments(s).map((h) => `${path}: ${h.term}`))).toEqual([]);
  });
});

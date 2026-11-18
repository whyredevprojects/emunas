/**
 * Hebrew UI copy rules for the Quiet site (the Hebrew edition). Checks every Hebrew string table of
 * the site against its English counterpart: same keys and placeholders, no nikud, the Mashgiach is
 * "המשגיח" and never "הרב" standing for him, never שליט"א, and no remark on the transcript or the
 * shiur itself. Wording itself is reviewed by a person; this only guards the decisions already made.
 */
import { describe, expect, it } from "vitest";
import { findMetaComments } from "@emunas/corpus-guard";
import { calendarEn, calendarHe } from "../components/calendar/strings.ts";
import { catalogEn, catalogHe } from "../components/catalog/strings.ts";
import { corpusEn, corpusHe } from "../components/corpus/strings.ts";
import { indexesEn, indexesHe } from "../components/indexes/strings.ts";
import { shiurEn, shiurHe } from "../components/shiur/strings.ts";
import { storiesEn, storiesHe } from "../components/stories/strings.ts";
import { topicsEn, topicsHe } from "../components/topics/strings.ts";
import { tables as ui } from "../i18n/index.ts";
import { ABOUT_STRINGS } from "../pages/[ed]/about/_strings.ts";
import { SEARCH_STRINGS } from "../pages/[ed]/search/_strings.ts";

/** Every Hebrew string table of the site, with its English counterpart. */
const PAIRS: Record<string, { en: object; he: object }> = {
  i18n: ui,
  catalog: { en: catalogEn, he: catalogHe },
  shiur: { en: shiurEn, he: shiurHe },
  indexes: { en: indexesEn, he: indexesHe },
  calendar: { en: calendarEn, he: calendarHe },
  corpus: { en: corpusEn, he: corpusHe },
  stories: { en: storiesEn, he: storiesHe },
  topics: { en: topicsEn, he: topicsHe },
  search: SEARCH_STRINGS,
  about: ABOUT_STRINGS,
};

/** Every string of a table, plural forms and nested records included. */
function strings(value: unknown, path: string): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") return [[path, String((value as (n: number) => string)(1))]];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  }
  return [];
}

const ALL = Object.entries(PAIRS).flatMap(([name, pair]) => strings(pair.he, name));

/** The `{name}` placeholders of a key, over all its plural forms. */
const placeholders = (value: unknown): string[] =>
  [...new Set(strings(value, "").flatMap(([, s]) => s.match(/\{\w+\}/g) ?? []))].sort();

describe("Hebrew UI copy (Quiet)", () => {
  it("reads every table", () => {
    expect(ALL.length).toBeGreaterThan(250);
  });

  it("is in Hebrew letters (AI, JavaScript and the year 2012 aside)", () => {
    const latin = ALL.filter(([, s]) => /[A-Za-z]/.test(s.replace(/\{\w+\}|\bAI\b|JavaScript/g, "")));
    expect(latin.map(([p, s]) => `${p}: ${s}`)).toEqual([]);
    expect(ALL.filter(([, s]) => !/[א-ת]/u.test(s) && !/^\{?\w*\}?$/.test(s)).map(([p]) => p)).toEqual([]);
  });

  it("has no nikud or cantillation (the maqaf is punctuation)", () => {
    const pointed = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/u;
    expect(ALL.filter(([, s]) => pointed.test(s)).map(([p, s]) => `${p}: ${s}`)).toEqual([]);
  });

  it("speaks of the Mashgiach as המשגיח, never as הרב, and never שליט\"א", () => {
    expect(ALL.filter(([, s]) => /(?<![א-ת])הרב(?![א-ת])/u.test(s)).map(([p]) => p)).toEqual([]);
    expect(ALL.filter(([, s]) => /שליט["״]א/u.test(s)).map(([p]) => p)).toEqual([]);
    expect(ALL.some(([, s]) => s.includes("המשגיח"))).toBe(true);
    expect(ALL.some(([, s]) => s.includes("זצ\"ל"))).toBe(true);
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

  it("never remarks on the transcript or the shiur itself (the guard's term list)", () => {
    const tables = Object.entries(PAIRS);
    const all = tables.flatMap(([name, pair]) => strings(pair.he, `${name}.he`));
    expect(all.flatMap(([path, s]) => findMetaComments(s).map((h) => `${path}: ${h.term}`))).toEqual([]);
  });
});

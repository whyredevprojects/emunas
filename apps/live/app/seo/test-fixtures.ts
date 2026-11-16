/**
 * Test fixtures for `app/seo` (not shipped): a small `SeoCorpus` and the same corpus as `.corpus/`
 * files on disk, catalog aggregates and corpus-layer entity files (only the fields
 * `corpus.server.ts` reads are meaningful).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SeoCorpus } from "./model.ts";

export const SHIUR_FULL = "yi-parshas-hashavua-brshys-01";
export const SHIUR_CATALOG = "en-emunah-en-01";
/** Catalogued shiurim of a one-off occasion outside the tables (the "other" bucket). */
export const OTHER_IDS = ["yi-other-01", "yi-other-02", "yi-other-03"] as const;

export const corpusFixture: SeoCorpus = {
  shiurim: [
    {
      id: SHIUR_FULL,
      lang: "yi",
      titleOriginal: "ולאדם לא מצא עזר כנגדו",
      subTitle: null,
      sectionTitle: "פרשת השבוע",
      years: [5736],
      oneLiner: { en: "The Mashgiach explains the bond of Hashem and Knesses Yisrael.", yi: "דער משגיח ערקלערט." },
    },
    {
      id: SHIUR_CATALOG,
      lang: "en",
      titleOriginal: "Emunah",
      subTitle: "The Everlasting Essence",
      sectionTitle: "EMUNAH #1 (English)",
      years: [],
      oneLiner: null,
    },
  ],
  series: [{ id: "tanya-yi", title: { en: "Tanya (Yiddish)", yi: "תניא" }, count: 12 }],
  occasions: [
    { key: "bereishis", kind: "parsha", label: { en: "Bereishis", yi: "בראשית" }, count: 4 },
    { key: "chanukah", kind: "zman", label: { en: "Chanukah", yi: "חנוכה" }, count: 2 },
    { key: "adar", kind: "zman", label: { en: "Adar", yi: "אדר" }, count: 1 },
    { key: "a-wedding", kind: null, label: { en: "חתונה", yi: "חתונה" }, count: 3 },
  ],
  works: [
    { key: "genesis", label: { en: "Genesis", yi: "בראשית" }, count: 40, prerender: true, quietPage: true },
    { key: "midrash", label: { en: "Midrash", yi: "מדרש" }, count: 30, prerender: false, quietPage: false },
    { key: "abudraham", label: { en: "Abudraham", yi: "אבודרהם" }, count: 2, prerender: false, quietPage: true },
  ],
  people: [
    { key: "achashverosh", label: { en: "Achashverosh", yi: "אחשורוש" }, count: 5, prerender: true, quietPage: true },
    { key: "rabbi-x", label: { en: "Rabbi X", yi: "Rabbi X" }, count: 1, prerender: false, quietPage: false },
  ],
  concepts: [
    { key: "emunah-1", label: { en: "אמונה", yi: "אמונה" }, count: 9, prerender: true, quietPage: true, topicId: null },
    { key: "bitachon-2", label: { en: "בטחון", yi: "בטחון" }, count: 2, prerender: false, quietPage: false, topicId: null },
  ],
  topics: [],
  stories: [],
  threads: [],
};

/**
 * The same corpus with a corpus layer (C1.7): corpus ids, page flags per site, topics, stories and
 * threads. `hester-panim` has a Quiet page; `rare-topic` and the thread do not.
 */
export const layerCorpusFixture: SeoCorpus = {
  ...corpusFixture,
  works: [{ key: "bereishis", label: { en: "Bereishis", yi: "בראשית" }, count: 40, prerender: true, quietPage: true }],
  people: [
    { key: "moshe-rabbeinu", label: { en: "Moshe Rabbeinu", yi: "משה רבינו" }, count: 30, prerender: true, quietPage: true },
    { key: "a-local", label: { en: "A local", yi: "A local" }, count: 1, prerender: false, quietPage: false },
  ],
  concepts: [
    { key: "tzimtzum", label: { en: "Tzimtzum", yi: "צמצום" }, count: 9, prerender: true, quietPage: true, topicId: null },
    { key: "hester-panim", label: { en: "Hester panim", yi: "הסתר פנים" }, count: 50, prerender: false, quietPage: false, topicId: "hester-panim" },
  ],
  topics: [
    { key: "hester-panim", label: { en: "Hester Panim", yi: "הסתר פנים" }, count: 112, prerender: true, quietPage: true },
    { key: "rare-topic", label: { en: "Rare", yi: "זעלטן" }, count: 8, prerender: true, quietPage: false },
  ],
  stories: [
    { key: "sugar-sled", label: { en: "The sugar sled", yi: "דער צוקער שליטן" }, count: 14, prerender: true, quietPage: true },
    { key: "told-once", label: { en: "Once", yi: "איינמאל" }, count: 1, prerender: false, quietPage: false },
  ],
  threads: [
    { key: "akeidah-last-generation", label: { en: "At the Akeidah", yi: "ביי דער עקידה" }, count: 8, prerender: true, quietPage: false },
    { key: "two-member", label: { en: "Two", yi: "צוויי" }, count: 2, prerender: false, quietPage: false },
  ],
};

const write = (dir: string, file: string, value: unknown) => writeFileSync(join(dir, file), JSON.stringify(value));

/** Writes `corpusFixture` as `.corpus/` files into `dir` (created). */
export function writeCorpusFixture(dir: string): string {
  mkdirSync(dir, { recursive: true });
  const c = corpusFixture;
  write(dir, "build.json", { buildId: "x", dataSha: null, schemaVersion: 2, mediaOrigin: "https://m.invalid", counts: {} });
  write(dir, "index.json", {
    schemaVersion: 2,
    sections: [],
    series: [],
    shiurim: [
      ...c.shiurim.map((s) => ({
        id: s.id,
        lang: s.lang,
        catalog: { titleOriginal: s.titleOriginal, subTitle: s.subTitle, sectionTitle: s.sectionTitle },
        parsha: s.id === SHIUR_FULL ? { raw: "בראשית", key: "bereishis" } : null,
        zman: null,
        years: s.years,
        oneLiner: s.oneLiner,
      })),
      // Shiurim whose zman is outside the tables: the catalog spelling labels the occasion.
      ...OTHER_IDS.map((id) => ({
        id,
        lang: "yi",
        catalog: { titleOriginal: "x", subTitle: null, sectionTitle: "y" },
        parsha: null,
        zman: { raw: "חתונה", key: "a-wedding" },
        years: [],
        oneLiner: null,
      })),
    ],
  });
  write(dir, "series.json", { series: c.series.map((s) => ({ ...s, lang: "yi", parts: [] })) });
  write(dir, "occasions.json", {
    parshiyos: [{ key: "bereishis", en: "Bereishis", yi: "בראשית", he: "בראשית", count: 4, shiurim: [] }],
    zmanim: [
      { key: "chanukah", en: "Chanukah", yi: "חנוכה", he: "חנוכה", count: 2, shiurim: [], subs: [] },
      { key: "adar", en: "Adar", yi: "אדר", he: "אדר", count: 1, shiurim: [], subs: [] },
    ],
    other: OTHER_IDS.map((id) => ({ id, lang: "yi", years: [], raw: "חתונה", audience: null })),
    excluded: { uncataloguedGuesses: 0 },
  });
  // The corpus layer's entity files, with the page flags the fixture's entities carry.
  const layer = join(dir, "layer");
  mkdirSync(layer, { recursive: true });
  const flags = (e: SeoCorpus["works"][number]) => ({ count: e.count, pages: { quiet: e.quietPage === true, live: e.prerender } });
  write(layer, "layer.json", { counts: { visibleShiurim: c.shiurim.length } });
  write(layer, "topics.json", { tree: [], detail: [] });
  write(layer, "stories.json", { stories: [] });
  write(layer, "threads.json", { threads: [] });
  write(layer, "works.json", {
    works: c.works.map((e) => ({ id: e.key, titleEn: e.label.en, titleHe: e.label.yi, generic: e.key === "midrash", ...flags(e) })),
  });
  write(layer, "people.json", {
    people: c.people.map((e) => ({
      id: e.key,
      nameEn: e.label.en,
      nameYi: e.label.yi,
      type: "acharon",
      group: "acharon",
      excluded: null,
      listed: { quiet: true, live: e.prerender },
      ...flags(e),
    })),
  });
  write(layer, "concepts.json", {
    concepts: c.concepts.map((e) => ({ id: e.key, label: { en: e.label.en, yi: e.label.yi }, canonicalHe: e.label.yi, mergedIntoTopic: e.topicId ?? null, ...flags(e) })),
  });
  return dir;
}

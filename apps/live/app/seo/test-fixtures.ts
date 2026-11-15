/**
 * Test fixtures for `app/seo` (not shipped): a small `SeoCorpus` and the same corpus as `.corpus/`
 * aggregate files on disk (only the fields `corpus.server.ts` reads are meaningful).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SeoCorpus } from "./model.ts";

export const SHIUR_FULL = "yi-parshas-hashavua-brshys-01";
export const SHIUR_CATALOG = "en-emunah-en-01";

export const corpusFixture: SeoCorpus = {
  shiurim: [
    {
      id: SHIUR_FULL,
      lang: "yi",
      titleOriginal: "ולאדם לא מצא עזר כנגדו",
      subTitle: null,
      sectionTitle: "פרשת השבוע",
      years: [5736],
      oneLiner: { en: "The Rav explains the bond of Hashem and Knesses Yisrael.", yi: "דער משגיח ערקלערט." },
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
    { key: "genesis", label: { en: "Genesis", yi: "בראשית" }, count: 40, prerender: true },
    { key: "midrash", label: { en: "Midrash", yi: "מדרש" }, count: 30, prerender: false },
    { key: "abudraham", label: { en: "Abudraham", yi: "אבודרהם" }, count: 2, prerender: false },
  ],
  people: [
    { key: "achashverosh", label: { en: "Achashverosh", yi: "אחשורוש" }, count: 5, prerender: true },
    { key: "rabbi-x", label: { en: "Rabbi X", yi: "Rabbi X" }, count: 1, prerender: false },
  ],
  concepts: [
    { key: "emunah-1", label: { en: "אמונה", yi: "אמונה" }, count: 9, prerender: true },
    { key: "bitachon-2", label: { en: "בטחון", yi: "בטחון" }, count: 2, prerender: false },
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
      // A shiur whose zman is outside the tables: its catalog spelling labels the occasion.
      {
        id: "yi-other-01",
        lang: "yi",
        catalog: { titleOriginal: "x", subTitle: null, sectionTitle: "y" },
        parsha: null,
        zman: { raw: "חתונה", key: "a-wedding" },
        years: [],
        oneLiner: null,
      },
    ],
  });
  write(dir, "series.json", { series: c.series.map((s) => ({ ...s, lang: "yi", parts: [] })) });
  write(dir, "occasions.json", {
    parshiyos: [{ key: "bereishis", en: "Bereishis", yi: "בראשית", he: "בראשית", count: 4, shiurim: [] }],
    zmanim: [
      { key: "chanukah", en: "Chanukah", yi: "חנוכה", he: "חנוכה", count: 2, shiurim: [], subs: [] },
      { key: "adar", en: "Adar", yi: "אדר", he: "אדר", count: 1, shiurim: [], subs: [] },
    ],
    other: [],
    excluded: { uncataloguedGuesses: 0 },
  });
  write(dir, "works.json", {
    works: [
      { key: "genesis", en: "Genesis", yi: null, he: "בראשית" },
      { key: "midrash", en: "Midrash", yi: "מדרש", he: "מדרש" },
      { key: "abudraham", en: "Abudraham", yi: "אבודרהם", he: null },
    ],
  });
  write(dir, "people.json", {
    people: [
      { key: "achashverosh", en: "Achashverosh", he: "אחשורוש" },
      { key: "rabbi-x", en: "Rabbi X", he: null },
    ],
  });
  write(dir, "concepts.json", { minShiurim: 3, omitted: {}, concepts: [{ key: "emunah-1", he: "אמונה" }] });
  const ent = (xs: SeoCorpus["works"]) =>
    xs.map((e) => ({ key: e.key, shiurim: e.count, quietPage: e.count >= 2, livePrerender: e.prerender }));
  write(dir, "entities.json", {
    thresholds: { quiet: { work: 2, person: 2, concept: 3 }, live: { prerender: 3 } },
    works: ent(c.works),
    people: ent(c.people),
    concepts: ent(c.concepts),
    occasions: c.occasions.map((o) => ({ key: o.key, shiurim: o.count })),
  });
  return dir;
}

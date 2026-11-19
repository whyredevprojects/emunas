/**
 * Every interface language (`UI_LANGS`): Hebrew text reaches the index only from a current
 * translation (here a fixture: the corpus applies overlays, search-core copies what it is given),
 * a reader's index follows `CONTENT_FALLBACK`, and the allow-lists cover every language.
 */
import { describe, expect, it } from "vitest";
import type { LocalizedText, PublicShiur, PublicWriteupBlock } from "@emunas/corpus/public";
import { CONTENT_FALLBACK, UI_LANGS } from "@emunas/i18n";
import {
  ENTITY_DOC_LABEL_FIELDS,
  MOMENT_ROW_FIELDS,
  MOMENT_ROW_TEXT_FIELDS,
  ROW_KIND_OF,
  buildSynonymTable,
  docTextParts,
  foldForIndex,
  localizedTexts,
  momentRowText,
  momentSearchText,
  normalizeQuery,
  type EntityDoc,
} from "../src/index.ts";
import { buildEntityDocs, buildMomentRows, buildSearchDoc, readCorpusShiurim, readLayerFiles, readSearchLayerInput } from "../src/build/index.ts";
import { MINI_DATA, MINI_POLICY, buildCorpusTo } from "./helpers.ts";

const ID = "yi-parshas-hashavua-brshys-01";
const HE_ONE_LINER = "המשגיח מבאר את יסוד האמונה";
const HE_SECTION = "פרק ראשון בתרגום";
const HE_PARAGRAPH = "פסקה עברית ראשונה של הסיכום";
const HE_HEADING = "כותרת עברית";

describe("languages", () => {
  const corpus = buildCorpusTo(MINI_DATA, MINI_POLICY);
  const shiurim = readCorpusShiurim(corpus);
  const shiur = shiurim.find((s) => s.id === ID)!;
  const { layer } = readSearchLayerInput(corpus, shiurim);

  /** The shiur as the corpus gives it with a current Hebrew translation of some of its text. */
  function translated(): PublicShiur {
    const s = JSON.parse(JSON.stringify(shiur)) as PublicShiur;
    const n = s.notes!;
    const he = (t: LocalizedText, text: string): LocalizedText => ({ ...t, he: text });
    n.summary = { ...n.summary, oneLiner: he(n.summary.oneLiner, HE_ONE_LINER) };
    const c0 = n.chapters[0]!;
    n.chapters[0] = { ...c0, title: he(c0.title, HE_SECTION) };
    // A translated write-up mirrors the yi blocks, with its own paragraph ids.
    const yi = n.writeup.yi;
    const heBlocks: PublicWriteupBlock[] = yi.map((b, bi) => ({
      ...b,
      heading: bi === 0 ? HE_HEADING : b.heading,
      paragraphs: b.paragraphs.map((p, pi) => ({ ...p, id: p.id.replace("~wyi", "~whe"), text: bi === 0 && pi === 0 ? HE_PARAGRAPH : `עברית ${bi}.${pi}` })),
    }));
    n.writeup = { ...n.writeup, he: heBlocks };
    return s;
  }

  it("the allow-lists cover every interface language", () => {
    expect([...ENTITY_DOC_LABEL_FIELDS]).toEqual([...UI_LANGS]);
    expect([...MOMENT_ROW_TEXT_FIELDS]).toEqual([...UI_LANGS.map((l) => `title_${l}`), ...UI_LANGS.map((l) => `body_${l}`)]);
    for (const f of MOMENT_ROW_TEXT_FIELDS) expect(MOMENT_ROW_FIELDS).toContain(f);
    for (const l of UI_LANGS) expect(ROW_KIND_OF[`w${l}`]).toBe("writeup");
  });

  it("without a translation there is no Hebrew text, and nothing is filled from another language", () => {
    const doc = buildSearchDoc({ shiur, layer });
    expect(doc.oneLiner).not.toBeNull();
    expect(Object.keys(doc.oneLiner!)).toEqual(["en", "yi"]);
    for (const r of buildMomentRows(shiur, layer)) {
      expect(r.title_he).toBeNull();
      expect(r.body_he).toBeNull();
      expect(momentSearchText(r, "he")).toBeNull();
    }
  });

  it("a current translation reaches the SearchDoc and the shared index text", () => {
    const doc = buildSearchDoc({ shiur: translated(), layer });
    expect(doc.oneLiner?.he).toBe(HE_ONE_LINER);
    expect(Object.keys(doc.oneLiner!)).toEqual(["en", "yi", "he"]);
    expect(doc.sections[0]?.title.he).toBe(HE_SECTION);
    // Untranslated texts keep only the source languages.
    expect(Object.keys(doc.sections[0]!.summary)).toEqual(["en", "yi"]);
    expect(docTextParts(doc)).toContain(HE_ONE_LINER);
    expect(docTextParts(doc)).toContain(doc.oneLiner!.yi);
    expect(docTextParts(doc)).toContain(doc.oneLiner!.en);
    expect(doc.hash).not.toBe(buildSearchDoc({ shiur, layer }).hash);
  });

  it("a reader's index holds the text that reader is shown, along CONTENT_FALLBACK", () => {
    const doc = buildSearchDoc({ shiur: translated(), layer });
    const he = docTextParts(doc, "he");
    expect(he).toContain(HE_ONE_LINER);
    expect(he).not.toContain(doc.oneLiner!.yi);
    expect(he).not.toContain(doc.oneLiner!.en);
    // No Hebrew summary: the Yiddish one (he → yi → en).
    expect(CONTENT_FALLBACK.he[1]).toBe("yi");
    expect(he).toContain(doc.sections[0]!.summary.yi);
    expect(he).not.toContain(doc.sections[0]!.summary.en);
    // Yiddish and English readers never see the Hebrew.
    expect(docTextParts(doc, "yi")).not.toContain(HE_ONE_LINER);
    expect(docTextParts(doc, "en")).not.toContain(HE_ONE_LINER);
    // Catalog strings are not localized.
    expect(he).toContain(doc.titleOriginal);
  });

  it("localizedTexts: every language present, or the picked one", () => {
    const t: LocalizedText = { en: "A", yi: "  ", he: "ב" };
    expect(localizedTexts(t)).toEqual(["A", "ב"]);
    expect(localizedTexts(t, "yi")).toEqual(["A"]);
    expect(localizedTexts({ en: "A", yi: "א" }, "he")).toEqual(["א"]);
    expect(localizedTexts(null, "he")).toEqual([]);
  });

  it("moment rows carry Hebrew text per field, and a Hebrew write-up as its own rows", () => {
    const rows = buildMomentRows(translated(), layer);
    const n = shiur.notes!;
    const section = rows.find((r) => r.id === n.chapters[0]!.id)!;
    expect(section.title_he).toBe(HE_SECTION);
    expect(momentRowText(section, "title", "he")).toBe(HE_SECTION);
    expect(section.body_he).toBeNull();
    expect(momentSearchText(section, "he")).toEqual({ title: foldForIndex(HE_SECTION), body: "" });

    const heRows = rows.filter((r) => r.id.includes("~whe"));
    const yiRows = rows.filter((r) => r.id.includes("~wyi"));
    expect(heRows.length).toBe(yiRows.length);
    expect(heRows.length).toBeGreaterThan(0);
    for (const r of heRows) {
      expect(r.kind).toBe("writeup");
      expect(r.body_he).not.toBeNull();
      expect(r.body_en).toBeNull();
      expect(r.body_yi).toBeNull();
    }
    const first = heRows.find((r) => r.body_he === HE_PARAGRAPH)!;
    expect(first.title_he).toBe(HE_HEADING);
    // The other languages' titles are the chapter titles, as on every write-up row.
    const twin = yiRows.find((r) => r.id === first.id.replace("~whe", "~wyi"))!;
    expect(first.t).toBe(twin.t);
    expect(first.title_en).toBe(twin.title_en);
  });

  it("entity labels per language: a concept's Hebrew label is its term", () => {
    const docs: EntityDoc[] = buildEntityDocs(readLayerFiles(corpus));
    for (const d of docs) expect(Object.keys(d.labels)).toEqual([...UI_LANGS]);
    const concept = docs.find((d) => d.kind === "concept")!;
    expect(concept.labels.he).not.toBeNull();
    const table = buildSynonymTable(docs);
    const entry = table.entries.find((e) => e.kind === concept.kind && e.id === concept.id)!;
    expect(entry.forms).toContain(foldForIndex(concept.labels.he!));
  });
});

describe("Hebrew queries", () => {
  it("nikud, cantillation, gershayim and geresh fold away on both sides", () => {
    expect(normalizeQuery("אֱמוּנָה").terms).toEqual(normalizeQuery("אמונה").terms);
    expect(normalizeQuery('רמב"ם').terms).toEqual(normalizeQuery("רמב״ם").terms);
    expect(normalizeQuery("רמב״ם").folded).toBe(foldForIndex("רמב\"ם"));
    expect(foldForIndex("בְּרֵאשִׁ֖ית")).toBe(foldForIndex("בראשית"));
  });

  it("Hebrew function words never prefix-match an entity on their own", () => {
    const table = buildSynonymTable([{ kind: "topic", id: "t", labels: { en: null, yi: null, he: "על התורה" }, synonyms: [], count: 1 }]);
    expect(normalizeQuery("על", table).entities).toEqual([]);
    expect(normalizeQuery("התורה", table).entities.map((e) => e.id)).toEqual(["t"]);
  });
});

import { describe, expect, it } from "vitest";
import { compareSortKeys } from "@emunas/normalize";
import bereishisFixture from "../../../data/fixtures/data/work/bereishis.json" with { type: "json" };
import { LIVE_DATA_SCHEMA_VERSION, type WorkCitation, type WorkFile, type WorkSummary } from "../../entities/live-data.ts";
import {
  INLINE_PLACES_MAX,
  chapterLabel,
  isFamilyMember,
  layoutWork,
  matchesWork,
  offersSefaria,
  placeLabel,
  shelfGroups,
  shiurimIn,
  wantsChapterIndex,
} from "../model.ts";

const cite = (shiurId: string, n: number, t: number | null = 10 * n): WorkCitation => ({
  shiurId,
  sourceId: `${shiurId}~src${n}`,
  t,
  mention: "quoted",
  resolution: "resolved",
});

function work(key: string, refs: (string | null)[], unlocated: WorkCitation[] = []): WorkFile {
  return {
    schemaVersion: LIVE_DATA_SCHEMA_VERSION,
    key,
    name: key,
    label: { en: key, yi: key },
    reviewed: false,
    sefariaIndexTitle: null,
    author: null,
    parent: null,
    children: [],
    shiurIds: [],
    locations: refs.map((r, i) => ({ ref: r ?? `cited ${i}`, sefariaRef: r, citations: [cite("yi-a-01", i)] })),
    unlocated,
  };
}

const summary = (key: string, group: string, over: Partial<WorkSummary> = {}): WorkSummary => ({
  key,
  name: key,
  label: { en: key, yi: key },
  count: 5,
  mentions: 5,
  page: true,
  group,
  parentId: null,
  ...over,
});

describe("shelf", () => {
  it("groups works by the layer's shelf group in shelf order; below the page line in the collapsed row; generic never", () => {
    const groups = shelfGroups([
      summary("bereishis", "torah"),
      summary("shemos", "torah"),
      summary("yehoshua", "neviim", { page: false, count: 1 }),
      summary("rashi", "rishonim"),
      summary("rashi-on-the-torah", "rishonim", { parentId: "rashi" }),
      summary("rashi-on-tehillim", "rishonim", { parentId: "rashi", page: false, count: 2 }),
      { ...summary("gemara", "bavli"), generic: true },
      summary("shabbos", "bavli"),
      summary("not-placed", "no-such-group"),
      summary("empty", "torah", { count: 0, page: false }),
    ]);
    expect(groups.map((g) => [g.group, g.works.map((w) => w.key), g.few.map((w) => w.key)])).toEqual([
      ["torah", ["bereishis", "shemos"], []],
      ["neviim", [], ["yehoshua"]],
      ["bavli", ["shabbos"], []],
      ["rishonim", ["rashi", "rashi-on-the-torah"], ["rashi-on-tehillim"]],
      ["other", ["not-placed"], []],
    ]);
    const shelved = new Set(["rashi", "rashi-on-the-torah"]);
    expect(isFamilyMember(summary("rashi-on-the-torah", "rishonim", { parentId: "rashi" }), shelved)).toBe(true);
    expect(isFamilyMember(summary("rashi", "rishonim"), shelved)).toBe(false);
    expect(isFamilyMember(summary("x", "rishonim", { parentId: "not-shelved" }), shelved)).toBe(false);
  });

  it("offers Sefaria only with a Sefaria index title", () => {
    expect(offersSefaria({ sefariaIndexTitle: "Tanya" })).toBe(true);
    expect(offersSefaria({ sefariaIndexTitle: null })).toBe(false);
    expect(offersSefaria({ sefariaIndexTitle: " " })).toBe(false);
  });

  it("filters by any name, folded", () => {
    const w = summary("bereishis", "torah", { name: "Bereishis", label: { en: "Bereishis", yi: "בראשית", he: "בְּרֵאשִׁית" } });
    const fold = (s: string) => s.normalize("NFD").replace(/[֑-ׇ̀-ͯ]/gu, "").toLowerCase();
    expect(matchesWork(w, fold("BEREI"), fold)).toBe(true);
    expect(matchesWork(w, fold("בראש"), fold)).toBe(true);
    expect(matchesWork(w, fold("shemos"), fold)).toBe(false);
    expect(matchesWork(w, "", fold)).toBe(true);
  });
});

describe("work layout", () => {
  it("lists Bereishis places in pasuk order even when the file is not ordered (W2.4 fixture)", () => {
    const layout = layoutWork(bereishisFixture as WorkFile);
    const placed = layout.chapters.flatMap((c) => c.places);
    const withRef = bereishisFixture.locations.filter((l) => l.sefariaRef !== null);
    expect(placed).toHaveLength(withRef.length);
    expect(layout.unordered.map((p) => p.location.sefariaRef)).toEqual(bereishisFixture.locations.filter((l) => l.sefariaRef === null).map(() => null));
    const keys = placed.map((p) => p.parsed!.sortKey);
    for (let i = 1; i < keys.length; i++) expect(compareSortKeys(keys[i - 1]!, keys[i]!)).toBeLessThanOrEqual(0);
    expect(layout.chapters.map((c) => c.key)).toEqual([...new Set(placed.map((p) => String(p.parsed!.start!.kind === "chapter" ? p.parsed!.start!.chapter : 0)))]);
    const ch6 = layout.chapters.find((c) => c.key === "6")!;
    expect(ch6.places.map((p) => p.location.sefariaRef)).toEqual(
      withRef
        .map((l) => l.sefariaRef!)
        .filter((r) => r.startsWith("Genesis 6:"))
        .sort((a, b) => Number(a.split(":")[1]) - Number(b.split(":")[1])),
    );
  });

  it("puts a range after the single place it starts with, whole chapters first", () => {
    const layout = layoutWork(work("bereishis", ["Genesis 2:21-22", "Genesis 2:21", "Genesis 2", "Genesis 1:3", "Genesis 2:19"]));
    expect(layout.chapters.map((c) => [c.key, c.places.map((p) => p.location.sefariaRef)])).toEqual([
      ["1", ["Genesis 1:3"]],
      ["2", ["Genesis 2", "Genesis 2:19", "Genesis 2:21", "Genesis 2:21-22"]],
    ]);
  });

  it("groups Shas by daf (both amudim together)", () => {
    const layout = layoutWork(work("bavli-shabbos", ["Shabbat 21b", "Shabbat 3b", "Shabbat 21a", "Shabbat 10b"]));
    expect(layout.chapters.map((c) => [c.key, c.unit.kind, c.places.map((p) => p.location.sefariaRef)])).toEqual([
      ["3", "daf", ["Shabbat 3b"]],
      ["10", "daf", ["Shabbat 10b"]],
      ["21", "daf", ["Shabbat 21a", "Shabbat 21b"]],
    ]);
    expect(chapterLabel(layout.chapters[2]!, "en")).toBe("Shabbos, daf 21");
    expect(chapterLabel(layout.chapters[2]!, "yi")).toBe("שבת דף כ״א");
  });

  it("keys chapters by book when a work spans several books (a commentary)", () => {
    const layout = layoutWork(work("rashi", ["Rashi on Exodus 12:2", "Rashi on Genesis 1:1:1", "Rashi on Genesis 12:1"]));
    expect(layout.chapters.map((c) => c.key)).toEqual(["bereishis.1", "bereishis.12", "shemos.12"]);
    expect(layout.chapters.map((c) => chapterLabel(c, "en"))).toEqual(["Bereishis 1", "Bereishis 12", "Shemos 12"]);
    expect(chapterLabel(layout.chapters[1]!, "yi")).toBe("בראשית י״ב");
  });

  it("keeps unparseable and missing refs as cited, and unlocated mentions apart", () => {
    const layout = layoutWork(work("tanya", ["Tanya, Part I; Likkutei Amarim 12", null], [cite("en-b-01", 9, null)]));
    expect(layout.chapters).toEqual([]);
    expect(layout.unordered.map((p) => p.location.ref)).toEqual(["Tanya, Part I; Likkutei Amarim 12", "cited 1"]);
    expect(placeLabel(layout.unordered[0]!, "yi")).toEqual({ text: "Tanya, Part I; Likkutei Amarim 12", script: "cited" });
    expect(layout.unlocated.map((c) => c.sourceId)).toEqual(["en-b-01~src9"]);
    expect(layout.momentCount).toBe(3);
  });

  it("place labels follow the interface language", () => {
    const [pl] = layoutWork(work("bereishis", ["Genesis 12:6"])).chapters[0]!.places;
    expect(placeLabel(pl!, "en")).toEqual({ text: "Bereishis 12:6", script: "en" });
    expect(placeLabel(pl!, "yi").script).toBe("he");
    expect(placeLabel(pl!, "yi").text).toContain("בראשית");
  });

  it("uses a chapter index only for big works with more than one chapter", () => {
    const many = Array.from({ length: INLINE_PLACES_MAX + 1 }, (_, i) => `Genesis ${1 + (i % 3)}:${i + 1}`);
    expect(wantsChapterIndex(layoutWork(work("bereishis", many)))).toBe(true);
    expect(wantsChapterIndex(layoutWork(work("bereishis", many.slice(0, INLINE_PLACES_MAX))))).toBe(false);
    const oneChapter = Array.from({ length: INLINE_PLACES_MAX + 5 }, (_, i) => `Psalms 119:${i + 1}`);
    expect(wantsChapterIndex(layoutWork(work("tehillim", oneChapter)))).toBe(false);
  });

  it("counts distinct shiurim of a chapter", () => {
    const w = work("bereishis", ["Genesis 1:1", "Genesis 1:2"]);
    w.locations[1]!.citations.push(cite("en-c-01", 5), cite("yi-a-01", 7));
    expect(shiurimIn(layoutWork(w).chapters[0]!.places)).toEqual(["yi-a-01", "en-c-01"]);
  });
});

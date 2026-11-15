/**
 * The shiur page's view model (W3.2): source letters and grading, write-up ↔ source links,
 * page parts, place in the catalog, the report link.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PublicNotes, PublicShiur } from "@emunas/corpus/public";
import { describe, expect, it } from "vitest";
import { shiurEn, shiurYi } from "../src/components/shiur/strings.ts";
import {
  buildSources,
  catalogPlace,
  pageParts,
  reportHref,
  sourceLetter,
  type RowLookup,
} from "../src/components/shiur/view.ts";

const golden = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "corpus", "test", "fixtures", "golden");
const load = (id: string) => JSON.parse(readFileSync(join(golden, `${id}.json`), "utf8")) as PublicShiur;

function notesOf(s: PublicShiur): PublicNotes {
  if (!s.notes) throw new Error(`${s.id} has no notes`);
  return s.notes;
}

describe("shiur page strings", () => {
  it("have the same keys and placeholders in both editions", () => {
    expect(Object.keys(shiurYi).sort()).toEqual(Object.keys(shiurEn).sort());
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of Object.entries(shiurEn)) {
      const y = shiurYi[k as keyof typeof shiurEn];
      expect(ph(String(y)), k).toEqual(ph(v));
      expect(/[א-ת]/.test(String(y)), k).toBe(true);
    }
  });

  it("never mention a transcript", () => {
    for (const v of [...Object.values(shiurEn), ...Object.values(shiurYi)]) expect(String(v)).not.toMatch(/transcri|טראנסקריפּ/i);
  });
});

describe("sourceLetter", () => {
  it("counts a…z, aa… in English and א…ת, אא… in Yiddish without gaps", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map((n) => sourceLetter(n, "en"))).toEqual(["a", "b", "z", "aa", "ab", "az", "ba"]);
    expect([0, 1, 21, 22, 23].map((n) => sourceLetter(n, "yi"))).toEqual(["א", "ב", "ת", "אא", "אב"]);
    const seen = new Set(Array.from({ length: 800 }, (_, i) => sourceLetter(i, "yi")));
    expect(seen.size).toBe(800);
  });
});

describe("buildSources", () => {
  const shiur = load("yi-zmanim-tv-bb-04");
  const notes = notesOf(shiur);

  it("letters every displayable source in published order and groups by kind of work", () => {
    const v = buildSources(notes, "en");
    expect(v.count).toBe(notes.sources.length);
    const letters = [...v.byIdx.values()].map((s) => s.letter);
    expect(letters).toEqual(letters.map((_, i) => sourceLetter(i, "en")));
    const order = v.groups.map((g) => g.group);
    expect(order[0]).toBe("torah");
    expect(new Set(order).size).toBe(order.length);
    for (const g of v.groups) {
      const idx = g.sources.map((s) => s.idx);
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
  });

  it("grades by wording: resolved links out, inferred is 'apparently', unresolved names the work", () => {
    const synthetic: PublicNotes = {
      ...notes,
      sources: [
        { idx: 0, id: "x~src0", work: "Devarim", workKey: "devarim", ref: "Devarim 10:12", sefariaRef: "Deuteronomy 10:12", resolution: "resolved", mention: "quoted", t: 10 },
        { idx: 1, id: "x~src1", work: "Midrash", workKey: "midrash", ref: "Bereishis Rabbah 1:1", sefariaRef: "Bereshit Rabbah 1:1", resolution: "inferred", mention: "alluded", t: null },
        { idx: 2, id: "x~src2", work: "Zohar", workKey: "zohar", ref: null, sefariaRef: null, resolution: "unresolved", mention: "alluded", t: 20 },
        { idx: 3, id: "x~src3", work: null, workKey: null, ref: null, sefariaRef: null, resolution: "unresolved", mention: "alluded", t: 30 },
      ],
      writeup: { en: [{ sectionIndex: 0, heading: null, paragraphs: [{ id: "p", text: "x", src: [2, 0, 3, 0], t: 5, end: 9 }] }], yi: [] },
    };
    const v = buildSources(synthetic, "en");
    expect(v.count).toBe(3);
    const [a, b, c] = [v.byIdx.get(0)!, v.byIdx.get(1)!, v.byIdx.get(2)!];
    expect(a.sefaria).toBe("https://www.sefaria.org/Deuteronomy%2010%3A12");
    expect(a.ref).toEqual({ text: "Devarim 10:12", qualifier: null, position: null });
    expect(b.sefaria).toBeNull();
    expect(b.ref).toEqual({ text: "Bereishis Rabbah 1:1", qualifier: "apparently", position: "before" });
    expect(c.sefaria).toBeNull();
    expect(c.ref).toEqual({ text: "Zohar", qualifier: "place not identified", position: "after" });
    expect(v.byIdx.has(3)).toBe(false);
    expect(buildSources(synthetic, "yi").byIdx.get(1)!.ref.qualifier).toBe("לכאורה");
    // back links: each citing paragraph once
    expect(a.citedBy).toEqual([{ anchor: "p0-0", t: 5, n: 1 }]);
    expect(c.citedBy).toEqual([{ anchor: "p0-0", t: 5, n: 1 }]);
    expect(b.citedBy).toEqual([]);
  });

  it("links each source to its work entry by corpus work id (layer refs), and nothing else", () => {
    const [first, second] = notes.sources;
    const works = new Map([
      [first!.id, { workId: "devarim", href: "/yi/sources/devarim/", orderGroup: "torah" }],
      [second!.id, { workId: "some-work", href: null, orderGroup: null }],
    ]);
    const v = buildSources(notes, "yi", works);
    const a = v.byIdx.get(first!.idx)!;
    expect(a.workId).toBe("devarim");
    expect(a.indexHref).toBe("/yi/sources/devarim/");
    expect(a.group).toBe("torah");
    const b = v.byIdx.get(second!.idx)!;
    expect(b.workId).toBe("some-work");
    expect(b.indexHref).toBeNull();
    expect(b.group).toBe("other");
    // Without layer refs a source has no work link at all (never a guessed key).
    for (const s of buildSources(notes, "yi").byIdx.values()) {
      expect(s.indexHref).toBeNull();
      expect(s.workId).toBeNull();
    }
  });

  it("every citation in the write-up points at a listed source", () => {
    for (const ed of ["en", "yi"] as const) {
      const v = buildSources(notes, ed);
      for (const block of notes.writeup[ed]) for (const p of block.paragraphs) for (const idx of p.src) expect(v.byIdx.has(idx)).toBe(true);
    }
  });
});

describe("pageParts", () => {
  it("lists the parts present, in page order", () => {
    const mentioned = { people: [{ id: "x", name: "X", href: null, hebrew: false }], concepts: [] };
    expect(pageParts(load("yi-zmanim-tv-bb-04"), "en", undefined, mentioned)).toEqual([
      "about",
      "outline",
      "writeup",
      "sources",
      "apparatus",
      "mentioned",
      "catalog",
    ]);
    expect(pageParts(load("yi-tanya-1-01"), "yi")).toEqual(["catalog"]);
  });

  it("omits an empty apparatus and empty sources", () => {
    const s = load("en-parsha-en-nch-01");
    const n = notesOf(s);
    const bare: PublicShiur = {
      ...s,
      notes: { ...n, sources: [], insights: [], takeaways: [], questions: [], stories: [], summary: { ...n.summary, keyPoints: [] }, people: [], concepts: [] },
    };
    expect(pageParts(bare, "en")).toEqual(["about", "outline", "writeup", "catalog"]);
  });
});

describe("catalogPlace", () => {
  const rows = new Map(
    ["a", "b", "c", "d"].map((id, i) => [
      id,
      { id, lang: i % 2 ? "en" : "yi", years: i === 3 ? [] : [5740 + i], catalog: { titleOriginal: `Title ${id}`, n: String(i + 1) } },
    ]),
  );
  const lookup = ((id: string) => rows.get(id)) as unknown as RowLookup;
  const shiur = load("yi-tanya-1-01");

  it("resolves section and series prev/next and the same-occasion list from catalog rows", () => {
    const place = catalogPlace(
      "en",
      shiur,
      {
        section: { of: "pocket-guide-2012:tanya-1", pos: 2, count: 3, prev: "a", next: "b" },
        series: { of: "tanya-yi", pos: 1, count: 4, prev: null, next: "c" },
        sameOccasion: ["d", "missing"],
      },
      lookup,
      () => "Tanya",
    );
    expect(place.section).toMatchObject({ href: "/en/section/tanya-1/", pos: 2, count: 3, label: "ספר התניא א'" });
    expect(place.section?.prev).toMatchObject({ id: "a", href: "/en/shiur/a/", title: "Title a" });
    expect(place.series).toMatchObject({ href: "/en/series/tanya-yi/", label: "Tanya", pos: 1, prev: null });
    expect(place.series?.next?.id).toBe("c");
    expect(place.sameOccasion.map((r) => r.id)).toEqual(["d"]);
  });

  it("has no position without neighbours and links the parsha/zman calendar page", () => {
    const zman = load("yi-zmanim-tv-bb-04");
    const place = catalogPlace("yi", zman, undefined, lookup);
    expect(place.section).toBeNull();
    expect(place.series).toBeNull();
    expect(place.occasion).toEqual({ raw: 'ט"ו באב', href: `/yi/calendar/zman/${encodeURIComponent("טו-באב")}/` });
  });
});

describe("reportHref", () => {
  it("builds a mailto that pre-fills the shiur id, or nothing without a valid address", () => {
    const href = reportHref("errors@example.org", "Error report: x-1", "Shiur: x-1\n");
    expect(href).toBe("mailto:errors@example.org?subject=Error%20report%3A%20x-1&body=Shiur%3A%20x-1%0A");
    expect(reportHref(undefined, "s", "b")).toBeNull();
    expect(reportHref("  ", "s", "b")).toBeNull();
    expect(reportHref("not an address", "s", "b")).toBeNull();
  });
});

/**
 * C3.5 (concept-live-corpus C.6): the series synthesis as data. The arc line replaces a visible
 * part's own one-liner; a part that is not visible gets no line; a series without a synthesis keeps
 * its own one-liners; blank (guard-suppressed) fields drop out; key themes are plain strings.
 * Checked on synthetic parts and on the real `tanya-yi` file (`make-real-tanya.ts`).
 */
import { describe, expect, it } from "vitest";
import { LIVE_DATA_SCHEMA_VERSION, type SeriesFile, type SeriesPart, type SeriesSynthesis } from "../../today/live-data.ts";
import { UI_LANGS } from "@emunas/i18n";
import { orderParts, partLines, seriesIntro } from "../model.ts";
import realTanya from "./real-tanya-yi.json" with { type: "json" };

const REAL = realTanya as unknown as SeriesFile;

function part(shiurId: string, order: number, full: boolean, oneLiner = full): SeriesPart {
  return {
    shiurId,
    order,
    perek: null,
    title: shiurId,
    oneLiner: oneLiner ? { en: `own ${shiurId}`, yi: `אייגן ${shiurId}` } : null,
    duration: 60,
    years: [],
    status: full ? "full" : "catalog-only",
  };
}

const SYNTHESIS: SeriesSynthesis = {
  title: { en: "A course", yi: "א קורס" },
  overview: { en: "It goes from here to there.", yi: "עס גייט פון דא ביז דארט." },
  keyThemes: [
    { en: "First theme", yi: "ערשטער ענין" },
    { en: "  ", yi: "" },
    { en: "Second theme", yi: "צווייטער ענין" },
  ],
  arc: [
    { shiurId: "a", oneLiner: { en: "The series opens with a.", yi: "די סדרה עפנט מיט א." } },
    { shiurId: "c", oneLiner: { en: "Then c.", yi: "דערנאך ס." } },
  ],
  reviewed: false,
};

function series(synthesis?: SeriesSynthesis): SeriesFile {
  return {
    schemaVersion: LIVE_DATA_SCHEMA_VERSION,
    id: "s",
    title: { en: "S", yi: "S" },
    lang: "yi",
    // a: visible with arc; b: visible, arc has no line for it; c: catalog-only (not visible) even though the arc names it; d: catalog-only
    parts: [part("a", 1, true), part("b", 2, true), part("c", 3, false), part("d", 4, false)],
    perekGroups: [],
    ...(synthesis ? { synthesis } : {}),
  };
}

describe("partLines", () => {
  it("with a synthesis: arc line for visible parts, own one-liner where the arc has none, nothing for parts not visible", () => {
    const lines = partLines(series(SYNTHESIS));
    expect(lines.get("a")).toEqual({ kind: "line", source: "arc", text: SYNTHESIS.arc[0]!.oneLiner });
    expect(lines.get("b")).toEqual({ kind: "line", source: "part", text: { en: "own b", yi: "אייגן b" } });
    expect(lines.get("c")).toEqual({ kind: "none" });
    expect(lines.get("d")).toEqual({ kind: "none" });
  });

  it("without a synthesis: each part's own one-liner, or pending", () => {
    const lines = partLines(series());
    expect(lines.get("a")).toEqual({ kind: "line", source: "part", text: { en: "own a", yi: "אייגן a" } });
    expect(lines.get("c")).toEqual({ kind: "pending" });
  });

  it("a blank arc line is no line", () => {
    const lines = partLines(series({ ...SYNTHESIS, arc: [{ shiurId: "a", oneLiner: { en: "", yi: " " } }] }));
    expect(lines.get("a")).toEqual({ kind: "line", source: "part", text: { en: "own a", yi: "אייגן a" } });
  });
});

describe("seriesIntro", () => {
  it("is null without a synthesis", () => {
    expect(seriesIntro(series(), "en")).toBeNull();
  });

  it("picks the reading language and drops blank themes; themes are plain strings with their language", () => {
    const en = (text: string) => ({ text, lang: "en", dir: "ltr", fallback: false });
    expect(seriesIntro(series(SYNTHESIS), "en")).toEqual({
      title: en("A course"),
      overview: en("It goes from here to there."),
      keyThemes: [en("First theme"), en("Second theme")],
      reviewed: false,
    });
    expect(seriesIntro(series(SYNTHESIS), "yi")!.keyThemes.map((k) => k.text)).toEqual(["ערשטער ענין", "צווייטער ענין"]);
  });

  it("a Hebrew reader gets the Hebrew translation where there is one, else Yiddish, marked with its language", () => {
    const translated: SeriesSynthesis = { ...SYNTHESIS, title: { ...SYNTHESIS.title, he: "קורס" } };
    const intro = seriesIntro(series(translated), "he")!;
    expect(intro.title).toEqual({ text: "קורס", lang: "he", dir: "rtl", fallback: false });
    expect(intro.overview).toEqual({ text: "עס גייט פון דא ביז דארט.", lang: "yi", dir: "rtl", fallback: true });
    expect(intro.keyThemes.map((k) => k.lang)).toEqual(["yi", "yi"]);
  });

  it("a suppressed (blank) overview is left out; the synthesis, and so its label, stays", () => {
    const intro = seriesIntro(series({ ...SYNTHESIS, overview: { en: "", yi: "" } }), "en");
    expect(intro).not.toBeNull();
    expect(intro!.overview).toBeNull();
    expect(intro!.title?.text).toBe("A course");
  });

  it("reads reviewed only when it is exactly true", () => {
    expect(seriesIntro(series({ ...SYNTHESIS, reviewed: true }), "en")!.reviewed).toBe(true);
  });
});

describe("the real tanya-yi file", () => {
  const lines = partLines(REAL);
  const ordered = orderParts(REAL.parts);

  it("has a synthesis with an overview and plain key themes in both languages", () => {
    for (const lang of UI_LANGS) {
      const intro = seriesIntro(REAL, lang)!;
      expect(intro.title).not.toBeNull();
      expect(intro.overview).not.toBeNull();
      expect(intro.keyThemes.length).toBeGreaterThan(0);
      expect(intro.keyThemes.every((k) => typeof k.text === "string")).toBe(true);
    }
  });

  it("every visible part reads its arc line; every part that is not visible has no line", () => {
    const arc = new Map(REAL.synthesis!.arc.map((a) => [a.shiurId, a.oneLiner]));
    for (const p of ordered) {
      const l = lines.get(p.shiurId)!;
      if (p.status !== "full") expect(l, p.shiurId).toEqual({ kind: "none" });
      else if (arc.has(p.shiurId)) expect(l, p.shiurId).toEqual({ kind: "line", source: "arc", text: arc.get(p.shiurId) });
    }
    expect(ordered.filter((p) => p.status !== "full").length).toBeGreaterThan(0);
    // the arc covers only visible parts (projection cuts it to the visible set)
    const visible = new Set(REAL.parts.filter((p) => p.status === "full").map((p) => p.shiurId));
    expect(REAL.synthesis!.arc.every((a) => visible.has(a.shiurId))).toBe(true);
  });

  it("is one course: every part is a Yiddish Tanya part", () => {
    expect(REAL.lang).toBe("yi");
    expect(REAL.parts.every((p) => p.shiurId.startsWith("yi-tanya-"))).toBe(true);
  });
});

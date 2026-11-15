import { describe, expect, it } from "vitest";
import { RAV_NAME, type PlayerShiur } from "../player-engine/index.ts";
import { makeDescribe } from "./describe.ts";
import { SPEEDS, formatRate, nextSpeed } from "./PlayerDock.tsx";

const shiur: PlayerShiur = {
  id: "yi-tanya-1-01",
  lang: "yi",
  duration: 100,
  catalog: { titleOriginal: "הקדמה; ביאור קושיא" },
  recordings: [{ id: "r", offset: 0, duration: 100, audioUrl: "https://m.example/r.mp3" }],
  notes: { chapters: [{ t: 0, end: 100, title: { en: "Opening", yi: "הקדמה" } }], skip: [] },
};

describe("Media Session describe", () => {
  const describeFn = makeDescribe((id) => (id === "yi-tanya-1-01" ? { en: "Tanya", yi: "תניא" } : null));

  it("uses the series title as the album", () => {
    const md = describeFn({ shiur, chapter: shiur.notes!.chapters[0]!, readingLang: "en" });
    expect(md).toEqual({ title: "Opening", artist: RAV_NAME.en, album: "Tanya" });
    expect(describeFn({ shiur, chapter: null, readingLang: "yi" }).album).toBe("תניא");
  });

  it("falls back to the catalog title outside a series", () => {
    const other = { ...shiur, id: "no-series" };
    const md = describeFn({ shiur: other, chapter: null, readingLang: "en" });
    expect(md.album).toBe("הקדמה; ביאור קושיא");
    expect(md.title).toBe("הקדמה; ביאור קושיא");
  });
});

describe("dock helpers", () => {
  it("cycles speeds within 0.75–2", () => {
    let r = 1;
    const seen: number[] = [];
    for (let i = 0; i < SPEEDS.length; i++) {
      r = nextSpeed(r);
      seen.push(r);
    }
    expect(seen.sort()).toEqual([...SPEEDS].sort());
    expect(Math.min(...seen)).toBe(0.75);
    expect(Math.max(...seen)).toBe(2);
    expect(nextSpeed(1.1)).toBe(1);
    expect(formatRate(1.25)).toBe("1.25×");
    expect(formatRate(1)).toBe("1×");
  });
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { FacetsFile, ShiurFile } from "../live-data.ts";
import { shiurNoachFixture as shiur, shiurTanyaFixture as catalogOnly } from "./fixtures.ts";
import { SERIES_CLASSES } from "../../series/styles.ts";
import { seriesEn, seriesYi } from "../../series/strings.ts";
import { formatCivilDate, formatHebrewDate, humanizeKey, momentContent, occasionLabel, yearLabel } from "../format.ts";
import { todayEn, todayYi } from "../strings.ts";
import { TODAY_CLASSES } from "../styles.ts";

const here = dirname(fileURLToPath(import.meta.url));

function classesIn(file: string): string[] {
  const css = readFileSync(file, "utf8");
  return [...new Set([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9]*)\b/g)].map((m) => m[1]!))].sort();
}

describe("format helpers", () => {
  it("formats the Hebrew date per interface language", () => {
    const d = { year: 5787, month: 9, monthName: "Kislev", monthNameHe: "כסלו", day: 5, leapYear: true };
    expect(formatHebrewDate(d, "en")).toBe("5 Kislev 5787");
    expect(formatHebrewDate(d, "yi")).toBe("ה׳ כסלו תשפ״ז");
  });

  it("formats civil dates without shifting the day", () => {
    expect(formatCivilDate("2027-06-19", "en")).toBe("June 19");
    expect(formatCivilDate("not-a-date", "en")).toBe("not-a-date");
  });

  it("labels occasions from facets, then the shared tables, then the key", () => {
    const facets = { occasion: { noach: { label: { en: "Noach (facets)", yi: "נח" }, count: 1, type: "parsha" } } } as unknown as FacetsFile;
    expect(occasionLabel("noach", facets, "en")).toBe("Noach (facets)");
    expect(occasionLabel("lech-lecha", facets, "en")).toBe("Lech Lecha");
    expect(occasionLabel("lag-baomer", null, "yi")).toMatch(/בעומר/);
    expect(occasionLabel("brand-new-key", null, "en")).toBe("Brand New Key");
    // today.json states a label only where it differs from the shared tables.
    const today = { occasions: { other: { label: { en: "Other occasions", yi: "אנדערע" }, shiurIds: [], total: 0, moments: [], mix: null }, noach: { shiurIds: [], total: 0, moments: [], mix: null } } };
    expect(occasionLabel("other", today, "en")).toBe("Other occasions");
    expect(occasionLabel("noach", today, "en")).toBe("Noach");
    expect(humanizeKey("ki-sisa")).toBe("Ki Sisa");
  });

  it("formats the first year", () => {
    expect(yearLabel([5749, 5736])).toEqual({ hebrew: 'תשל"ו', civil: "1975–76" });
    expect(yearLabel([])).toBeNull();
  });

  it("finds moment text by id in a shiur file", () => {
    const s = shiur as unknown as ShiurFile;
    const insight = s.notes!.insights[0]!;
    expect(momentContent(s, insight.id)).toEqual({ kind: "i", text: insight.text });
    const q = s.notes!.questions[0]!;
    expect(momentContent(s, q.id)).toEqual({ kind: "q", text: q.q });
    const st = s.notes!.stories[0]!;
    expect(momentContent(s, st.id)).toEqual({ kind: "st", text: st.title });
    expect(momentContent(s, `${s.id}~i999`)).toBeNull();
    expect(momentContent(catalogOnly as unknown as ShiurFile, "yi-tanya-1-01~i0")).toBeNull();
  });
});

describe("strings and styles", () => {
  it("Yiddish tables provide every key", () => {
    expect(Object.keys(todayYi).sort()).toEqual(Object.keys(todayEn).sort());
    expect(Object.keys(seriesYi).sort()).toEqual(Object.keys(seriesEn).sort());
  });

  it("class lists match the stylesheets", () => {
    expect(classesIn(join(here, "../Today.module.css"))).toEqual([...TODAY_CLASSES].sort());
    expect(classesIn(join(here, "../../series/Series.module.css"))).toEqual([...SERIES_CLASSES].sort());
  });
});

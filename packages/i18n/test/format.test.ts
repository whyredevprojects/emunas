import { describe, expect, it } from "vitest";
import {
  civilPair,
  formatClock,
  formatDuration,
  formatHebrewYear,
  formatHebrewYears,
  hebrewNumeral,
  hebrewYearParts,
  numeralValue,
  UI_LANGS,
} from "../src/index.ts";

describe("gematria", () => {
  it("writes standard numerals with geresh and gershayim", () => {
    expect(hebrewNumeral(1)).toBe("א'");
    expect(hebrewNumeral(15)).toBe('ט"ו');
    expect(hebrewNumeral(16)).toBe('ט"ז');
    expect(hebrewNumeral(115)).toBe('קט"ו');
    expect(hebrewNumeral(400)).toBe("ת'");
    expect(hebrewNumeral(743)).toBe('תשמ"ג');
    expect(hebrewNumeral(900)).toBe('תת"ק');
    expect(hebrewNumeral(743, "hebrew")).toBe("תשמ״ג");
    expect(hebrewNumeral(5, "hebrew")).toBe("ה׳");
  });

  it("round-trips 1–999 through numeralValue", () => {
    for (let n = 1; n <= 999; n++) expect(numeralValue(hebrewNumeral(n))).toBe(n);
  });

  it("throws only for out-of-range numerals", () => {
    expect(() => hebrewNumeral(0)).toThrow(RangeError);
    expect(() => hebrewNumeral(1000)).toThrow(RangeError);
    expect(() => hebrewNumeral(1.5)).toThrow(RangeError);
  });
});

describe("formatHebrewYear", () => {
  it("formats 5743 as in the brief, in both languages", () => {
    const snapshot = Object.fromEntries(
      UI_LANGS.map((lang) => [
        lang,
        [5724, 5736, 5743, 5744, 5760, 5761, 5775, 5776, 5787, 5800].map((y) => formatHebrewYear(y, lang)),
      ]),
    );
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "en": [
          "תשכ"ד (1963–64)",
          "תשל"ו (1975–76)",
          "תשמ"ג (1982–83)",
          "תשמ"ד (1983–84)",
          "תש"ס (1999–2000)",
          "תשס"א (2000–01)",
          "תשע"ה (2014–15)",
          "תשע"ו (2015–16)",
          "תשפ"ז (2026–27)",
          "ת"ת (2039–40)",
        ],
        "yi": [
          "תשכ"ד (1963–64)",
          "תשל"ו (1975–76)",
          "תשמ"ג (1982–83)",
          "תשמ"ד (1983–84)",
          "תש"ס (1999–2000)",
          "תשס"א (2000–01)",
          "תשע"ה (2014–15)",
          "תשע"ו (2015–16)",
          "תשפ"ז (2026–27)",
          "ת"ת (2039–40)",
        ],
      }
    `);
    expect(formatHebrewYear(5743, "yi")).toBe('תשמ"ג (1982–83)');
  });

  it("supports Hebrew marks, no civil pair and thousands", () => {
    expect(formatHebrewYear(5743, "en", { marks: "hebrew" })).toBe("תשמ״ג (1982–83)");
    expect(formatHebrewYear(5743, "yi", { civil: false })).toBe('תשמ"ג');
    expect(formatHebrewYear(5743, "yi", { civil: false, thousands: true })).toBe('ה\'תשמ"ג');
    expect(hebrewYearParts(5743)).toEqual({ year: 5743, hebrew: 'תשמ"ג', civilYears: [1982, 1983], civil: "1982–83" });
    expect(civilPair(5760)).toBe("1999–2000");
  });

  it("never throws on bad data", () => {
    expect(formatHebrewYear(Number.NaN, "en")).toBe("NaN");
    expect(formatHebrewYear(5000, "en")).toBe("5000");
    expect(formatHebrewYear(57.5, "yi")).toBe("57.5");
    expect(hebrewYearParts(-1)).toBeNull();
  });

  it("formats several years in order", () => {
    expect(formatHebrewYears([5743, 5736], "en")).toBe('תשל"ו (1975–76), תשמ"ג (1982–83)');
    expect(formatHebrewYears([], "yi")).toBe("");
  });
});

describe("formatDuration", () => {
  const samples = [0, 7, 45, 59.4, 59.6, 60, 61, 89, 90, 600, 3599, 3600, 3660, 4745, 7200, 10_000];

  it("snapshots short and long in both languages", () => {
    const snapshot = Object.fromEntries(
      UI_LANGS.flatMap((lang) =>
        (["short", "long"] as const).map((style) => [
          `${lang}/${style}`,
          samples.map((s) => `${s} → ${formatDuration(s, lang, style)}`),
        ]),
      ),
    );
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "en/long": [
          "0 → 0 seconds",
          "7 → 7 seconds",
          "45 → 45 seconds",
          "59.4 → 59 seconds",
          "59.6 → 1 minute",
          "60 → 1 minute",
          "61 → 1 minute",
          "89 → 1 minute",
          "90 → 2 minutes",
          "600 → 10 minutes",
          "3599 → 1 hour",
          "3600 → 1 hour",
          "3660 → 1 hour 1 minute",
          "4745 → 1 hour 19 minutes",
          "7200 → 2 hours",
          "10000 → 2 hours 47 minutes",
        ],
        "en/short": [
          "0 → 0 sec",
          "7 → 7 sec",
          "45 → 45 sec",
          "59.4 → 59 sec",
          "59.6 → 1 min",
          "60 → 1 min",
          "61 → 1 min",
          "89 → 1 min",
          "90 → 2 min",
          "600 → 10 min",
          "3599 → 1 hr",
          "3600 → 1 hr",
          "3660 → 1 hr 1 min",
          "4745 → 1 hr 19 min",
          "7200 → 2 hr",
          "10000 → 2 hr 47 min",
        ],
        "yi/long": [
          "0 → 0 סעקונדעס",
          "7 → 7 סעקונדעס",
          "45 → 45 סעקונדעס",
          "59.4 → 59 סעקונדעס",
          "59.6 → 1 מינוט",
          "60 → 1 מינוט",
          "61 → 1 מינוט",
          "89 → 1 מינוט",
          "90 → 2 מינוטן",
          "600 → 10 מינוטן",
          "3599 → 1 שעה",
          "3600 → 1 שעה",
          "3660 → 1 שעה 1 מינוט",
          "4745 → 1 שעה 19 מינוטן",
          "7200 → 2 שעות",
          "10000 → 2 שעות 47 מינוטן",
        ],
        "yi/short": [
          "0 → 0 סעק׳",
          "7 → 7 סעק׳",
          "45 → 45 סעק׳",
          "59.4 → 59 סעק׳",
          "59.6 → 1 מינ׳",
          "60 → 1 מינ׳",
          "61 → 1 מינ׳",
          "89 → 1 מינ׳",
          "90 → 2 מינ׳",
          "600 → 10 מינ׳",
          "3599 → 1 שעה",
          "3600 → 1 שעה",
          "3660 → 1 שעה 1 מינ׳",
          "4745 → 1 שעה 19 מינ׳",
          "7200 → 2 שעה",
          "10000 → 2 שעה 47 מינ׳",
        ],
      }
    `);
  });

  it("formats clock times identically in both languages", () => {
    for (const lang of UI_LANGS) {
      expect(formatDuration(4745, lang, "clock")).toBe("1:19:05");
      expect(formatDuration(79.9, lang, "clock")).toBe("1:19");
    }
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(3600)).toBe("1:00:00");
  });

  it("returns an empty string for invalid durations", () => {
    expect(formatDuration(-1, "en")).toBe("");
    expect(formatDuration(Number.NaN, "yi", "long")).toBe("");
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe("");
  });
});

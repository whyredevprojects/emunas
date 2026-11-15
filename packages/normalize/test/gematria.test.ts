import { describe, expect, it } from "vitest";
import { hebrewYear, parseHebrewNumeral, parseHebrewYear, toHebrewNumeral } from "../src/gematria.ts";

describe("Hebrew numerals", () => {
  it("formats with gershayim/geresh", () => {
    expect(toHebrewNumeral(1)).toBe("א'");
    expect(toHebrewNumeral(15)).toBe('ט"ו');
    expect(toHebrewNumeral(16)).toBe('ט"ז');
    expect(toHebrewNumeral(115)).toBe('קט"ו');
    expect(toHebrewNumeral(743)).toBe('תשמ"ג');
    expect(toHebrewNumeral(800)).toBe('ת"ת');
    expect(toHebrewNumeral(999)).toBe('תתקצ"ט');
    expect(toHebrewNumeral(743, { punctuate: false })).toBe("תשמג");
    expect(toHebrewNumeral(743, { marks: "hebrew" })).toBe(`תשמ${String.fromCodePoint(0x05f4)}ג`);
  });

  it("rejects out-of-range input", () => {
    expect(() => toHebrewNumeral(0)).toThrow(RangeError);
    expect(() => toHebrewNumeral(1000)).toThrow(RangeError);
    expect(() => toHebrewNumeral(1.5)).toThrow(RangeError);
  });

  it("parses numerals, ignoring marks", () => {
    expect(parseHebrewNumeral('תשמ"ג')).toBe(743);
    expect(parseHebrewNumeral("ט״ו")).toBe(15);
    expect(parseHebrewNumeral("ך")).toBe(20);
    expect(parseHebrewNumeral("abc")).toBeNull();
    expect(parseHebrewNumeral("")).toBeNull();
  });

  it("round-trips 1..999", () => {
    for (let n = 1; n <= 999; n++) expect(parseHebrewNumeral(toHebrewNumeral(n))).toBe(n);
  });
});

describe("Hebrew years", () => {
  it("formats the usual and the full form", () => {
    expect(hebrewYear(5743)).toBe('תשמ"ג');
    expect(hebrewYear(5724)).toBe('תשכ"ד');
    expect(hebrewYear(5780)).toBe('תש"פ');
    expect(hebrewYear(5775)).toBe('תשע"ה');
    expect(hebrewYear(5743, { thousands: true })).toBe('ה\'תשמ"ג');
  });

  it("round-trips 5724–5800 in every form", () => {
    for (let y = 5724; y <= 5800; y++) {
      expect(parseHebrewYear(hebrewYear(y)), String(y)).toBe(y);
      expect(parseHebrewYear(hebrewYear(y, { thousands: true })), String(y)).toBe(y);
      expect(parseHebrewYear(hebrewYear(y, { marks: "hebrew" })), String(y)).toBe(y);
      expect(parseHebrewYear(hebrewYear(y, { punctuate: false })), String(y)).toBe(y);
    }
  });

  it("parses the thousands prefix without a geresh", () => {
    expect(parseHebrewYear('התשמ"ג')).toBe(5743);
    expect(parseHebrewYear("התשפ")).toBe(5780);
  });

  it("parses final-letter spellings", () => {
    expect(parseHebrewYear('תש"ף')).toBe(5780);
    expect(parseHebrewYear('תש"ך')).toBe(5720);
  });

  it("returns null for junk", () => {
    expect(parseHebrewYear("")).toBeNull();
    expect(parseHebrewYear("1983")).toBeNull();
  });

  it("rejects unrepresentable years", () => {
    expect(() => hebrewYear(5000)).toThrow(RangeError);
    expect(() => hebrewYear(999)).toThrow(RangeError);
  });
});

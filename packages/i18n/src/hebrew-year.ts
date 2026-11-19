import { hebrewLetters, punctuateNumeral, type NumeralMarks } from "./gematria.ts";
import type { UiLang } from "./lang.ts";

export interface HebrewYearOptions {
  /** Append the civil pair, "(1982–83)". Default true. */
  readonly civil?: boolean;
  /** ASCII `"`/`'` (default, as the catalog writes them) or Hebrew ״/׳. */
  readonly marks?: NumeralMarks;
  /** Prefix the thousands, ה'תשמ"ג. Default false. */
  readonly thousands?: boolean;
}

export interface HebrewYearParts {
  /** The input year, e.g. 5743. */
  readonly year: number;
  /** תשמ"ג */
  readonly hebrew: string;
  /** The civil years the Hebrew year spans: [1982, 1983]. */
  readonly civilYears: readonly [number, number];
  /** "1982–83" (full second year when the century changes: "1999–2000"). */
  readonly civil: string;
}

const EN_DASH = "–";

/** Hebrew year Y begins in the autumn of civil year Y − 3761: 5743 → [1982, 1983]. */
export function civilYearsOf(year: number): [number, number] {
  return [year - 3761, year - 3760];
}

export function civilPair(year: number): string {
  const [a, b] = civilYearsOf(year);
  const sameCentury = Math.floor(a / 100) === Math.floor(b / 100);
  return `${a}${EN_DASH}${sameCentury ? String(b % 100).padStart(2, "0") : b}`;
}

function isFormattable(year: number): boolean {
  return Number.isInteger(year) && year >= 1001 && year <= 9999 && year % 1000 !== 0;
}

export function hebrewYearParts(year: number, options: HebrewYearOptions = {}): HebrewYearParts | null {
  if (!isFormattable(year)) return null;
  const marks = options.marks ?? "ascii";
  const letters = punctuateNumeral(hebrewLetters(year % 1000), marks);
  const thousandsMark = marks === "hebrew" ? "׳" : "'";
  const hebrew = options.thousands
    ? `${hebrewLetters(Math.floor(year / 1000))}${thousandsMark}${letters}`
    : letters;
  return { year, hebrew, civilYears: civilYearsOf(year), civil: civilPair(year) };
}

/**
 * formatHebrewYear(5743) → `תשמ"ג (1982–83)`.
 *
 * Every edition shows the Hebrew year first with the civil pair in parentheses
 * (concept-quiet §8, concept-live §7), so the text is the same in every language;
 * `lang` is accepted so callers stay uniform and the rule can diverge later.
 * Callers render the result inside a direction-isolated element (`<bdi>`), see
 * `langFor`. A year that cannot be written (not an integer in 1001–9999) is
 * returned as plain digits rather than throwing (integration-plan §0.4).
 */
export function formatHebrewYear(year: number, _lang: UiLang, options: HebrewYearOptions = {}): string {
  const parts = hebrewYearParts(year, options);
  if (!parts) return String(year);
  return options.civil === false ? parts.hebrew : `${parts.hebrew} (${parts.civil})`;
}

/** Several years, e.g. a shiur given across two years: `תשל"ו (1975–76), תשמ"ג (1982–83)`. */
export function formatHebrewYears(years: readonly number[], lang: UiLang, options: HebrewYearOptions = {}): string {
  return [...years]
    .sort((a, b) => a - b)
    .map((y) => formatHebrewYear(y, lang, options))
    .join(", ");
}

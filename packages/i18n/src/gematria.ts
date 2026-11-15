/**
 * Hebrew numerals (gematria), implemented locally so this package has no
 * dependency on @emunas/normalize (normalize may re-export these; integration-plan
 * §8 W1.7). Pure and browser-safe.
 */

const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"] as const;
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"] as const;
const HUNDREDS = ["", "ק", "ר", "ש", "ת"] as const;

export type NumeralMarks = "ascii" | "hebrew";

const MARKS: Readonly<Record<NumeralMarks, { geresh: string; gershayim: string }>> = {
  ascii: { geresh: "'", gershayim: '"' },
  hebrew: { geresh: "׳", gershayim: "״" },
};

/** Bare letters for 1–999 (no punctuation). 15 and 16 are written ט״ו and ט״ז. */
export function hebrewLetters(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) {
    throw new RangeError(`hebrewLetters: expected an integer 1-999, got ${n}`);
  }
  let rest = n;
  let out = "";
  let hundreds = Math.floor(rest / 100);
  rest %= 100;
  while (hundreds >= 4) {
    out += "ת";
    hundreds -= 4;
  }
  out += HUNDREDS[hundreds] ?? "";
  if (rest === 15) return `${out}טו`;
  if (rest === 16) return `${out}טז`;
  out += TENS[Math.floor(rest / 10)] ?? "";
  out += ONES[rest % 10] ?? "";
  return out;
}

/** Adds geresh (single letter) or gershayim (before the last letter). */
export function punctuateNumeral(letters: string, marks: NumeralMarks = "ascii"): string {
  const { geresh, gershayim } = MARKS[marks];
  const chars = Array.from(letters);
  if (chars.length === 0) return "";
  if (chars.length === 1) return `${letters}${geresh}`;
  return `${chars.slice(0, -1).join("")}${gershayim}${chars[chars.length - 1] ?? ""}`;
}

/** 1–999 as a punctuated Hebrew numeral: 3 → ג', 15 → ט"ו, 743 → תשמ"ג. */
export function hebrewNumeral(n: number, marks: NumeralMarks = "ascii"): string {
  return punctuateNumeral(hebrewLetters(n), marks);
}

/** The letters' numeric value, ignoring punctuation and anything that is not a numeral letter. */
export function numeralValue(text: string): number {
  let sum = 0;
  for (const ch of text) sum += LETTER_VALUES.get(ch) ?? 0;
  return sum;
}

const LETTER_ENTRIES: readonly (readonly [string, number])[] = [
  ...ONES.map((l, i) => [l, i] as const),
  ...TENS.map((l, i) => [l, i * 10] as const),
  ...HUNDREDS.map((l, i) => [l, i * 100] as const),
  ["ך", 20],
  ["ם", 40],
  ["ן", 50],
  ["ף", 80],
  ["ץ", 90],
];
const LETTER_VALUES: ReadonlyMap<string, number> = new Map(LETTER_ENTRIES.filter(([l]) => l !== ""));

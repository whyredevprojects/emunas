/**
 * Hebrew numerals (gematria) and Hebrew years. Pure, browser-safe.
 *
 *   toHebrewNumeral(743)        → 'תשמ"ג'
 *   toHebrewNumeral(15)         → 'ט"ו'     (never י"ה)
 *   toHebrewNumeral(5)          → "ה'"
 *   hebrewYear(5743)            → 'תשמ"ג'   (thousands omitted, the usual form)
 *   hebrewYear(5743, { thousands: true }) → 'ה\'תשמ"ג'
 *   parseHebrewNumeral('תשמ"ג') → 743
 *   parseHebrewYear('תשמ"ג')    → 5743      (5th millennium assumed when no thousands given)
 *
 * `marks: "ascii"` (default) uses " and ', matching the catalog; `marks: "hebrew"` uses
 * gershayim U+05F4 and geresh U+05F3.
 */

export interface NumeralOptions {
  marks?: "ascii" | "hebrew";
  /** add the punctuation marks (default true) */
  punctuate?: boolean;
}

export interface YearOptions extends NumeralOptions {
  /** prefix the thousands letter with a geresh: ה'תשמ"ג (default false) */
  thousands?: boolean;
}

const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"] as const;
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"] as const;
const HUNDREDS = ["", "ק", "ר", "ש", "ת"] as const;

const VALUES: Readonly<Record<string, number>> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50, ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90,
  ק: 100, ר: 200, ש: 300, ת: 400,
};

function letters(n: number): string {
  // n in 1..999
  let out = "";
  let h = Math.floor(n / 100);
  while (h >= 4) {
    out += "ת";
    h -= 4;
  }
  out += HUNDREDS[h] ?? "";
  const rest = n % 100;
  if (rest === 15) return out + "טו";
  if (rest === 16) return out + "טז";
  out += TENS[Math.floor(rest / 10)] ?? "";
  out += ONES[rest % 10] ?? "";
  return out;
}

function punctuate(s: string, marks: "ascii" | "hebrew"): string {
  const geresh = marks === "hebrew" ? "\u05F3" : "'";
  const gershayim = marks === "hebrew" ? "\u05F4" : '"';
  if (s.length === 1) return s + geresh;
  return s.slice(0, -1) + gershayim + s.slice(-1);
}

/**
 * Hebrew numeral for 1..999 (the part below the thousands). Throws RangeError outside that range
 * or for non-integers: callers pass validated numbers.
 */
export function toHebrewNumeral(n: number, opts: NumeralOptions = {}): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) throw new RangeError(`toHebrewNumeral: ${n} not in 1..999`);
  const s = letters(n);
  return opts.punctuate === false ? s : punctuate(s, opts.marks ?? "ascii");
}

/** Hebrew year string, e.g. 5743 → תשמ"ג. Throws RangeError for years that are not 1000..9999 or are exact millennia. */
export function hebrewYear(year: number, opts: YearOptions = {}): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999 || year % 1000 === 0) {
    throw new RangeError(`hebrewYear: ${year} not representable`);
  }
  const body = toHebrewNumeral(year % 1000, opts);
  if (!opts.thousands) return body;
  const th = ONES[Math.floor(year / 1000)] ?? "";
  const geresh = opts.marks === "hebrew" ? "\u05F3" : "'";
  return th + geresh + body;
}

/** Value of a Hebrew numeral string; ignores quotes/geresh/whitespace. Null if it contains anything else or is empty. */
export function parseHebrewNumeral(s: string): number | null {
  const cleaned = s.replace(/[\s"'\u05F3\u05F4\u201C\u201D\u2018\u2019]/g, "");
  if (cleaned.length === 0) return null;
  let total = 0;
  for (const c of cleaned) {
    const v = VALUES[c];
    if (v === undefined) return null;
    total += v;
  }
  return total;
}

/**
 * Parse a Hebrew year. Accepts 'תשמ"ג', 'ה\'תשמ"ג', 'התשמ"ג' (thousands letter followed by
 * ≥3 letters) and gershayim variants. Without a thousands letter the 6th millennium (5000s) is
 * assumed. Null if unparseable.
 */
export function parseHebrewYear(s: string): number | null {
  const t = s.trim().replace(/[\u05F3\u2019\u2018]/g, "'").replace(/[\u05F4\u201C\u201D]/g, '"');
  let thousands = 5;
  let rest = t;
  const m = /^([א-ט])'(.+)$/.exec(t);
  if (m) {
    thousands = VALUES[m[1] as string] ?? 5;
    rest = m[2] as string;
  } else {
    const bare = t.replace(/["'\s]/g, "");
    // "התשמג": a numeral body never starts with ה followed by a hundreds letter (digits run
    // from large to small), so that shape means a thousands prefix.
    if (bare.length >= 2 && bare[0] === "ה" && /[קרשת]/.test(bare[1] ?? "")) {
      const tail = parseHebrewNumeral(bare.slice(1));
      if (tail !== null && tail >= 100 && tail <= 999) return 5000 + tail;
    }
  }
  const v = parseHebrewNumeral(rest);
  if (v === null || v < 1 || v > 999) return null;
  return thousands * 1000 + v;
}

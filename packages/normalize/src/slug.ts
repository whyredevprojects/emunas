/**
 * Deterministic ASCII slugs for stable keys (`[a-z0-9]+(-[a-z0-9]+)*`).
 *
 * - Latin input: `foldBasic`, spaces → "-". "the Ba'al Shem Tov" → "the-baal-shem-tov".
 * - Input containing Hebrew letters: a consonantal transliteration (Ashkenazi-leaning, lossy) plus
 *   a six-hex-digit hash of the folded original, so two different Hebrew strings never share a key
 *   ("עקבתא דמשיחא" → "ekbsa-dmshycha-<hash>").
 * - Empty input → "unknown".
 *
 * Never throws. Keys feed URLs, so this function is frozen: changing it renames pages.
 */
import { foldBasic } from "./fold.ts";
import { shortHash } from "./hash.ts";

const HEBREW_TO_ASCII: Readonly<Record<string, string>> = {
  "א": "a", // א
  "ב": "b", // ב
  "ג": "g", // ג
  "ד": "d", // ד
  "ה": "h", // ה
  "ו": "v", // ו
  "ז": "z", // ז
  "ח": "ch", // ח
  "ט": "t", // ט
  "י": "y", // י
  "ך": "k", // ך
  "כ": "k", // כ
  "ל": "l", // ל
  "ם": "m", // ם
  "מ": "m", // מ
  "ן": "n", // ן
  "נ": "n", // נ
  "ס": "s", // ס
  "ע": "e", // ע
  "ף": "f", // ף
  "פ": "p", // פ
  "ץ": "tz", // ץ
  "צ": "tz", // צ
  "ק": "k", // ק
  "ר": "r", // ר
  "ש": "sh", // ש
  "ת": "s", // ת
};

const HEBREW_LETTER = /[א-ת]/;
const MAX_SLUG_BODY = 60;

function trimSlug(s: string): string {
  return s
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Slug for any string (see module doc). */
export function slugify(input: string): string {
  const folded = foldBasic(input);
  if (folded.length === 0) return "unknown";
  const hasHebrew = HEBREW_LETTER.test(folded);
  const ascii = [...folded].map((c) => HEBREW_TO_ASCII[c] ?? c).join("");
  let body = trimSlug(ascii);
  const lossy = hasHebrew || body !== trimSlug(folded) || body.length > MAX_SLUG_BODY;
  if (body.length > MAX_SLUG_BODY) body = trimSlug(body.slice(0, MAX_SLUG_BODY));
  if (body.length === 0) return `x-${shortHash(folded)}`;
  return lossy ? `${body}-${shortHash(folded)}` : body;
}

/** True when `s` is a well-formed key. */
export function isKey(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

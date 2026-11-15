/**
 * Tokenizer shared by the transcript side and the shipped-text side of the
 * verbatim scan (integration-plan §5.3):
 *   NFC → strip nikud/cantillation (U+0591–U+05C7) → unify quote marks →
 *   runs of Unicode letters/digits → lowercase.
 *
 * Details that keep both sides comparable:
 *  - Hebrew punctuation inside U+0591–U+05C7 (maqaf U+05BE, paseq U+05C0,
 *    sof pasuq U+05C3, nun hafukha U+05C6) separates words instead of gluing
 *    them together; every other code point in the range is a mark and is dropped.
 *  - Quote marks (״ ” “ " ׳ ’ ‘ ' ` ´) between two letters/digits are removed, so
 *    חז"ל, חז״ל and חזל, or don't and dont, give the same token. Elsewhere they separate.
 *  - Other combining marks (\p{M}) stay part of the word they belong to.
 */

const HEBREW_PUNCT_IN_NIKUD_RANGE = /[־׀׃׆]/gu;
const NIKUD = /[֑-ׇ]/gu;
const DOUBLE_QUOTES = /[״“”„‟«»"]/gu;
const SINGLE_QUOTES = /[׳‘’‚‛`´']/gu;
const INNER_QUOTE = /(?<=[\p{L}\p{N}])["'](?=[\p{L}\p{N}])/gu;
const TOKEN = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu;

/** Text normalization only (no splitting). Exposed for tests and for callers that hash text. */
export function normalizeForGuard(text: string): string {
  return text
    .normalize("NFC")
    .replace(HEBREW_PUNCT_IN_NIKUD_RANGE, " ")
    .replace(NIKUD, "")
    .replace(DOUBLE_QUOTES, '"')
    .replace(SINGLE_QUOTES, "'")
    .replace(INNER_QUOTE, "")
    .toLowerCase();
}

/** Tokens of `text` as strings. */
export function tokenize(text: string): string[] {
  return normalizeForGuard(text).match(TOKEN) ?? [];
}

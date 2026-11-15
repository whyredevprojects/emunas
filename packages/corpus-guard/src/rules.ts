/** Forbidden keys and substrings (integration-plan §0.1, §5.2, §5.3; corpus-wave-plan §3.4). */

/** JSON keys that must never appear in any public output. */
export const FORBIDDEN_KEYS = [
  "heardAs",
  "asrNotes",
  "segments",
  "segs",
  "startSeg",
  "endSeg",
  "questionSegs",
  "answerSegs",
  "transcriptKey",
  "audioKey",
  // Raw-only keys of data/derived/corpus/raw/ (ASR spellings and their aggregation counters,
  // corpus-wave-plan §3.4). None of them is ever a public field.
  "asrVariants",
  "heardAsSamples",
  "sampleTitles",
  "resolutionTotals",
  "nullWork",
  "fromStories",
  "fromPeople",
] as const;

export type ForbiddenKey = (typeof FORBIDDEN_KEYS)[number];

/**
 * Keys distinctive enough to also flag in unquoted form (`heardAs:` in a minified bundle).
 * `segments` and `segs` are common identifiers in third-party code, so in JS/HTML they are
 * flagged only as quoted JSON keys.
 */
export const DISTINCTIVE_KEYS: readonly ForbiddenKey[] = [
  "heardAs",
  "asrNotes",
  "startSeg",
  "endSeg",
  "questionSegs",
  "answerSegs",
  "transcriptKey",
  "audioKey",
  "asrVariants",
  "heardAsSamples",
];

/** Substrings that point at transcript material. */
export const FORBIDDEN_SUBSTRINGS = [
  "transcripts/",
  "input.txt",
  ".vtt",
  "audits/",
  // The corpus raw/ folder (alias maps, ASR variants, digests) and its file names (§3.4).
  "corpus/raw/",
  "alias-map",
  "asr-variants",
] as const;

const KEY_SET: ReadonlySet<string> = new Set(FORBIDDEN_KEYS);

export function isForbiddenKey(key: string): key is ForbiddenKey {
  return KEY_SET.has(key);
}

const QUOTED_KEY = new RegExp(`["'\`]\\s*(${FORBIDDEN_KEYS.join("|")})\\s*["'\`]\\s*:`, "g");
const BARE_KEY = new RegExp(`(?<![\\w$.])(${DISTINCTIVE_KEYS.join("|")})\\s*:`, "g");

/** Forbidden keys used as object keys in JS/JSON-ish text (counts per key). */
export function findKeysInText(text: string): Map<ForbiddenKey, number> {
  const out = new Map<ForbiddenKey, number>();
  for (const re of [QUOTED_KEY, BARE_KEY]) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const k = m[1] as ForbiddenKey;
      out.set(k, (out.get(k) ?? 0) + 1);
    }
  }
  return out;
}

/** Forbidden substrings in text (counts per substring). */
export function findSubstrings(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of FORBIDDEN_SUBSTRINGS) {
    let n = 0;
    for (let i = text.indexOf(s); i !== -1; i = text.indexOf(s, i + s.length)) n++;
    if (n > 0) out.set(s, n);
  }
  return out;
}

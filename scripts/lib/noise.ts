// ASR noise detection (code, no LLM). Flags segments that are likely Whisper hallucination or
// unusable audio, so input preparation can mark them `[NOISE?]` before the model sees them.
// Segment indices are never changed; a flag is only a hint for the model.
//
// Heuristics (a segment can match several):
//   long_sparse  own duration (end - start) >= 30 s with < 3 letters per second. Normal speech in this
//                corpus runs ~8-10 letters/s; a long, sparse segment means Whisper skipped or
//                hallucinated over silence, singing or bad audio.
//   repeat_run   one token or short phrase (1-4 words) repeated >= 4 times in a row, covering at least
//                half the segment's words, or repeated >= 8 times anywhere ("און און און און ...").
//                Short stutters ("to to to") are not flagged.
//   repeat_prev  exact repeat (after whitespace/punctuation normalization) of the previous segment, when
//                it has >= 25 letters or is the 3rd+ line of a chain of identical lines (the 2nd line of
//                that chain is flagged too). A single short repeat ("for hundreds of years") is usually
//                the Mashgiach repeating for emphasis and is not flagged; the content is in the previous line.
//   near_empty   no letters at all and no digits (".", "...", "♪"), or <= 3 letters over >= 5 s.
//   stock_phrase a known Whisper filler: "Thank you for watching", "Subtitles by...", a segment that is
//                only "תודה רבה" (in Yiddish shiurim) or a repeated "שבת שלום".
import type { TranscriptSegment } from "./pilot.js";

export type NoiseType = "long_sparse" | "repeat_run" | "repeat_prev" | "near_empty" | "stock_phrase";
export const NOISE_TYPES: NoiseType[] = ["long_sparse", "repeat_run", "repeat_prev", "near_empty", "stock_phrase"];

export interface NoiseFlag {
  idx: number;
  types: NoiseType[];
}

export const NOISE_RULES = {
  longSparseMinSec: 30,
  longSparseMaxLettersPerSec: 3,
  repeatRunMinRepeats: 4,
  repeatRunMinShare: 0.5,
  repeatRunAnywhere: 8,
  repeatRunMaxNgram: 4,
  repeatPrevMinLetters: 25,
  repeatPrevChain: 3,
  nearEmptyMaxLetters: 3,
  nearEmptyMinSec: 5,
} as const;

const STOCK_PHRASES = [
  /thank you (so much |very much )?for watching/i,
  /subtitles? (by|from)|amara\.org|please subscribe|like and subscribe/i,
  /^(תודה רבה[.!]?\s*)+$/u,
  /^(שבת שלום[.!]?\s*){2,}$/u,
];

const LETTER = /\p{L}/gu;
const letters = (t: string): number => t.match(LETTER)?.length ?? 0;
const words = (t: string): string[] =>
  t
    .trim()
    .split(/\s+/u)
    .map((w) => w.replace(/[^\p{L}\p{N}'׳״"]/gu, "").toLowerCase())
    .filter(Boolean);
const norm = (t: string): string => words(t).join(" ");

/** Longest run of one n-gram (n = 1..maxN) repeated back to back: { repeats, wordsCovered }. */
export function longestRepeat(ws: string[], maxN: number = NOISE_RULES.repeatRunMaxNgram): { repeats: number; covered: number } {
  let best = { repeats: 1, covered: 0 };
  for (let n = 1; n <= maxN; n++) {
    for (let st = 0; st + 2 * n <= ws.length; st++) {
      let r = 1;
      while (st + (r + 1) * n <= ws.length) {
        let same = true;
        for (let k = 0; k < n; k++) if (ws[st + r * n + k] !== ws[st + k]) same = false;
        if (!same) break;
        r++;
      }
      if (r > 1 && r * n > best.covered) best = { repeats: r, covered: r * n };
    }
  }
  return best;
}

/** `chain`: how many consecutive identical (normalized) lines end at this segment, itself included. */
export function classifySegment(seg: TranscriptSegment, prev: TranscriptSegment | undefined, chain = 1): NoiseType[] {
  const R = NOISE_RULES;
  const types: NoiseType[] = [];
  const text = seg.text.trim();
  const dur = Math.max(0, seg.end - seg.start);
  const nL = letters(text);
  if (dur >= R.longSparseMinSec && nL / dur < R.longSparseMaxLettersPerSec) types.push("long_sparse");
  const ws = words(text);
  const rep = longestRepeat(ws);
  if (
    (rep.repeats >= R.repeatRunMinRepeats && rep.covered / Math.max(1, ws.length) >= R.repeatRunMinShare) ||
    rep.repeats >= R.repeatRunAnywhere
  ) {
    types.push("repeat_run");
  }
  if (prev && chain >= 2 && (nL >= R.repeatPrevMinLetters || chain >= R.repeatPrevChain)) types.push("repeat_prev");
  if ((nL === 0 && !/\d/u.test(text)) || (nL <= R.nearEmptyMaxLetters && dur >= R.nearEmptyMinSec)) types.push("near_empty");
  if (text && STOCK_PHRASES.some((re) => re.test(text))) types.push("stock_phrase");
  return types;
}

/** Flags for every noisy segment of one recording, in index order. */
export function detectNoise(segs: TranscriptSegment[]): NoiseFlag[] {
  const keys = segs.map((s) => norm(s.text));
  // chain[i]: length of the run of identical non-empty lines ending at i; chainLen[i]: full run length.
  const chain = keys.map(() => 1);
  for (let i = 1; i < keys.length; i++) if (keys[i] && keys[i] === keys[i - 1]) chain[i] = chain[i - 1]! + 1;
  const chainLen = [...chain];
  for (let i = keys.length - 2; i >= 0; i--) if (chain[i + 1]! > chain[i]!) chainLen[i] = chainLen[i + 1]!;
  const out: NoiseFlag[] = [];
  segs.forEach((s, i) => {
    // The 2nd line of a chain of >= 3 is flagged like the later ones.
    const c = chain[i]! >= 2 ? Math.max(chain[i]!, chainLen[i]!) : 1;
    const types = classifySegment(s, segs[i - 1], c);
    if (types.length) out.push({ idx: i, types });
  });
  return out;
}

export const NOISE_MARK = "[NOISE?]";

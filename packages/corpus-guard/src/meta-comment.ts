/**
 * Remarks on the transcript or on the shiur itself (owner rule, CLAUDE.md "Transcripts are never
 * published"): published text never mentions the transcript or ASR, which point at material that is
 * never published, and never judges the shiur or its words as garbled or unclear ("the shiur is X").
 * Remarks on the sound or the recording are allowed ("poor sound quality", "the recording cuts
 * off"). The post-pass reports every listed phrase in a built page (its visible text and prose
 * attributes; ids and URLs are skipped) or a published data file (every string value but ids).
 *
 * This file is the one place the term list lives. Terms are curated, not generated. Matching folds
 * both sides with `foldBasic` (@emunas/normalize: lowercase, no niqqud or diacritics, quotes dropped,
 * punctuation to spaces) and compares whole words; a word ending in `*` may run on (`garbl*` covers
 * garble, garbled, garbling). Words that are ordinary in the Mashgiach's teaching (Yiddish "נישט
 * קלאר", "not clear", and "צעמישט", "confused": "the shofar confuses the Satan") are listed only in
 * the phrases that tie them to the shiur's own words ("א צעמישטער חלק"), so the teaching passes.
 *
 * A legitimate use passes only through the reviewed allow-list, `site-policy/meta-comment-allow.json`,
 * keyed by file (a glob) and phrase (the published words around the hit). Prefer rewording the text.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { foldBasic } from "@emunas/normalize";

/** The curated terms, English then Yiddish. Changing this list is a reviewed change. */
export const META_COMMENT_TERMS: readonly string[] = [
  // English: the transcript and its machinery
  "transcri*",
  "untranscrib*",
  "asr",
  "speech recognition",
  // English: the shiur or its words judged garbled or unclear
  "garbl*",
  "unintelligib*",
  "shiur is unclear",
  "shiur is not clear",
  "shiur is incoherent",
  "hard to follow in the recording",
  // Yiddish: the transcript
  "טראנסקריפ*",
  "טראנסקריבי*",
  // Yiddish: the shiur or its words judged unclear (נישט קלאר alone is ordinary teaching)
  "נישט קלאר אויפן שיעור",
  "שיעור איז נישט קלאר",
  // Yiddish: the shiur or its words judged garbled (צעמישט alone is ordinary teaching: confused)
  "צעמישט* חלק",
  "צעמישט* שטיק",
  "צעמישט* אנהייב",
  "צעמישט* ווערטער",
  "צו צעמישט* צו פארשטיין",
  "חלק איז צעמישט*",
  "חלק איז שטארק צעמישט*",
  "שטיק איז שטארק צעמישט*",
  "שיעור איז צעמישט*",
  "שיעור איז שטארק צעמישט*",
  "ווערטער זענען צעמישט*",
  "זענען שטארק צעמישט*",
  "מערסטנס צעמישט*",
  "צומישט* חלק",
  "צו צומישט* צו פארשטיין",
  "צו צומישט* כדי צו פארשטיין",
];

/** Hebrew final letters as their medial forms, so a run-on stem (`אויפגענומען*`) matches `אויפגענומענעם`. */
const FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const unfinal = (w: string): string => w.replace(/[ךםןףץ]/g, (c) => FINALS[c] ?? c);

interface Word {
  text: string;
  /** May run on (`*`). */
  prefix: boolean;
}

interface CompiledTerm {
  /** The term as listed (reported). */
  term: string;
  words: Word[];
}

function compileWords(term: string): Word[] {
  return term
    .split(/\s+/)
    .filter((w) => w !== "")
    .flatMap((w) => {
      const prefix = w.endsWith("*");
      const parts = foldBasic(prefix ? w.slice(0, -1) : w).split(" ").filter((p) => p !== "");
      return parts.map((text, i) => {
        const runOn = prefix && i === parts.length - 1;
        return { text: runOn ? unfinal(text) : text, prefix: runOn };
      });
    });
}

/** First-word index: a full first word by itself, a run-on first word by its first two letters. */
function compile(terms: readonly string[]): Map<string, CompiledTerm[]> {
  const byFirst = new Map<string, CompiledTerm[]>();
  for (const term of new Set(terms)) {
    const words = compileWords(term);
    const first = words[0];
    if (!first) continue;
    const key = first.prefix ? first.text.slice(0, 2) : first.text;
    const list = byFirst.get(key) ?? [];
    list.push({ term, words });
    byFirst.set(key, list);
  }
  return byFirst;
}

const COMPILED = compile(META_COMMENT_TERMS);

export interface MetaCommentHit {
  term: string;
  /** About 60 characters of folded text on each side, the match in [brackets]. */
  context: string;
  /** The match in the folded text (`[start, end)`). */
  start: number;
  end: number;
  /** The folded text. */
  folded: string;
}

const CONTEXT = 60;

/** Every occurrence of a listed term in `text`. */
export function findMetaComments(text: string): MetaCommentHit[] {
  if (text.length < 3) return [];
  const folded = foldBasic(text);
  if (folded === "") return [];
  const words = folded.split(" ");
  const out: MetaCommentHit[] = [];
  let at = 0;
  for (let i = 0; i < words.length; at += words[i]!.length + 1, i++) {
    const w = words[i]!;
    const whole = COMPILED.get(w);
    const runOn = w.length >= 2 ? COMPILED.get(w.slice(0, 2)) : undefined;
    if (whole === undefined && runOn === undefined) continue;
    for (const list of runOn === whole ? [whole] : [whole, runOn]) {
      for (const c of list ?? []) {
        if (i + c.words.length > words.length) continue;
        const ok = c.words.every((cw, j) => (cw.prefix ? unfinal(words[i + j]!).startsWith(cw.text) : words[i + j] === cw.text));
        if (!ok) continue;
        let end = at;
        for (let j = 0; j < c.words.length; j++) end += words[i + j]!.length + (j > 0 ? 1 : 0);
        const before = folded.slice(Math.max(0, at - CONTEXT), at);
        const after = folded.slice(end, end + CONTEXT);
        const context = `${at > CONTEXT ? "…" : ""}${before}[${folded.slice(at, end)}]${after}${end + CONTEXT < folded.length ? "…" : ""}`;
        out.push({ term: c.term, context, start: at, end, folded });
      }
    }
  }
  return out;
}

/**
 * A reviewed exception. `file` is a glob over the post-pass source path (as the report prints it,
 * an NDJSON `:line` left off; `*` stays inside one path segment, `**` crosses segments). `phrase` is
 * the published words around the hit: folded, it holds a listed term, and a hit passes only when it
 * lies inside an occurrence of the phrase.
 */
export interface MetaCommentAllow {
  file: string;
  phrase: string;
  reason: string;
  reviewedBy: string;
  reviewedAt: string;
}

export interface CompiledAllow {
  entry: MetaCommentAllow;
  file: RegExp;
  phrase: string;
}

export const META_COMMENT_ALLOW_FILE = "meta-comment-allow.json";

function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[\\^$.|+()[\]{}]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** Validate and compile allow-list entries (`where` names them in errors). */
export function compileMetaCommentAllow(list: unknown, where: string): CompiledAllow[] {
  if (!Array.isArray(list)) throw new Error(`${where}: expected an array of { file, phrase, reason, reviewedBy, reviewedAt }`);
  return list.map((e: unknown, i) => {
    const r = (typeof e === "object" && e !== null ? e : {}) as Record<string, unknown>;
    for (const k of ["file", "phrase", "reason", "reviewedBy", "reviewedAt"] as const) {
      if (typeof r[k] !== "string" || r[k] === "") throw new Error(`${where}: entry ${i} needs a non-empty "${k}"`);
    }
    const entry = r as unknown as MetaCommentAllow;
    if (findMetaComments(entry.phrase).length === 0) throw new Error(`${where}: entry ${i}: the phrase holds no listed term`);
    return { entry, file: globToRegExp(entry.file), phrase: foldBasic(entry.phrase) };
  });
}

/** `site-policy/meta-comment-allow.json`. A missing file allows nothing; a malformed one is an error. */
export function readMetaCommentAllow(siteDir: string): CompiledAllow[] {
  const file = join(siteDir, META_COMMENT_ALLOW_FILE);
  if (!existsSync(file)) return [];
  return compileMetaCommentAllow(JSON.parse(readFileSync(file, "utf8")), file);
}

/** Whether `hit` in `source` lies inside an allow-listed phrase for that file. */
export function isMetaCommentAllowed(allow: readonly CompiledAllow[], source: string, hit: MetaCommentHit): boolean {
  const file = source.replace(/:\d+$/, "");
  for (const a of allow) {
    if (!a.file.test(file)) continue;
    for (let at = hit.folded.indexOf(a.phrase); at !== -1; at = hit.folded.indexOf(a.phrase, at + 1)) {
      if (at <= hit.start && at + a.phrase.length >= hit.end) return true;
    }
  }
  return false;
}

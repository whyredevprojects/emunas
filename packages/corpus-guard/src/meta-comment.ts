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
 * garble, garbled, garbling). A Hebrew term word also matches with the one-letter prefixes Hebrew
 * attaches (`META_COMMENT_PREFIX_LETTERS`: "התמלול", "בשיעור"). There is one list per interface
 * language (`UI_LANGS`), each matched against every text. Words that are ordinary in the
 * Mashgiach's teaching (Yiddish "נישט קלאר" and Hebrew "לא ברור", "not clear"; Yiddish "צעמישט",
 * "confused": "the shofar confuses the Satan"; Hebrew "משובש", "corrupt": "הגירסא משובשת") are
 * listed only in the phrases that tie them to the shiur's own words ("א צעמישטער חלק", "קטע
 * משובש"), so the teaching passes.
 *
 * A legitimate use passes only through the reviewed allow-list, `site-policy/meta-comment-allow.json`,
 * keyed by file (a glob) and phrase (the published words around the hit). Prefer rewording the text.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { foldBasic } from "@emunas/normalize";
import { UI_LANGS, type UiLang } from "@emunas/i18n";

/**
 * The curated terms of each interface language (`UI_LANGS`), so a language added there makes `tsc`
 * ask for its list here. Every list is matched against every text, whatever its language. Changing
 * a list is a reviewed change.
 */
export const META_COMMENT_TERMS_BY_LANG: Readonly<Record<UiLang, readonly string[]>> = {
  en: [
    // the transcript and its machinery
    "transcri*",
    "untranscrib*",
    "asr",
    "speech recognition",
    // the shiur or its words judged garbled or unclear
    "garbl*",
    "unintelligib*",
    "shiur is unclear",
    "shiur is not clear",
    "shiur is incoherent",
    "hard to follow in the recording",
  ],
  yi: [
    // the transcript ("איבערשרייבונג" is the W5.3 glossary word for a transcription; the verb
    // "איבערשרייבן", to copy out by hand, is ordinary teaching and is not listed)
    "טראנסקריפ*",
    "טראנסקריבי*",
    "איבערשרייבונג*",
    // the shiur or its words judged unclear (נישט קלאר alone is ordinary teaching)
    "נישט קלאר אויפן שיעור",
    "שיעור איז נישט קלאר",
    // the shiur or its words judged garbled (צעמישט alone is ordinary teaching: confused)
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
  ],
  he: [
    // the transcript and its machinery ("העתקה", copying out, is ordinary teaching and is not listed)
    "תמלול*",
    "תמליל*",
    "תומלל*",
    "טרנסקריפ*",
    "טרנסקריב*",
    "זיהוי דיבור",
    "זיהוי קולי",
    // the shiur or its words judged garbled (משובש alone is ordinary teaching: "הגירסא משובשת")
    "שיעור משובש*",
    "שיעור הוא משובש*",
    "קטע משובש*",
    "חלק משובש*",
    "מילים משובשות",
    "דבריו משובשים",
    "משובש* ואינו ברור",
    "משובש* לא ברור*",
    // the shiur or its words judged unclear (לא ברור alone is ordinary teaching)
    "שיעור אינו ברור",
    "שיעור לא ברור",
    "לא ברור* בשיעור",
    "קשה להבין את השיעור",
  ],
};

/** Every curated term, in `UI_LANGS` order. */
export const META_COMMENT_TERMS: readonly string[] = UI_LANGS.flatMap((lang) => META_COMMENT_TERMS_BY_LANG[lang]);

/**
 * One-letter prefixes a language attaches to its words (Hebrew ו ב כ ל מ ש ה: "והתמלול",
 * "בשיעור"). A word of that language's terms also matches the text word with up to
 * `MAX_PREFIX_LETTERS` of them in front. Yiddish and English write these as separate words.
 */
export const META_COMMENT_PREFIX_LETTERS: Readonly<Record<UiLang, string>> = { en: "", yi: "", he: "ובכלמשה" };
const MAX_PREFIX_LETTERS = 4;

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
  /** Prefix letters its language attaches to words (`META_COMMENT_PREFIX_LETTERS`). */
  prefixLetters: string;
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

/**
 * A text word and the words left after taking off up to `MAX_PREFIX_LETTERS` leading `letters`
 * (at least two letters stay): "והתמלול" → והתמלול, התמלול, תמלול.
 */
function prefixForms(word: string, letters: string): string[] {
  const out = [word];
  if (letters === "") return out;
  for (let k = 1; k <= MAX_PREFIX_LETTERS && word.length - k >= 2 && letters.includes(word[k - 1]!); k++) out.push(word.slice(k));
  return out;
}

function wordMatches(cw: Word, textWord: string, prefixLetters: string): boolean {
  return prefixForms(textWord, prefixLetters).some((f) => (cw.prefix ? unfinal(f).startsWith(cw.text) : f === cw.text));
}

/** First-word index: a full first word by itself, a run-on first word by its first two letters. */
function compile(byLang: Readonly<Record<UiLang, readonly string[]>>): Map<string, CompiledTerm[]> {
  const byFirst = new Map<string, CompiledTerm[]>();
  const seen = new Set<string>();
  for (const lang of UI_LANGS) {
    for (const term of byLang[lang]) {
      if (seen.has(term)) continue;
      seen.add(term);
      const words = compileWords(term);
      const first = words[0];
      if (!first) continue;
      const key = first.prefix ? first.text.slice(0, 2) : first.text;
      const list = byFirst.get(key) ?? [];
      list.push({ term, words, prefixLetters: META_COMMENT_PREFIX_LETTERS[lang] });
      byFirst.set(key, list);
    }
  }
  return byFirst;
}

const COMPILED = compile(META_COMMENT_TERMS_BY_LANG);
const ANY_PREFIX_LETTERS = [...new Set(UI_LANGS.flatMap((l) => [...META_COMMENT_PREFIX_LETTERS[l]]))].join("");

/** Terms whose first word may be `word` (with or without prefix letters), each once, in index order. */
function candidates(word: string): CompiledTerm[] {
  const out = new Set<CompiledTerm>();
  for (const f of prefixForms(word, ANY_PREFIX_LETTERS)) {
    for (const key of f.length >= 2 ? [f, f.slice(0, 2)] : [f]) for (const c of COMPILED.get(key) ?? []) out.add(c);
  }
  return [...out];
}

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
    for (const c of candidates(words[i]!)) {
      if (i + c.words.length > words.length) continue;
      if (!c.words.every((cw, j) => wordMatches(cw, words[i + j]!, c.prefixLetters))) continue;
      let end = at;
      for (let j = 0; j < c.words.length; j++) end += words[i + j]!.length + (j > 0 ? 1 : 0);
      const before = folded.slice(Math.max(0, at - CONTEXT), at);
      const after = folded.slice(end, end + CONTEXT);
      const context = `${at > CONTEXT ? "…" : ""}${before}[${folded.slice(at, end)}]${after}${end + CONTEXT < folded.length ? "…" : ""}`;
      out.push({ term: c.term, context, start: at, end, folded });
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

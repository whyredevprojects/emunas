/**
 * Snippets: a window of generated display text (D1 `moment_text`) with highlight offsets.
 * The text is returned as plain text plus [start, end) offsets, never as HTML, so the client
 * renders <mark> itself and nothing in the data can inject markup.
 */
import { foldWord, type NormalizedQuery } from "./query.ts";
import type { UiLang } from "@emunas/i18n";
import type { Snippet } from "./contract.ts";

export const SNIPPET_LENGTH = 200;
const LEAD = 60;
const ELLIPSIS = "…";

/** Words of display text, keeping in-word quotes/geresh (ל"ג, ר' ) attached. */
const WORD_RE = /[\p{L}\p{N}\p{M}]+(?:["'׳״’][\p{L}\p{N}\p{M}]+)*/gu;
/** One-letter prefixes that attach to Hebrew/Yiddish words. */
const HEBREW_PREFIX_RE = /^[בהוכלמש]{1,3}$/u;

export function queryTokenSet(q: NormalizedQuery): string[] {
  return [...new Set([...q.tokens, ...q.alternatives.flat()])].filter((t) => t.length > 0);
}

function wordMatches(folded: string, tokens: readonly string[]): boolean {
  for (const part of folded.split(" ")) {
    if (part.length === 0) continue;
    for (const t of tokens) {
      if (part === t || part.startsWith(t)) return true;
      if ([...t].length >= 2 && part.endsWith(t) && HEBREW_PREFIX_RE.test(part.slice(0, part.length - t.length))) {
        return true;
      }
      if ([...t].length >= 3 && part.includes(t)) return true;
    }
  }
  return false;
}

/** Offsets of words in `text` that match any query token. */
export function findMarks(text: string, tokens: readonly string[]): [number, number][] {
  if (tokens.length === 0) return [];
  const marks: [number, number][] = [];
  for (const m of text.matchAll(WORD_RE)) {
    const start = m.index;
    const word = m[0];
    if (wordMatches(foldWord(word), tokens)) marks.push([start, start + word.length]);
  }
  return marks;
}

function isSpace(ch: string | undefined): boolean {
  return ch !== undefined && /\s/u.test(ch);
}

/** Cut a window around the first highlight (or the start) and shift the offsets into it. */
export function makeSnippet(text: string, lang: UiLang, tokens: readonly string[]): Snippet {
  const marks = findMarks(text, tokens);
  if (text.length <= SNIPPET_LENGTH) return { text, lang, marks };

  const first = marks[0];
  let start = first === undefined ? 0 : Math.max(0, first[0] - LEAD);
  if (start > 0) {
    // move forward to the next word start so the snippet does not begin mid-word
    while (start < text.length && !isSpace(text[start - 1])) start++;
    if (first !== undefined && start > first[0]) start = first[0];
  }
  let end = Math.min(text.length, start + SNIPPET_LENGTH);
  if (end < text.length) {
    let back = end;
    while (back > start && !isSpace(text[back])) back--;
    if (back > start + SNIPPET_LENGTH / 2) end = back;
  }
  const body = text.slice(start, end).trim();
  const lead = text.slice(start, end).length - text.slice(start, end).trimStart().length;
  const prefix = start > 0 ? ELLIPSIS : "";
  const suffix = end < text.length ? ELLIPSIS : "";
  const shift = prefix.length - start - lead;
  const shifted: [number, number][] = marks
    .filter(([s, e]) => s >= start + lead && e <= start + lead + body.length)
    .map(([s, e]) => [s + shift, e + shift]);
  return { text: `${prefix}${body}${suffix}`, lang, marks: shifted };
}

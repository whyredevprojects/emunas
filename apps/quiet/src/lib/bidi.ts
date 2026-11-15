/**
 * Bidi helpers for mixed runs (concept-quiet §8, tech-quiet §4 "Mixed direction"). Every catalog
 * string is its own isolated run (`<bdi>`) with `lang`/`dir` from its dominant script; times,
 * numbers and daf/pasuk references sit in `<bdi dir="ltr">`.
 */
import { formatClock, isolate, langFor, type ContentLang, type Dir } from "@emunas/i18n";
import type { Ed } from "./edition.ts";

export interface RunAttrs {
  readonly lang: ContentLang;
  readonly dir: Dir;
}

/**
 * `lang`/`dir` for a catalog or data string of a shiur in language `shiurLang`. Hebrew-script
 * text is `yi` in a Yiddish shiur and `he` in an English one; Latin is `en`; mixed text follows
 * its first strong character (the same rule as `dir="auto"`, decided at build time).
 */
export function runAttrs(text: string, shiurLang: Ed): RunAttrs {
  const { lang, dir } = langFor(text, shiurLang);
  return { lang, dir };
}

/** Attributes for numbers, times and references: always an LTR isolate. */
export const NUMERIC_RUN = { dir: "ltr" } as const;

/** A time as shown on the page: `12:34` or `1:02:03`, ordinary digits in both editions. */
export function clock(seconds: number): string {
  return formatClock(Math.max(0, Math.floor(seconds)));
}

/** Plain-text contexts (`<title>`, `aria-label`): isolate catalog text so it cannot reorder its neighbours. */
export function isolateText(text: string): string {
  return isolate(text);
}

/** An LTR-isolated time for plain-text contexts inside RTL strings (accessible names). */
export function isolateClock(seconds: number): string {
  return isolate(clock(seconds), "ltr");
}

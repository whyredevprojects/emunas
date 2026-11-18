/**
 * Bidi helpers for mixed runs (concept-quiet §8, tech-quiet §4 "Mixed direction"). Every catalog
 * string is its own isolated run (`<bdi>`) with `lang`/`dir` from its dominant script; times,
 * numbers and daf/pasuk references sit in `<bdi dir="ltr">`.
 */
import { UI_DIR, formatClock, hebrewScriptLang, isolate, langFor, type AudioLang, type Dir, type UiLang } from "@emunas/i18n";
import type { Ed } from "./edition.ts";

export interface RunAttrs {
  readonly lang: UiLang;
  readonly dir: Dir;
}

/**
 * `lang`/`dir` for a catalog or data string shown in edition `ed`, of a shiur in language
 * `shiurLang` (`null` for a string that belongs to no one shiur: corpus names, index entries).
 * Hebrew-script text follows `hebrewScriptLang` from `@emunas/i18n` (`he` in the Hebrew edition;
 * otherwise `yi` in a Yiddish context and `he` in an English one); Latin is `en`; mixed text follows
 * its first strong character (the same rule as `dir="auto"`, decided at build time).
 */
export function runAttrs(text: string, shiurLang: AudioLang | null, ed: Ed): RunAttrs {
  const { lang, dir } = langFor(text, shiurLang, ed);
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

/**
 * `lang`/`dir` of a name already known to be in Hebrew script or not (a corpus name as the layer
 * gives it): Hebrew script follows `hebrewScriptLang` for a string of no one shiur, Latin is `en`.
 */
export function nameAttrs(hebrew: boolean, ed: Ed): RunAttrs {
  return hebrew ? { lang: hebrewScriptLang(null, ed), dir: "rtl" } : { lang: "en", dir: "ltr" };
}

/** The arrow that points forward in the edition's reading direction ("told in N other shiurim →"). */
export function forwardArrow(ed: Ed): "←" | "→" {
  return UI_DIR[ed] === "rtl" ? "←" : "→";
}

import type { UiLang } from "./lang.ts";
import { formatNumber, pad2 } from "./numbers.ts";
import { selectPlural, type PluralMessage } from "./plural.ts";

/**
 * - `short`: citation lines and lists, "1 hr 19 min" / "1 שעה 19 מינ׳" / "1 שע׳ 19 דק׳"
 * - `long`: prose and screen-reader labels, "1 hour 19 minutes" / "1 שעה 19 מינוטן" / "1 שעה 19 דקות"
 * - `clock`: time links and the player, "1:19:05" / "19:05" (same in every language)
 */
export type DurationStyle = "short" | "long" | "clock";

type Unit = "hour" | "minute" | "second";

const UNITS: Readonly<Record<UiLang, Readonly<Record<"short" | "long", Readonly<Record<Unit, PluralMessage>>>>>> = {
  en: {
    short: {
      hour: { other: "{n} hr" },
      minute: { other: "{n} min" },
      second: { other: "{n} sec" },
    },
    long: {
      hour: { one: "{n} hour", other: "{n} hours" },
      minute: { one: "{n} minute", other: "{n} minutes" },
      second: { one: "{n} second", other: "{n} seconds" },
    },
  },
  yi: {
    short: {
      hour: { other: "{n} שעה" },
      minute: { other: "{n} מינ׳" },
      second: { other: "{n} סעק׳" },
    },
    long: {
      hour: { one: "{n} שעה", other: "{n} שעות" },
      minute: { one: "{n} מינוט", other: "{n} מינוטן" },
      second: { one: "{n} סעקונדע", other: "{n} סעקונדעס" },
    },
  },
  he: {
    short: {
      hour: { other: "{n} שע׳" },
      minute: { other: "{n} דק׳" },
      second: { other: "{n} שנ׳" },
    },
    long: {
      // Hebrew `two` for hours: "שעתיים", not "2 שעות".
      hour: { one: "{n} שעה", two: "שעתיים", other: "{n} שעות" },
      minute: { one: "{n} דקה", other: "{n} דקות" },
      second: { one: "{n} שנייה", other: "{n} שניות" },
    },
  },
};

function unit(lang: UiLang, style: "short" | "long", u: Unit, n: number): string {
  return selectPlural(lang, n, UNITS[lang][style][u]).replace("{n}", formatNumber(n, lang));
}

/** Clock form of a non-negative number of seconds (floored): 79 → "1:19", 4745 → "1:19:05". */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/**
 * Formats a duration in seconds. `short`/`long` round to whole minutes from one
 * minute up and show seconds only below a minute. Digits are ordinary digits in
 * every language (concept-quiet §8). Invalid input (negative, NaN) gives "" so a
 * bad value in one shiur never breaks a page (integration-plan §0.4).
 */
export function formatDuration(seconds: number, lang: UiLang, style: DurationStyle = "short"): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (style === "clock") return formatClock(seconds);
  if (seconds < 59.5) return unit(lang, style, "second", Math.round(seconds));
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return unit(lang, style, "minute", m);
  if (m === 0) return unit(lang, style, "hour", h);
  return `${unit(lang, style, "hour", h)} ${unit(lang, style, "minute", m)}`;
}

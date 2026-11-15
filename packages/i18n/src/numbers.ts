import type { UiLang } from "./lang.ts";

/**
 * Numbers are written with ordinary (Western) digits in both editions
 * (concept-quiet §8). Yiddish uses the same grouping as English, so both
 * editions format through the `en` locale; this keeps output identical across
 * ICU builds, some of which have no `yi` number data.
 */
const formatters = new Map<string, Intl.NumberFormat>();

function formatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let nf = formatters.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat("en", options);
    formatters.set(key, nf);
  }
  return nf;
}

export function formatNumber(n: number, _lang: UiLang, options: Intl.NumberFormatOptions = {}): string {
  return formatter(options).format(n);
}

/** Two-digit zero padding for clock times. */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

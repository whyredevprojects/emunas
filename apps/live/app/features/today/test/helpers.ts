/**
 * Synthetic Today data keyed like the real build (W3.6 emits `@emunas/normalize` occasion keys:
 * `noach`, `chanukah`, `lag-baomer`, …). Each key gets one Yiddish and one English shiur, with
 * different years, and three moments each (insight, question, story). The cards live in the Today
 * file itself, as the emitter writes them (C1.7), with each one-liner picked for the file's reader.
 */
import { pickText, type UiLang } from "@emunas/i18n";
import { isReaderText } from "../../../components/Text.tsx";
import { LIVE_DATA_SCHEMA_VERSION, type TodayCard, type TodayFile, type TodayMoment } from "../live-data.ts";
import type { ContinueRow, TodayRow } from "../model.ts";

export function row(id: string, over: Partial<ContinueRow> = {}): ContinueRow {
  const lang = id.startsWith("en-") ? "en" : "yi";
  return {
    id,
    lang,
    status: "full",
    title: `title ${id}`,
    years: [],
    duration: 3600,
    oneLiner: { en: `one-liner ${id}`, yi: `קיצור ${id}` },
    series: null,
    next: null,
    ...over,
  };
}

/** The card of a row in the Today file for readers of `read` (its one-liner picked as the emitter does). */
export function card(r: TodayRow, read: UiLang = "en"): TodayCard {
  const ol = r.oneLiner === null ? null : isReaderText(r.oneLiner) ? r.oneLiner : pickText(r.oneLiner, read);
  return {
    lang: r.lang,
    title: r.title,
    duration: r.duration,
    years: r.years,
    status: r.status,
    ...(ol ? { oneLiner: { lang: ol.lang, text: ol.text } } : {}),
  };
}

export function moments(shiurId: string): TodayMoment[] {
  return [
    { id: `${shiurId}~i0`, t: 100 },
    { id: `${shiurId}~q0`, t: 200 },
    { id: `${shiurId}~st0`, t: 300 },
  ];
}

/** `yi-<key>` (year 5740) and `en-<key>` (year 5735) per key; the English one sorts first by year. */
export function todayData(keys: readonly string[], extraRows: TodayRow[] = [], read: UiLang = "en"): { today: TodayFile; rows: TodayRow[] } {
  const rows: TodayRow[] = [...extraRows];
  const today: TodayFile = {
    schemaVersion: LIVE_DATA_SCHEMA_VERSION,
    lang: read,
    counts: { total: 0, full: 0, catalogOnly: 0, downgraded: 0 },
    occasions: {},
    newlySummarized: [],
    cards: {},
  };
  for (const k of keys) {
    const yi = row(`yi-${k}`, { years: [5740] });
    const en = row(`en-${k}`, { years: [5735] });
    rows.push(yi, en);
    today.occasions[k] = { shiurIds: [en.id, yi.id], total: 2, moments: [...moments(en.id), ...moments(yi.id)], mix: null };
  }
  for (const r of rows) today.cards[r.id] = card(r, read);
  const full = rows.filter((r) => r.status === "full").length;
  today.counts = { total: rows.length + 10, full, catalogOnly: rows.length + 10 - full, downgraded: 0 };
  return { today, rows };
}

/**
 * Synthetic Today data keyed like the real build (W3.6 emits `@emunas/normalize` occasion keys:
 * `noach`, `chanukah`, `lag-baomer`, …). Each key gets one Yiddish and one English shiur, with
 * different years, and three moments each (insight, question, story).
 */
import { LIVE_DATA_SCHEMA_VERSION, type CorpusFile, type CorpusRow, type MomentRef, type TodayFile } from "../live-data.ts";

export function row(id: string, over: Partial<CorpusRow> = {}): CorpusRow {
  const lang = id.startsWith("en-") ? "en" : "yi";
  return {
    id,
    rev: "r",
    lang,
    category: "parsha",
    status: "full",
    title: `title ${id}`,
    heading: null,
    sectionTitle: "section",
    derived: "catalog",
    parsha: null,
    zman: null,
    perek: null,
    years: [],
    series: null,
    duration: 3600,
    oneLiner: { en: `one-liner ${id}`, yi: `קיצור ${id}` },
    entities: { works: [], people: [], concepts: [] },
    counts: { chapters: 1, stories: 1, questions: 1, insights: 1 },
    ...over,
  };
}

export function moments(shiurId: string): MomentRef[] {
  return [
    { id: `${shiurId}~i0`, shiurId, kind: "i", t: 100, end: 160 },
    { id: `${shiurId}~q0`, shiurId, kind: "q", t: 200, end: 260 },
    { id: `${shiurId}~st0`, shiurId, kind: "st", t: 300, end: 400 },
  ];
}

/** `yi-<key>` (year 5740) and `en-<key>` (year 5735) per key; the English one sorts first by year. */
export function todayData(keys: readonly string[], extraRows: CorpusRow[] = []): { today: TodayFile; corpus: CorpusFile } {
  const rows: CorpusRow[] = [...extraRows];
  const today: TodayFile = { schemaVersion: LIVE_DATA_SCHEMA_VERSION, occasions: {}, newlySummarized: [] };
  for (const k of keys) {
    const yi = row(`yi-${k}`, { parsha: k, years: [5740] });
    const en = row(`en-${k}`, { parsha: k, years: [5735] });
    rows.push(yi, en);
    today.occasions[k] = { shiurIds: [en.id, yi.id], moments: [...moments(en.id), ...moments(yi.id)] };
  }
  const full = rows.filter((r) => r.status === "full").length;
  return {
    today,
    corpus: {
      schemaVersion: LIVE_DATA_SCHEMA_VERSION,
      buildId: "test",
      counts: { total: rows.length + 10, full, catalogOnly: rows.length + 10 - full, downgraded: 0 },
      shiurim: rows,
    },
  };
}

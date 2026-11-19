/**
 * Small display helpers shared by Today and the series pages.
 */
import type { HebrewDate } from "@emunas/calendar";
import type { LocalizedText } from "@emunas/corpus/public";
import { formatHebrewYear, hebrewNumeral, hebrewYearParts, UI_LOCALE, type UiLang } from "@emunas/i18n";
import { OCCASIONS, PARSHIYOS } from "@emunas/normalize";
import { labelText, latinEdition } from "../../i18n/content.ts";
import type { FacetLabel, FacetsFile, MomentKind, ShiurFile, TodayFile } from "./live-data.ts";

/** "5 Kislev 5787" / "ה׳ כסלו תשפ״ז". */
export function formatHebrewDate(d: HebrewDate, ui: UiLang): string {
  if (latinEdition(ui)) return `${d.day} ${d.monthName} ${d.year}`;
  return `${hebrewNumeral(d.day, "hebrew")} ${d.monthNameHe} ${formatHebrewYear(d.year, ui, { civil: false, marks: "hebrew" })}`;
}

/** A civil date `YYYY-MM-DD` in the interface language (UTC, so the day never shifts). */
export function formatCivilDate(iso: string, ui: UiLang): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(UI_LOCALE[ui], { day: "numeric", month: "long", timeZone: "UTC" }).format(d);
  } catch {
    return iso;
  }
}

/** `lech-lecha` → `Lech Lecha`: the last resort for an occasion with no label in the data. */
export function humanizeKey(key: string): string {
  return key
    .split("-")
    .filter((p) => p !== "")
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

let labelIndex: Map<string, FacetLabel> | null = null;

/** Parsha and occasion names from the shared tables, by key (the same keys the calendar uses). */
function tableLabel(key: string): FacetLabel | undefined {
  labelIndex ??= new Map([...PARSHIYOS, ...OCCASIONS].map((r) => [r.key, { en: r.en, yi: r.yi, he: r.he }]));
  return labelIndex.get(key);
}

/**
 * The label for an occasion key: from the data file at hand (the Today file states it where it differs
 * from the shared tables; Explore passes `facets.json`), else from the `@emunas/normalize` tables,
 * else the key made readable.
 */
export function occasionLabel(
  key: string,
  source: Pick<TodayFile, "occasions"> | Pick<FacetsFile, "occasion"> | null,
  ui: UiLang,
): string {
  const f: FacetLabel | undefined =
    source === null ? undefined : "occasions" in source ? source.occasions[key]?.label : source.occasion[key]?.label;
  if (f) return labelText(f, ui);
  const table = tableLabel(key);
  return table ? labelText(table, ui) : humanizeKey(key);
}

/**
 * The first year of a shiur as its two parts (`תשל"ו`, `1975–76`), or null. Rendered separately so
 * the civil range keeps its left-to-right order inside right-to-left text.
 */
export function yearLabel(years: readonly number[]): { hebrew: string; civil: string } | null {
  if (years.length === 0) return null;
  const parts = hebrewYearParts(Math.min(...years));
  return parts ? { hebrew: parts.hebrew, civil: parts.civil } : { hebrew: String(Math.min(...years)), civil: "" };
}

export interface MomentContent {
  kind: MomentKind;
  text: LocalizedText;
}

/** The text of a moment (insight, question, story, …) from its shiur file; null when absent. */
export function momentContent(shiur: ShiurFile, momentId: string): MomentContent | null {
  const n = shiur.notes;
  if (!n) return null;
  const pick = <T extends { id: string }>(list: readonly T[]) => list.find((x) => x.id === momentId);
  const kp = pick(n.summary.keyPoints);
  if (kp) return { kind: "kp", text: kp.text };
  const i = pick(n.insights);
  if (i) return { kind: "i", text: i.text };
  const tk = pick(n.takeaways);
  if (tk) return { kind: "tk", text: tk.text };
  const q = pick(n.questions);
  if (q) return { kind: "q", text: q.q };
  const st = pick(n.stories);
  if (st) return { kind: "st", text: st.title };
  const s = pick(n.chapters);
  if (s) return { kind: "s", text: s.title };
  return null;
}

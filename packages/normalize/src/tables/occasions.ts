/**
 * Occasion (zman) table, ordered through the year from Elul.
 *
 * - `key`: stable ASCII key. Shares the occasion namespace with parsha keys (disjoint, tested).
 *   The same ids are used by @emunas/calendar's generated table.
 * - `order`: position in the year starting from Elul (sections of the calendar page).
 * - `window`: when the occasion falls on the Hebrew calendar, for "this week" and the calendar
 *   generator. Month names follow @hebcal/core ("Adar" = Adar II in a leap year).
 * - `aliases`: catalog spellings. Matched on `foldBasic` (quotes, gershayim, case and hyphens are
 *   already folded). Prefixes are handled by the lookup, not by aliases:
 *     "סעודת X"  → X with sub-heading "seudah"
 *     "חודש X"   → month X
 *     trailing audience words ("For Children", "קינדער", "Young Bachurim") → `audience`
 * - `OTHER_ZMANIM`: catalog values that are deliberately not calendar occasions (one-off events);
 *   they map to the `other` bucket without being reported as unmapped.
 *
 * reviewStatus "unreviewed".
 */
export const occasionsReviewStatus = "unreviewed" as const;

export type HebMonth =
  | "Tishrei" | "Cheshvan" | "Kislev" | "Tevet" | "Sh'vat" | "Adar" | "Adar I" | "Adar II"
  | "Nisan" | "Iyyar" | "Sivan" | "Tamuz" | "Av" | "Elul";

export interface HebDay {
  month: HebMonth;
  day: number;
}

export type OccasionWindow =
  /** a run of days: starts at `from` (+ `offset` days), lasts `days` (`daysIsrael` in Israel) */
  | { kind: "dates"; from: HebDay; days: number; daysIsrael?: number; offset?: number; note?: string }
  /** a whole month */
  | { kind: "month"; month: HebMonth }
  /** a special Shabbos; `hebcal` is the @hebcal/core event description */
  | { kind: "shabbos"; hebcal: string; note?: string }
  /** the weeks of a run of parshiyos (Shovavim) */
  | { kind: "parshiyos"; from: string; to: string; toLeap?: string };

export interface Occasion {
  key: string;
  order: number;
  he: string;
  yi: string;
  en: string;
  window: OccasionWindow;
  aliases: readonly string[];
}

/** The bucket for one-off events and anything unmapped. Not a real occasion; no window. */
export const OTHER_OCCASION_KEY = "other";

type Row = [key: string, he: string, en: string, window: OccasionWindow, aliases?: string[], yi?: string];

const d = (month: HebMonth, day: number, days = 1, extra: { daysIsrael?: number; offset?: number; note?: string } = {}): OccasionWindow => ({
  kind: "dates",
  from: { month, day },
  days,
  ...extra,
});

const ROWS: Row[] = [
  // ---- Elul and the Yamim Noraim ----
  ["elul", "אלול", "Elul", { kind: "month", month: "Elul" }, ["חודש אלול"]],
  ["rosh-hashanah", "ראש השנה", "Rosh Hashanah", d("Tishrei", 1, 2), ["ר\"ה"]],
  ["aseres-yemei-teshuvah", "עשרת ימי תשובה", "Aseres Yemei Teshuvah", d("Tishrei", 1, 10), ["עשי\"ת"]],
  ["shabbos-shuvah", "שבת שובה", "Shabbos Shuvah", { kind: "shabbos", hebcal: "Shabbat Shuva" }],
  ["yom-kippur", "יום הכיפורים", "Yom Kippur", d("Tishrei", 10), ["יו\"כ", "יום כיפור", "יום הכפורים"]],
  ["sukkos", "סוכות", "Sukkos", d("Tishrei", 15, 7), ["סוכות", "סכות", "חג הסוכות"]],
  ["hoshana-rabbah", "הושענא רבה", "Hoshana Rabbah", d("Tishrei", 21)],
  ["shemini-atzeres", "שמיני עצרת", "Shemini Atzeres", d("Tishrei", 22, 2, { daysIsrael: 1 }), ["שמחת תורה", "שמע\"צ"]],
  // ---- winter ----
  ["kislev", "כסלו", "Kislev", { kind: "month", month: "Kislev" }],
  ["yud-tes-kislev", "י\"ט כסלו", "Yud-Tes Kislev", d("Kislev", 19)],
  ["chanukah", "חנוכה", "Chanukah", d("Kislev", 25, 8), ["חנוכה"]],
  ["shabbos-chanukah", "שבת חנוכה", "Shabbos Chanukah", { kind: "shabbos", hebcal: "Chanukah", note: "the Shabbos (or Shabbosos) within Chanukah" }],
  ["zos-chanukah", "זאת חנוכה", "Zos Chanukah", d("Kislev", 25, 1, { offset: 7, note: "eighth day of Chanukah (2 or 3 Tevet)" })],
  ["teves", "טבת", "Teves", { kind: "month", month: "Tevet" }],
  ["shovavim", "שובבי\"ם", "Shovavim", { kind: "parshiyos", from: "shemos", to: "mishpatim", toLeap: "tetzaveh" }, ["שובבים", "שובבים ת\"ת"]],
  ["tu-bishvat", "ט\"ו בשבט", "Tu BiShvat", d("Sh'vat", 15), ["חמשה עשר בשבט"]],
  ["shabbos-shirah", "שבת שירה", "Shabbos Shirah", { kind: "shabbos", hebcal: "Shabbat Shirah" }],
  ["parshas-shekalim", "שקלים", "Parshas Shekalim", { kind: "shabbos", hebcal: "Shabbat Shekalim" }, ["פרשת שקלים", "שבת שקלים"]],
  ["adar", "אדר", "Adar", { kind: "month", month: "Adar" }],
  ["purim-katan", "פורים קטן", "Purim Katan", d("Adar I", 14, 1, { note: "leap years only" })],
  ["parshas-zachor", "זכור", "Parshas Zachor", { kind: "shabbos", hebcal: "Shabbat Zachor" }, ["פרשת זכור", "שבת זכור"]],
  ["purim", "פורים", "Purim", d("Adar", 14)],
  ["shushan-purim", "שושן פורים", "Shushan Purim", d("Adar", 15)],
  ["purim-meshulash", "פורים המשולש", "Purim Meshulash", d("Adar", 14, 3, { note: "only when 15 Adar falls on Shabbos (Jerusalem)" }), ["פורים משולש"]],
  ["parshas-parah", "פרה", "Parshas Parah", { kind: "shabbos", hebcal: "Shabbat Parah" }, ["פרשת פרה", "שבת פרה"]],
  ["parshas-hachodesh", "החודש", "Parshas HaChodesh", { kind: "shabbos", hebcal: "Shabbat HaChodesh" }, ["פרשת החודש", "שבת החודש"]],
  // ---- Nisan to Sivan ----
  ["nisan", "ניסן", "Nisan", { kind: "month", month: "Nisan" }, ["נ\u05B4יסן", "חודש ניסן"]],
  ["rosh-chodesh-nisan", "ר\"ח ניסן", "Rosh Chodesh Nisan", d("Nisan", 1), ["ראש חודש ניסן"]],
  ["erev-pesach", "ערב פסח", "Erev Pesach", d("Nisan", 14)],
  ["pesach", "פסח", "Pesach", d("Nisan", 15, 8, { daysIsrael: 7 }), ["חג הפסח"]],
  ["chol-hamoed-pesach", "חול המועד פסח", "Chol HaMoed Pesach", d("Nisan", 17, 4, { daysIsrael: 5, note: "Israel: from 16 Nisan" }), ["חוה\"מ פסח"]],
  ["shevii-shel-pesach", "שביעי של פסח", "Shevi'i shel Pesach", d("Nisan", 21, 2, { daysIsrael: 1 }), ["שביעי של פסח", "אחרון של פסח"]],
  ["sefirah", "ספירה", "Sefirah", d("Nisan", 16, 49), ["ספירת העומר", "ימי הספירה"]],
  ["iyar", "אייר", "Iyar", { kind: "month", month: "Iyyar" }, ["איר"]],
  ["lag-baomer", "ל\"ג בעומר", "Lag BaOmer", d("Iyyar", 18)],
  ["sivan", "סיון", "Sivan", { kind: "month", month: "Sivan" }, ["סיוון"]],
  ["rosh-chodesh-sivan", "ר\"ח סיון", "Rosh Chodesh Sivan", d("Sivan", 1), ["ראש חודש סיון"]],
  ["shavuos", "שבועות", "Shavuos", d("Sivan", 6, 2, { daysIsrael: 1 }), ["חג השבועות"]],
  // ---- summer ----
  ["tamuz", "תמוז", "Tamuz", { kind: "month", month: "Tamuz" }, ["תמוז"]],
  ["yahrzeit-ohr-hachaim", "יארצייט אור החיים הק'", "Yahrzeit of the Ohr HaChaim", d("Tamuz", 15), ["יא\"צ אוה\"ח הק'", "יא\"צ אור החיים"]],
  ["bein-hametzarim", "בין המצרים", "Bein HaMetzarim", d("Tamuz", 17, 22), ["בין המיצרים"]],
  ["nine-days", "תשעת הימים", "The Nine Days", d("Av", 1, 9)],
  ["shabbos-chazon", "שבת חזון", "Shabbos Chazon", { kind: "shabbos", hebcal: "Shabbat Chazon" }],
  ["tishah-beav", "תשעה באב", "Tishah B'Av", d("Av", 9, 1, { note: "10 Av when 9 Av is Shabbos" }), ["ט' באב", "ט באב", "תשעה באב"]],
  ["shabbos-nachamu", "שבת נחמו", "Shabbos Nachamu", { kind: "shabbos", hebcal: "Shabbat Nachamu" }],
  ["tu-beav", "ט\"ו באב", "Tu B'Av", d("Av", 15), ["חמשה עשר באב"]],
];

export const OCCASIONS: readonly Occasion[] = ROWS.map(([key, he, en, window, aliases, yi], i) => ({
  key,
  order: i + 1,
  he,
  yi: yi ?? he,
  en,
  window,
  aliases: [he, en, ...(aliases ?? [])],
}));

/** Catalog zman values that are one-off events, deliberately in the `other` bucket. */
export const OTHER_ZMANIM: readonly string[] = [
  "מהר\"ל גבורת ה'",
  "מסיבת לחיים בקעמפ תורה ודעת דרשה אחר שריפה במחנה תורה ודעת (קעמפ)",
  "יום המיוחס",
];

/** Explicit raw → occasion mappings that carry a sub-heading the prefix rules cannot derive. */
export const SPECIAL_ZMANIM: readonly { raw: string; key: string; sub: "seudah" | "lechaim" }[] = [
  { raw: "לחיים יא\"צ אוה\"ח הק'", key: "yahrzeit-ohr-hachaim", sub: "lechaim" },
];

/** Month aliases for "חודש X" / "ר\"ח X". */
export const MONTH_OCCASION: Readonly<Record<string, string>> = {
  "אלול": "elul",
  "כסלו": "kislev",
  "טבת": "teves",
  "אדר": "adar",
  "ניסן": "nisan",
  "אייר": "iyar",
  "איר": "iyar",
  "סיון": "sivan",
  "סיוון": "sivan",
  "תמוז": "tamuz",
};

/**
 * Approximate position of a parsha or occasion inside a Hebrew year (Tishrei → Elul), used only to
 * list a year's shiurim "in calendar order" (concept-quiet §5.6). The catalog has no dates beyond
 * the year, so this is a sort key, not a date: months count as 30 days, parshiyos are spread
 * evenly from the Shabbos after Sukkos to the end of Elul.
 */
import { occasionByKeyOf, parshaByKey, type Occasion } from "@emunas/normalize";

const MONTH_INDEX: Readonly<Record<string, number>> = {
  Tishrei: 0,
  Cheshvan: 1,
  Kislev: 2,
  Tevet: 3,
  "Sh'vat": 4,
  "Adar I": 4.5,
  Adar: 5,
  "Adar II": 5,
  Nisan: 6,
  Iyyar: 7,
  Sivan: 8,
  Tamuz: 9,
  Av: 10,
  Elul: 11,
};

const day = (month: string, d: number): number => (MONTH_INDEX[month] ?? 12) * 30 + d;

/** Special Shabbosos by their hebcal name. */
const SHABBOS_DAY: Readonly<Record<string, number>> = {
  "Shabbat Shuva": day("Tishrei", 5),
  Chanukah: day("Kislev", 27),
  "Shabbat Shekalim": day("Sh'vat", 27),
  "Shabbat Zachor": day("Adar", 10),
  "Shabbat Parah": day("Adar", 20),
  "Shabbat HaChodesh": day("Adar", 27),
  "Shabbat Chazon": day("Av", 6),
  "Shabbat Nachamu": day("Av", 12),
};

/** Sort keys after every real position. */
export const UNPLACED = 1000;

const FIRST_PARSHA_DAY = day("Tishrei", 23);
const LAST_PARSHA_DAY = day("Elul", 28);

export function parshaPosition(key: string): number {
  const p = parshaByKey(key);
  if (!p) return UNPLACED;
  // Vezos Haberachah is read on Simchas Torah.
  if (p.key === "vezos-haberachah") return day("Tishrei", 22);
  return FIRST_PARSHA_DAY + ((p.order - 1) * (LAST_PARSHA_DAY - FIRST_PARSHA_DAY)) / 52;
}

function occasionPosition(o: Occasion): number {
  const w = o.window;
  switch (w.kind) {
    case "dates":
      return day(w.from.month, w.from.day + (w.offset ?? 0));
    case "month":
      return day(w.month, 0.5);
    case "shabbos":
      return SHABBOS_DAY[w.hebcal] ?? (w.hebcal === "Shabbat Shirah" ? parshaPosition("beshalach") : UNPLACED);
    case "parshiyos":
      return parshaPosition(w.from);
  }
}

export function zmanPosition(key: string): number {
  const o = occasionByKeyOf(key);
  return o ? occasionPosition(o) : UNPLACED;
}

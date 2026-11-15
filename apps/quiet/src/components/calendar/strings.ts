/**
 * UI strings for the calendar (לוח) and year (שנים) pages (concept-quiet §5.5, §5.6). Kept beside
 * the components that use them so this package does not edit the shared table in `src/i18n/`
 * (W2.3); the integrator may fold them in later. Same rules: `createT` from `@emunas/i18n`, the
 * Yiddish table is typed against the English keys.
 *
 * Wording status: unreviewed (W5.3 does the fixed-copy pass).
 */
import { createT, type MessageTable, type TFunction } from "@emunas/i18n";
import type { Ed } from "../../lib/edition.ts";

export const calendarEn = {
  "cal.label": "Calendar",
  "cal.views": "Ways into the calendar",
  "cal.byParsha": "By parsha",
  "cal.byZman": "By zman",
  "cal.byYear": "By year",

  "cal.parsha.title": "Shiurim by parsha",
  "cal.parsha.intro": "Every shiur on each parsha, the Yiddish and the English together, by year.",
  "cal.zman.title": "Shiurim by zman",
  "cal.zman.intro": "Around the year from Elul. Every shiur on each zman, the Yiddish and the English together, by year.",

  "cal.chumash.bereishis": "Bereishis",
  "cal.chumash.shemos": "Shemos",
  "cal.chumash.vayikra": "Vayikra",
  "cal.chumash.bamidbar": "Bamidbar",
  "cal.chumash.devarim": "Devarim",

  "cal.count": { one: "{count} shiur", other: "{count} shiurim" },
  "cal.countNone": "none",
  "cal.parsha.pageIntro": "Every shiur on this parsha in the catalog, in Yiddish and in English, by year.",
  "cal.zman.pageIntro": "Every shiur on this zman in the catalog, in Yiddish and in English, by year.",
  "cal.parsha.empty": "There is no shiur on this parsha in the catalog.",
  "cal.zman.empty": "There is no shiur on this zman in the catalog.",
  "cal.sub.seudah": "At the seudah",
  "cal.sub.lechaim": "At a lechaim",
  "cal.audience.children": "for children",
  "cal.audience.bachurim": "for bachurim",
  "cal.yearUnknown": "year not recorded",

  "cal.other.title": "Other occasions",
  "cal.other.intro": "Shiurim the guide lists under an occasion that has no place of its own above.",

  "years.title": "Shiurim by year",
  "years.intro": "The year is recorded for {known} of the {total} shiurim. A shiur given over two years is listed under both.",
  "years.col.year": "Year",
  "years.col.count": "Shiurim",
  "years.unknown": "Year not recorded",
  "years.page.intro": "In calendar order, by parsha and zman. The catalog gives no date finer than the year.",
  "years.unknown.title": "Year not recorded",
  "years.unknown.intro": {
    one: "The catalog gives no year for this shiur.",
    other: "The catalog gives no year for these {count} shiurim.",
  },
  "years.unknown.why":
    "The sets and the simchos were not dated in the 2012 Pocket Guide, and most recordings outside the guide carry no year. They are listed here by section, in catalog order.",
} as const;

export type CalendarKey = keyof typeof calendarEn;

export const calendarYi: MessageTable<CalendarKey> = {
  "cal.label": "לוח",
  "cal.views": "וועגן אריין אין לוח",
  "cal.byParsha": "לויט די פרשיות",
  "cal.byZman": "לויט די זמנים",
  "cal.byYear": "לויט די יארן",

  "cal.parsha.title": "שיעורים לויט די פרשיות",
  "cal.parsha.intro": "יעדער שיעור אויף יעדער פרשה, אידיש און ענגליש צוזאמען, לויט די יארן.",
  "cal.zman.title": "שיעורים לויט די זמנים",
  "cal.zman.intro": "ארום דעם יאר פון אלול. יעדער שיעור אויף יעדן זמן, אידיש און ענגליש צוזאמען, לויט די יארן.",

  "cal.chumash.bereishis": "ספר בראשית",
  "cal.chumash.shemos": "ספר שמות",
  "cal.chumash.vayikra": "ספר ויקרא",
  "cal.chumash.bamidbar": "ספר במדבר",
  "cal.chumash.devarim": "ספר דברים",

  "cal.count": { one: "{count} שיעור", other: "{count} שיעורים" },
  "cal.countNone": "קיינע",
  "cal.parsha.pageIntro": "יעדער שיעור אויף דער פרשה אינעם קאטאלאג, אויף אידיש און אויף ענגליש, לויט די יארן.",
  "cal.zman.pageIntro": "יעדער שיעור אויף דעם זמן אינעם קאטאלאג, אויף אידיש און אויף ענגליש, לויט די יארן.",
  "cal.parsha.empty": "אינעם קאטאלאג איז נישטא קיין שיעור אויף דער פרשה.",
  "cal.zman.empty": "אינעם קאטאלאג איז נישטא קיין שיעור אויף דעם זמן.",
  "cal.sub.seudah": "ביי דער סעודה",
  "cal.sub.lechaim": "ביי א לחיים",
  "cal.audience.children": "פאר קינדער",
  "cal.audience.bachurim": "פאר בחורים",
  "cal.yearUnknown": "יאר נישט פארצייכנט",

  "cal.other.title": "אנדערע געלעגנהייטן",
  "cal.other.intro": "שיעורים וואס דער גייד שטעלט אונטער א געלעגנהייט וואס האט נישט קיין אייגן ארט אויבן.",

  "years.title": "שיעורים לויט די יארן",
  "years.intro": "דאס יאר איז פארצייכנט ביי {known} פון די {total} שיעורים. א שיעור וואס איז געזאגט געווארן איבער צוויי יאר שטייט אונטער ביידע.",
  "years.col.year": "יאר",
  "years.col.count": "שיעורים",
  "years.unknown": "יאר נישט פארצייכנט",
  "years.page.intro": "לויט דעם סדר פון יאר, לויט פרשה און זמן. דער קאטאלאג גיט נישט קיין דאטום מער ווי דאס יאר.",
  "years.unknown.title": "יאר נישט פארצייכנט",
  "years.unknown.intro": {
    one: "דער קאטאלאג גיט נישט קיין יאר פאר דעם שיעור.",
    other: "דער קאטאלאג גיט נישט קיין יאר פאר די {count} שיעורים.",
  },
  "years.unknown.why":
    "די סדרות און די שמחות זענען נישט דאטירט אינעם פּאָקעט גייד פון 2012, און רוב רעקארדירונגען אויסער דעם גייד האבן נישט קיין יאר. זיי שטייען דא לויט די אפטיילונגען, אינעם סדר פון קאטאלאג.",
};

const cache = new Map<Ed, TFunction<CalendarKey>>();

/** The typed `t()` for the calendar pages of an edition. */
export function useCalendarT(ed: Ed): TFunction<CalendarKey> {
  let t = cache.get(ed);
  if (!t) {
    t = createT<CalendarKey>({ en: calendarEn, yi: calendarYi }, ed);
    cache.set(ed, t);
  }
  return t;
}

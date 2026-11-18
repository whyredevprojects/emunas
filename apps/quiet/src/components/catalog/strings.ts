/**
 * UI strings of the catalog pages (W3.1): title page, contents, sections, series. Kept next to the
 * pages that use them (integration-plan §1.3: UI strings stay in each app); typed with `createT`
 * like `src/i18n/`, so a missing Yiddish or Hebrew key fails `tsc`.
 *
 * Wording status: unreviewed; the Yiddish needs a native reader (W5.3). Plain voice, no "content"
 * vocabulary (concept-quiet §8, §11).
 */
import { byUiLang, createT, type MessageTable, type MessageTables, type TFunction } from "@emunas/i18n";
import type { Ed } from "../../lib/edition.ts";

export const catalogEn = {
  "home.lead":
    "The recorded shiurim of Harav Moshe Wolfson zt\"l.",
  "home.standing":
    "{total} shiurim, about {hours} hours.",
  "home.thisWeek": "This week",
  "home.thisWeekLead": "The parsha of the week and the nearest zman, as of {date}.",
  "home.parsha": "Parshas {name}",
  "home.zmanNow": "Now: {name}",
  "home.zmanSoon": "Coming: {name}",
  "home.allOn": { one: "The {count} shiur on {name}", other: "All {count} shiurim on {name}" },
  "home.liveLead": "For more data and an interactive way to listen, use {link}.",
  "home.liveLink": "Analyze",
  "home.contents": "The contents in brief",
  "home.contentsAll": "The full contents",
  "home.indexes": "Indexes",

  "count.shiurim": { one: "{count} shiur", other: "{count} shiurim" },

  "contents.title": "Contents",
  "contents.yiddish": "Shiurim in Yiddish",
  "contents.english": "Shiurim in English",
  "contents.more": "More recordings",
  "contents.series": "Series",
  "contents.seriesLead": "Sets of shiurim given as a course, to be heard in order.",
  "contents.sectionsLabel": "Sections",

  "section.alsoSeries": "Also set out as a series:",
  "section.jump": "In this section",
  "section.other": "Other",
  "section.otherZman": "Other occasions",
  "section.otherParsha": "Without a parsha",

  "table.caption": "{name}: the shiurim in order",
  "table.part": "Part",
  "table.title": "Title",
  "table.parsha": "Parsha",
  "table.zman": "Zman",
  "table.occasion": "Parsha / zman",
  "table.year": "Year",
  "table.length": "Length",
  "table.notes": "In brief (notes)",
  "table.scroll": "{name} (the table scrolls sideways)",
  "row.noRecording": "no recording online",
  "row.part": "Part {part} of {count}",

  "series.lead": "{count} in order.",
  "series.perek": "Perek {perek}",
  "series.noPerek": "Without a perek",
  "series.jump": "Perakim",
  "series.empty": "None of the shiurim of this set is in the collection online.",
  "series.intro": "About this series",
  "series.keyThemes": "Key themes",

  "chumash.bereishis": "Sefer Bereishis",
  "chumash.shemos": "Sefer Shemos",
  "chumash.vayikra": "Sefer Vayikra",
  "chumash.bamidbar": "Sefer Bamidbar",
  "chumash.devarim": "Sefer Devarim",
} as const;

export type CatalogKey = keyof typeof catalogEn;

export const catalogYi: MessageTable<CatalogKey> = {
  "home.lead":
    "די רעקארדירטע שיעורים פון הרב משה וואלפסאן זצ\"ל.",
  "home.standing": "{total} שיעורים, בערך {hours} שעה.",
  "home.thisWeek": "די וואך",
  "home.thisWeekLead": "די פרשה פון דער וואך און דער נאענטסטער זמן, לויט {date}.",
  "home.parsha": "פרשת {name}",
  "home.zmanNow": "יעצט: {name}",
  "home.zmanSoon": "באלד: {name}",
  "home.allOn": { one: "דער שיעור אויף {name}", other: "אלע {count} שיעורים אויף {name}" },
  "home.liveLead": "פאר מער פרטים און א מער אינטעראקטיוון אופן צו הערן, נוצט {link}.",
  "home.liveLink": "עיון",
  "home.contents": "דער תוכן בקיצור",
  "home.contentsAll": "דער גאנצער תוכן",
  "home.indexes": "מפתחות",

  "count.shiurim": { one: "{count} שיעור", other: "{count} שיעורים" },

  "contents.title": "תוכן",
  "contents.yiddish": "שיעורים אויף אידיש",
  "contents.english": "שיעורים אויף ענגליש",
  "contents.more": "נאך רעקארדירונגען",
  "contents.series": "סדרות",
  "contents.seriesLead": "סדרות פון שיעורים וואס זענען געזאגט געווארן נאכאנאנד, צו הערן על הסדר.",
  "contents.sectionsLabel": "אפטיילונגען",

  "section.alsoSeries": "אויך אויסגעשטעלט ווי א סדרה:",
  "section.jump": "אין דער אפטיילונג",
  "section.other": "אנדערע",
  "section.otherZman": "אנדערע זמנים",
  "section.otherParsha": "אן א פרשה",

  "table.caption": "{name}: די שיעורים לויטן סדר",
  "table.part": "טייל",
  "table.title": "קעפל",
  "table.parsha": "פרשה",
  "table.zman": "זמן",
  "table.occasion": "פרשה / זמן",
  "table.year": "יאר",
  "table.length": "לענג",
  "table.notes": "בקיצור (נאטיצן)",
  "table.scroll": "{name} (מען קען די טאבעלע רוקן אויף די זייט)",
  "row.noRecording": "קיין רעקארדירונג אויפן אינטערנעט",
  "row.part": "טייל {part} פון {count}",

  "series.lead": "{count} לויטן סדר.",
  "series.perek": "פרק {perek}",
  "series.noPerek": "אן א פרק",
  "series.jump": "פרקים",
  "series.empty": "קיינער פון די שיעורים פון דער סדרה איז נישט אין דער זאמלונג אויפן אינטערנעט.",
  "series.intro": "וועגן דער סדרה",
  "series.keyThemes": "די הויפט ענינים",

  "chumash.bereishis": "ספר בראשית",
  "chumash.shemos": "ספר שמות",
  "chumash.vayikra": "ספר ויקרא",
  "chumash.bamidbar": "ספר במדבר",
  "chumash.devarim": "ספר דברים",
};

export const catalogHe: MessageTable<CatalogKey> = {
  "home.lead": "השיעורים המוקלטים של הגה\"צ רבי משה וולפסון זצ\"ל.",
  "home.standing": "{total} שיעורים, כ־{hours} שעות.",
  "home.thisWeek": "השבוע",
  "home.thisWeekLead": "פרשת השבוע והזמן הקרוב, נכון ל־{date}.",
  "home.parsha": "פרשת {name}",
  "home.zmanNow": "עכשיו: {name}",
  "home.zmanSoon": "בקרוב: {name}",
  "home.allOn": { one: "השיעור על {name}", other: "כל {count} השיעורים על {name}" },
  "home.liveLead": "לנתונים נוספים ולדרך האזנה אינטראקטיבית יותר, השתמשו ב{link}.",
  "home.liveLink": "עיון",
  "home.contents": "התוכן בקצרה",
  "home.contentsAll": "התוכן המלא",
  "home.indexes": "מפתחות",

  "count.shiurim": { one: "{count} שיעור", other: "{count} שיעורים" },

  "contents.title": "תוכן",
  "contents.yiddish": "שיעורים באידיש",
  "contents.english": "שיעורים באנגלית",
  "contents.more": "הקלטות נוספות",
  "contents.series": "סדרות",
  "contents.seriesLead": "סדרות של שיעורים שנאמרו ברצף, לשמיעה על הסדר.",
  "contents.sectionsLabel": "מדורים",

  "section.alsoSeries": "מסודר גם כסדרה:",
  "section.jump": "במדור זה",
  "section.other": "אחרים",
  "section.otherZman": "זמנים אחרים",
  "section.otherParsha": "בלי פרשה",

  "table.caption": "{name}: השיעורים לפי הסדר",
  "table.part": "חלק",
  "table.title": "כותרת",
  "table.parsha": "פרשה",
  "table.zman": "זמן",
  "table.occasion": "פרשה / זמן",
  "table.year": "שנה",
  "table.length": "אורך",
  "table.notes": "בקצרה (רשימות)",
  "table.scroll": "{name} (אפשר לגלול את הטבלה לצדדים)",
  "row.noRecording": "אין הקלטה באינטרנט",
  "row.part": "חלק {part} מתוך {count}",

  "series.lead": "{count} לפי הסדר.",
  "series.perek": "פרק {perek}",
  "series.noPerek": "בלי פרק",
  "series.jump": "פרקים",
  "series.empty": "אף אחד מן השיעורים של סדרה זו אינו באוסף שבאינטרנט.",
  "series.intro": "על הסדרה",
  "series.keyThemes": "הנושאים העיקריים",

  "chumash.bereishis": "ספר בראשית",
  "chumash.shemos": "ספר שמות",
  "chumash.vayikra": "ספר ויקרא",
  "chumash.bamidbar": "ספר במדבר",
  "chumash.devarim": "ספר דברים",
};

/** Every edition's table (`tsc` reports a missing edition). */
export const catalogTables: MessageTables<CatalogKey> = { en: catalogEn, yi: catalogYi, he: catalogHe };

const ts = byUiLang((ed) => createT<CatalogKey>(catalogTables, ed));

/**
 * A message with one `{slot}` placeholder, split around it so a page can put a link in the slot:
 * `[before, after]`. The raw table is read because `t()` would fill the placeholder with text.
 */
export function catalogSlot(ed: Ed, key: CatalogKey, slot: string): readonly [string, string] {
  const msg = catalogTables[ed][key];
  if (typeof msg !== "string" || !msg.includes(`{${slot}}`)) throw new Error(`catalog string ${key} has no {${slot}}`);
  const [before = "", after = ""] = msg.split(`{${slot}}`);
  return [before, after];
}

/** The typed `t()` of the catalog pages for an edition. */
export function useCatalogT(ed: Ed): TFunction<CatalogKey> {
  return ts[ed];
}

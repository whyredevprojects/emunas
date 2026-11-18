/**
 * UI strings of the catalog pages (W3.1): title page, contents, sections, series. Kept next to the
 * pages that use them (integration-plan §1.3: UI strings stay in each app); typed with `createT`
 * like `src/i18n/`, so a missing Yiddish or Hebrew key fails `tsc`.
 *
 * Wording status: unreviewed; the Yiddish needs a native reader (W5.3). Plain voice, no "content"
 * vocabulary (concept-quiet §8, §11).
 */
import { byUiLang, createT, isolate, type MessageTable, type MessageTables, type TFunction } from "@emunas/i18n";
import type { Ed } from "../../lib/edition.ts";

export const catalogEn = {
  "home.lead":
    "The recorded shiurim of Harav Moshe Wolfson zt\"l. The contents are based on the {guide}.",
  "home.standing":
    "{total} shiurim, about {hours} hours. Notes are available for {full} so far and are being added.",
  "home.thisWeek": "This week",
  "home.thisWeekLead": "The parsha of the week and the nearest zman, as of {date}.",
  "home.parsha": "Parshas {name}",
  "home.zmanNow": "Now: {name}",
  "home.zmanSoon": "Coming: {name}",
  "home.allOn": { one: "The {count} shiur on {name}", other: "All {count} shiurim on {name}" },
  "home.liveLead": "For a more interactive way to listen, use {link}.",
  "home.liveLink": "the listening site",
  "guide.link": "2012 Pocket Guide",
  "home.contents": "The contents in brief",
  "home.contentsAll": "The full contents",
  "home.indexes": "Indexes",

  "count.shiurim": { one: "{count} shiur", other: "{count} shiurim" },
  "coverage.withNotes": "{full} of {total} shiurim have notes so far.",

  "contents.title": "Contents",
  "contents.lead": "The sections of the {guide}, in the guide's own order: the Yiddish shiurim, then the English.",
  "contents.yiddish": "Shiurim in Yiddish",
  "contents.english": "Shiurim in English",
  "contents.uncatalogued": "Not in the 2012 guide",
  "contents.uncataloguedLead":
    "Recordings in the collection that the 2012 Pocket Guide does not list. Their titles are taken from the file and folder names.",
  "contents.series": "Series",
  "contents.seriesLead": "Sets of shiurim given as a course, to be heard in order.",
  "contents.pages": "pp. {pages}",
  "contents.page": "p. {pages}",
  "contents.sectionsLabel": "Sections",

  "section.guidePages": "Pocket Guide, pp. {pages}.",
  "section.guidePage": "Pocket Guide, p. {pages}.",
  "section.uncataloguedLead":
    "None of these shiurim is in the 2012 Pocket Guide; their titles are taken from the file names. Each such row carries the mark {mark}.",
  "section.alsoSeries": "Also set out as a series:",
  "section.jump": "In this section",
  "section.other": "Other",
  "section.otherZman": "Other occasions",
  "section.otherParsha": "Without a parsha",

  "table.caption": "{name}: the shiurim in catalog order",
  "table.no": "No.",
  "table.part": "Part",
  "table.title": "Title as catalogued",
  "table.parsha": "Parsha",
  "table.zman": "Zman",
  "table.occasion": "Parsha / zman",
  "table.year": "Year",
  "table.length": "Length",
  "table.notes": "In brief (notes)",
  "table.scroll": "{name} (the table scrolls sideways)",
  "row.noRecording": "no recording online",
  "row.uncatalogued": "not in the 2012 guide",
  "row.part": "Part {part} of {count}",

  "series.inGuide": "In the Pocket Guide:",
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
    "די רעקארדירטע שיעורים פון הרב משה וואלפסאן זצ\"ל. דער תוכן גייט לויטן {guide}.",
  "home.standing": "{total} שיעורים, בערך {hours} שעה. ביז יעצט זענען דא נאטיצן פאר {full}, און מען לייגט צו נאך.",
  "home.thisWeek": "די וואך",
  "home.thisWeekLead": "די פרשה פון דער וואך און דער נאענטסטער זמן, לויט {date}.",
  "home.parsha": "פרשת {name}",
  "home.zmanNow": "יעצט: {name}",
  "home.zmanSoon": "באלד: {name}",
  "home.allOn": { one: "דער שיעור אויף {name}", other: "אלע {count} שיעורים אויף {name}" },
  "home.liveLead": "פאר א מער אינטעראקטיוון אופן צו הערן, נוצט {link}.",
  "home.liveLink": "דעם זייטל צום הערן",
  "guide.link": "פאקעט גייד פון 2012",
  "home.contents": "דער תוכן בקיצור",
  "home.contentsAll": "דער גאנצער תוכן",
  "home.indexes": "מפתחות",

  "count.shiurim": { one: "{count} שיעור", other: "{count} שיעורים" },
  "coverage.withNotes": "{full} פון {total} שיעורים האבן שוין נאטיצן.",

  "contents.title": "תוכן",
  "contents.lead": "די אפטיילונגען פונעם {guide}, לויטן סדר פונעם גייד אליין: די אידישע שיעורים, און דערנאך די ענגלישע.",
  "contents.yiddish": "שיעורים אויף אידיש",
  "contents.english": "שיעורים אויף ענגליש",
  "contents.uncatalogued": "נישט אינעם גייד פון 2012",
  "contents.uncataloguedLead":
    "רעקארדירונגען אין דער זאמלונג וואס דער פאקעט גייד פון 2012 רעכנט נישט אויס. די קעפלעך זענען גענומען פון די נעמען פון די פיילס און פאלדערס.",
  "contents.series": "סדרות",
  "contents.seriesLead": "סדרות פון שיעורים וואס זענען געזאגט געווארן נאכאנאנד, צו הערן על הסדר.",
  "contents.pages": "ז׳ {pages}",
  "contents.page": "ז׳ {pages}",
  "contents.sectionsLabel": "אפטיילונגען",

  "section.guidePages": "פאקעט גייד, ז׳ {pages}.",
  "section.guidePage": "פאקעט גייד, ז׳ {pages}.",
  "section.uncataloguedLead":
    "קיינער פון די שיעורים שטייט נישט אינעם פאקעט גייד פון 2012; די קעפלעך זענען גענומען פון די נעמען פון די פיילס. יעדע אזא שורה האט דעם צייכן {mark}.",
  "section.alsoSeries": "אויך אויסגעשטעלט ווי א סדרה:",
  "section.jump": "אין דער אפטיילונג",
  "section.other": "אנדערע",
  "section.otherZman": "אנדערע זמנים",
  "section.otherParsha": "אן א פרשה",

  "table.caption": "{name}: די שיעורים לויטן סדר פונעם קאטאלאג",
  "table.no": "נומ׳",
  "table.part": "טייל",
  "table.title": "דער קעפל ווי אינעם קאטאלאג",
  "table.parsha": "פרשה",
  "table.zman": "זמן",
  "table.occasion": "פרשה / זמן",
  "table.year": "יאר",
  "table.length": "לענג",
  "table.notes": "בקיצור (נאטיצן)",
  "table.scroll": "{name} (מען קען די טאבעלע רוקן אויף די זייט)",
  "row.noRecording": "קיין רעקארדירונג אויפן אינטערנעט",
  "row.uncatalogued": "נישט אינעם גייד פון 2012",
  "row.part": "טייל {part} פון {count}",

  "series.inGuide": "אינעם פאקעט גייד:",
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
  "home.lead": "השיעורים המוקלטים של הגה\"צ רבי משה וולפסון זצ\"ל. התוכן מבוסס על {guide}.",
  "home.standing": "{total} שיעורים, כ־{hours} שעות. עד כה יש רשימות ל־{full} שיעורים, ועוד מתווספות.",
  "home.thisWeek": "השבוע",
  "home.thisWeekLead": "פרשת השבוע והזמן הקרוב, נכון ל־{date}.",
  "home.parsha": "פרשת {name}",
  "home.zmanNow": "עכשיו: {name}",
  "home.zmanSoon": "בקרוב: {name}",
  "home.allOn": { one: "השיעור על {name}", other: "כל {count} השיעורים על {name}" },
  "home.liveLead": "לדרך האזנה אינטראקטיבית יותר, השתמשו ב{link}.",
  "home.liveLink": "אתר ההאזנה",
  "guide.link": "מדריך הכיס משנת 2012",
  "home.contents": "התוכן בקצרה",
  "home.contentsAll": "התוכן המלא",
  "home.indexes": "מפתחות",

  "count.shiurim": { one: "{count} שיעור", other: "{count} שיעורים" },
  "coverage.withNotes": "ל־{full} מתוך {total} שיעורים יש כבר רשימות.",

  "contents.title": "תוכן",
  "contents.lead": "המדורים של {guide}, לפי סדר המדריך עצמו: השיעורים באידיש, ואחריהם השיעורים באנגלית.",
  "contents.yiddish": "שיעורים באידיש",
  "contents.english": "שיעורים באנגלית",
  "contents.uncatalogued": "אינם במדריך משנת 2012",
  "contents.uncataloguedLead":
    "הקלטות באוסף שמדריך הכיס משנת 2012 אינו מונה. הכותרות שלהן נלקחו משמות הקבצים והתיקיות.",
  "contents.series": "סדרות",
  "contents.seriesLead": "סדרות של שיעורים שנאמרו ברצף, לשמיעה על הסדר.",
  "contents.pages": "עמ׳ {pages}",
  "contents.page": "עמ׳ {pages}",
  "contents.sectionsLabel": "מדורים",

  "section.guidePages": "מדריך הכיס, עמ׳ {pages}.",
  "section.guidePage": "מדריך הכיס, עמ׳ {pages}.",
  "section.uncataloguedLead":
    "אף אחד מן השיעורים האלה אינו במדריך הכיס משנת 2012; הכותרות שלהם נלקחו משמות הקבצים. כל שורה כזו מסומנת {mark}.",
  "section.alsoSeries": "מסודר גם כסדרה:",
  "section.jump": "במדור זה",
  "section.other": "אחרים",
  "section.otherZman": "זמנים אחרים",
  "section.otherParsha": "בלי פרשה",

  "table.caption": "{name}: השיעורים לפי סדר הקטלוג",
  "table.no": "מס׳",
  "table.part": "חלק",
  "table.title": "הכותרת כבקטלוג",
  "table.parsha": "פרשה",
  "table.zman": "זמן",
  "table.occasion": "פרשה / זמן",
  "table.year": "שנה",
  "table.length": "אורך",
  "table.notes": "בקצרה (רשימות)",
  "table.scroll": "{name} (אפשר לגלול את הטבלה לצדדים)",
  "row.noRecording": "אין הקלטה באינטרנט",
  "row.uncatalogued": "אינו במדריך משנת 2012",
  "row.part": "חלק {part} מתוך {count}",

  "series.inGuide": "במדריך הכיס:",
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

/**
 * Pocket Guide pages as printed ("pp. 15–33" / "ז׳ 15–33"): the numbers are an LTR isolate, so the
 * range keeps its order inside Yiddish text.
 */
export function guidePages(ed: Ed, pages: readonly [number, number] | null, where: "contents" | "section"): string | null {
  if (pages === null) return null;
  const c = useCatalogT(ed);
  const single = pages[0] === pages[1];
  const text = isolate(single ? String(pages[0]) : `${pages[0]}–${pages[1]}`, "ltr");
  if (where === "contents") return c(single ? "contents.page" : "contents.pages", { pages: text });
  return c(single ? "section.guidePage" : "section.guidePages", { pages: text });
}

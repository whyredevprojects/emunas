import type { MessageTable } from "@emunas/i18n";
import type { UiKey } from "./en.ts";

/**
 * Quiet UI strings, Yiddish edition. Typed against the English key union, so a missing
 * key fails `tsc`.
 *
 * Wording status: unreviewed; needs a native reader (W5.3). Heimish and plain
 * (concept-quiet §8): סדר השיעור, מראי מקומות, מעשיות, מפתחות; "דער משגיח".
 */
export const yi: MessageTable<UiKey> = {
  "site.name": "ספריה — שיעורים",
  "site.nameShort": "שיעורים",
  "site.description": "די רעקארדירטע שיעורים פון הרב משה וואלפסאן זצ\"ל.",

  "skip.toMain": "גייט צום טעקסט",

  "nav.label": "זייטל",
  "nav.contents": "תוכן",
  "nav.calendar": "לוח",
  "nav.indexes": "מפתחות",
  "nav.search": "זוכן",
  "nav.about": "וועגן",

  "edition.label": "אויסגאבע",
  "edition.current": "אידישע אויסגאבע",
  "edition.other": "English",
  "edition.otherName": "ענגלישע אויסגאבע",

  "theme.label": "פארבן",
  "theme.light": "העל",
  "theme.dark": "טונקל",

  "link.newTab": "(עפנט זיך אין א נייעם טאב)",

  "breadcrumb.label": "דא זענט איר",

  "footer.recordingIsSource": "דער מקור איז די רעקארדירונגען. די קעפלעך זענען ווי געדרוקט אינעם פאקעט גייד פון 2012.",
  "footer.otherEdition": "דער בלאט אויף ענגליש",
  "footer.home": "אמונת",

  "time.playFrom": "שפילן פון {time}",
  "time.playFromPart": "שפילן פון {time} (טייל {part})",

  "listen.heading": "הערן",
  "listen.part": "טייל {part} פון {count}",
  "listen.download": "אראפלאדן",
  "listen.downloadPart": "אראפלאדן טייל {part}",
  "listen.unavailable": "די רעקארדירונג איז נאך נישט צוגעשטעלט אויפן אינטערנעט.",
  "listen.unavailablePart": "טייל {part}: נאך נישט צוגעשטעלט אויפן אינטערנעט.",
  "listen.noSupport": "דער בראוזער קען דא נישט שפילן די רעקארדירונג. נוצט דעם לינק צום אראפלאדן.",
  "listen.duration": "לענג {duration}",

  "citation.label": "קאטאלאג",
  "citation.number": "נומ׳ {n}",
  "citation.guidePage": "פאקעט גייד ז׳ {page}",
  "citation.series": "סדרה",

  "catalog.derived.filename": "שטייט נישט אינעם פאקעט גייד פון 2012; דער קעפל איז גענומען פונעם נאמען פונעם פייל.",
  "catalog.derived.dirPrefix": "שטייט נישט אינעם פאקעט גייד פון 2012; דער קעפל איז גענומען פונעם פאלדער און פונעם נאמען פונעם פייל.",

  "notes.label": "נאטיצן",

  "chooser.title": "קלייבט אן אויסגאבע",
  "chooser.enter": "אידישע אויסגאבע",
  "chooser.enterNote": "דער זייטל און די נאטיצן אויף אידיש. אלע שיעורים, סיי אויף אידיש סיי אויף ענגליש.",
};

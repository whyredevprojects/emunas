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

  "theme.label": "פארבן",
  "theme.light": "העל",
  "theme.dark": "טונקל",

  "link.newTab": "(עפנט זיך אין א נייעם טאב)",

  "breadcrumb.label": "דא זענט איר",

  "footer.recordingIsSource": "דער מקור איז די רעקארדירונגען.",
  "footer.inLanguage": "דער בלאט אויף {language}",
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

  "citation.label": "פרטים",
  "citation.number": "נומ׳ {n}",
  "citation.perek": "פרק {perek}",

  "notes.label": "נאטיצן",

  "chooser.title": "קלייבט אן אויסגאבע",
  "chooser.enter": "אידישע אויסגאבע",
  "chooser.enterNote": "דער זייטל און די נאטיצן אויף אידיש. אלע שיעורים, סיי אויף אידיש סיי אויף ענגליש.",
};

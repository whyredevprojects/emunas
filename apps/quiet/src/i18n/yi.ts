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
  "site.name": "די שיעורים פון דעם משגיח",
  "site.nameShort": "שיעורים",
  "site.description": "די רעקארדירטע שיעורים פון הרב משה וואלפסאן זצ\"ל, אויסגעשטעלט ווי א קאטאלאג.",

  "skip.toMain": "גיי צום טעקסט",

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

  "breadcrumb.label": "דא ביסטו",

  "footer.recordingIsSource": "דער מקור איז די רעקארדירונגען. די קעפלעך זענען ווי געדרוקט אינעם פּאָקעט גייד פון 2012.",
  "footer.otherEdition": "דאס זייטל אויף ענגליש",

  "time.playFrom": "שפּיל פון {time}",
  "time.playFromPart": "שפּיל פון {time} (טייל {part})",

  "listen.heading": "הערן",
  "listen.part": "טייל {part} פון {count}",
  "listen.download": "אראפּנעמען",
  "listen.downloadPart": "אראפּנעמען טייל {part}",
  "listen.unavailable": "די רעקארדירונג איז נאך נישט צוגעשטעלט אויפן נעץ.",
  "listen.unavailablePart": "טייל {part}: נאך נישט צוגעשטעלט אויפן נעץ.",
  "listen.noSupport": "דער בלעטערער קען דא נישט שפּילן די רעקארדירונג. נוצט דעם לינק צום אראפּנעמען.",
  "listen.duration": "לענג {duration}",

  "citation.label": "קאטאלאג",
  "citation.number": "נומ׳ {n}",
  "citation.guidePage": "פּאָקעט גייד ז׳ {page}",
  "citation.series": "סעריע",

  "catalog.derived.filename": "שטייט נישט אינעם פּאָקעט גייד פון 2012; דער קעפּל איז גענומען פונעם נאמען פון דער טעקע.",
  "catalog.derived.dirPrefix": "שטייט נישט אינעם פּאָקעט גייד פון 2012; דער קעפּל איז גענומען פונעם פאלדער און פונעם נאמען פון דער טעקע.",

  "notes.label": "נאטיצן",

  "chooser.title": "קלייבט אן אויסגאבע",
  "chooser.enter": "אידישע אויסגאבע",
  "chooser.enterNote": "דער אינטערפייס און די נאטיצן אויף אידיש. אלע שיעורים, אויף אידיש און ענגליש.",
};

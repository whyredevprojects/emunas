import type { MessageTable } from "@emunas/i18n";
import type { UiKey } from "./en.ts";

/**
 * Quiet UI strings, Hebrew edition. Typed against the English key union, so a missing key fails
 * `tsc`.
 *
 * Wording status: unreviewed; needs a Hebrew reader. Plain Torah-world Hebrew without nikud; the
 * Mashgiach is "המשגיח". Where a Yiddish UI word has no easy Hebrew equivalent, the Hebrew word is
 * used (סדר השיעור, מראי מקומות, מעשיות, מפתחות).
 */
export const he: MessageTable<UiKey> = {
  "site.name": "ספריה — שיעורים",
  "site.nameShort": "שיעורים",
  "site.description": "השיעורים המוקלטים של הגה\"צ רבי משה וולפסון זצ\"ל.",

  "skip.toMain": "דלגו לטקסט",

  "nav.label": "האתר",
  "nav.contents": "תוכן",
  "nav.calendar": "לוח",
  "nav.indexes": "מפתחות",
  "nav.search": "חיפוש",
  "nav.about": "אודות",

  "edition.label": "מהדורה",

  "theme.label": "צבעים",
  "theme.light": "בהיר",
  "theme.dark": "כהה",

  "link.newTab": "(נפתח בכרטיסייה חדשה)",

  "breadcrumb.label": "אתם נמצאים כאן",

  "footer.recordingIsSource": "המקור הוא ההקלטות.",
  "footer.inLanguage": "הדף הזה ב{language}",
  "footer.home": "אמונת",

  "time.playFrom": "השמעה מ־{time}",
  "time.playFromPart": "השמעה מ־{time} (חלק {part})",

  "listen.heading": "האזנה",
  "listen.part": "חלק {part} מתוך {count}",
  "listen.download": "הורדה",
  "listen.downloadPart": "הורדת חלק {part}",
  "listen.unavailable": "ההקלטה עדיין אינה זמינה באינטרנט.",
  "listen.unavailablePart": "חלק {part}: עדיין אינו זמין באינטרנט.",
  "listen.noSupport": "דפדפן זה אינו יכול להשמיע כאן את ההקלטה. השתמשו בקישור להורדה.",

  "citation.label": "פרטים",
  "citation.number": "מס׳ {n}",
  "citation.perek": "פרק {perek}",

  "notes.label": "רשימות",

  "chooser.title": "בחרו מהדורה",
  "chooser.enter": "מהדורה בעברית",
  "chooser.enterNote": "האתר בעברית; הרשימות בעברית היכן שכבר תורגמו, ובשאר באידיש. כל השיעורים, באידיש ובאנגלית.",
};

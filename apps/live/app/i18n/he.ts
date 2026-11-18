import type { MessageTable } from "@emunas/i18n";
import type { UiKey } from "./en.ts";

/**
 * Hebrew UI strings for the Live site. Typed against the English key union, so a missing key fails
 * `tsc`. Torah-world Hebrew without nikud; where a Yiddish UI word has no natural Hebrew rendering,
 * the Hebrew word is used. Wording is unreviewed until a Hebrew reader checks it.
 */
export const he: MessageTable<UiKey> = {
  "site.name": "אמונת — האזנה",
  "site.short": "אמונת",
  "site.tagline": 'שיעורי הגה"צ רבי משה וולפסון זצ"ל',

  "shell.skip": "דלג לתוכן",
  "shell.rail": "ראשי",
  "shell.dock": "נגן",
  "shell.dockIdle": "שום דבר אינו מתנגן כעת",

  "nav.today": "היום",
  "nav.explore": "עיון",
  "nav.seforim": "ספרים",
  "nav.maasios": "מעשיות",
  "nav.series": "סדרות",
  "nav.shelf": "המדף שלי",
  "nav.quiet": "קטלוג ומפתחות",
  "nav.newTab": "(נפתח בכרטיסייה חדשה)",
  "nav.search": "חיפוש",

  "theme.dark": "צבעים כהים",

  "lang.button": "שפה",
  "lang.dialog": "הגדרות שפה",
  "lang.ui": "שפת הממשק",
  "lang.audio": "שיעורים להאזנה",
  "lang.audio.both": "אידיש ואנגלית",
  "lang.audio.yi": "אידיש בלבד",
  "lang.audio.en": "אנגלית בלבד",
  "lang.read": "שפת הרשימות",
  "lang.summary": "ממשק: {ui}. שיעורים: {audio}. רשימות: {read}.",

  "home.title": "בחרו שפה",
  "home.redirecting": "האתר נפתח בשפה שלכם…",

  "stub.note": "דף זה עדיין בבנייה.",
  "page.today": "היום",
  "page.today.lead": "הפרשה והזמנים של השבוע, מה ששמעתם, ונקודה להיום.",
  "page.shiur": "שיעור",
  "page.shiur.lead": "חדר ההאזנה של שיעור {id}.",
  "page.explore": "עיון",
  "page.explore.lead": "כל השיעורים והנקודות לפי זמן, שנה, ספר, אישיות ועניין.",
  "page.seforim": "ספרים",
  "page.seforim.lead": "הספרים המובאים בשיעורים, לפי סדרם.",
  "page.work": "ספר",
  "page.work.lead": "היכן ש{work} מובא בשיעורים.",
  "page.workChapter": "ספר, לפי פרקים",
  "page.workChapter.lead": "{work}, {chapter}.",
  "page.maasios": "מעשיות",
  "page.maasios.lead": "מעשיות שסופרו בשיעורים.",
  "page.series": "סדרות",
  "page.series.lead": "שיעורים שנאמרו על הסדר, כמו תניא ואמונה.",
  "page.seriesOne": "סדרה",
  "page.seriesOne.lead": "השיעורים של סדרה {id}, על הסדר.",
  "page.person": "אישיות",
  "page.person.lead": "שיעורים ומעשיות על {id}.",
  "page.concept": "עניין",
  "page.concept.lead": "היכן שמדובר על העניין {id}.",
  "page.occasion": "זמן",
  "page.occasion.lead": "שיעורים ל{id}.",
  "page.search": "חיפוש",
  "page.search.lead": "חיפוש בשיעורים לפי הרשימות וכותרות הקטלוג.",
  "page.searchQuery": "תוצאות עבור {q}",
  "page.shelf": "המדף שלי",
  "page.shelf.lead": "מה שאתם שומעים, התור שלכם, רשימות השמעה, נקודות שמורות ושיעורים שהורדו. נשמר במכשיר זה בלבד.",
  "page.shelfSection": "המדף שלי",
  "page.shelfSection.lead": "חלק: {section}.",
  "page.playlist": "רשימה ששותפה",
  "page.playlist.lead": "רשימת נקודות שמישהו שיתף אתכם.",
  "page.notFound": "הדף לא נמצא",
  "page.notFound.lead": "אין דף בכתובת זו.",
  "page.notFound.home": "חזרה להיום",
  "page.error": "משהו השתבש",

  "count.shiurim": { one: "{count} שיעור", other: "{count} שיעורים" },
};

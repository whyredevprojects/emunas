/**
 * UI strings of the shiur page (concept-quiet §5.4). Kept next to the shiur components so the
 * page does not edit the shell's shared tables (`src/i18n/`, W2.3); same `createT` pattern, same
 * rule: `yi` and `he` are typed against the English key union, so a missing key fails `tsc`.
 *
 * Wording status: unreviewed (W5.3 does the fixed-copy pass). Plain voice, reported speech,
 * "the Mashgiach" / "דער משגיח" / "המשגיח"; no "content" vocabulary.
 */
import { byUiLang, createT, type MessageTable, type MessageTables, type TFunction } from "@emunas/i18n";
import type { Ed } from "../../lib/edition.ts";

export const shiurEn = {
  "jump.label": "On this page",
  "jump.about": "About this shiur",
  "jump.outline": "Order of the shiur",
  "jump.writeup": "Write-up",
  "jump.sources": "Sources",
  "jump.apparatus": "Points, questions and stories",
  "jump.mentioned": "Mentioned",
  "jump.catalog": "Place in the catalog",

  "about.heading": "About this shiur",
  "about.abstract": "Summary",

  "outline.heading": "Order of the shiur",
  "outline.listedInGuide": "listed in the guide",

  "writeup.heading": "The shiur, written up",
  "writeup.cite": "Source {letter}",

  "sources.heading": "Sources",
  "sources.inNotes": "In the write-up:",
  "sources.index": "index",
  "sources.sefaria": "text",

  "keyPoints.heading": "Key points",
  "questions.heading": "Questions and answers",
  "questions.q": "Question",
  "questions.a": "Answer",
  "stories.heading": "Stories",
  "stories.people": "In the story:",
  "insights.heading": "Insights",
  "takeaways.heading": "What the Mashgiach says to take from it",

  "mentioned.heading": "Mentioned in this shiur",
  "mentioned.people": "People",
  "mentioned.concepts": "Terms",

  "catalog.heading": "Place in the catalog",
  "catalog.prev": "Previous",
  "catalog.next": "Next",
  "catalog.inSection": "{section}: no. {pos} of {count}",
  "catalog.inSeries": "{series}: part {pos} of {count}",
  "catalog.seriesFallback": "Series",
  "catalog.sameOccasion": "Also on {occasion}",
  "catalog.noTitle": "Untitled",

  "live.open": "Open in the listening app",
  "report.link": "Report an error on this page",
  "report.subject": "Error report: {id}",
  "report.body": "Shiur: {id}\nPage: {url}\n\nWhat is wrong:\n",
} as const;

export type ShiurKey = keyof typeof shiurEn;

export const shiurYi: MessageTable<ShiurKey> = {
  "jump.label": "אויף דעם בלאט",
  "jump.about": "וועגן דעם שיעור",
  "jump.outline": "סדר השיעור",
  "jump.writeup": "דער שיעור אויסגעשריבן",
  "jump.sources": "מראי מקומות",
  "jump.apparatus": "נקודות, קושיות און מעשיות",
  "jump.mentioned": "דערמאנט",
  "jump.catalog": "ארט אינעם קאטאלאג",

  "about.heading": "וועגן דעם שיעור",
  "about.abstract": "קיצור",

  "outline.heading": "סדר השיעור",
  "outline.listedInGuide": "שטייט אינעם קאטאלאג",

  "writeup.heading": "דער שיעור, אויסגעשריבן",
  "writeup.cite": "מקור {letter}",

  "sources.heading": "מראי מקומות",
  "sources.inNotes": "אינעם אויסשרייב:",
  "sources.index": "מפתח",
  "sources.sefaria": "טעקסט",

  "keyPoints.heading": "עיקרי הדברים",
  "questions.heading": "קושיות און תירוצים",
  "questions.q": "קשיא",
  "questions.a": "תירוץ",
  "stories.heading": "מעשיות",
  "stories.people": "אין דער מעשה:",
  "insights.heading": "געדאנקען",
  "takeaways.heading": "וואס דער משגיח זאגט מ׳זאל ארויסנעמען",

  "mentioned.heading": "דערמאנט אין דעם שיעור",
  "mentioned.people": "פערזאנען",
  "mentioned.concepts": "ערכים",

  "catalog.heading": "ארט אינעם קאטאלאג",
  "catalog.prev": "פריערדיגער",
  "catalog.next": "קומענדיגער",
  "catalog.inSection": "{section}: נומ׳ {pos} פון {count}",
  "catalog.inSeries": "{series}: טייל {pos} פון {count}",
  "catalog.seriesFallback": "סדרה",
  "catalog.sameOccasion": "אויך אויף {occasion}",
  "catalog.noTitle": "אן א קעפל",

  "live.open": "עפענען אין דער אפליקאציע צום הערן",
  "report.link": "מעלדן א טעות אויף דעם בלאט",
  "report.subject": "א טעות: {id}",
  "report.body": "שיעור: {id}\nבלאט: {url}\n\nוואס איז נישט ריכטיג:\n",
};

export const shiurHe: MessageTable<ShiurKey> = {
  "jump.label": "בדף זה",
  "jump.about": "על השיעור",
  "jump.outline": "סדר השיעור",
  "jump.writeup": "השיעור בכתב",
  "jump.sources": "מראי מקומות",
  "jump.apparatus": "נקודות, קושיות ומעשיות",
  "jump.mentioned": "נזכרים",
  "jump.catalog": "מקומו בקטלוג",

  "about.heading": "על השיעור",
  "about.abstract": "תקציר",

  "outline.heading": "סדר השיעור",
  "outline.listedInGuide": "רשום בקטלוג",

  "writeup.heading": "השיעור, בכתב",
  "writeup.cite": "מקור {letter}",

  "sources.heading": "מראי מקומות",
  "sources.inNotes": "בשיעור שבכתב:",
  "sources.index": "מפתח",
  "sources.sefaria": "טקסט",

  "keyPoints.heading": "עיקרי הדברים",
  "questions.heading": "קושיות ותירוצים",
  "questions.q": "קושיא",
  "questions.a": "תירוץ",
  "stories.heading": "מעשיות",
  "stories.people": "במעשה:",
  "insights.heading": "הערות",
  "takeaways.heading": "מה שהמשגיח אומר ללמוד מכך",

  "mentioned.heading": "נזכרים בשיעור זה",
  "mentioned.people": "אישים",
  "mentioned.concepts": "ערכים",

  "catalog.heading": "מקומו בקטלוג",
  "catalog.prev": "הקודם",
  "catalog.next": "הבא",
  "catalog.inSection": "{section}: מס׳ {pos} מתוך {count}",
  "catalog.inSeries": "{series}: חלק {pos} מתוך {count}",
  "catalog.seriesFallback": "סדרה",
  "catalog.sameOccasion": "גם על {occasion}",
  "catalog.noTitle": "ללא כותרת",

  "live.open": "פתיחה באתר ההאזנה",
  "report.link": "דיווח על טעות בדף זה",
  "report.subject": "דיווח על טעות: {id}",
  "report.body": "שיעור: {id}\nדף: {url}\n\nמה אינו נכון:\n",
};

export const shiurTables: MessageTables<ShiurKey> = { en: shiurEn, yi: shiurYi, he: shiurHe };

const ts = byUiLang((ed) => createT<ShiurKey>(shiurTables, ed));

/** The typed `t()` for the shiur page strings of an edition. */
export function useShiurT(ed: Ed): TFunction<ShiurKey> {
  return ts[ed];
}

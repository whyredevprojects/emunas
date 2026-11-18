/**
 * UI strings of the stories index and the story pages (Quiet C4.5). The AI-label sentences
 * ("Retold here from N tellings…", the entry foot note), the person-group names and the
 * "tellings differ on the attribution" line are shared with Live and come from `@emunas/i18n`
 * (`corpusLabel`); only Quiet's own wording lives here. `yi` and `he` are typed against the English keys, so
 * a missing key fails `tsc`.
 *
 * Wording status: unreviewed (proposed; the Yiddish needs a native reader). Yiddish speaks of the
 * Mashgiach as "דער משגיח".
 */
import { byUiLang, createT, type MessageTable, type TFunction } from "@emunas/i18n";
import type { Ed } from "../../lib/edition.ts";

export const storiesEn = {
  // ---- the index (Quiet C4.5: most retold, by person, without a name)
  "index.lead":
    "The stories the Mashgiach tells in the shiurim. A story he told in more than one shiur has a page of its own, with every place he tells it; a story told once links to the place in the shiur.",
  "index.jump": "In this index",
  "index.mostRetold": "Most retold",
  "index.mostRetoldLead": "Stories told in {min} or more shiurim, the most often told first.",
  "index.byPerson": "By person",
  "index.byPersonLead": "Stories about the people named in them, in the order of the index of names.",
  "index.withoutName": "Without a name",
  "index.withoutNameLead": "Stories that name no one in the index of names, by title.",
  "count.tellings": { one: "told once", other: "told {count} times" },

  // ---- a story page
  "story.people": "About",
  "story.retelling": "The story",
  "story.where": "Where he tells it",
  "story.whereLead": "In order of year where it is known; the undated ones last.",
  "telling.shiur": "Shiur",
  "telling.occasion": "Occasion",
  "telling.year": "Year",
  "telling.lang": "Language",
  "telling.time": "At",
  "telling.undated": "not known",
  "telling.caption": "The shiurim in which the story is told",
} as const;

export type StoriesKey = keyof typeof storiesEn;

export const storiesYi: MessageTable<StoriesKey> = {
  "index.lead":
    "די מעשיות וואס דער משגיח דערציילט אין די שיעורים. א מעשה וואס ער האט דערציילט אין מער ווי איין שיעור האט אן אייגענעם בלאט, מיט יעדן ארט וואו ער דערציילט זי; א מעשה וואס איז דערציילט געווארן איין מאל פירט צום ארט אינעם שיעור.",
  "index.jump": "אין דעם מפתח",
  "index.mostRetold": "די מערסט דערציילטע",
  "index.mostRetoldLead": "מעשיות וואס זענען דערציילט געווארן אין {min} אדער מער שיעורים, די וואס ווערן מערסטנס דערציילט פריער.",
  "index.byPerson": "לויט די פערזאן",
  "index.byPersonLead": "מעשיות וועגן די מענטשן וואס ווערן אין זיי דערמאנט, אינעם סדר פון מפתח השמות.",
  "index.withoutName": "אן א נאמען",
  "index.withoutNameLead": "מעשיות וואס דערמאנען קיינעם פון מפתח השמות, לויטן נאמען פון דער מעשה.",
  "count.tellings": { one: "דערציילט איין מאל", other: "דערציילט {count} מאל" },

  "story.people": "וועגן",
  "story.retelling": "די מעשה",
  "story.where": "וואו ער דערציילט זי",
  "story.whereLead": "לויטן יאר וואו מען ווייסט עס; די אן א יאר צום סוף.",
  "telling.shiur": "שיעור",
  "telling.occasion": "צייט",
  "telling.year": "יאר",
  "telling.lang": "שפראך",
  "telling.time": "ביי",
  "telling.undated": "נישט באקאנט",
  "telling.caption": "די שיעורים אין וועלכע די מעשה ווערט דערציילט",
};

export const storiesHe: MessageTable<StoriesKey> = {
  "index.lead":
    "המעשיות שהמשגיח מספר בשיעורים. למעשה שסיפר ביותר משיעור אחד יש דף משלה, עם כל מקום שבו הוא מספר אותה; מעשה שסופרה פעם אחת מקשרת למקומה בשיעור.",
  "index.jump": "במפתח זה",
  "index.mostRetold": "המסופרות ביותר",
  "index.mostRetoldLead": "מעשיות שסופרו ב־{min} שיעורים או יותר, המסופרות ביותר תחילה.",
  "index.byPerson": "לפי האישים",
  "index.byPersonLead": "מעשיות על האישים הנזכרים בהן, בסדר של מפתח השמות.",
  "index.withoutName": "בלי שם",
  "index.withoutNameLead": "מעשיות שאינן מזכירות איש ממפתח השמות, לפי שם המעשה.",
  "count.tellings": { one: "סופרה פעם אחת", two: "סופרה פעמיים", other: "סופרה {count} פעמים" },

  "story.people": "על",
  "story.retelling": "המעשה",
  "story.where": "היכן הוא מספר אותה",
  "story.whereLead": "לפי השנה היכן שהיא ידועה; אלה שבלי שנה בסוף.",
  "telling.shiur": "שיעור",
  "telling.occasion": "זמן",
  "telling.year": "שנה",
  "telling.lang": "שפה",
  "telling.time": "בהקלטה",
  "telling.undated": "לא ידוע",
  "telling.caption": "השיעורים שבהם המעשה מסופרת",
};

const ts = byUiLang((ed) => createT<StoriesKey>({ en: storiesEn, yi: storiesYi, he: storiesHe }, ed));

export function useStoriesT(ed: Ed): TFunction<StoriesKey> {
  return ts[ed];
}

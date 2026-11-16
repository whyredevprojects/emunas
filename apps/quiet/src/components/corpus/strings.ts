/**
 * UI strings of the shared corpus-entry components (C1.8): the title page's indexes block, the
 * entry head, the report mail and the grade list. The AI-label sentences, kind names, grade names
 * and report options themselves are shared with Live and come from `@emunas/i18n`
 * (`corpusLabel`, C1.4); only what is Quiet's own wording lives here. `yi` is typed against the
 * English keys, so a missing key fails `tsc`.
 *
 * Wording status: unreviewed (proposed; the Yiddish needs a native reader). Yiddish speaks of the
 * Mashgiach as "דער משגיח".
 */
import { createT, type MessageTable, type TFunction } from "@emunas/i18n";
import type { Ed } from "../../lib/edition.ts";

export const corpusEn = {
  // ---- the indexes block on the title page (Quiet C5, in order)
  "indexes.topics.note": "the subjects of the shiurim, as a tree",
  "indexes.glossary.note": "terms as they are used in the shiurim, by the Hebrew headword",
  "indexes.names.note": "people named in the shiurim, by era",
  "indexes.sources.note": "seforim cited, in the order of a mafteach",
  "indexes.stories.note": "the maasios told in the shiurim",
  "indexes.calendar": "Calendar",
  "indexes.calendar.parsha": "by parsha",
  "indexes.calendar.zman": "by zman",
  "indexes.years": "Years",
  "indexes.years.note": "the year each shiur was given, where it is known",
  "count.topics": { one: "{count} topic", other: "{count} topics" },
  "count.entries": { one: "{count} entry", other: "{count} entries" },
  "count.names": { one: "{count} name", other: "{count} names" },
  "count.works": { one: "{count} sefer", other: "{count} seforim" },
  "count.stories": { one: "{count} story", other: "{count} stories" },

  // ---- entry head
  "entry.seeAlso": "See also",

  // ---- report mail (the options are the shared ones)
  "report.body":
    "Entry: {kind} {id}\nPage: {url}\n\nWhat is wrong? Keep the line that applies and add a word:\n- {twoDifferent}\n- {sameAsOther}:\n- {doesNotBelong}:\n\nDetails:\n",
} as const;

export type CorpusKey = keyof typeof corpusEn;

export const corpusYi: MessageTable<CorpusKey> = {
  "indexes.topics.note": "די ענינים פון די שיעורים, ווי א בוים",
  "indexes.glossary.note": "ווערטער ווי זיי ווערן גענוצט אין די שיעורים, לויטן לשון הקודש ערך",
  "indexes.names.note": "מענטשן וואס ווערן דערמאנט אין די שיעורים, לויט די דורות",
  "indexes.sources.note": "ספרים וואס ווערן געברענגט, אין סדר פון א מפתח",
  "indexes.stories.note": "די מעשיות וואס דער משגיח דערציילט אין די שיעורים",
  "indexes.calendar": "לוח",
  "indexes.calendar.parsha": "לויט די פרשה",
  "indexes.calendar.zman": "לויט די זמנים",
  "indexes.years": "שנים",
  "indexes.years.note": "דאס יאר ווען יעדער שיעור איז געזאגט געווארן, וואו מען ווייסט",
  "count.topics": { one: "{count} ענין", other: "{count} ענינים" },
  "count.entries": { one: "{count} ערך", other: "{count} ערכים" },
  "count.names": { one: "{count} נאמען", other: "{count} נעמען" },
  "count.works": { one: "{count} ספר", other: "{count} ספרים" },
  "count.stories": { one: "{count} מעשה", other: "{count} מעשיות" },

  "entry.seeAlso": "ראה גם",

  "report.body":
    "ערך: {kind} {id}\nבלאט: {url}\n\nוואס איז נישט ריכטיג? לאזט איבער די שורה וואס פאסט און שרייבט צו א ווארט:\n- {twoDifferent}\n- {sameAsOther}:\n- {doesNotBelong}:\n\nפרטים:\n",
};

const tables = { en: corpusEn, yi: corpusYi };

export function useCorpusT(ed: Ed): TFunction<CorpusKey> {
  return createT<CorpusKey>(tables, ed);
}

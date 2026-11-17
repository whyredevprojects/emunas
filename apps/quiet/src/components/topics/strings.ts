/**
 * UI strings of the topic index, מפתח הענינים (concept-quiet-corpus C4.1). The AI label, kind and
 * grade names are shared with Live and come from `@emunas/i18n` (`corpusLabel`); only Quiet's own
 * wording is here. `yi` is typed against the English keys, so a missing key fails `tsc`.
 *
 * Wording status: unreviewed (proposed; the Yiddish needs a native reader). Yiddish speaks of the
 * Mashgiach as "דער משגיח".
 */
import { createT, type MessageTable, type TFunction } from "@emunas/i18n";
import type { Ed } from "../../lib/edition.ts";

export const topicsEn = {
  "tree.intro":
    "The subjects of the shiurim by gate, with the topics under each and their subtopics after a dash. The number is how many shiurim speak of it.",
  "tree.gates": "Gates of the index",
  "count.shiurim": { one: "{count} shiur", other: "{count} shiurim" },
  "topic.beginHere": "Begin here",
  "topic.children": "The topics under it",
  "topic.fullList": { one: "The complete list: {count} shiur", other: "The complete list: {count} shiurim" },
  "topic.allTitle": "all the shiurim",
  "topic.backToEntry": "Back to the entry",
  "topic.calendar": "In the calendar",
  "row.onOccasion": "said on {occasion}",
  "row.yearUnknown": "year not recorded",
  "row.sections": "Parts on this",
} as const;

export type TopicsKey = keyof typeof topicsEn;

export const topicsYi: MessageTable<TopicsKey> = {
  "tree.intro":
    "די ענינים פון די שיעורים לויט די שערים, מיט די ענינים אונטער יעדן שער און זייערע פרטים נאך א שטריך. די צאל זאגט אין וויפיל שיעורים מען רעדט דערפון.",
  "tree.gates": "די שערים פונעם מפתח",
  "count.shiurim": { one: "{count} שיעור", other: "{count} שיעורים" },
  "topic.beginHere": "הייבט אן דא",
  "topic.children": "די ענינים אונטער דעם",
  "topic.fullList": { one: "די גאנצע רשימה: {count} שיעור", other: "די גאנצע רשימה: {count} שיעורים" },
  "topic.allTitle": "אלע שיעורים",
  "topic.backToEntry": "צוריק צום ערך",
  "topic.calendar": "אינעם לוח",
  "row.onOccasion": "געזאגט אויף {occasion}",
  "row.yearUnknown": "יאר נישט פארצייכנט",
  "row.sections": "טיילן וועגן דעם",
};

const tables = { en: topicsEn, yi: topicsYi };

export function useTopicsT(ed: Ed): TFunction<TopicsKey> {
  return createT<TopicsKey>(tables, ed);
}

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
  "about.heading": "About this shiur",

  "prevNext.label": "Previous and next",
  "prevNext.prev": "Previous:",
  "prevNext.next": "Next:",
  "prevNext.seriesFallback": "Series",
  "prevNext.noTitle": "Untitled",

  "live.open": "Open in Analyze",
  "report.link": "Report an error on this page",
  "report.subject": "Error report: {id}",
  "report.body": "Shiur: {id}\nPage: {url}\n\nWhat is wrong:\n",
} as const;

export type ShiurKey = keyof typeof shiurEn;

export const shiurYi: MessageTable<ShiurKey> = {
  "about.heading": "וועגן דעם שיעור",

  "prevNext.label": "פריערדיגער און קומענדיגער",
  "prevNext.prev": "פריערדיגער:",
  "prevNext.next": "קומענדיגער:",
  "prevNext.seriesFallback": "סדרה",
  "prevNext.noTitle": "אן א קעפל",

  "live.open": "עפענען אין עיון",
  "report.link": "מעלדן א טעות אויף דעם בלאט",
  "report.subject": "א טעות: {id}",
  "report.body": "שיעור: {id}\nבלאט: {url}\n\nוואס איז נישט ריכטיג:\n",
};

export const shiurHe: MessageTable<ShiurKey> = {
  "about.heading": "על השיעור",

  "prevNext.label": "הקודם והבא",
  "prevNext.prev": "הקודם:",
  "prevNext.next": "הבא:",
  "prevNext.seriesFallback": "סדרה",
  "prevNext.noTitle": "ללא כותרת",

  "live.open": "פתיחה בעיון",
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

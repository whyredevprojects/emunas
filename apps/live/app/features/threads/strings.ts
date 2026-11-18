/**
 * UI strings for the thread page (C3.3). Kept with the feature, same `createT` contract as the app's
 * table: `yi` provides every key, placeholders survive translation. The heading ("A teaching the Mashgiach
 * returns to") and the AI label come from the shared corpus vocabulary in `@emunas/i18n`.
 *
 * Wording rules (concept-live-corpus C.1): never claim the wording is the same across members, never
 * "the Mashgiach always says", never call a member another member's counterpart in the other language.
 */
import { createT, type MessageTable, type TFunction, type UiLang } from "@emunas/i18n";

export const threadsEn = {
  "loading": "Loading…",
  "error": "This page could not be loaded. Check your connection and reload.",
  "count": { one: "In {count} shiur", other: "In {count} shiurim" },
  "span": "{from} to {to}",
  "topics": "Topics",
  "members": "Where it comes up",
  "members.lead": "Each shiur's own point, with the section of the shiur it sits in.",
  "undated": "Year not known",
  "play": { one: "Play the thread ({count} shiur)", other: "Play the thread ({count} shiurim)" },
  "play.lead": "Plays each shiur's part in year order, one after another. Replaces your queue.",
  "play.playing": { one: "Playing {count} part in the queue.", other: "Playing {count} parts in the queue." },
  "play.failed": "Could not start playing.",
  "leftOut": { one: "{count} more in {language}", other: "{count} more in {language}" },
  "leftOut.why": "Not played: your shiur language setting.",
  "untimed": { one: "{count} has no time in the recording.", other: "{count} have no time in the recording." },
  "row.play": "Play this part",
  "row.playing": "Playing",
} as const satisfies MessageTable<string>;

export type ThreadsKey = keyof typeof threadsEn;

export const threadsYi: MessageTable<ThreadsKey> = {
  "loading": "ווערט געלאדנט…",
  "error": "דער בלאט האט נישט געקענט געלאדנט ווערן. קוקט איבער די פארבינדונג און לאדנט נאכאמאל.",
  "count": { one: "אין {count} שיעור", other: "אין {count} שיעורים" },
  "span": "{from} ביז {to}",
  "topics": "ענינים",
  "members": "וואו עס קומט פאר",
  "members.lead": "יעדן שיעור'ס אייגענער פונקט, מיטן חלק פונעם שיעור וואו ער שטייט.",
  "undated": "דאס יאר איז נישט באקאנט",
  "play": { one: "שפילט דעם פאדעם ({count} שיעור)", other: "שפילט דעם פאדעם ({count} שיעורים)" },
  "play.lead": "שפילט יעדן שיעור'ס טייל לויט די יארן, איינס נאכן אנדערן. דאס בייט אויס אייער ריי.",
  "play.playing": { one: "שפילט {count} טייל אין דער ריי.", other: "שפילט {count} טיילן אין דער ריי." },
  "play.failed": "האט נישט געקענט אנהייבן שפילן.",
  "leftOut": { one: "נאך {count} אויף {language}", other: "נאך {count} אויף {language}" },
  "leftOut.why": "נישט געשפילט: אייער שיעור־שפראך באשטימונג.",
  "untimed": { one: "{count} האט נישט קיין צייט אין דער אויפנאמע.", other: "{count} האבן נישט קיין צייט אין דער אויפנאמע." },
  "row.play": "שפילט דעם טייל",
  "row.playing": "שפילט יעצט",
};

export type ThreadsT = TFunction<ThreadsKey>;

const cache: Partial<Record<UiLang, ThreadsT>> = {};

export function threadsT(ui: UiLang): ThreadsT {
  return (cache[ui] ??= createT<ThreadsKey>({ en: threadsEn, yi: threadsYi }, ui));
}

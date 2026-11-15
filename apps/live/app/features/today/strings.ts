/**
 * UI strings for Today and the shared shiur cards. Kept with the feature (the app's table in
 * `app/i18n/` belongs to the shell); same `createT` contract: `yi` must provide every key.
 */
import { createT, type MessageTable, type TFunction, type UiLang } from "@emunas/i18n";

export const todayEn = {
  "today.heading": "Today",
  "today.loading": "Loading…",
  "today.error": "Today's page could not be loaded. Check your connection and reload.",
  "today.week": "This week",
  "today.parsha": "Parshas {name}",
  "today.parsha.deferred": "Read on Shabbos {date}, after the Yom Tov.",
  "today.count": { one: "{count} shiur", other: "{count} shiurim" },
  "today.parsha.empty": "No shiurim on this parsha in the selected language.",
  "today.occasion.active": "Now",
  "today.occasion.soon": { one: "In {count} day", other: "In {count} days" },
  "today.outOfRange": "The calendar for this date is not available.",
  "today.israel": "Israel schedule",
  "today.moment": "A moment for today",
  "today.moment.play": "Listen from {time}",
  "today.moment.from": "From: {title}",
  "today.moment.kind.i": "Insight",
  "today.moment.kind.q": "Question",
  "today.moment.kind.st": "Story",
  "today.moment.kind.kp": "Key point",
  "today.moment.kind.tk": "Takeaway",
  "today.moment.kind.s": "Chapter",
  "today.continue": "Continue",
  "today.continue.empty": "Shiurim you start will appear here, so you can pick up where you stopped.",
  "today.continue.resume": "Resume at {time}",
  "today.continue.next": "Next in the series",
  "today.newly": "Newly summarized",
  "today.newly.lead": "Notes for these shiurim were added recently.",
  "today.counter": "{full} of {total} shiurim have notes so far.",
  "card.year.unknown": "Year unknown",
  "card.notesPending": "Notes not prepared yet",
  "card.part": "Part {n}",
} as const;

export type TodayKey = keyof typeof todayEn;

export const todayYi: MessageTable<TodayKey> = {
  "today.heading": "היינט",
  "today.loading": "מ׳לאדט…",
  "today.error": "מען האט נישט געקענט לאדן דעם בלאט. קוקט איבער די פארבינדונג און לאדט איבער דעם בלאט.",
  "today.week": "די וואך",
  "today.parsha": "פרשת {name}",
  "today.parsha.deferred": "מען ליינט זי שבת {date}, נאך יום טוב.",
  "today.count": { one: "{count} שיעור", other: "{count} שיעורים" },
  "today.parsha.empty": "קיין שיעורים אויף דער פרשה אין דער אויסגעקליבענער שפראך.",
  "today.occasion.active": "יעצט",
  "today.occasion.soon": { one: "אין {count} טאג", other: "אין {count} טעג" },
  "today.outOfRange": "דער לוח פאר דעם טאג איז נישט פאראן.",
  "today.israel": "סדר פון ארץ ישראל",
  "today.moment": "א נקודה פאר היינט",
  "today.moment.play": "הערן פון {time}",
  "today.moment.from": "פון: {title}",
  "today.moment.kind.i": "געדאנק",
  "today.moment.kind.q": "קשיא",
  "today.moment.kind.st": "מעשה",
  "today.moment.kind.kp": "הויפט נקודה",
  "today.moment.kind.tk": "לימוד",
  "today.moment.kind.s": "חלק",
  "today.continue": "ווייטער הערן",
  "today.continue.empty": "שיעורים וואס איר הייבט אן וועלן זיך דא ווייזן, כדי איר זאלט קענען ווייטער הערן.",
  "today.continue.resume": "ווייטער פון {time}",
  "today.continue.next": "דער קומענדיגער אין דער סדרה",
  "today.newly": "נייע נאטיצן",
  "today.newly.lead": "נאטיצן פאר די שיעורים זענען לעצטנס צוגעלייגט געווארן.",
  "today.counter": "{full} פון {total} שיעורים האבן שוין נאטיצן.",
  "card.year.unknown": "יאר נישט באקאנט",
  "card.notesPending": "נאטיצן נאך נישט צוגעגרייט",
  "card.part": "טייל {n}",
};

export type TodayT = TFunction<TodayKey>;

const cache: Partial<Record<UiLang, TodayT>> = {};

export function todayT(ui: UiLang): TodayT {
  return (cache[ui] ??= createT<TodayKey>({ en: todayEn, yi: todayYi }, ui));
}

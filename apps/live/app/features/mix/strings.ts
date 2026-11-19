/**
 * UI strings for the topic mix (concept-live-corpus C.3). The header says what the mix is and that
 * it was assembled automatically from AI tags. The Yiddish wording is unreviewed (W5.3).
 */
import { createT, type MessageTable, type TFunction, type UiLang } from "@emunas/i18n";

export const mixEn = {
  "mix.title": "Play this topic",
  "mix.sections": { one: "{count} section", other: "{count} sections" },
  "mix.shiurim": { one: "{count} shiur", other: "{count} shiurim" },
  "mix.header": "{sections} from {shiurim}.",
  "mix.playing": { one: "Playing {count}, about {minutes} minutes.", other: "Playing {count}, about {minutes} minutes." },
  "mix.auto": "Assembled automatically from AI tags. Each item plays its section to the end.",
  "mix.play": "Play the mix",
  "mix.preparing": "Preparing the mix…",
  "mix.save": "Save as a playlist",
  "mix.saved": "Saved to your shelf.",
  "mix.share": "Share as a link",
  "mix.copied": "Link copied.",
  "mix.linkLabel": "Playlist link",
  "mix.playlistName": "{label} (mix)",
  "mix.empty": "No sections in this language yet.",
  "mix.error": "The mix could not be loaded. Check your connection and try again.",
  "mix.items": "In this mix",
};

export type MixKey = keyof typeof mixEn;

export const mixYi: MessageTable<MixKey> = {
  "mix.title": "שפילט דעם ענין",
  "mix.sections": { one: "{count} חלק", other: "{count} חלקים" },
  "mix.shiurim": { one: "{count} שיעור", other: "{count} שיעורים" },
  "mix.header": "{sections} פון {shiurim}.",
  "mix.playing": { one: "מ'שפילט {count}, בערך {minutes} מינוט.", other: "מ'שפילט {count}, בערך {minutes} מינוט." },
  "mix.auto": "אויטאמאטיש צוזאמגעשטעלט פון AI צייכנס. יעדער חלק שפילט ביזן סוף.",
  "mix.play": "שפילט די מיקס",
  "mix.preparing": "מ'גרייט צו די מיקס…",
  "mix.save": "היט אפ ווי א שפיל-ליסטע",
  "mix.saved": "אפגעהיט אויף אייער פאליצע.",
  "mix.share": "טיילט ווי א לינק",
  "mix.copied": "דער לינק איז קאפירט.",
  "mix.linkLabel": "לינק צו דער ליסטע",
  "mix.playlistName": "{label} (מיקס)",
  "mix.empty": "נאך נישטא קיין חלקים אין דער שפראך.",
  "mix.error": "די מיקס האט זיך נישט געלאדן. קוקט אויף דער פארבינדונג און פרובירט נאכאמאל.",
  "mix.items": "אין דער מיקס",
};

export const mixHe: MessageTable<MixKey> = {
  "mix.title": "השמעת הנושא",
  "mix.sections": { one: "{count} קטע", other: "{count} קטעים" },
  "mix.shiurim": { one: "{count} שיעור", other: "{count} שיעורים" },
  "mix.header": "{sections} מתוך {shiurim}.",
  "mix.playing": { one: "משמיע {count}, כ־{minutes} דקות.", other: "משמיע {count}, כ־{minutes} דקות." },
  "mix.auto": "הורכב אוטומטית לפי תגיות AI. כל פריט מתנגן עד סוף הקטע שלו.",
  "mix.play": "השמעת המיקס",
  "mix.preparing": "המיקס בהכנה…",
  "mix.save": "שמירה כרשימת השמעה",
  "mix.saved": "נשמר במדף שלכם.",
  "mix.share": "שיתוף כקישור",
  "mix.copied": "הקישור הועתק.",
  "mix.linkLabel": "קישור לרשימה",
  "mix.playlistName": "{label} (מיקס)",
  "mix.empty": "עדיין אין קטעים בשפה זו.",
  "mix.error": "לא ניתן היה לטעון את המיקס. בדקו את החיבור ונסו שוב.",
  "mix.items": "במיקס זה",
};

export type MixT = TFunction<MixKey>;

const cache: Partial<Record<UiLang, MixT>> = {};

export function mixT(ui: UiLang): MixT {
  return (cache[ui] ??= createT<MixKey>({ en: mixEn, yi: mixYi, he: mixHe }, ui));
}

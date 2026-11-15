/**
 * UI strings of the AI indexes (sources, stories, people, inyanim). Kept beside the index
 * components (W3.4 owns `components/indexes/**`); shared shell strings (nav, citation number,
 * notes label) come from `src/i18n`. Same rules as the shell tables: `yi` is typed against the
 * English keys, so a missing key fails `tsc`; plain voice, no marketing words.
 *
 * Wording status: unreviewed (W5.3 does the fixed-copy pass; Yiddish needs a native reader).
 */
import { createT, type MessageTable, type TFunction } from "@emunas/i18n";
import type { Ed } from "../../lib/edition.ts";

export const indexesEn = {
  "indexes.label": "Indexes",

  "sources.title": "Sources",
  "sources.intro": "Seforim the notes say the Rav brings, in the order of a mafteach: Torah, Nevi'im, Kesuvim, Mishnah and Gemara by masechta, Midrash, Zohar, Rishonim, then later seforim.",
  "stories.title": "Stories",
  "stories.intro": "Stories told in the shiurim, by the person they are about. Each telling is listed, so a story told in several shiurim appears more than once. The retelling is on the shiur page.",
  "people.title": "People",
  "people.intro": "Names mentioned in the shiurim, with the shiurim that mention them.",
  "inyanim.title": "Inyanim",
  "inyanim.intro": "Concepts by their Hebrew term, where a term occurs in at least {min} shiurim. Very common words are left out.",

  "index.partial": "This index is partial and unreviewed: it is compiled from AI notes and has not been checked by a person.",
  "index.jump": "Jump to",
  "index.backTo": "All {index}",

  "count.shiurim": { one: "{count} shiur", other: "{count} shiurim" },
  "count.mentions": { one: "mentioned once", other: "mentioned {count} times" },
  "count.stories": { one: "{count} story", other: "{count} stories" },

  "cite.label": "{cite}, at {time}",

  "work.group.torah": "Torah",
  "work.group.neviim": "Nevi'im",
  "work.group.kesuvim": "Kesuvim",
  "work.group.targum": "Targum",
  "work.group.mishnah": "Mishnah",
  "work.group.bavli": "Talmud Bavli",
  "work.group.yerushalmi": "Talmud Yerushalmi",
  "work.group.midrash": "Midrash",
  "work.group.zohar": "Zohar and Kabbalah",
  "work.group.rishonim": "Rishonim",
  "work.group.acharonim": "Acharonim and Chassidus",
  "work.group.tefillah": "Tefillah and Piyut",
  "work.group.other": "Other seforim",
  "work.group.unmapped": "Not yet in the list of seforim",
  "work.group.general": "General references",
  "work.generalNote": "Named without a particular sefer or place (\"the Midrash says\").",
  "work.refs": "By place",
  "work.otherRefs": "Other references",
  "work.placeNotIdentified": "Place not identified",
  "work.onSefaria": "Sefaria",
  "work.onSefariaLabel": "{ref} on Sefaria (external site)",

  "names.label": "Written in the notes as:",
  "people.mentioned": "Mentioned",
  "people.storiesHeading": "Stories",
  "people.noPerson": "Stories without a named person",

  "inyanim.sections": "Sections on this",
  "inyanim.variants": "Also spelled:",
} as const;

export type IndexesKey = keyof typeof indexesEn;

export const indexesYi: MessageTable<IndexesKey> = {
  "indexes.label": "מפתחות",

  "sources.title": "מראי מקומות",
  "sources.intro": "ספרים וואס דער משגיח ברענגט לויט די נאטיצן, אין דעם סדר פון א מפתח: תורה, נביאים, כתובים, משנה און גמרא לויט די מסכתות, מדרש, זוהר, ראשונים, און דערנאך שפעטערדיגע ספרים.",
  "stories.title": "מעשיות",
  "stories.intro": "מעשיות וואס ווערן דערציילט אין די שיעורים, לויט דעם וועמען זיי גייען. יעדעס דערציילן איז אויסגערעכנט, אזוי אז א מעשה וואס ווערט דערציילט אין עטליכע שיעורים קומט פאר מער ווי איינמאל. די מעשה אליין שטייט ביים שיעור.",
  "people.title": "שמות",
  "people.intro": "נעמען וואס ווערן דערמאנט אין די שיעורים, מיט די שיעורים וואו זיי ווערן דערמאנט.",
  "inyanim.title": "ענינים",
  "inyanim.intro": "ענינים לויט זייער לשון־קודש ווארט, ווען דאס ווארט קומט פאר אין כאטש {min} שיעורים. גאר געווענליכע ווערטער זענען אויסגעלאזט.",

  "index.partial": "דער מפתח איז נישט פולשטענדיג און נישט איבערגעקוקט: ער איז צוזאמגעשטעלט פון AI נאטיצן און קיינער האט אים נישט דורכגעקוקט.",
  "index.jump": "שפרינג צו",
  "index.backTo": "אלע {index}",

  "count.shiurim": { one: "{count} שיעור", other: "{count} שיעורים" },
  "count.mentions": { one: "דערמאנט איינמאל", other: "דערמאנט {count} מאל" },
  "count.stories": { one: "{count} מעשה", other: "{count} מעשיות" },

  "cite.label": "{cite}, ביי {time}",

  "work.group.torah": "תורה",
  "work.group.neviim": "נביאים",
  "work.group.kesuvim": "כתובים",
  "work.group.targum": "תרגום",
  "work.group.mishnah": "משנה",
  "work.group.bavli": "תלמוד בבלי",
  "work.group.yerushalmi": "תלמוד ירושלמי",
  "work.group.midrash": "מדרש",
  "work.group.zohar": "זוהר און קבלה",
  "work.group.rishonim": "ראשונים",
  "work.group.acharonim": "אחרונים און חסידות",
  "work.group.tefillah": "תפילה און פיוט",
  "work.group.other": "אנדערע ספרים",
  "work.group.unmapped": "נאך נישט אין דער ליסטע פון ספרים",
  "work.group.general": "אלגעמיינע מראי מקומות",
  "work.generalNote": "דערמאנט אן א באשטימטן ספר אדער פלאץ (\"דער מדרש זאגט\").",
  "work.refs": "לויט דעם פלאץ",
  "work.otherRefs": "אנדערע מראי מקומות",
  "work.placeNotIdentified": "מקום נישט באשטימט",
  "work.onSefaria": "ספריא",
  "work.onSefariaLabel": "{ref} אויף ספריא (א דרויסנדיגער זייטל)",

  "names.label": "אין די נאטיצן געשריבן:",
  "people.mentioned": "דערמאנט",
  "people.storiesHeading": "מעשיות",
  "people.noPerson": "מעשיות אן א באשטימטן מענטש",

  "inyanim.sections": "חלקים וועגן דעם",
  "inyanim.variants": "אויך געשריבן:",
};

const tables = { en: indexesEn, yi: indexesYi } as const;
const cache = new Map<Ed, TFunction<IndexesKey>>();

/** The typed `t()` for the index strings of an edition. */
export function useIndexesT(ed: Ed): TFunction<IndexesKey> {
  let t = cache.get(ed);
  if (!t) {
    t = createT<IndexesKey>(tables, ed);
    cache.set(ed, t);
  }
  return t;
}

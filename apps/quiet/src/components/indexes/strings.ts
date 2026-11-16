/**
 * UI strings of the corpus-entry indexes (names, sources, glossary). Kept beside the index
 * components; shared shell strings (nav, citation number,
 * notes label) come from `src/i18n`. Same rules as the shell tables: `yi` is typed against the
 * English keys, so a missing key fails `tsc`; plain voice, no marketing words.
 *
 * Wording status: unreviewed (W5.3 does the fixed-copy pass; Yiddish needs a native reader).
 */
import { createT, type MessageTable, type TFunction } from "@emunas/i18n";
import type { Ed } from "../../lib/edition.ts";

export const indexesEn = {
  "index.jump": "Jump to",

  "count.shiurim": { one: "{count} shiur", other: "{count} shiurim" },
  "count.stories": { one: "{count} story", other: "{count} stories" },

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
  "work.onSefaria": "Sefaria",
  "work.onSefariaLabel": "{ref} on Sefaria (external site)",

  // ---- corpus entries (C2.1): names, works, glossary
  "names.intro": "People named in the shiurim, by era: Tanach, Chazal, Rishonim, Acharonim, tzaddikim of Chassidus, then others. Someone named in one or two shiurim is listed with those shiurim; anyone else has a page.",
  "names.also": "also:",
  "names.see": "see",
  "names.seforim": "Seforim cited",
  "names.stories": "Stories",
  "names.shiurim": "Shiurim",
  "names.allShiurim": { one: "The shiur ({count})", other: "All {count} shiurim" },
  "names.allTitle": "{name}: all shiurim",
  "works.intro": "Seforim cited in the shiurim, in the order of a mafteach: Torah, Nevi'im, Kesuvim, Mishnah and Gemara by masechta, Midrash, Zohar, Rishonim, then later seforim. A sefer cited in one shiur is listed with that shiur; a general name (\"the Midrash\") is listed with its shiurim at the end.",
  "works.by": "by",
  "works.onSefaria": "on Sefaria",
  "works.onSefariaLabel": "{title} on Sefaria (external site)",
  "works.family": "Seforim in this family",
  "works.familyShiurim": "Shiurim that cite it by this name",
  "works.shiurim": "Shiurim",
  "works.alsoCited": "Also cited, place not given",
  "glossary.intro": "Terms as they are used in the shiurim, aleph to tav, each with a short definition. A term found in five or more shiurim has a page with the places it is best explained; a term found in a great many shiurim is marked \"throughout\".",
  "glossary.examples": "Well illustrated in",
  "glossary.shiurim": "Shiurim",
  "glossary.topic": "see the topic",
  "glossary.also": "Also written:",
} as const;

export type IndexesKey = keyof typeof indexesEn;

export const indexesYi: MessageTable<IndexesKey> = {
  "index.jump": "גייט צו",

  "count.shiurim": { one: "{count} שיעור", other: "{count} שיעורים" },
  "count.stories": { one: "{count} מעשה", other: "{count} מעשיות" },

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
  "work.generalNote": "דערמאנט אן א באשטימטן ספר אדער מקום (\"דער מדרש זאגט\").",
  "work.refs": "לויט דעם מקום",
  "work.otherRefs": "אנדערע מראי מקומות",
  "work.onSefaria": "ספריא",
  "work.onSefariaLabel": "{ref} אויף ספריא (אן אנדער זייטל)",

  "names.intro": "פערזאנען וואס ווערן דערמאנט אין די שיעורים, לויט די דורות: תנ\"ך, חז\"ל, ראשונים, אחרונים, צדיקי החסידות, און דערנאך אנדערע. ווער עס ווערט דערמאנט אין איין אדער צוויי שיעורים שטייט מיט די שיעורים; יעדער אנדערער האט א בלאט.",
  "names.also": "אויך:",
  "names.see": "ראה",
  "names.seforim": "ספרים וואס ווערן געברענגט",
  "names.stories": "מעשיות",
  "names.shiurim": "שיעורים",
  "names.allShiurim": { one: "דער שיעור ({count})", other: "אלע {count} שיעורים" },
  "names.allTitle": "{name}: אלע שיעורים",
  "works.intro": "ספרים וואס ווערן געברענגט אין די שיעורים, אין דעם סדר פון א מפתח: תורה, נביאים, כתובים, משנה און גמרא לויט די מסכתות, מדרש, זוהר, ראשונים, און דערנאך שפעטערדיגע ספרים. א ספר וואס ווערט געברענגט אין איין שיעור שטייט מיט יענעם שיעור; אן אלגעמיינער נאמען (\"דער מדרש\") שטייט מיט זיינע שיעורים צום סוף.",
  "works.by": "פון",
  "works.onSefaria": "אויף ספריא",
  "works.onSefariaLabel": "{title} אויף ספריא (אן אנדער זייטל)",
  "works.family": "ספרים אין דער משפחה",
  "works.familyShiurim": "שיעורים וואס ברענגען אים מיט דעם נאמען",
  "works.shiurim": "שיעורים",
  "works.alsoCited": "אויך געברענגט, אן א מקום",
  "glossary.intro": "ווערטער ווי זיי ווערן גענוצט אין די שיעורים, פון א׳ ביז ת׳, יעדעס מיט א קורצן טייטש. א ווארט וואס קומט פאר אין פינף שיעורים אדער מער האט א בלאט מיט די ערטער וואו עס ווערט בעסטן ערקלערט; א ווארט וואס קומט פאר אין גאר אסאך שיעורים איז אנגעצייכנט \"אומעטום\".",
  "glossary.examples": "גוט ערקלערט אין",
  "glossary.shiurim": "שיעורים",
  "glossary.topic": "זעט דעם ענין",
  "glossary.also": "אויך געשריבן:",
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

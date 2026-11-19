import { byUiLang, type UiLang } from "../lang.ts";
import { createT, type MessageTable, type MessageTables, type Params, type TFunction } from "../t.ts";

/**
 * Shared wording for the corpus-wide layer (corpus-wave-plan C1.4): topics, the glossary, merged
 * people, works and stories, and threads (teaching clusters). Both sites use these tables, so the
 * AI labels and counts read the same on Quiet and Live.
 *
 * Every corpus entity is AI-generated and unreviewed, and is labelled once per page:
 * - Quiet (concept-quiet-corpus C6 "The label"): `label.index` under each generated index heading;
 *   `label.entry` at the foot of each entity page, beside `report.entry`; a story page uses
 *   `label.story`. An entity with `reviewStatus: "reviewed"` drops the "not reviewed" clause
 *   (`label.entry.reviewed`) and nothing else changes.
 * - Live (concept-live-corpus E.3): the standing AI label (`AI_LABEL`) plus `label.grouped` once
 *   under the title of an entity page; a reviewed entity shows `label.grouped.reviewed` instead.
 *
 * Yiddish speaks of the Mashgiach as "דער משגיח" (the upstream voice), Hebrew as "המשגיח"; English
 * says "the Mashgiach". Hebrew plurals may add a `two` form ("שני שיעורים"); without one, 2 takes
 * `other`. Wording status: PROPOSED, not yet signed off by the owner or a Yiddish or Hebrew reader
 * (like AI_LABEL).
 */
export const CORPUS_LABEL_STATUS = "proposed" as const;

const en = {
  // ---- AI labels (Quiet C6)
  "label.index": {
    one: "Compiled by AI from the notes on {count} shiur. Not reviewed by a person; entries may be wrongly joined or split.",
    other: "Compiled by AI from the notes on {count} shiurim. Not reviewed by a person; entries may be wrongly joined or split.",
  },
  "label.entry": "Notes prepared by AI; not reviewed. The recordings are the source.",
  "label.entry.reviewed": "Notes prepared by AI. The recordings are the source.",
  "label.story": {
    one: "Retold here from {count} telling. Hear it in the shiur.",
    other: "Retold here from {count} tellings; details differ from one to another. Hear it in the shiur.",
  },
  /** A story whose tellings credit it to different people (`attributionVaries`). */
  "story.attributionVaries": "The tellings differ on whom this happened with.",
  // ---- AI labels (Live E.3, C.1, C.5)
  "label.grouped": "Grouped and named by AI across all the shiurim. Not reviewed by a person.",
  "label.grouped.reviewed": "Reviewed",
  "thread.heading": "A teaching the Mashgiach returns to",
  "glossary.asUsed": "As the term is used in these shiurim",

  // ---- indexes (Quiet C5, in order)
  "index.topics": "Topics",
  "index.glossary": "Glossary",
  "index.names": "Names",
  "index.sources": "Sources",
  "index.stories": "Stories",
  "index.threads": "Teachings the Mashgiach returned to",

  // ---- kinds (report subject, headings)
  "kind.topic": "topic",
  "kind.concept": "glossary entry",
  "kind.person": "person",
  "kind.work": "sefer",
  "kind.story": "story",
  "kind.thread": "teaching",

  // ---- person type groups, sefer order (Quiet C4.3, Live C.5)
  "personGroup.tanach": "Tanach",
  "personGroup.malach": "Malachim",
  "personGroup.chazal": "Chazal",
  "personGroup.rishon": "Rishonim",
  "personGroup.acharon": "Acharonim",
  "personGroup.chassidic_rebbe": "Chassidic Rebbes",
  "personGroup.ruler": "Kings and rulers",
  "personGroup.other": "Others",

  // ---- topic grades (Quiet C4.1 part 4)
  "grade.main": "The shiur is about this",
  "grade.discussed": "Discussed in the shiur",
  "grade.touched": "Touched on in one part",

  // ---- counts and cross-references
  "count.retoldFrom": { one: "retold from {count} telling", other: "retold from {count} tellings" },
  "count.toldInOther": { one: "told in {count} other shiur", other: "told in {count} other shiurim" },
  "count.taughtInOther": { one: "taught in {count} other shiur", other: "taught in {count} other shiurim" },
  "count.taughtInOtherYears": {
    one: "taught in {count} other shiur, {from} to {to}",
    other: "taught in {count} other shiurim, {from} to {to}",
  },
  "alsoTaughtIn": "also taught in {shiur}, {year}",
  "alsoTaughtIn.undated": "also taught in {shiur}",
  "throughout": "throughout",
  "notesNotPrepared": "notes not prepared yet",

  // ---- reporting (Quiet C6 "Reporting", Live E.4)
  "report.entry": "Report an error in this entry",
  "report.subject": "Error in {kind} {id}",
  "report.twoDifferent": "These are two different people or stories",
  "report.sameAsOther": "This is the same as another entry",
  "report.doesNotBelong": "This shiur does not belong here",
  "report.notHere": "This does not belong here",
  "report.same": "These are the same",
  "report.merged": "Two different things were merged",
  "report.wrongDetails": "Wrong name, wrong type or wrong definition",
} as const;

export type CorpusLabelKey = keyof typeof en;

const yi: MessageTable<CorpusLabelKey> = {
  "label.index": {
    one: "צוזאמגעשטעלט דורך AI פון די נאטיצן אויף {count} שיעור. נישט איבערגעקוקט דורך א מענטש; ערכים קענען זיין פאלש צוזאמגעשטעלט אדער צעטיילט.",
    other: "צוזאמגעשטעלט דורך AI פון די נאטיצן אויף {count} שיעורים. נישט איבערגעקוקט דורך א מענטש; ערכים קענען זיין פאלש צוזאמגעשטעלט אדער צעטיילט.",
  },
  "label.entry": "נאטיצן צוגעגרייט דורך AI; נישט איבערגעקוקט. דער מקור זענען די רעקארדירונגען.",
  "label.entry.reviewed": "נאטיצן צוגעגרייט דורך AI. דער מקור זענען די רעקארדירונגען.",
  "label.story": {
    one: "דא איבערדערציילט פון {count} מאל וואס דער משגיח דערציילט עס. הערט עס אין שיעור.",
    other: "דא איבערדערציילט פון {count} מאל וואס דער משגיח דערציילט עס; די פרטים זענען נישט גלייך פון איין מאל צום אנדערן. הערט עס אין שיעור.",
  },
  "story.attributionVaries": "אין די פארשידענע מאל ווערט די מעשה צוגעשריבן צו פארשידענע מענטשן.",
  "label.grouped": "צוזאמגעגרופירט און אנגערופן דורך AI איבער אלע שיעורים. נישט איבערגעקוקט דורך א מענטש.",
  "label.grouped.reviewed": "איבערגעקוקט",
  "thread.heading": "א לימוד צו וועלכן דער משגיח קומט צוריק",
  "glossary.asUsed": "ווי דאס ווארט ווערט גענוצט אין די שיעורים",

  "index.topics": "ענינים",
  "index.glossary": "ערכים",
  "index.names": "שמות",
  "index.sources": "מראי מקומות",
  "index.stories": "מעשיות",
  "index.threads": "חזרות: לימודים צו וועלכע דער משגיח קומט צוריק",

  "kind.topic": "ענין",
  "kind.concept": "ערך",
  "kind.person": "פערזאן",
  "kind.work": "ספר",
  "kind.story": "מעשה",
  "kind.thread": "לימוד",

  "personGroup.tanach": "תנ\"ך",
  "personGroup.malach": "מלאכים",
  "personGroup.chazal": "חז\"ל",
  "personGroup.rishon": "ראשונים",
  "personGroup.acharon": "אחרונים",
  "personGroup.chassidic_rebbe": "צדיקי החסידות",
  "personGroup.ruler": "מלכים און הערשער",
  "personGroup.other": "אנדערע",

  "grade.main": "דער שיעור איז וועגן דעם",
  "grade.discussed": "גערעדט אין שיעור",
  "grade.touched": "דערמאנט אין איין טייל",

  "count.retoldFrom": { one: "איבערדערציילט פון {count} מאל", other: "איבערדערציילט פון {count} מאל" },
  "count.toldInOther": { one: "דערציילט אין נאך {count} שיעור", other: "דערציילט אין נאך {count} שיעורים" },
  "count.taughtInOther": { one: "געלערנט אין נאך {count} שיעור", other: "געלערנט אין נאך {count} שיעורים" },
  "count.taughtInOtherYears": {
    one: "געלערנט אין נאך {count} שיעור, פון {from} ביז {to}",
    other: "געלערנט אין נאך {count} שיעורים, פון {from} ביז {to}",
  },
  "alsoTaughtIn": "אויך געלערנט אין {shiur}, {year}",
  "alsoTaughtIn.undated": "אויך געלערנט אין {shiur}",
  "throughout": "אומעטום",
  "notesNotPrepared": "נאטיצן נאך נישט צוגעגרייט",

  "report.entry": "מעלדט א טעות אין דעם ערך",
  "report.subject": "א טעות אין {kind} {id}",
  "report.twoDifferent": "דאס זענען צוויי באזונדערע מענטשן אדער מעשיות",
  "report.sameAsOther": "דאס איז דאס זעלבע ווי אן אנדער ערך",
  "report.doesNotBelong": "דער שיעור געהערט נישט אהער",
  "report.notHere": "דאס געהערט נישט אהער",
  "report.same": "דאס איז דאס זעלבע",
  "report.merged": "צוויי באזונדערע זאכן זענען צוזאמגעשטעלט געווארן",
  "report.wrongDetails": "א פאלשער נאמען, א פאלשער סוג אדער א פאלשער פירוש",
};

const he: MessageTable<CorpusLabelKey> = {
  "label.index": {
    one: "לוקט על ידי AI מהרשימות על שיעור אחד. לא נבדק על ידי אדם; ייתכן שערכים אוחדו או פוצלו בטעות.",
    other: "לוקט על ידי AI מהרשימות על {count} שיעורים. לא נבדק על ידי אדם; ייתכן שערכים אוחדו או פוצלו בטעות.",
  },
  "label.entry": "רשימות שהוכנו על ידי AI; לא נבדקו. המקור הוא ההקלטות.",
  "label.entry.reviewed": "רשימות שהוכנו על ידי AI. המקור הוא ההקלטות.",
  "label.story": {
    one: "מסופר כאן על פי הפעם האחת שהמשגיח סיפר את המעשה. שמעו אותו בשיעור.",
    two: "מסופר כאן על פי שתי הפעמים שהמשגיח סיפר את המעשה; הפרטים משתנים מפעם לפעם. שמעו אותו בשיעור.",
    other: "מסופר כאן על פי {count} הפעמים שהמשגיח סיפר את המעשה; הפרטים משתנים מפעם לפעם. שמעו אותו בשיעור.",
  },
  "story.attributionVaries": "בפעמים השונות מיוחס המעשה לאנשים שונים.",
  "label.grouped": "קובץ ונקבע שמו על ידי AI מתוך כל השיעורים. לא נבדק על ידי אדם.",
  "label.grouped.reviewed": "נבדק",
  "thread.heading": "לימוד שהמשגיח חוזר אליו",
  "glossary.asUsed": "כפי שהמונח משמש בשיעורים אלו",

  "index.topics": "נושאים",
  "index.glossary": "מונחים",
  "index.names": "שמות",
  "index.sources": "מראי מקומות",
  "index.stories": "מעשיות",
  "index.threads": "לימודים שהמשגיח חזר אליהם",

  "kind.topic": "נושא",
  "kind.concept": "מונח",
  "kind.person": "אישיות",
  "kind.work": "ספר",
  "kind.story": "מעשה",
  "kind.thread": "לימוד",

  "personGroup.tanach": "תנ\"ך",
  "personGroup.malach": "מלאכים",
  "personGroup.chazal": "חז\"ל",
  "personGroup.rishon": "ראשונים",
  "personGroup.acharon": "אחרונים",
  "personGroup.chassidic_rebbe": "צדיקי החסידות",
  "personGroup.ruler": "מלכים ושליטים",
  "personGroup.other": "אחרים",

  "grade.main": "השיעור עוסק בזה",
  "grade.discussed": "נידון בשיעור",
  "grade.touched": "הוזכר בחלק אחד",

  "count.retoldFrom": { one: "מסופר מתוך פעם אחת", two: "מסופר מתוך שתי פעמים", other: "מסופר מתוך {count} פעמים" },
  "count.toldInOther": { one: "סופר בעוד שיעור אחד", two: "סופר בעוד שני שיעורים", other: "סופר בעוד {count} שיעורים" },
  "count.taughtInOther": { one: "נלמד בעוד שיעור אחד", two: "נלמד בעוד שני שיעורים", other: "נלמד בעוד {count} שיעורים" },
  "count.taughtInOtherYears": {
    one: "נלמד בעוד שיעור אחד, בשנים {from} עד {to}",
    two: "נלמד בעוד שני שיעורים, בשנים {from} עד {to}",
    other: "נלמד בעוד {count} שיעורים, בשנים {from} עד {to}",
  },
  "alsoTaughtIn": "נלמד גם בשיעור {shiur}, {year}",
  "alsoTaughtIn.undated": "נלמד גם בשיעור {shiur}",
  "throughout": "לאורך כל השיעור",
  "notesNotPrepared": "הרשימות עדיין לא הוכנו",

  "report.entry": "דיווח על טעות בערך זה",
  "report.subject": "טעות ב{kind} {id}",
  "report.twoDifferent": "אלו שני אנשים או שני מעשים שונים",
  "report.sameAsOther": "זהו אותו ערך כמו ערך אחר",
  "report.doesNotBelong": "השיעור הזה אינו שייך לכאן",
  "report.notHere": "זה אינו שייך לכאן",
  "report.same": "אלו אותו הדבר",
  "report.merged": "שני דברים שונים אוחדו",
  "report.wrongDetails": "שם שגוי, סוג שגוי או הגדרה שגויה",
};

/** Every language's table, over one key union; the one accessor for a corpus table (`CORPUS_LABELS[lang]`). */
export const CORPUS_LABELS: MessageTables<CorpusLabelKey> = { en, yi, he };

const translators: Readonly<Record<UiLang, TFunction<CorpusLabelKey>>> = byUiLang((lang) =>
  createT<CorpusLabelKey>(CORPUS_LABELS, lang),
);

/** A corpus label in `lang`; `params.count` picks the plural form. */
export function corpusLabel(key: CorpusLabelKey, lang: UiLang, params?: Params): string {
  return translators[lang](key, params);
}

/** The once-per-page AI sentence of an entity page on each site, reviewed or not. */
export function corpusEntryLabel(site: "quiet" | "live", reviewed: boolean, lang: UiLang): string {
  if (site === "quiet") return corpusLabel(reviewed ? "label.entry.reviewed" : "label.entry", lang);
  return corpusLabel(reviewed ? "label.grouped.reviewed" : "label.grouped", lang);
}

/**
 * Mirrors `LayerPersonGroup` (`@emunas/corpus/public`), in sefer order: malachim beside Tanach,
 * rulers before the others. The layer maps each person type to a group (`individual` → `other`).
 */
export type PersonGroup = "tanach" | "malach" | "chazal" | "rishon" | "acharon" | "chassidic_rebbe" | "ruler" | "other";
export const PERSON_GROUP_ORDER: readonly PersonGroup[] = ["tanach", "malach", "chazal", "rishon", "acharon", "chassidic_rebbe", "ruler", "other"];

/** Group heading for a person group; a group the data adds later shows as itself. */
export function personGroupLabel(type: string, lang: UiLang): string {
  const key = `personGroup.${type}`;
  return translators[lang].has(key) ? translators[lang](key) : type;
}

/** The three grades of a topic page (salience ≥0.6 / lower / section level only). */
export type TopicGrade = "main" | "discussed" | "touched";
export const TOPIC_GRADES: readonly TopicGrade[] = ["main", "discussed", "touched"];

export function topicGradeLabel(grade: TopicGrade, lang: UiLang): string {
  return corpusLabel(`grade.${grade}`, lang);
}

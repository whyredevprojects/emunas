import type { UiLang } from "../lang.ts";
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
 * Yiddish speaks of the Rav as "דער משגיח" (the upstream voice); English says "the Rav".
 * Wording status: PROPOSED, not yet signed off by the owner or a Yiddish reader (like AI_LABEL).
 */
export const CORPUS_LABEL_STATUS = "proposed" as const;

export const corpusLabelsEn = {
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
  // ---- AI labels (Live E.3, C.1, C.5)
  "label.grouped": "Grouped and named by AI across all the shiurim. Not reviewed by a person.",
  "label.grouped.reviewed": "Reviewed",
  "thread.heading": "A teaching the Rav returns to",
  "glossary.asUsed": "As the term is used in these shiurim",

  // ---- indexes (Quiet C5, in order)
  "index.topics": "Topics",
  "index.glossary": "Glossary",
  "index.names": "Names",
  "index.sources": "Sources",
  "index.stories": "Stories",
  "index.threads": "Teachings the Rav returned to",

  // ---- kinds (report subject, headings)
  "kind.topic": "topic",
  "kind.concept": "glossary entry",
  "kind.person": "person",
  "kind.work": "sefer",
  "kind.story": "story",
  "kind.thread": "teaching",

  // ---- person type groups, sefer order (Quiet C4.3, Live C.5)
  "personGroup.tanach": "Tanach",
  "personGroup.chazal": "Chazal",
  "personGroup.rishon": "Rishonim",
  "personGroup.acharon": "Acharonim",
  "personGroup.chassidic_rebbe": "Chassidic Rebbes",
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

export type CorpusLabelKey = keyof typeof corpusLabelsEn;

export const corpusLabelsYi: MessageTable<CorpusLabelKey> = {
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
  "personGroup.chazal": "חז\"ל",
  "personGroup.rishon": "ראשונים",
  "personGroup.acharon": "אחרונים",
  "personGroup.chassidic_rebbe": "צדיקי החסידות",
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

export const CORPUS_LABELS: MessageTables<CorpusLabelKey> = { en: corpusLabelsEn, yi: corpusLabelsYi };

const translators: Readonly<Record<UiLang, TFunction<CorpusLabelKey>>> = {
  en: createT<CorpusLabelKey>(CORPUS_LABELS, "en"),
  yi: createT<CorpusLabelKey>(CORPUS_LABELS, "yi"),
};

/** A corpus label in `lang`; `params.count` picks the plural form. */
export function corpusLabel(key: CorpusLabelKey, lang: UiLang, params?: Params): string {
  return translators[lang](key, params);
}

/** The once-per-page AI sentence of an entity page on each site, reviewed or not. */
export function corpusEntryLabel(site: "quiet" | "live", reviewed: boolean, lang: UiLang): string {
  if (site === "quiet") return corpusLabel(reviewed ? "label.entry.reviewed" : "label.entry", lang);
  return corpusLabel(reviewed ? "label.grouped.reviewed" : "label.grouped", lang);
}

/** Mirrors `LayerPersonType` (`@emunas/corpus/public`), in sefer order. */
export type PersonGroup = "tanach" | "chazal" | "rishon" | "acharon" | "chassidic_rebbe" | "other";
export const PERSON_GROUP_ORDER: readonly PersonGroup[] = ["tanach", "chazal", "rishon", "acharon", "chassidic_rebbe", "other"];

/** Group heading for a person type; a type the data adds later shows as itself. */
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

import type { UiLang } from "./lang.ts";
import { formatNumber } from "./numbers.ts";
import { AI_LABEL } from "./vocab/ai-label.ts";

/**
 * Data vocabulary shared by both sites (integration-plan §1.3): labels for values
 * that come from the data (category, section kind, source resolution, audio
 * language) and the standing notices about AI notes and catalog coverage. UI
 * copy (navigation, buttons) stays in each app.
 *
 * Wording follows concept-quiet §5.4/§8/§11 and concept-live §2/§7/§9: plain,
 * no marketing voice; Yiddish speaks of "דער משגיח", English of "the Rav".
 * All wording is unreviewed (reviewStatus below) until the owner signs it off.
 */
export const VOCABULARY_REVIEW_STATUS = "unreviewed" as const;

type Labels<K extends string> = Readonly<Record<K, Readonly<Record<UiLang, string>>>>;

/** Mirrors `Shiur["category"]` in src/types.ts (a type test keeps them equal). */
export type Category = "parsha" | "zman" | "shonos" | "set" | "simcha" | "misc" | "current" | "purim";

/** Mirrors `SectionKind` in src/types.ts. */
export type SectionKind =
  | "intro"
  | "main"
  | "story"
  | "tangent"
  | "closing"
  | "brachah"
  | "singing"
  | "other_speaker"
  | "noise";

/** Mirrors `SourceMention["resolution"]` in src/types.ts. */
export type Resolution = "resolved" | "inferred" | "unresolved";

/** Spoken language of a recording (`Shiur["lang"]`). */
export type AudioLang = "yi" | "en";

export const CATEGORY_LABELS: Labels<Category> = {
  parsha: { en: "Parshas Hashavua", yi: "פרשת השבוע" },
  zman: { en: "Zmanim", yi: "זמנים" },
  shonos: { en: "Various topics", yi: "שונות" },
  set: { en: "Series", yi: "סדרות" },
  simcha: { en: "Simchos", yi: "שמחות" },
  misc: { en: "Miscellaneous", yi: "פארשידנס" },
  current: { en: "Current", yi: "ענינים פון דער צייט" },
  purim: { en: "Purim", yi: "פורים" },
};

export const SECTION_KIND_LABELS: Labels<SectionKind> = {
  intro: { en: "Opening", yi: "הקדמה" },
  main: { en: "Main part", yi: "עיקר השיעור" },
  story: { en: "Story", yi: "מעשה" },
  tangent: { en: "Aside", yi: "אגב" },
  closing: { en: "Closing", yi: "סיום" },
  brachah: { en: "Brachah", yi: "ברכה" },
  singing: { en: "Singing", yi: "ניגון" },
  other_speaker: { en: "Another speaker", yi: "אן אנדער רעדנער" },
  noise: { en: "Unclear audio", yi: "נישט קלאר אויפגענומען" },
};

/**
 * Source grading by wording, not colour (concept-quiet §5.4 part 6): `resolved`
 * has no qualifier, `inferred` is preceded by "apparently", `unresolved` with a
 * work is followed by "(place not identified)".
 */
export const RESOLUTION_LABELS: Labels<Resolution> = {
  resolved: { en: "", yi: "" },
  inferred: { en: "apparently", yi: "לכאורה" },
  unresolved: { en: "place not identified", yi: "מקום נישט באשטימט" },
};

export const LANGUAGE_NAMES: Labels<AudioLang> = {
  yi: { en: "Yiddish", yi: "אידיש" },
  en: { en: "English", yi: "ענגליש" },
};

/** The audio-language mark on every card and citation line (concept-live §7). */
export const AUDIO_LANGUAGE_LABELS: Labels<AudioLang> = {
  yi: { en: "Shiur in Yiddish", yi: "שיעור אויף אידיש" },
  en: { en: "Shiur in English", yi: "שיעור אויף ענגליש" },
};

export type NoticeKey = "aiNotes" | "aiNotesShort" | "notesPending" | "uncatalogued" | "listedInGuide";

export const NOTICES: Labels<NoticeKey> = {
  /** The standing label over the notes area, once per page (concept-quiet §5.4 part 4). */
  aiNotes: AI_LABEL,
  /**
   * The constant small label on generated text surfaces (concept-live §2). The same object as
   * `aiNotes`: the label is identical in both sites (W5.3, ./vocab/ai-label.ts).
   */
  aiNotesShort: AI_LABEL,
  /** A shiur without derived data (concept-quiet §5.4 "when notes are pending"). */
  notesPending: {
    en: "Notes for this shiur have not been prepared yet.",
    yi: "נאטיצן פאר דעם שיעור זענען נאך נישט צוגעגרייט.",
  },
  /** A shiur that is not in the 2012 Pocket Guide (catalog.source "uncatalogued-guide"). */
  uncatalogued: {
    en: "Not listed in the 2012 Pocket Guide; its details are taken from the recording.",
    yi: "שטייט נישט אינעם פאקעט גייד פון 2012; די פרטים זענען גענומען פון דער רעקארדירונג.",
  },
  /** A section the catalog title anticipated (`catalogTopicIdx`). */
  listedInGuide: { en: "listed in the guide", yi: "שטייט אינעם קאטאלאג" },
};

function label<K extends string>(table: Labels<K>, key: K, lang: UiLang): string {
  // Data keeps arriving (integration-plan §0.4): an unknown value shows as itself.
  return Object.hasOwn(table, key) ? table[key][lang] : key;
}

export const categoryLabel = (c: Category, lang: UiLang): string => label(CATEGORY_LABELS, c, lang);
export const sectionKindLabel = (k: SectionKind, lang: UiLang): string => label(SECTION_KIND_LABELS, k, lang);
export const languageName = (l: AudioLang, lang: UiLang): string => label(LANGUAGE_NAMES, l, lang);
export const audioLanguageLabel = (l: AudioLang, lang: UiLang): string => label(AUDIO_LANGUAGE_LABELS, l, lang);
export const notice = (k: NoticeKey, lang: UiLang): string => label(NOTICES, k, lang);

/**
 * The coverage line under each AI-derived index heading (concept-quiet §10):
 * "Compiled from the 518 shiurim that have notes so far, of 997."
 */
export function coverageNotice(withNotes: number, total: number, lang: UiLang): string {
  const done = formatNumber(withNotes, lang);
  const all = formatNumber(total, lang);
  return lang === "en"
    ? `Compiled from the ${done} shiurim that have notes so far, of ${all}.`
    : `צוזאמגעשטעלט פון די ${done} שיעורים וואס האבן שוין נאטיצן, פון ${all}.`;
}

export interface SourceRefInput {
  readonly work: string | null;
  readonly ref: string | null;
  readonly resolution: Resolution;
}

/**
 * A source reference split into the reference itself and its qualifier, so the
 * caller can isolate the reference (often Latin in the Yiddish edition) from the
 * edition-language qualifier.
 */
export interface SourceRefParts {
  /** The reference ("Bereishis 6:9") or, without a place, the work ("Zohar"). */
  readonly text: string;
  /** "apparently" / "place not identified" in the edition language, or null. */
  readonly qualifier: string | null;
  /** `before`: "apparently Bereishis 6:9"; `after`: "Zohar (place not identified)". */
  readonly position: "before" | "after" | null;
}

/** Null when there is nothing displayable (`unresolved` with no work; integration-plan C8). */
export function sourceRefParts(source: SourceRefInput, lang: UiLang): SourceRefParts | null {
  const { work, ref, resolution } = source;
  if (resolution === "resolved" && (ref ?? work)) {
    return { text: (ref ?? work) as string, qualifier: null, position: null };
  }
  if (resolution === "inferred" && ref) {
    return { text: ref, qualifier: RESOLUTION_LABELS.inferred[lang], position: "before" };
  }
  if (work) {
    return { text: work, qualifier: RESOLUTION_LABELS.unresolved[lang], position: "after" };
  }
  return null;
}

/** Plain-text form of `sourceRefParts`: "apparently Bereishis 6:9", "Zohar (place not identified)". */
export function formatSourceRef(source: SourceRefInput, lang: UiLang): string | null {
  const parts = sourceRefParts(source, lang);
  if (!parts) return null;
  if (parts.position === "before") return `${parts.qualifier} ${parts.text}`;
  if (parts.position === "after") return `${parts.text} (${parts.qualifier})`;
  return parts.text;
}

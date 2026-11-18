import type { UiLang } from "../lang.ts";

/**
 * The standing AI label (integration-plan §8 W5.3): one wording, used unchanged by both sites.
 * Quiet shows it once over the notes area (`notice("aiNotes")`, concept-quiet §5.4); Live shows it
 * on every generated text surface (`notice("aiNotesShort")`, concept-live §2). Both notice keys
 * resolve to this one object, so the two sites cannot drift apart; a test pins that.
 *
 * It says what both concepts require: the text was made by AI from the recording, no person has
 * reviewed it, it is not the Mashgiach's own words, and the recording is the source.
 *
 * Status: PROPOSED wording (W5.3 copy pass), not yet signed off by the owner or a named Yiddish
 * reviewer. See docs/sites/copy-review.md, "Standing AI label".
 */
export const AI_LABEL: Readonly<Record<UiLang, string>> = {
  en: "Notes prepared by AI from the recording; not reviewed, and not the Mashgiach's words. The recording is the source.",
  yi: "נאטיצן צוגעגרייט דורך AI פון דער רעקארדירונג; נישט איבערגעקוקט, און נישט דעם משגיח׳ס ווערטער. דער מקור איז די רעקארדירונג.",
};

/** Review status of the label wording; becomes "approved" only when the owner signs it off. */
export const AI_LABEL_STATUS = "proposed" as const;

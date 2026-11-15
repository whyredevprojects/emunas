/**
 * Concept (inyan) tables. Concepts are keyed by their Hebrew term (`concepts[].he`).
 *
 * - `CONCEPT_ALIASES`: spelling variants that should be one concept (plene/defective spelling,
 *   construct forms). Matched on `foldBasic`, so nikud and quote marks are already folded.
 * - `CONCEPT_STOP_LIST`: terms too general or too frequent to deserve a concept page (they are
 *   still kept in the shiur data; only the index skips them).
 * - `CONCEPT_MIN_SHIURIM`: Quiet creates a concept page from this many shiurim (concept §5).
 *
 * reviewStatus "unreviewed".
 */
export const conceptsReviewStatus = "unreviewed" as const;

export const CONCEPT_MIN_SHIURIM = 3;

/** canonical → variants */
export const CONCEPT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "מדת הדין": ["מידת הדין"],
  "מדת החסד": ["מידת החסד"],
  "מדת הרחמים": ["מידת הרחמים"],
  "מסירות נפש": ["מסירת נפש"],
  "רבונו של עולם": ["ריבונו של עולם", "רבש\"ע"],
  "יצר הרע": ["היצר הרע", "יצה\"ר"],
  "יצר הטוב": ["היצר הטוב"],
  "סטרא אחרא": ["ס\"א", "סיטרא אחרא"],
  "קליפה": ["קליפות"],
  "ניצוצות": ["ניצוצות קדושה", "נצוצות"],
  "נסיון": ["ניסיון", "נסיונות", "ניסיונות"],
  "השגחה פרטית": ["השגחה פרטיות"],
  "עקבתא דמשיחא": ["עקבתא דמשיחה", "עיקבתא דמשיחא"],
  "תחיית המתים": ["תחית המתים"],
  "בטחון": ["ביטחון"],
  "שם הוי\"ה": ["שם הויה", "שם הוי'ה", "הוי\"ה"],
  "מחיית עמלק": ["מחית עמלק"],
  "גלגול": ["גלגולים", "גלגול נשמות"],
  "שכינה": ["השכינה", "שכינתא"],
  "חבלי משיח": ["חבלו של משיח"],
};

/**
 * Terms that are not useful as index entries: forms of address to Hashem and terms so general
 * that a page would list half the corpus.
 */
export const CONCEPT_STOP_LIST: readonly string[] = [
  "רבונו של עולם",
  "הקב\"ה",
  "השם",
  "ה'",
  "תורה",
  "ישראל",
  "כלל ישראל",
  "עם ישראל",
  "מצוה",
  "מצוות",
  "יהודי",
  "אידן",
  "צדיק",
  "צדיקים",
  "חז\"ל",
  "פסוק",
  "משל",
  "נמשל",
  "רבי",
];

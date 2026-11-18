/**
 * Concept (inyan) tables. Concepts are keyed by their Hebrew term (`concepts[].he`).
 *
 * - `CONCEPT_ALIASES`: spelling variants that should be one concept (plene/defective spelling,
 *   construct forms). Matched on `foldBasic`, so nikud and quote marks are already folded.
 *
 * Concept pages and their thresholds come from the corpus layer (`.corpus/layer/concepts.json`);
 * the site's own stop-list and minimum-shiurim threshold were retired in C3.1.
 *
 * reviewStatus "unreviewed".
 */
export const conceptsReviewStatus = "unreviewed" as const;

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


/**
 * UI copy of the "Follow the text" slot (W5.2), kept out of the component so the W5.3 Yiddish copy
 * rules (src/content/yiddish-copy.test.ts) cover it. Yiddish wording follows the W5.3 glossary
 * (docs/sites/copy-review.md); not yet signed off. Used only when the view is on.
 */
import type { Ed } from "../../lib/edition.ts";

export const followTextEn = {
  heading: "Follow the text",
  note: "The words of the recording, from a transcription a person approved for this recording. It can still contain mistakes.",
  part: (n: number) => `Part ${n}`,
  open: "Open the text",
  loading: "Loading the text…",
  failed: "The text could not be loaded.",
};

export const followTextYi: typeof followTextEn = {
  heading: "דער טעקסט פון דער רעקארדירונג",
  note: "די ווערטער פון דער רעקארדירונג, פון אן איבערשרייבונג וואס א מענטש האט באשטעטיגט פאר דער רעקארדירונג. עס קען נאך האבן טעותים.",
  part: (n: number) => `טייל ${n}`,
  open: "עפן דעם טעקסט",
  loading: "מ׳לאדט דעם טעקסט…",
  failed: "מ׳האט נישט געקענט לאדן דעם טעקסט.",
};

export const followTextHe: typeof followTextEn = {
  heading: "הטקסט של ההקלטה",
  note: "מילות ההקלטה, מתוך העתקה שאדם אישר להקלטה זו. ייתכנו בה עדיין טעויות.",
  part: (n: number) => `חלק ${n}`,
  open: "פתיחת הטקסט",
  loading: "טוען את הטקסט…",
  failed: "לא ניתן היה לטעון את הטקסט.",
};

/** The copy per edition (`tsc` reports a missing edition). */
export const FOLLOW_TEXT: Readonly<Record<Ed, typeof followTextEn>> = { en: followTextEn, yi: followTextYi, he: followTextHe };

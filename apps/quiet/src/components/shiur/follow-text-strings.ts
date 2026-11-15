/**
 * UI copy of the "Follow the text" slot (W5.2), kept out of the component so the W5.3 Yiddish copy
 * rules (src/content/yiddish-copy.test.ts) cover it. Yiddish wording follows the W5.3 glossary
 * (docs/sites/copy-review.md); not yet signed off. Used only when the view is on.
 */
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

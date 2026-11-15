/**
 * UI strings of the Transcript tab (W5.2). Kept with the feature so that, with TRANSCRIPT_VIEW off,
 * none of them reaches the bundle. Yiddish wording follows the W5.3 glossary (docs/sites/copy-review.md); not yet signed off.
 */
import { createT, type MessageTable, type TFunction, type UiLang } from "@emunas/i18n";

export const transcriptEn = {
  "tx.tab": "Text",
  "tx.heading": "The words of the recording",
  "tx.note": "From a transcription a person approved for this recording. It can still contain mistakes.",
  "tx.reviewed": "Reviewed transcription",
  "tx.highAsr": "Machine transcription, approved",
  "tx.loading": "Loading the text",
  "tx.failed": "The text could not be loaded.",
  "tx.none": "There is no approved text for this recording.",
  "tx.part": "Part {n}",
} as const;

export type TranscriptKey = keyof typeof transcriptEn;

export const transcriptYi: MessageTable<TranscriptKey> = {
  "tx.tab": "טעקסט",
  "tx.heading": "די ווערטער פון דער רעקארדירונג",
  "tx.note": "פון אן איבערשרייבונג וואס א מענטש האט באשטעטיגט פאר דער רעקארדירונג. עס קען נאך האבן טעותים.",
  "tx.reviewed": "איבערגעקוקטע איבערשרייבונג",
  "tx.highAsr": "מאשין־איבערשרייבונג, באשטעטיגט",
  "tx.loading": "מ׳לאדט דעם טעקסט",
  "tx.failed": "מ׳האט נישט געקענט לאדן דעם טעקסט.",
  "tx.none": "עס איז נישטא קיין באשטעטיגטער טעקסט פאר דער רעקארדירונג.",
  "tx.part": "טייל {n}",
};

export type TranscriptT = TFunction<TranscriptKey>;

export function transcriptT(ui: UiLang): TranscriptT {
  return createT<TranscriptKey>({ en: transcriptEn, yi: transcriptYi }, ui);
}

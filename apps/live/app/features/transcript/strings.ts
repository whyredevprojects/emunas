/**
 * UI strings of the Transcript tab (W5.2). Kept with the feature so that, with TRANSCRIPT_VIEW off,
 * none of them reaches the bundle. Yiddish wording is unreviewed until W5.3.
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
  "tx.heading": "די ווערטער פֿון דער אויפֿנאַמע",
  "tx.note": "פֿון אַן איבערשרייבונג וואָס אַ מענטש האָט באַשטעטיקט פֿאַר דער אויפֿנאַמע. עס קען נאָך האָבן טעותים.",
  "tx.reviewed": "איבערגעקוקטע איבערשרייבונג",
  "tx.highAsr": "מאַשין־איבערשרייבונג, באַשטעטיקט",
  "tx.loading": "מען לאָדט דעם טעקסט",
  "tx.failed": "מען האָט נישט געקענט לאָדן דעם טעקסט.",
  "tx.none": "עס איז נישטאָ קיין באַשטעטיקטער טעקסט פֿאַר דער אויפֿנאַמע.",
  "tx.part": "חלק {n}",
};

export type TranscriptT = TFunction<TranscriptKey>;

export function transcriptT(ui: UiLang): TranscriptT {
  return createT<TranscriptKey>({ en: transcriptEn, yi: transcriptYi }, ui);
}

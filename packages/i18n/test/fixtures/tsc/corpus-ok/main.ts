import { corpusLabelsEn, corpusLabelsYi, type CorpusLabelKey, type MessageTable } from "../../../../src/index.ts";

// Both shipped tables are complete tables of the one key union.
export const en: MessageTable<CorpusLabelKey> = corpusLabelsEn;
export const yi: MessageTable<CorpusLabelKey> = corpusLabelsYi;

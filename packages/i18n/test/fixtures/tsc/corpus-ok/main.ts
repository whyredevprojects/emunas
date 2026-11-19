import { CORPUS_LABELS, UI_LANGS, type CorpusLabelKey, type MessageTable } from "../../../../src/index.ts";

// Every shipped table is a complete table of the one key union.
export const tables: MessageTable<CorpusLabelKey>[] = UI_LANGS.map((lang) => CORPUS_LABELS[lang]);
export const he: MessageTable<CorpusLabelKey> = CORPUS_LABELS.he;

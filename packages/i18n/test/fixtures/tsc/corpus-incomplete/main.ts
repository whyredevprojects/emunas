import { CORPUS_LABELS, type CorpusLabelKey, type MessageTable } from "../../../../src/index.ts";

// A Hebrew table that lost a key the English one has fails tsc.
const { "thread.heading": _dropped, ...rest } = CORPUS_LABELS.he;
export const he: MessageTable<CorpusLabelKey> = rest;

import { corpusLabelsYi, type CorpusLabelKey, type MessageTable } from "../../../../src/index.ts";

// A Yiddish table that lost a key the English one has fails tsc.
const { "thread.heading": _dropped, ...rest } = corpusLabelsYi;
export const yi: MessageTable<CorpusLabelKey> = rest;

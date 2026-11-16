/**
 * The two functions of `@emunas/search-core` the search page loads on first use. A dynamic import of
 * the package itself keeps every export in the chunk, among them the forbidden-key lists
 * (`FORBIDDEN_SEARCH_KEYS`: transcript field names), which have no business in a public script.
 * Importing through this module lets the bundler drop everything else.
 */
export { buildSynonymTable, normalizeQuery } from "@emunas/search-core";
